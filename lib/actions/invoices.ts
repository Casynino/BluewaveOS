"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";

import {
  formatCurrency,
  formatRate,
  rateOutOfBand,
  roundMoney,
  tzsToUsd,
  usdToTzs,
} from "@/lib/currency";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { nextInvoiceNumber, reserveInvoiceNumbers } from "@/lib/ids";
import { impliedStatus, outstandingOf } from "@/lib/invoice-balance";
import { billingMeasurement, priceConsignment } from "@/lib/invoice-draft";
import { announceCargoEvent } from "@/lib/cargo-events";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { prisma, type TxClient } from "@/lib/prisma";
import { accrueStorage, accrueStorageQuietly } from "@/lib/storage-charge";
import {
  applyVat,
  companySettings,
  currentExchangeRate,
  resolveRate,
} from "@/lib/pricing";
import { darConfirmationGap } from "@/lib/price-confirmation";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { formMessage } from "@/lib/safe-error";
import { paymentSnapshotNow } from "@/lib/invoice-accounts";
import { confirmPrices } from "@/lib/actions/price-list";


/**
 * THE RATE A BILL IS FINALISED AT.
 *
 * A draft carries whatever rate was on the board when it was raised, because
 * nobody has been told a figure yet. Issuing is the moment the customer is told
 * one, so the rate is taken again then and never read again afterwards — a bill
 * issued at 2,700 stays 2,700 when the board moves to 2,800.
 */
function issueSnapshot(
  invoice: { total: Prisma.Decimal; currency: string },
  fx: { id: string; rate: Prisma.Decimal }
) {
  return {
    exchangeRateId: fx.id,
    fxRate: fx.rate,
    totalTzs:
      invoice.currency === "TZS"
        ? roundMoney(invoice.total, "TZS")
        : usdToTzs(invoice.total, fx.rate),
  };
}

/** A second bill for the same boxes, caught inside the lock. Never shown raw. */
class DuplicateInvoice extends Error {}

/**
 * THE BILL HELD STILL WHILE ITS MONEY IS RESTATED.
 *
 * Every change to what a customer owes is a read and then a write: take the
 * subtotal off the row, work the new one out, put it back. Nothing about a
 * transaction makes those two one act — the read is an ordinary SELECT and
 * anybody may write between them. Two desks on the same bill in the same
 * minute, which is the ordinary case here (Support gives a little off on the
 * phone while Finance takes the floor rent back off), each subtract from the
 * figure they read, and whichever commits second writes the other's change
 * back out of a bill the customer has already been shown.
 *
 * Locking the row first means the second desk waits and then works from the
 * first desk's figure. Called at the top of the transaction, before anything
 * is read from the row, and never outside one — a lock taken outside a
 * transaction is released before the write it was meant to cover.
 */
async function billForUpdate(tx: TxClient, invoiceId: string) {
  await tx.$executeRaw`SELECT 1 FROM "Invoice" WHERE id = ${invoiceId} FOR UPDATE`;
  return tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      subtotal: true,
      total: true,
      discount: true,
      vatPercent: true,
      vatInclusive: true,
      fxRate: true,
    },
  });
}

/**
 * A bill that moved while it was being re-priced.
 *
 * The other half of the rule above, for the changes that rebuild the whole
 * bill out of the lines they read rather than adding to or subtracting from
 * its subtotal. Holding the row still does not help those: their lines were
 * read before the lock could exist. So the write is made conditional on the
 * total they were worked out from, and a bill that has moved since is refused
 * and reopened rather than quietly restated — the same guard the price list
 * uses (lib/price-confirmation.ts).
 */
class BillMoved extends Error {}

const MOVED = "That bill changed a moment ago. Open it again and make the change on what it says now.";

/** "TZS 36,450 (USD 13.50 at 1 USD = 2,700 TZS)" */
function amountDueLine(totalUsd: Prisma.Decimal, rate: Prisma.Decimal) {
  return `${formatCurrency(usdToTzs(totalUsd, rate), "TZS")} (${formatCurrency(totalUsd, "USD")} at ${formatRate(rate)})`;
}

export type ActionState = { error?: string; ok?: string; id?: string };

/**
 * Raise a bill for one consignment on one sailing.
 *
 * IT REFUSES ANYTHING THAT HAS NOT LANDED. Sea freight is billed on what Dar
 * actually received, because that is the figure the customer can be shown and
 * the only one anybody can defend. Invoicing from the Foshan measurement
 * means re-issuing every bill where the two disagree.
 *
 * The rate, the VAT percentage and the exchange rate are all written onto the
 * invoice here. While it is still a draft, a corrected measurement re-prices
 * its freight from the rate book (lib/invoice-reprice.ts); once it is issued
 * nothing downstream re-reads them.
 */
export async function generateInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.create");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      receiver: true,
      darReceiving: true,
      chinaReceiving: true,
      containerLines: { include: { container: true } },
      invoices: { where: { status: { not: "CANCELLED" } } },
    },
  });
  if (!cargo) return { error: "That cargo no longer exists." };

  if (!cargo.darReceiving) {
    return {
      error: `${cargo.reference} has not been received in Dar. Sea freight is billed on what actually landed.`,
    };
  }

  const line = cargo.containerLines.at(-1) ?? null;
  if (cargo.invoices.some((i) => i.containerCargoId === (line?.id ?? null))) {
    return { error: "This consignment already has a live invoice for that sailing." };
  }

  const settings = await companySettings();
  const fx = await currentExchangeRate();

  /* Dar's measurement first, falling back to China's when Dar recorded a count
     but not a volume — the bill still has to be raisable. Typed lines are
     priced as they stand, after whatever Dar corrected on them. */
  const priced = await priceConsignment({
    id: cargo.id,
    description: cargo.description,
    commodity: cargo.commodity,
    service: cargo.service,
    receiverId: cargo.receiverId,
    ...billingMeasurement(cargo),
  });

  if (priced.blockedReason) {
    return { error: priced.blockedReason };
  }

  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);
  const { vatAmount, total } = applyVat(priced.amount, vatPercent, settings?.pricesIncludeVat ?? true);

  let invoice: Awaited<ReturnType<typeof prisma.invoice.create>>;
  try {
    invoice = await prisma.$transaction(async (tx) => {
      /* Two people on the invoices screen pressing "Raise invoice" at the same
         second both pass the check above. On a sailing the unique constraint on
         the container line decides it and the loser is told plainly rather than
         shown a stack trace; a consignment with no sailing has no such line, so
         the lock is what serialises them. */
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${cargo.id}, 0))`;
      const again = await tx.invoice.findFirst({
        where: {
          cargoId: cargo.id,
          status: { not: "CANCELLED" },
          containerCargoId: line?.id ?? null,
        },
        select: { id: true },
      });
      if (again) throw new DuplicateInvoice();
      const number = await nextInvoiceNumber(tx);
      return tx.invoice.create({
        data: {
          number,
          customerId: cargo.receiverId,
          cargoId: cargo.id,
          containerCargoId: line?.id ?? null,
          status: "DRAFT",
          billableCbm: priced.billableCbm,
          billableKg: priced.billableKg,
          standardRate: priced.standardRate,
          appliedRate: priced.appliedRate,
          rateBasis: priced.basis,
          discount: priced.discount,
          subtotal: priced.amount,
          vatPercent,
          vatAmount,
          vatInclusive: settings?.pricesIncludeVat ?? true,
          total,
          currency: priced.currency,
          exchangeRateId: fx?.id ?? null,
          fxRate: fx?.rate ?? null,
          totalTzs: fx ? usdToTzs(total, fx.rate) : null,
          issuedById: actor.id,
          items: { create: priced.items },
        },
      });
    });
  } catch (error) {
    if (
      error instanceof DuplicateInvoice ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      return {
        error:
          "Somebody raised an invoice for this sailing a moment ago. Refresh the list before raising another.",
      };
    }
    throw error;
  }

  await recordAudit({
    actor,
    action: "invoice.create",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Raised ${invoice.number} for ${cargo.reference} — ${priced.explanation}, total ${priced.currency} ${total}`,
    metadata: {
      explanation: priced.explanation,
      standardRate: priced.standardRate?.toString() ?? null,
      appliedRate: priced.appliedRate?.toString() ?? null,
      vatPercent: vatPercent.toString(),
      fxRate: fx?.rate?.toString() ?? null,
    },
  });

  revalidatePath("/app/finance/invoices");
  revalidatePath(`/app/cargo/${cargo.id}`);
  return { ok: `${invoice.number} raised as a draft.`, id: invoice.id };
}

/** Raise drafts for everything on a container that has landed and has none. */
export async function generateContainerInvoices(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.create");

  const containerId = String(formData.get("containerId") ?? "");
  const lines = await prisma.containerCargo.findMany({
    where: {
      containerId,
      cargo: {
        deletedAt: null,
        OR: [{ chinaReceiving: { isNot: null } }, { darReceiving: { isNot: null } }],
        /* Nobody is billed for boxes nobody found. Foshan's measurement alone
           is enough to price a consignment, so without this a press meant for
           the rest of the box bills the one that never came off it. */
        status: { notIn: ["MISSING_AT_DAR", "CANCELLED"] },
        invoices: { none: { status: { not: "CANCELLED" } } },
      },
    },
    include: {
      cargo: {
        include: { darReceiving: true, chinaReceiving: true, receiver: true },
      },
    },
  });

  if (lines.length === 0) {
    return { ok: "Nothing on this container is waiting to be invoiced." };
  }

  const settings = await companySettings();
  const fx = await currentExchangeRate();
  const vatPercent = new Prisma.Decimal(settings?.vatPercent ?? 0);

  let raised = 0;
  const skipped: string[] = [];

  /* Numbers are reserved in one block rather than one at a time — a container
     of three hundred consignments is three hundred round trips otherwise, and
     the counter upsert is atomic either way. */
  const numbers = await prisma.$transaction((tx) =>
    reserveInvoiceNumbers(tx, lines.length)
  );

  for (const [index, line] of lines.entries()) {
    const cargo = line.cargo;
    const priced = await priceConsignment({
      id: cargo.id,
      description: cargo.description,
      commodity: cargo.commodity,
      service: cargo.service,
      receiverId: cargo.receiverId,
      ...billingMeasurement(cargo),
    });

    if (priced.blockedReason) {
      skipped.push(`${cargo.reference}: ${priced.blockedReason}`);
      continue;
    }

    const { vatAmount, total } = applyVat(priced.amount, vatPercent, settings?.pricesIncludeVat ?? true);

    /* Two people pressing this on the same container both read the same lines
       and both try to write. The unique constraint on the sailing decides it,
       and the loser is named in the answer — an unhandled collision here would
       abandon the run half-done, with the consignments after it unbilled and
       nothing on screen saying which. */
    try {
      await prisma.invoice.create({
        data: {
          number: numbers[index],
          customerId: cargo.receiverId,
          cargoId: cargo.id,
          containerCargoId: line.id,
          status: "DRAFT",
          billableCbm: priced.billableCbm,
          billableKg: priced.billableKg,
          standardRate: priced.standardRate,
          appliedRate: priced.appliedRate,
          rateBasis: priced.basis,
          discount: priced.discount,
          subtotal: priced.amount,
          vatPercent,
          vatAmount,
          vatInclusive: settings?.pricesIncludeVat ?? true,
          total,
          currency: priced.currency,
          exchangeRateId: fx?.id ?? null,
          fxRate: fx?.rate ?? null,
          totalTzs: fx ? usdToTzs(total, fx.rate) : null,
          issuedById: actor.id,
          items: { create: priced.items },
        },
      });
      raised++;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        skipped.push(`${cargo.reference}: already billed for this sailing.`);
        continue;
      }
      throw error;
    }
  }

  await recordAudit({
    actor,
    action: "invoice.bulk",
    entity: "Container",
    entityId: containerId,
    summary: `Raised ${raised} draft invoice(s)${skipped.length ? `, ${skipped.length} could not be priced` : ""}`,
    metadata: { skipped },
  });

  revalidatePath("/app/finance/invoices");
  return {
    ok: skipped.length
      ? `${raised} raised. ${skipped.length} could not be priced: ${skipped[0]}`
      : `${raised} draft invoice(s) raised.`,
  };
}

/**
 * Send it to the customer.
 *
 * A draft is Finance's working; an issued invoice is a demand for money and is
 * what the release engine looks at. Issuing is where the customer is told.
 */
export async function issueInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.issue");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  /* Days to pay, from a form field. A term is a handful of days or a couple of
     months; anything else is a slipped key, and a negative one issued a bill
     that was already overdue on the day the customer was first shown it. */
  const dueDays = Number(formData.get("dueDays") ?? 7);
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365) {
    return { error: "Days to pay has to be between 0 and 365." };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      cargo: {
        select: {
          reference: true,
          senderId: true,
          status: true,
          darReceiving: { select: { verified: true, discrepancy: true } },
          chinaReceiving: { select: { id: true } },
        },
      },
    },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status !== "DRAFT") {
    return { error: "That invoice has already been issued." };
  }
  /* Nobody is billed for boxes nobody found. A draft raised when the container
     landed outlives the floor's report that this consignment never came off
     it, and issuing it is a demand for money and a letter to the customer. */
  if (invoice.cargo.status === "MISSING_AT_DAR") {
    return {
      error: `${invoice.cargo.reference} did not come off the container. Settle the case before billing it.`,
    };
  }
  /* Something must have been measured — China's counter is enough. */
  const gap = darConfirmationGap(invoice.cargo);
  if (gap) return { error: `${invoice.cargo.reference}: ${gap}` };

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + dueDays);

  const fx = await currentExchangeRate();
  if (!fx) {
    return { error: "There is no exchange rate published. Set one in the Rate book first." };
  }
  const snapshot = issueSnapshot(invoice, fx);

  /* The claim below is what stops a double press issuing twice, and the
     sentence it throws is written for the person who lost the race. Thrown out
     of a server action it never reaches them — they get an error page instead
     of being told to reload — so it is caught here and handed back. */
  try {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.invoice.updateMany({
        where: { id: invoice.id, status: "DRAFT" },
        data: {
          status: "ISSUED",
          issuedAt: new Date(),
          dueAt,
          ...snapshot,
          paymentSnapshot: await paymentSnapshotNow(tx),
        },
      });
      if (claim.count === 0) throw new Error("Somebody else issued it first.");

      await recordAudit(
        {
          actor,
          action: "invoice.issue",
          entity: "Invoice",
          entityId: invoice.id,
          summary: `Issued ${invoice.number} — ${amountDueLine(invoice.total, snapshot.fxRate)}`,
          metadata: { exchangeRateId: snapshot.exchangeRateId, fxRate: snapshot.fxRate.toString(), totalTzs: snapshot.totalTzs.toString() },
        },
        tx
      );
      /* The invoice message, with the bill's own download link. */
      await announceCargoEvent(tx, "PRICE_CONFIRMED", invoice.cargoId, { invoiceId: invoice.id });
    });
  } catch (error) {
    return { error: formMessage(error, "That invoice was not issued.") };
  }

  /* A bill issued past the free days carries its storage from the start. */
  await accrueStorageQuietly([invoice.cargoId]);

  revalidatePath("/app/finance/invoices");
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `${invoice.number} issued.` };
}

const adjustSchema = z.object({
  invoiceId: z.string().min(1),
  appliedRate: z.coerce.number().min(0).optional(),
  /* A charge, not a way to take money off. Money comes off a bill as a
     discount, which appends its own reasoned line and can be put back; a
     negative charge here folded silently into the subtotal and — far enough
     below zero — turned a bill into one the company owed. */
  additionalCharge: z.coerce
    .number()
    .min(0, "A charge cannot be negative. Use a discount to take money off.")
    .optional(),
  chargeDescription: z.string().trim().optional(),
  reason: z.string().trim().optional(),
});

/**
 * Change what a customer is being asked to pay.
 *
 * Only on a draft. Once an invoice is issued the customer has been told a
 * figure, and moving it afterwards — even downward — is a credit note, not an
 * edit. Every change writes the old and new values before it takes effect.
 */
export async function adjustInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const parsed = adjustSchema.safeParse({
    invoiceId: formData.get("invoiceId"),
    appliedRate: formData.get("appliedRate") || undefined,
    additionalCharge: formData.get("additionalCharge") || undefined,
    chargeDescription: formData.get("chargeDescription") || undefined,
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const data = parsed.data;

  const invoice = await prisma.invoice.findUnique({
    where: { id: data.invoiceId },
    include: { items: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status !== "DRAFT") {
    return {
      error:
        "This invoice has been issued. The customer has been told a figure — raise a credit note rather than editing it.",
    };
  }

  const billable =
    invoice.billableCbm ?? invoice.billableKg ?? new Prisma.Decimal(1);
  const newRate =
    data.appliedRate !== undefined
      ? new Prisma.Decimal(data.appliedRate)
      : invoice.appliedRate ?? new Prisma.Decimal(0);

  const freight = billable.mul(newRate).toDecimalPlaces(2);
  const extra =
    data.additionalCharge !== undefined
      ? new Prisma.Decimal(data.additionalCharge)
      : new Prisma.Decimal(0);

  const subtotal = freight.add(extra);
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent, invoice.vatInclusive);
  const standardTotal = invoice.standardRate
    ? billable.mul(invoice.standardRate)
    : subtotal;

  await prisma.$transaction(async (tx) => {
    if (invoice.appliedRate && !invoice.appliedRate.equals(newRate)) {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "appliedRate",
          oldValue: invoice.appliedRate.toString(),
          newValue: newRate.toString(),
          reason: data.reason,
        },
        tx
      );
    }
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "total",
        oldValue: invoice.total.toString(),
        newValue: total.toString(),
        reason: data.reason,
      },
      tx
    );

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        appliedRate: newRate,
        subtotal,
        vatAmount,
        total,
        discount: standardTotal.sub(freight).toDecimalPlaces(2),
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
        notes: data.reason,
      },
    });

    /* The freight line follows the rate; anything else is added beside it so a
       customer can see what the extra was for. */
    const freightItem = invoice.items.find((i) => i.category === "Freight");
    if (freightItem) {
      await tx.invoiceItem.update({
        where: { id: freightItem.id },
        data: { unitPrice: newRate, amount: freight },
      });
    }
    if (!extra.isZero()) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          description: data.chargeDescription || "Additional charge",
          quantity: 1,
          unitPrice: extra,
          amount: extra,
          category: "Other",
        },
      });
    }
  });

  await recordAudit({
    actor,
    action: "invoice.adjust",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `${invoice.number}: total ${invoice.total} → ${total} — ${data.reason}`,
  });

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: "Adjusted." };
}

export async function cancelInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.cancel");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };

  if (invoice.payments.some((p) => p.status === "VERIFIED")) {
    return {
      error:
        "Money has been received against this invoice. Reverse the payment first — cancelling it here would make the receipt point at nothing.",
    };
  }

  /*
    THE SAILING IS RELEASED WITH THE BILL.

    `containerCargoId` is unique across invoices, which is what stops one
    sailing being billed twice. A cancelled invoice that kept its hold on that
    sailing would make the consignment permanently unbillable — Finance cancels
    a wrong bill, raises the right one, and the database refuses it. Clearing
    the link puts the sailing back in play; which sailing this bill covered is
    kept below, in a log that is never rewritten.
  */
  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledReason: reason,
      containerCargoId: null,
    },
  });

  await recordAudit({
    actor,
    action: "invoice.cancel",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Cancelled ${invoice.number} — ${reason}`,
    metadata: {
      containerCargoId: invoice.containerCargoId,
      cargoId: invoice.cargoId,
      total: invoice.total.toString(),
      currency: invoice.currency,
    },
  });

  revalidatePath("/app/finance/invoices");
  return { ok: "Cancelled." };
}


/**
 * CONFIRM THE PRICES ON A WHOLE CONTAINER.
 *
 * The same press as "Confirm all prices" on the price list, kept under this
 * name for the callers that already use it. It prices whatever Dar counted and
 * has no draft yet, then issues every draft on the container — see
 * lib/price-confirmation.ts. A line the rate book cannot price is named and
 * left waiting; the rest of the container goes out.
 */
export async function confirmContainerPricing(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await authorize("invoice.priceConfirm");
  if (!String(formData.get("containerId") ?? "")) {
    return { error: "Which container?" };
  }
  return confirmPrices({}, formData);
}


/*
  A SETTLED BILL IS NOT RE-OPENED AT THE COUNTER.

  invoice.discount is held by Support so that a customer on the phone can be
  given a little off before they pay. Once the bill is paid in full, or the
  boxes it paid for have left the warehouse, changing it rewrites money the
  books have already counted — and nobody is on the phone any more. That is a
  correction, and corrections belong to the desks holding invoice.edit.
*/
/**
 * FINANCE HEARS ABOUT EVERY PRICE A DESK OUTSIDE FINANCE MOVES.
 *
 * Support may change a price or give a discount without waiting for anybody —
 * only money received waits for Finance. Finance still has to know: each such
 * change lands on Finance's bell with who, what and why, linked to the bill,
 * where Finance can change it again or take it back.
 */
async function tellFinance(
  actor: { role: Role; name?: string | null; email?: string | null },
  invoice: { id: string; number: string },
  what: string
) {
  if (can(actor.role, "invoice.edit")) return;
  await notifyStaff(await staffInDepartment("FINANCE"), {
    kind: "invoice.changedOutsideFinance",
    title: `${actor.name ?? actor.email ?? "Support"} changed ${invoice.number}`,
    body: what,
    href: `/app/finance/invoices/${invoice.id}`,
  });
}

async function settledRefusal(
  actor: { role: Role },
  invoice: { status: string; cargoId: string }
): Promise<string | null> {
  if (can(actor.role, "invoice.edit")) return null;
  if (invoice.status === "PAID") {
    return "This bill is paid in full. Ask Finance to correct it.";
  }
  const released = await prisma.release.findFirst({
    where: { cargoId: invoice.cargoId },
    select: { id: true },
  });
  return released
    ? "This cargo has already been handed over. Ask Finance to correct the bill."
    : null;
}

/**
 * A DISCOUNT ON A BILL THE CUSTOMER HAS ALREADY SEEN.
 *
 * The rule everywhere else is that an issued figure does not move — the
 * customer has been told it. This is the deliberate exception, and it is why it
 * looks the way it does: it never edits the total in place. It appends a
 * negative line with a reason and a name on it, so the invoice document shows
 * what was charged, what was taken off, and who took it off.
 *
 * A discount larger than the bill is refused. Forgiving more than somebody owes
 * is not a discount, it is a payment out, and that is a different act.
 */
/**
 * PUT THE PRICE BACK.
 *
 * A discount agreed at the counter reaches Finance as part of a bill it is
 * about to take money against, and Finance may not agree with it. Taking it
 * off again is the same act as giving it, in reverse and by the same
 * authority: the lines come off, the bill returns to what the rate book said,
 * and what was undone — with who undid it and why — is written before it takes
 * effect. An issued bill a customer has already settled is refused, as every
 * other change to a settled bill is.
 */
export async function undoDiscount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "Discount not agreed by Finance";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true, payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const lines = invoice.items.filter((i) => i.category === "Discount");
  if (lines.length === 0 && invoice.discount.lessThanOrEqualTo(0)) {
    return { error: "There is no discount on this bill." };
  }

  /* The lines are the record of what came off; a bill discounted before the
     lines existed is put back by the figure stored on it. */
  const off = lines.length
    ? lines.reduce((sum, i) => sum.add(i.amount.abs()), new Prisma.Decimal(0))
    : invoice.discount;

  await prisma.$transaction(async (tx) => {
    const live = await billForUpdate(tx, invoice.id);
    const subtotal = live.subtotal.add(off);
    const { vatAmount, total } = applyVat(subtotal, live.vatPercent, live.vatInclusive);

    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "total",
        oldValue: live.total.toString(),
        newValue: total.toString(),
        reason,
      },
      tx
    );
    if (lines.length) {
      await tx.invoiceItem.deleteMany({ where: { id: { in: lines.map((i) => i.id) } } });
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discount: Prisma.Decimal.max(new Prisma.Decimal(0), live.discount.sub(off)),
        subtotal,
        vatAmount,
        total,
        totalTzs: live.fxRate ? usdToTzs(total, live.fxRate) : null,
      },
    });
  });

  await recordAudit({
    actor,
    action: "invoice.discount.undo",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Put ${invoice.currency} ${off} back onto ${invoice.number}: ${reason}`,
    metadata: { amount: off.toString(), reason },
  });
  await tellFinance(actor, invoice, `Discount of ${invoice.currency} ${off} taken back: ${reason}`);

  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath("/app/finance/collections/verify");
  return { ok: `${invoice.currency} ${off} put back on the bill.` };
}

export async function discountInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "How much is coming off?" };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice is cancelled." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  /* Typed in shillings or dollars; the bill is in dollars, so shillings are
     turned into dollars here at the bill's own rate, not in the browser. */
  const inCurrency = String(formData.get("currency") ?? invoice.currency);
  let off = new Prisma.Decimal(amount);
  if (inCurrency === "TZS" && invoice.currency === "USD") {
    if (!invoice.fxRate || invoice.fxRate.lessThanOrEqualTo(1)) {
      return { error: "This bill has no exchange rate. Give the discount in dollars." };
    }
    off = tzsToUsd(off, invoice.fxRate);
    if (off.lessThanOrEqualTo(0)) return { error: "That is less than one cent." };
  }
  if (off.greaterThan(invoice.total)) {
    return {
      error: `The bill is only ${invoice.currency} ${invoice.total}. A discount cannot be larger than it.`,
    };
  }

  const total = await prisma.$transaction(async (tx) => {
    /* Worked out from the bill as it stands under the lock, never from the
       copy the press was read against. */
    const live = await billForUpdate(tx, invoice.id);
    const subtotal = live.subtotal.sub(off);
    const money = applyVat(subtotal, live.vatPercent, live.vatInclusive);

    /* Written before it takes effect, like every other change to a figure
       somebody has been shown. */
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "total",
        oldValue: live.total.toString(),
        newValue: money.total.toString(),
        reason,
      },
      tx
    );

    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description: `Discount — ${reason}`,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: off.negated(),
        amount: off.negated(),
        category: "Discount",
        taxable: true,
      },
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        discount: live.discount.add(off),
        subtotal,
        vatAmount: money.vatAmount,
        total: money.total,
        totalTzs: live.fxRate ? usdToTzs(money.total, live.fxRate) : null,
      },
    });
    return money.total;
  });

  await recordAudit({
    actor,
    action: "invoice.discount",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Took ${invoice.currency} ${off} off ${invoice.number}: ${reason}`,
    metadata: { amount: off.toString(), nowTotal: total.toString(), reason },
  });
  await tellFinance(actor, invoice, `Discount of ${invoice.currency} ${off}: ${reason}`);

  /* The stored status follows the new total: a bill that now owes is not
     left reading PAID, and one a discount settled is not left reading ISSUED. */
  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  return { ok: `${invoice.currency} ${off} taken off.` };
}

/**
 * RE-PRICE A BILL AT A DIFFERENT RATE PER CBM.
 *
 * Every line is re-multiplied at the new rate and the old rate is written to
 * FieldChange first. Flat-rate and per-kilo lines are left alone — they are not
 * priced per cubic metre, and silently scaling them would be inventing a charge.
 */
export async function repriceInvoice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const rate = Number(formData.get("rate") ?? 0);
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  /* Optional: the category and the volume, the two things our prices move on
     besides the rate itself. Absent means unchanged. */
  const rawCategory = formData.get("category");
  const category = rawCategory === null ? undefined : String(rawCategory).trim() || null;
  const rawCbm = String(formData.get("cbm") ?? "").trim();
  const cbmIn = rawCbm ? Number(rawCbm) : undefined;

  if (!Number.isFinite(rate) || rate <= 0) return { error: "Give a rate." };
  if (cbmIn !== undefined && (!Number.isFinite(cbmIn) || cbmIn <= 0 || cbmIn > 5000)) {
    return { error: "Check the volume." };
  }
  /* No reason is asked for: who changed it, when, and from what to what are
     all written down regardless. */
  const why = reason.length >= 3 ? reason : "Price edited";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      cargo: {
        select: {
          id: true,
          service: true,
          commodity: true,
          packages: { where: { deletedAt: null }, select: { id: true, cargoType: true } },
        },
      },
    },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") {
    return { error: "That invoice is cancelled." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const next = new Prisma.Decimal(rate);
  const cbmLines = invoice.items.filter((i) => i.unit === "CBM");
  if (cbmLines.length === 0) {
    return { error: "Nothing on this bill is priced per cubic metre." };
  }

  /* One freight line: its category and volume can be changed here. A bill
     with several is changed line by line on the bill itself. */
  /* The category is the cargo's — its lines' type, or its commodity when it
     has no lines — never the invoice line's own kind ("Freight"). A new one
     applies to every line. The volume is the bill's total; a new total is
     shared across the freight lines in proportion, the last taking the
     rounding, so a two-carton bill can be re-measured as easily as one. */
  const lineTypes = [...new Set(invoice.cargo?.packages.map((p) => p.cargoType) ?? [])];
  const oldCategory =
    (invoice.cargo?.packages.length ?? 0) === 0
      ? (invoice.cargo?.commodity ?? null)
      : lineTypes.length === 1
        ? lineTypes[0]
        : null;
  const newCategory = category !== undefined && category !== oldCategory ? category : undefined;
  const oldTotalCbm = cbmLines.reduce((sum, l) => sum.add(l.quantity), new Prisma.Decimal(0));
  const newCbm =
    cbmIn !== undefined && !oldTotalCbm.equals(new Prisma.Decimal(cbmIn).toDecimalPlaces(4))
      ? new Prisma.Decimal(cbmIn).toDecimalPlaces(4)
      : undefined;
  const newQuantity = new Map<string, Prisma.Decimal>();
  if (newCbm !== undefined) {
    let given = new Prisma.Decimal(0);
    cbmLines.forEach((line, index) => {
      const share =
        index === cbmLines.length - 1
          ? newCbm.sub(given)
          : oldTotalCbm.isZero()
            ? newCbm.div(cbmLines.length).toDecimalPlaces(4)
            : line.quantity.mul(newCbm).div(oldTotalCbm).toDecimalPlaces(4);
      given = given.add(share);
      newQuantity.set(line.id, share);
    });
  }

  /* The book's rate for the new category, so the bill still says what the
     standard was beside what is charged. */
  let newStandard: Prisma.Decimal | null | undefined;
  if (newCategory !== undefined) {
    const { standard } = await resolveRate(prisma, {
      service: invoice.cargo?.service ?? "LCL",
      cargoType: newCategory,
    });
    newStandard = standard && standard.basis === "PER_CBM" ? standard.rate : null;
  }

  const quantityOf = (item: (typeof invoice.items)[number]) =>
    newQuantity.get(item.id) ?? item.quantity;

  let subtotal = new Prisma.Decimal(0);
  for (const item of invoice.items) {
    subtotal = subtotal.add(
      item.unit === "CBM" ? quantityOf(item).mul(next) : item.amount
    );
  }
  /* A re-price is Finance pricing the bill again, so it is priced the way the
     company prices now — which is how a bill issued with VAT on top is brought
     to a price that already contains it. */
  const repriceInclusive = (await companySettings())?.pricesIncludeVat ?? true;
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent, repriceInclusive);

  const refused = await prisma.$transaction(async (tx) => {
    /* The total can move at an unchanged rate — a bill issued with VAT on top
       re-priced the way prices are now — so it is written on its own. */
    if (!invoice.total.equals(total)) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "total", oldValue: invoice.total.toString(), newValue: total.toString(), reason: why },
        tx
      );
    }
    if (invoice.vatInclusive !== repriceInclusive) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "vatInclusive", oldValue: String(invoice.vatInclusive), newValue: String(repriceInclusive), reason: why },
        tx
      );
    }
    if (!invoice.appliedRate || !invoice.appliedRate.equals(next)) {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "appliedRate",
          oldValue: invoice.appliedRate?.toString() ?? "mixed",
          newValue: next.toString(),
          reason: why,
        },
        tx
      );
    }
    if (newCategory !== undefined && invoice.cargo) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "cargoType", oldValue: oldCategory, newValue: newCategory, reason: why },
        tx
      );
      /* The cargo follows the bill, so the next draft, the packing list and
         the price list all read the category that was charged. */
      if (invoice.cargo.packages.length === 0) {
        await recordFieldChange(
          { actor, entity: "Cargo", entityId: invoice.cargo.id, field: "commodity", oldValue: invoice.cargo.commodity, newValue: newCategory, reason: why },
          tx
        );
        await tx.cargo.update({ where: { id: invoice.cargo.id }, data: { commodity: newCategory } });
      } else {
        for (const line of invoice.cargo.packages) {
          if (line.cargoType === newCategory) continue;
          await recordFieldChange(
            { actor, entity: "CargoPackage", entityId: line.id, field: "cargoType", oldValue: line.cargoType, newValue: newCategory, reason: why },
            tx
          );
          await tx.cargoPackage.update({ where: { id: line.id }, data: { cargoType: newCategory } });
        }
      }
    }
    if (newCbm !== undefined) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "billableCbm", oldValue: oldTotalCbm.toString(), newValue: newCbm.toString(), reason: why },
        tx
      );
    }

    for (const item of cbmLines) {
      const quantity = quantityOf(item);
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          unitPrice: next,
          quantity,
          amount: quantity.mul(next).toDecimalPlaces(2),
        },
      });
    }

    /* Every line on this bill was read before the transaction opened, so the
       new subtotal is only right while the bill has not moved since. A
       storage charge or a discount landing in between is money this would
       otherwise write back out of the bill. */
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, total: invoice.total },
      data: {
        ...(newCbm !== undefined ? { billableCbm: newCbm } : {}),
        ...(newStandard !== undefined ? { standardRate: newStandard } : {}),
        appliedRate: next,
        subtotal,
        vatAmount,
        vatInclusive: repriceInclusive,
        total,
        totalTzs: invoice.fxRate
          ? usdToTzs(total, invoice.fxRate)
          : null,
      },
    });
    if (claim.count === 0) throw new BillMoved();
  }).catch((error) => {
    if (error instanceof BillMoved) return MOVED;
    throw error;
  });
  if (refused) return { error: refused };

  await recordAudit({
    actor,
    action: "invoice.reprice",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Re-priced ${invoice.number} at ${invoice.currency} ${next}/CBM${newCategory !== undefined ? `, category ${oldCategory ?? "none"} → ${newCategory ?? "none"}` : ""}${newCbm !== undefined ? `, ${oldTotalCbm} → ${newCbm} CBM` : ""}: ${why}`,
  });
  await tellFinance(
    actor,
    invoice,
    `Price changed to ${invoice.currency} ${next}/CBM${newCategory !== undefined ? `, category ${oldCategory ?? "none"} → ${newCategory ?? "none"}` : ""}${newCbm !== undefined ? `, ${oldTotalCbm} → ${newCbm} CBM` : ""}: ${why}`
  );

  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath("/app/finance/collections/verify");
  return { ok: `Re-priced at ${invoice.currency} ${next} per CBM.` };
}

/**
 * THE LAST CHANGE OF ONE KIND, IF IT IS STILL STANDING.
 *
 * A change put back after it was made is no longer on the bill, and putting it
 * back twice would take the price somewhere nobody asked for. Both halves stay
 * in the trail; only the newer of the two decides what the bill carries now.
 */
async function changeStanding(invoiceId: string, action: string) {
  const [made, back] = await Promise.all([
    prisma.auditLog.findFirst({
      where: { entity: "Invoice", entityId: invoiceId, action },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.auditLog.findFirst({
      where: { entity: "Invoice", entityId: invoiceId, action: `${action}.undo` },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);
  if (!made) return null;
  return back && back.createdAt >= made.createdAt ? null : made;
}

/**
 * PUT THE BOOK PRICE BACK.
 *
 * The twin of the discount's put-back, for the other way a price moves. Support
 * re-prices a bill at the counter and Finance meets it later as a figure it is
 * about to take money against; if Finance does not agree the rate, the bill
 * goes back to what the rate book says.
 *
 * IT IS THE PRICE ENGINE THAT ANSWERS, NOT THIS FILE. The freight lines are
 * priced again by lib/invoice-draft.ts, exactly as a draft is priced — the same
 * book, the same per-line rates, the same volume the warehouse measured. No
 * rate is multiplied here and none is carried over from the bill: an agreed
 * rate is the thing being taken off. Everything that is not freight — storage,
 * an added charge, a discount — is kept and re-added, so VAT is taken once over
 * the whole.
 *
 * THE CATEGORY STAYS WHERE THE RE-PRICE PUT IT. A cargo type is what the goods
 * are, not what they cost; the price that goes back on is the book's price for
 * the goods as they now stand, which is the figure the badge named beside the
 * change.
 */
export async function undoReprice(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason =
    String(formData.get("reason") ?? "").trim() || "Price not agreed by Finance";

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: true,
      cargo: { include: { darReceiving: true, chinaReceiving: true } },
    },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const standing = await changeStanding(invoice.id, "invoice.reprice");
  if (!standing) return { error: "There is no re-price on this bill to put back." };
  if (!invoice.cargo) return { error: "That bill has no cargo to price." };

  const priced = await priceConsignment(
    {
      id: invoice.cargo.id,
      description: invoice.cargo.description,
      commodity: invoice.cargo.commodity,
      service: invoice.cargo.service,
      receiverId: invoice.cargo.receiverId,
      ...billingMeasurement(invoice.cargo),
    },
    prisma,
    /* No agreed rate carried forward. The one on the bill is what is coming
       off, and reading it back would put the same figure on again. */
    null
  );
  if (priced.blockedReason) {
    return {
      error: `The rate book has no price for this cargo today — ${priced.blockedReason}. Change the price instead.`,
    };
  }

  const kept = invoice.items.filter((i) => i.category !== "Freight");
  const subtotal = priced.amount.add(
    kept.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0))
  );
  const { vatAmount, total } = applyVat(subtotal, invoice.vatPercent, invoice.vatInclusive);

  const refused = await prisma.$transaction(async (tx) => {
    /* Old value first, for every figure the customer has been shown. */
    if (!invoice.total.equals(total)) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "total", oldValue: invoice.total.toString(), newValue: total.toString(), reason },
        tx
      );
    }
    const wasRate = invoice.appliedRate?.toString() ?? null;
    const nowRate = priced.appliedRate?.toString() ?? null;
    if (wasRate !== nowRate) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "appliedRate", oldValue: wasRate, newValue: nowRate, reason },
        tx
      );
    }
    const wasCbm = invoice.billableCbm?.toString() ?? null;
    const nowCbm = priced.billableCbm?.toString() ?? null;
    if (wasCbm !== nowCbm) {
      await recordFieldChange(
        { actor, entity: "Invoice", entityId: invoice.id, field: "billableCbm", oldValue: wasCbm, newValue: nowCbm, reason },
        tx
      );
    }

    await tx.invoiceItem.deleteMany({
      where: { invoiceId: invoice.id, category: "Freight" },
    });
    await tx.invoiceItem.createMany({
      data: priced.items.map((item) => ({ ...item, invoiceId: invoice.id })),
    });
    /* Priced again from the lines this bill carried when it was read, so it
       goes back only onto the bill it was read from. */
    const claim = await tx.invoice.updateMany({
      where: { id: invoice.id, total: invoice.total },
      data: {
        billableCbm: priced.billableCbm,
        billableKg: priced.billableKg,
        standardRate: priced.standardRate,
        appliedRate: priced.appliedRate,
        rateBasis: priced.basis,
        subtotal,
        vatAmount,
        total,
        totalTzs: invoice.fxRate ? usdToTzs(total, invoice.fxRate) : null,
      },
    });
    if (claim.count === 0) throw new BillMoved();
  }).catch((error) => {
    if (error instanceof BillMoved) return MOVED;
    throw error;
  });
  if (refused) return { error: refused };

  const back = priced.appliedRate
    ? `${invoice.currency} ${priced.appliedRate} per CBM`
    : `${invoice.currency} ${total}`;
  await recordAudit({
    actor,
    action: "invoice.reprice.undo",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Put ${invoice.number} back on the rate book at ${back} — ${invoice.currency} ${invoice.total} → ${invoice.currency} ${total}: ${reason}`,
    metadata: {
      from: invoice.total.toString(),
      to: total.toString(),
      rate: priced.appliedRate?.toString() ?? null,
      explanation: priced.explanation,
      reason,
    },
  });
  await tellFinance(actor, invoice, `Re-price taken back — ${back}: ${reason}`);

  await refreshInvoiceStatus(invoice.id);

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath("/app/finance/collections/verify");
  revalidatePath("/app/finance/payments/new", "layout");
  return { ok: `Back on the rate book at ${back} — ${formatCurrency(total, invoice.currency)}.` };
}

/**
 * TAKE THE STORAGE OFF, OR PUT IT BACK.
 *
 * Storage is charged by itself past the free days (lib/storage-charge.ts).
 * What a desk decides is the exception: waiving it for a customer, with a
 * reason, or putting it back after a waiver. Taking it off marks the bill so
 * the nightly charge leaves it alone; putting it back clears the mark and
 * charges it up to today.
 */
export async function chargeStorage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const remove = String(formData.get("remove") ?? "") === "1";

  if (remove) {
    return waiveStorageOn(actor, [invoiceId], String(formData.get("reason") ?? ""));
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: { where: { category: "Storage" } } },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  if (invoice.status === "DRAFT") {
    return { error: "Storage goes on when the bill is issued." };
  }
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };
  if (invoice.items.length > 0 && !invoice.storageWaivedAt) {
    return { ok: "Storage is already on this bill." };
  }

  const settings = await companySettings();
  if (!settings || !settings.storagePerDay.greaterThan(0)) {
    return {
      error:
        "No storage rate is set. An administrator sets one in Settings before it can be charged.",
    };
  }

  if (invoice.storageWaivedAt) {
    await prisma.$transaction(async (tx) => {
      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "storageWaived",
          oldValue: `Waived — ${invoice.storageWaivedReason ?? "no reason given"}`,
          newValue: "Charged",
          reason: "Storage put back on the bill",
        },
        tx
      );
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { storageWaivedAt: null, storageWaivedReason: null },
      });
    });
  }

  const { charged } = await accrueStorage({ cargoIds: [invoice.cargoId] });
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  if (!charged.includes(invoice.id)) {
    const fresh = await prisma.invoiceItem.count({
      where: { invoiceId: invoice.id, category: "Storage" },
    });
    return fresh > 0
      ? { ok: "Storage is back on the bill." }
      : { ok: `Still inside the ${settings.freeStorageDays} free days — it goes on by itself after that.` };
  }
  await recordAudit({
    actor,
    action: "invoice.storage.charge",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `Put storage back on ${invoice.number}`,
  });
  return { ok: "Storage is back on the bill." };
}

/**
 * Take the storage off several bills at once — the payment screen, with the
 * customer at the counter. One reason covers them all; each bill writes its
 * own history.
 */
export async function waiveStorage(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const actor = await authorize("invoice.discount");
  const ids = formData.getAll("invoiceId").map(String).filter(Boolean);
  return waiveStorageOn(actor, ids, String(formData.get("reason") ?? ""));
}

async function waiveStorageOn(
  actor: Awaited<ReturnType<typeof authorize>>,
  invoiceIds: string[],
  rawReason: string
): Promise<ActionState> {
  const reason = rawReason.trim().slice(0, 300);
  if (!reason) return { error: "Say why the storage is being taken off." };
  if (invoiceIds.length === 0) return { error: "Tick the cargo first." };

  const invoices = await prisma.invoice.findMany({
    where: { id: { in: invoiceIds } },
    select: {
      id: true,
      number: true,
      status: true,
      cargoId: true,
      currency: true,
      storageWaivedAt: true,
    },
  });
  let taken = 0;
  let total = new Prisma.Decimal(0);
  let currency = "USD";
  for (const invoice of invoices) {
    if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") continue;
    const settled = await settledRefusal(actor, invoice);
    if (settled) return { error: `${invoice.number}: ${settled}` };

    /*
      WORKED OUT INSIDE THE TRANSACTION, BEHIND THE BILL'S OWN LOCK.

      The lines and the subtotal above were read before the permission check
      ran. Subtracting from a copy that old writes back a figure another desk
      has since changed — a discount agreed on the phone while the counter
      takes the rent off vanishes with it, from a bill the customer has
      already been given. What comes off here is the storage that is on the
      row nobody else can be writing.
    */
    const off = await prisma.$transaction(async (tx) => {
      const live = await billForUpdate(tx, invoice.id);
      const lines = await tx.invoiceItem.findMany({
        where: { invoiceId: invoice.id, category: "Storage" },
        select: { id: true, amount: true },
      });
      const taking = lines.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0));
      /* Nothing on it and already let off: a second press is somebody pressing
         twice, not a second decision, and it must not write a second reason
         against a bill nobody changed. Marking a bill that is inside its free
         days is a decision — "never charge this one" — and goes through. */
      if (taking.isZero() && invoice.storageWaivedAt) return null;
      const subtotal = live.subtotal.sub(taking);
      const { vatAmount, total: newTotal } = applyVat(
        subtotal,
        live.vatPercent,
        live.vatInclusive
      );

      await recordFieldChange(
        {
          actor,
          entity: "Invoice",
          entityId: invoice.id,
          field: "storageWaived",
          oldValue: taking.isZero()
            ? "Charged (nothing yet)"
            : `${invoice.currency} ${taking} storage`,
          newValue: "Waived",
          reason,
        },
        tx
      );
      /* The figure the bill moved by, in the ledger's own words, so a payment
         taken before the waiver still reads as the bill the customer saw. */
      if (!taking.isZero()) {
        await recordFieldChange(
          {
            actor,
            entity: "Invoice",
            entityId: invoice.id,
            field: "total",
            oldValue: live.total.toString(),
            newValue: newTotal.toString(),
            reason,
          },
          tx
        );
      }
      if (lines.length > 0) {
        await tx.invoiceItem.deleteMany({ where: { id: { in: lines.map((i) => i.id) } } });
      }
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          subtotal,
          vatAmount,
          total: newTotal,
          totalTzs: live.fxRate ? usdToTzs(newTotal, live.fxRate) : null,
          storageWaivedAt: new Date(),
          storageWaivedReason: reason,
        },
      });
      return { taking, wasTotal: live.total, nowTotal: newTotal };
    });
    if (!off) continue;

    await recordAudit({
      actor,
      action: "invoice.storage.waive",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Waived ${invoice.currency} ${off.taking} of storage on ${invoice.number} — ${reason}`,
      /* The bill on either side of the waiver. "What was taken off" is not the
         same question as "what the bill came to", and the second is the one
         asked when a customer disputes what they were charged. */
      metadata: {
        amount: off.taking.toString(),
        wasTotal: off.wasTotal.toString(),
        nowTotal: off.nowTotal.toString(),
        reason,
      },
    });
    await refreshInvoiceStatus(invoice.id);
    revalidatePath(`/app/finance/invoices/${invoice.id}`);
    taken++;
    total = total.add(off.taking);
    currency = invoice.currency;
  }
  if (taken === 0) return { error: "There is no storage on those bills." };
  revalidatePath("/app/finance/payments");
  return {
    ok:
      taken === 1
        ? `${currency} ${total} of storage taken off. It will not be charged again.`
        : `${currency} ${total} of storage taken off ${taken} bills. It will not be charged again.`,
  };
}


/**
 * THE EXCHANGE RATE ON ONE BILL.
 *
 * The dollar total does not move — only what it comes to in shillings. Used when
 * the counter agreed a rate with this customer that is not the board's. Payments
 * already taken keep the shilling value they were taken at; the balance is the
 * new shilling total less those.
 */
export async function changeInvoiceRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  /* The shillings a customer was told to pay move with this figure while the
     dollar total sits still, so it is the bill's own desk that moves it —
     never the desk that only quotes it over the phone. */
  const actor = await authorize("invoice.edit");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const raw = String(formData.get("rate") ?? "").replace(/,/g, "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!/^\d+(\.\d{1,6})?$/.test(raw)) return { error: "Enter the rate, e.g. 2700." };
  const rate = new Prisma.Decimal(raw);
  if (rateOutOfBand(rate)) {
    return { error: "That rate is outside any sensible USD → TZS range." };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };
  if (invoice.currency !== "USD") return { error: "Only a dollar bill has an exchange rate." };
  if (invoice.fxRate && invoice.fxRate.equals(rate)) return { error: "That is already the rate on this bill." };

  const totalTzs = await prisma.$transaction(async (tx) => {
    /* The shillings follow the dollar total the bill carries now, not the one
       this press was read against: a discount landing in between would leave
       the two figures on the bill saying different things. */
    const live = await billForUpdate(tx, invoice.id);
    const shillings = usdToTzs(live.total, rate);
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "fxRate",
        oldValue: invoice.fxRate,
        newValue: rate,
        reason: note || "Rate agreed for this bill",
      },
      tx
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      /* No longer the published row: this bill carries a rate of its own. */
      data: { fxRate: rate, exchangeRateId: null, totalTzs: shillings },
    });
    await recordAudit(
      {
        actor,
        action: "invoice.rate",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `${invoice.number}: ${invoice.fxRate ? formatRate(invoice.fxRate) : "no rate"} → ${formatRate(rate)}${note ? ` — ${note}` : ""}`,
        metadata: {
          oldValue: invoice.fxRate?.toString() ?? null,
          newValue: rate.toString(),
          reason: note || null,
        },
      },
      tx
    );
    return shillings;
  });

  await refreshInvoiceStatus(invoice.id);
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath(`/app/cargo/${invoice.cargoId}`);
  revalidatePath("/app/finance/collections");
  return { ok: `Rate on ${invoice.number} is now ${formatRate(rate)} — ${formatCurrency(totalTzs, "TZS")}.` };
}

/**
 * PUT THE RATE BACK.
 *
 * The shillings a customer was told to pay moved while the dollar total sat
 * still, and Finance — meeting the bill on the verify row — may not agree the
 * rate it moved to. It goes back to the rate pinned before the change, taken
 * off this bill's own field trail, which is where every other screen reads
 * "what has this been?" from.
 *
 * A BILL WHOSE EARLIER RATE LEFT NO TRAIL IS NOT GUESSED AT. Rather than
 * inventing a figure, it is refused and today's published rate is offered
 * instead — and taking that offer is a decision somebody makes on purpose,
 * which is what `useToday` is. The rate row is re-pinned only when it is
 * today's: a recovered figure is a figure this bill carried, not a row on the
 * board, and claiming the board published it would be a second untruth.
 */
export async function undoInvoiceRate(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  /* The desk that owns the bill moved it; the same desk moves it back. */
  const actor = await authorize("invoice.edit");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const useToday = formData.get("useToday") === "1";
  const reason =
    String(formData.get("reason") ?? "").trim() || "Rate not agreed by Finance";

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };
  if (invoice.currency !== "USD") return { error: "Only a dollar bill has an exchange rate." };

  const standing = await changeStanding(invoice.id, "invoice.rate");
  if (!standing) return { error: "This bill's rate has not been changed." };

  const was = await prisma.fieldChange.findFirst({
    where: { entity: "Invoice", entityId: invoice.id, field: "fxRate", oldValue: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { oldValue: true },
  });
  const published = was && !useToday ? null : await currentExchangeRate();
  if (!was && !useToday) {
    return {
      error: published
        ? `This bill does not say what its rate was before it was changed. Put it on today's published rate (${formatRate(published.rate)}) instead.`
        : "This bill does not say what its rate was before it was changed, and no rate is published today.",
    };
  }
  const rate =
    was && !useToday ? new Prisma.Decimal(was.oldValue!) : published ? published.rate : null;
  if (!rate) return { error: "No rate is published today." };
  if (invoice.fxRate && invoice.fxRate.equals(rate)) {
    return { error: "That is already the rate on this bill." };
  }

  const totalTzs = await prisma.$transaction(async (tx) => {
    /* The shillings follow the dollar total the bill carries now. */
    const live = await billForUpdate(tx, invoice.id);
    const shillings = usdToTzs(live.total, rate);
    await recordFieldChange(
      {
        actor,
        entity: "Invoice",
        entityId: invoice.id,
        field: "fxRate",
        oldValue: invoice.fxRate,
        newValue: rate,
        reason,
      },
      tx
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        fxRate: rate,
        exchangeRateId: was && !useToday ? null : (published?.id ?? null),
        totalTzs: shillings,
      },
    });
    await recordAudit(
      {
        actor,
        action: "invoice.rate.undo",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `${invoice.number}: ${formatRate(invoice.fxRate)} → ${formatRate(rate)}${
          was && !useToday ? " — the rate it was pinned at" : " — today's published rate"
        }: ${reason}`,
        metadata: {
          oldValue: invoice.fxRate?.toString() ?? null,
          newValue: rate.toString(),
          recovered: Boolean(was && !useToday),
          reason,
        },
      },
      tx
    );
    return shillings;
  });

  await tellFinance(actor, invoice, `Rate put back to ${formatRate(rate)}: ${reason}`);

  await refreshInvoiceStatus(invoice.id);
  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath(`/app/cargo/${invoice.cargoId}`);
  revalidatePath("/app/finance/collections", "layout");
  revalidatePath("/app/finance/payments/new", "layout");
  return { ok: `Rate on ${invoice.number} is back at ${formatRate(rate)} — ${formatCurrency(totalTzs, "TZS")}.` };
}

/**
 * ADJUST THIS INVOICE, AS ONE SAVE.
 *
 * The editor on the invoice page shows every figure a desk may correct — the
 * rate per CBM, storage, an additional charge, a discount, the exchange rate
 * and the note printed on the bill — and sends only the ones that changed. Each
 * is applied by the same action that does it on its own, in the order that
 * keeps VAT honest (price first, then what is added, then what is taken off,
 * then what it comes to in shillings), and each writes its own history. It
 * stops at the first refusal and says which one.
 */
export async function saveInvoiceAdjustments(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  await authorize("invoice.discount");

  const invoiceId = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  if (invoice.status === "CANCELLED") return { error: "That invoice is cancelled." };

  const num = (key: string) => {
    const raw = String(formData.get(key) ?? "").replace(/,/g, "").trim();
    return raw === "" ? null : Number(raw);
  };
  const steps: { label: string; run: () => Promise<ActionState> }[] = [];
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    f.set("invoiceId", invoice.id);
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  const rate = num("appliedRate");
  if (rate !== null && (!invoice.appliedRate || !invoice.appliedRate.equals(rate))) {
    steps.push({
      label: "rate per CBM",
      run: () => repriceInvoice({}, form({ rate: String(rate), reason })),
    });
  }

  const hasStorage = invoice.items.some((i) => i.category === "Storage");
  const wantStorage = formData.get("storage") === "on";
  if (wantStorage !== hasStorage) {
    steps.push({
      label: "storage",
      run: () => chargeStorage({}, form(wantStorage ? { reason } : { remove: "1", reason })),
    });
  }

  const extra = num("additionalCharge");
  if (extra !== null && extra !== 0) {
    steps.push({
      label: "additional charge",
      run: () =>
        addInvoiceCharge(
          form({
            amount: String(extra),
            description: String(formData.get("chargeDescription") ?? "").trim(),
            reason,
          })
        ),
    });
  }

  const discount = num("discount");
  if (discount !== null && discount > 0) {
    steps.push({
      label: "discount",
      run: () => discountInvoice({}, form({ amount: String(discount), currency: "USD", reason })),
    });
  }

  const fx = String(formData.get("fxRate") ?? "").replace(/,/g, "").trim();
  if (fx && invoice.currency === "USD" && (!invoice.fxRate || !invoice.fxRate.equals(fx))) {
    steps.push({
      label: "exchange rate",
      run: () => changeInvoiceRate({}, form({ rate: fx, note: reason })),
    });
  }

  const note = String(formData.get("notes") ?? "").trim();
  if (note !== (invoice.notes ?? "")) {
    steps.push({ label: "note", run: () => setInvoiceNote(invoice.id, note) });
  }

  if (steps.length === 0) return { error: "Nothing was changed." };

  const done: string[] = [];
  for (const step of steps) {
    const result = await step.run();
    if (result.error) {
      return {
        error: `${done.length ? `Saved ${done.join(", ")}. ` : ""}The ${step.label} was not changed: ${result.error}`,
      };
    }
    done.push(step.label);
  }

  revalidatePath(`/app/finance/invoices/${invoice.id}`);
  revalidatePath(`/app/cargo/${invoice.cargoId}`);
  revalidatePath("/app/finance/collections");
  return { ok: `Saved: ${done.join(", ")}.` };
}

/** A charge added to an issued bill — repacking, handling, delivery. Its own line. */
async function addInvoiceCharge(formData: FormData): Promise<ActionState> {
  const actor = await authorize("invoice.discount");
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = String(formData.get("description") ?? "").trim() || "Additional charge";
  const reason = String(formData.get("reason") ?? "").trim() || "No reason given";
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "An additional charge has to be above zero. Use a discount to take money off." };
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "That invoice no longer exists." };
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };

  const value = new Prisma.Decimal(amount).toDecimalPlaces(2);

  await prisma.$transaction(async (tx) => {
    const live = await billForUpdate(tx, invoice.id);
    const subtotal = live.subtotal.add(value);
    const { vatAmount, total } = applyVat(subtotal, live.vatPercent, live.vatInclusive);

    await tx.invoiceItem.create({
      data: {
        invoiceId: invoice.id,
        description,
        quantity: new Prisma.Decimal(1),
        unit: null,
        unitPrice: value,
        amount: value,
        category: "Charge",
        taxable: true,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal,
        vatAmount,
        total,
        totalTzs: live.fxRate ? usdToTzs(total, live.fxRate) : null,
      },
    });
    await recordAudit(
      {
        actor,
        action: "invoice.charge",
        entity: "Invoice",
        entityId: invoice.id,
        summary: `Added ${formatCurrency(value, invoice.currency)} to ${invoice.number}: ${description}${reason ? ` — ${reason}` : ""}`,
        metadata: { oldValue: live.total.toString(), newValue: total.toString(), reason },
      },
      tx
    );
  });
  await refreshInvoiceStatus(invoice.id);
  return { ok: "Charge added." };
}

async function setInvoiceNote(invoiceId: string, note: string): Promise<ActionState> {
  const actor = await authorize("invoice.discount");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { notes: true, status: true, cargoId: true },
  });
  if (!invoice) return { error: "That invoice no longer exists." };
  /* The note is printed on the bill and on its PDF, so it is part of the
     document the customer is holding and runs on the same rail as the figures
     beside it. Without this, the one line on a paid or already-handed-over
     bill that `invoice.discount` alone could still rewrite was the sentence
     explaining the rest of it. */
  const settled = await settledRefusal(actor, invoice);
  if (settled) return { error: settled };
  await prisma.$transaction(async (tx) => {
    await recordFieldChange(
      { actor, entity: "Invoice", entityId: invoiceId, field: "notes", oldValue: invoice.notes, newValue: note || null },
      tx
    );
    await tx.invoice.update({ where: { id: invoiceId }, data: { notes: note || null } });
  });
  return { ok: "Note saved." };
}
