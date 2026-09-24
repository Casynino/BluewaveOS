import { Prisma, type CargoStatus } from "@prisma/client";

import { mergedLinks } from "@/lib/cargo-links";
import { formatCurrency, fromBase } from "@/lib/currency";
import type { MergeLetterContext } from "@/lib/messages";
import { accountsForInvoice, type InvoiceAccount } from "@/lib/invoice-accounts";
import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";
import { storageState, storageStart } from "@/lib/storage-clock";
import { storageOnCargo } from "@/lib/storage-fee";
import { BLUEWAVE_STAGE_LABEL, bluewaveStageOf } from "@/lib/tracking-stage";
import { referenceFromInput } from "@/lib/tracking";

/**
 * SEVERAL CONSIGNMENTS, ONE THING TO PAY — AND NOTHING MERGED AWAY.
 *
 * The owner's rule: merge the payment, never the cargo. Each consignment keeps
 * its own reference, its own QR, its own timeline and its own invoice; this
 * only reads them back as the group a single transfer covers, so the customer
 * has one figure to send and one document to hold.
 *
 * Nothing here writes. It is the one definition of "the bills this cargo is
 * paid with", read by the WhatsApp letter, the public tracking page and the
 * combined-bill PDF, so the three cannot disagree about what is owed.
 *
 * WHICH BILLS ARE IN THE GROUP:
 *
 *  - the customer's bills that a merged payment already ties together
 *    (`Payment.transactionRef`, written by lib/actions/merge.ts), so the link
 *    still opens the same set after the money has landed and every bill reads
 *    "paid"; otherwise
 *  - the customer's open bills, which is what the desk is looking at when it
 *    presses Notify.
 *
 * A DRAFT is Finance's working and is nobody's bill: it is never in the group,
 * never in the letter and never in the document. A cancelled bill is not owed
 * either.
 */

/** The bills a customer can be asked to pay. */
const OPEN_STATUS = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export type MergedBillRow = {
  invoiceId: string;
  invoiceNumber: string;
  issuedAt: Date | null;
  currency: string;
  /** The rate FROZEN ON THIS BILL. Never today's. */
  rate: Prisma.Decimal | null;
  reference: string;
  description: string;
  status: CargoStatus;
  /** Where this consignment stands, in its own right. */
  stageLabel: string;
  container: string | null;
  packages: number | null;
  pieces: number | null;
  cbm: Prisma.Decimal | null;
  arrivedAt: Date | null;
  total: Prisma.Decimal;
  totalTzs: Prisma.Decimal | null;
  paid: Prisma.Decimal;
  paidTzs: Prisma.Decimal | null;
  outstanding: Prisma.Decimal;
  outstandingTzs: Prisma.Decimal | null;
  settled: boolean;
};

/** One transfer that landed, kept as its own line. */
export type MergedPaymentRow = {
  reference: string;
  invoiceNumber: string;
  amount: Prisma.Decimal;
  currency: string;
  paidAt: Date;
};

export type MergedTotals = {
  /** Shillings, summed in shillings. Null when no bill in the group converts. */
  billedTzs: Prisma.Decimal | null;
  paidTzs: Prisma.Decimal | null;
  outstandingTzs: Prisma.Decimal | null;
  /** Each bill's own dollar figure added up — an equivalent, not a conversion. */
  billedUsd: Prisma.Decimal | null;
  paidUsd: Prisma.Decimal | null;
  outstandingUsd: Prisma.Decimal | null;
  /** A dollar bill with no rate cannot join the shillings and is kept apart. */
  unconvertedOutstanding: Prisma.Decimal;
};

export type MergedStorage = {
  arrivedAt: Date;
  freeDays: number;
  lastFreeDay: Date;
  chargeableDays: number;
  /** What the clock works out to. A calculation, and nobody's bill. */
  amount: Prisma.Decimal;
  currency: string;
  /**
   * WHAT THE BILLS IN THE GROUP ACTUALLY CARRY, added off their storage lines.
   *
   * A different figure from `amount` and the only one a customer may be shown
   * as a charge: storage becomes money when Finance presses the button, and a
   * letter that names the clock's reading as a charge is asking for shillings
   * no invoice in the group is asking for. Null when the bills carrying
   * storage are not all in one currency — dollars are not added to shillings
   * to make a sentence read.
   */
  charged: Prisma.Decimal | null;
  chargedCurrency: string | null;
  state: "free" | "charged" | "waived";
};

export type MergedBill = {
  customerId: string;
  customerName: string;
  customerCode: string;
  phone: string | null;
  address: string | null;
  /** The reference the merged payment carries, when one already does. */
  mergeRef: string | null;
  rows: MergedBillRow[];
  payments: MergedPaymentRow[];
  /** The goods, added up — never a figure that replaces a consignment's own. */
  summary: { packages: number; pieces: number; cbm: Prisma.Decimal };
  totals: MergedTotals;
  status: "UNPAID" | "PART_PAID" | "PAID";
  /** One rate only when every bill in the group was pinned at the same one. */
  sharedRate: Prisma.Decimal | null;
  storage: MergedStorage | null;
  accounts: InvoiceAccount[];
};

const ZERO = () => new Prisma.Decimal(0);

const INVOICE_INCLUDE = {
  payments: {
    select: {
      id: true,
      reference: true,
      status: true,
      amount: true,
      currency: true,
      fxRate: true,
      baseCurrencyAmount: true,
      creditedAmount: true,
      transactionRef: true,
      paidAt: true,
      createdAt: true,
    },
  },
  /* The storage lines only: what the group has actually been charged for the
     floor, as against what the clock reads. */
  items: { where: { category: "Storage" }, select: { amount: true } },
  cargo: {
    select: {
      reference: true,
      description: true,
      status: true,
      darArrivedAt: true,
      darReceiving: { select: { packagesCount: true, piecesCount: true, cbm: true, receivedAt: true } },
      /* The day the boxes went. The clock stops there — a consignment handed
         over on credit is still in this group and is not still accruing. */
      release: { select: { releasedAt: true } },
      chinaReceiving: { select: { packagesCount: true, piecesCount: true, cbm: true } },
      containerLines: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { container: { select: { reference: true, containerNumber: true } } },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

type LoadedInvoice = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

/**
 * THE GROUP THIS CONSIGNMENT IS PAID WITH, OR NOTHING.
 *
 * The customer is resolved from the cargo the caller names and from nowhere
 * else. The link a customer holds is signed over one reference (lib/track-key),
 * and widening it to the rest of that customer's bills is only safe while the
 * customer is read out of the record rather than out of the address bar.
 */
export async function mergedBillFor(raw: string): Promise<MergedBill | null> {
  const reference = referenceFromInput(raw);
  if (!reference) return null;

  const anchor = await prisma.invoice.findFirst({
    where: {
      status: { notIn: ["DRAFT", "CANCELLED"] },
      cargo: { deletedAt: null, reference: { equals: reference, mode: "insensitive" } },
    },
    orderBy: { createdAt: "desc" },
    include: INVOICE_INCLUDE,
  });
  if (!anchor) return null;

  /*
    WHICH GROUP, AND WHY.

    While this consignment's own bill is still owed, the group is everything
    that customer owes now — that is the figure the desk is asking for and the
    one the customer is about to send. Once it is settled the group is the
    merge its payment was taken under, so the link in a letter already sent
    still opens the same consignments and says they are paid, rather than
    quietly becoming a demand for bills raised since.
  */
  const settled = balanceOf(anchor).settled;
  const mergeRef = anchor.payments.find((p) => p.transactionRef)?.transactionRef ?? null;
  if (settled && !mergeRef) return null;

  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: anchor.customerId,
      status: { notIn: ["DRAFT", "CANCELLED"] },
      cargo: { deletedAt: null },
      ...(settled
        ? { payments: { some: { transactionRef: mergeRef } } }
        : { status: { in: [...OPEN_STATUS] } }),
    },
    orderBy: [{ issuedAt: "asc" }, { createdAt: "asc" }],
    include: INVOICE_INCLUDE,
  });

  /* A settled bill nobody is chasing does not belong in a letter asking for
     payment; the merge it was paid under keeps all of its own. */
  const kept = settled ? invoices : invoices.filter((i) => balanceOf(i).outstanding.greaterThan(0));
  if (kept.length === 0) return null;

  const [customer, company] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: anchor.customerId },
      select: { id: true, code: true, fullName: true, businessName: true, phone: true, address: true },
    }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
  ]);
  if (!customer) return null;

  const rows = kept.map(rowOf);
  /* The accounts the oldest bill in the group was issued with: the customer is
     being asked for one transfer, and a bill's own copy is the one that cannot
     be changed under them. See lib/invoice-accounts.ts. */
  const accounts = await accountsForInvoice(kept[0].paymentSnapshot);

  return {
    customerId: customer.id,
    customerName: customer.businessName || customer.fullName,
    customerCode: customer.code,
    phone: customer.phone ?? null,
    address: customer.address ?? null,
    /* Named only where it is what the group IS: on a bill still owed, an
       earlier transfer's reference would read as the reference to pay under. */
    mergeRef: settled ? mergeRef : null,
    rows,
    payments: paymentsOf(kept),
    summary: summaryOf(kept),
    totals: totalsOf(rows),
    status: statusOf(rows),
    sharedRate: sharedRateOf(rows),
    storage: storageOf(kept, company),
    accounts,
  };
}

/**
 * THE CONSIGNMENT THE LINK IS SIGNED OVER.
 *
 * Any of them opens the whole group, so the one chosen is the one that reads
 * best to the customer: something that has landed in Dar, because that is the
 * cargo they are being asked to pay for and collect.
 */
export function anchorOf(merged: MergedBill): string {
  const landed = merged.rows.find((row) => row.arrivedAt !== null);
  return (landed ?? merged.rows[0]).reference;
}

/**
 * The merged group as the WhatsApp letter needs it.
 *
 * Every figure is already derived — this only formats. The letter, the merged
 * tracking page and the PDF all read the same `MergedBill`, so a customer
 * comparing the three finds the same figures on all of them.
 */
export function mergeLetterContextFor(
  merged: MergedBill,
  options: { reference?: string; pickupAddress?: string | null } = {}
): MergeLetterContext {
  const reference = options.reference ?? anchorOf(merged);
  const links = mergedLinks(reference);
  const totals = merged.totals;
  const plain = (value: Prisma.Decimal | null, currency: string) =>
    value ? formatCurrency(value, currency).replace(`${currency} `, "") : null;

  return {
    customerName: merged.customerName,
    cargo: merged.rows.map((row) => ({
      reference: row.reference,
      description: row.description,
      outstanding: row.outstandingTzs
        ? formatCurrency(row.outstandingTzs, "TZS")
        : formatCurrency(row.outstanding, row.currency),
      stage: row.stageLabel,
    })),
    packages: merged.summary.packages || null,
    pieces: merged.summary.pieces || null,
    cbm: merged.summary.cbm.greaterThan(0) ? merged.summary.cbm.toFixed(3) : null,
    containers: merged.rows.map((row) => row.container).filter((c): c is string => Boolean(c)),
    /* What was billed, and only once something has been received against it:
       with nothing paid it repeats the figure the customer is asked for. */
    billedTzs:
      totals.paidTzs && totals.paidTzs.greaterThan(0) ? plain(totals.billedTzs, "TZS") : null,
    paidTzs: totals.paidTzs && totals.paidTzs.greaterThan(0) ? plain(totals.paidTzs, "TZS") : null,
    amountTzs: plain(totals.outstandingTzs, "TZS"),
    amountUsd: plain(totals.outstandingUsd, "USD"),
    fxRate: merged.sharedRate ? plain(merged.sharedRate.toDecimalPlaces(0), "TZS") : null,
    paid: merged.status === "PAID",
    partlyPaid: merged.status === "PART_PAID",
    freeStorageDays: merged.storage?.freeDays ?? null,
    storageFrom: merged.storage?.arrivedAt ?? null,
    lastFreeDay: merged.storage?.lastFreeDay ?? null,
    /* "Storage iliyokwisha tozwa" is a statement that money has been charged,
       so it names the storage the bills carry and never the clock's reading.
       The clock is a figure Finance may decide to bill; quoting it to the
       customer alongside an amount due that excludes it is asking them to pay
       for something no invoice in the group is asking for. */
    storageCharge:
      merged.storage && merged.storage.charged && merged.storage.charged.greaterThan(0)
        ? formatCurrency(merged.storage.charged, merged.storage.chargedCurrency ?? merged.storage.currency)
        : null,
    pickupAddress: options.pickupAddress ?? null,
    trackLink: links.track,
    invoiceLink: links.invoice,
  };
}

function rowOf(invoice: LoadedInvoice): MergedBillRow {
  const balance = balanceOf(invoice);
  const counted = invoice.cargo.darReceiving ?? invoice.cargo.chinaReceiving;
  const container = invoice.cargo.containerLines[0]?.container ?? null;
  const stage = bluewaveStageOf(invoice.cargo.status);
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    issuedAt: invoice.issuedAt,
    currency: invoice.currency,
    rate: balance.rate,
    reference: invoice.cargo.reference,
    description: invoice.cargo.description ?? "",
    status: invoice.cargo.status,
    stageLabel: stage ? BLUEWAVE_STAGE_LABEL[stage] : "Not yet received",
    container: container?.containerNumber ?? container?.reference ?? null,
    packages: counted?.packagesCount ?? null,
    pieces: counted?.piecesCount ?? null,
    cbm: counted?.cbm ?? null,
    arrivedAt: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.darArrivedAt),
    total: balance.total,
    totalTzs: balance.totalTzs,
    paid: balance.paid,
    paidTzs: balance.paidTzs,
    outstanding: balance.outstanding,
    outstandingTzs: balance.outstandingTzs,
    settled: balance.settled,
  };
}

/**
 * WHAT ACTUALLY LANDED, ONE TRANSFER PER LINE.
 *
 * Only VERIFIED money: a screenshot somebody uploaded is a claim and is worth
 * nothing until Finance says otherwise. USD 100 on the 20th and TZS 810,000 on
 * the 21st stay two lines in two currencies — rolling them into one figure
 * would invent a payment nobody made.
 */
function paymentsOf(invoices: LoadedInvoice[]): MergedPaymentRow[] {
  return invoices
    .flatMap((invoice) =>
      invoice.payments
        .filter((p) => p.status === "VERIFIED")
        .map((p) => ({
          reference: p.reference,
          invoiceNumber: invoice.number,
          amount: new Prisma.Decimal(p.amount),
          currency: p.currency,
          /* The day the money moved, or the day it was written down when
             nobody said otherwise. */
          paidAt: p.paidAt ?? p.createdAt,
        }))
    )
    .sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
}

/** The goods as counted: Dar's figures where Dar has counted, China's before. */
function summaryOf(invoices: LoadedInvoice[]) {
  let packages = 0;
  let pieces = 0;
  let cbm = ZERO();
  for (const invoice of invoices) {
    const counted = invoice.cargo.darReceiving ?? invoice.cargo.chinaReceiving;
    packages += counted?.packagesCount ?? 0;
    pieces += counted?.piecesCount ?? 0;
    if (counted?.cbm) cbm = cbm.add(counted.cbm);
  }
  return { packages, pieces, cbm };
}

/**
 * The group's figures.
 *
 * Shillings are summed in shillings, each bill having been valued at its own
 * pinned rate by `balanceOf`. The dollar figure beside them is each bill's own
 * dollar figure added up — an equivalent, never a conversion of the total at
 * one rate. A dollar bill with no rate at all cannot be counted in shillings
 * and is kept apart from them.
 */
function totalsOf(rows: MergedBillRow[]): MergedTotals {
  let billedTzs: Prisma.Decimal | null = null;
  let paidTzs: Prisma.Decimal | null = null;
  let outstandingTzs: Prisma.Decimal | null = null;
  let billedUsd: Prisma.Decimal | null = null;
  let paidUsd: Prisma.Decimal | null = null;
  let outstandingUsd: Prisma.Decimal | null = null;
  let unconvertedOutstanding = ZERO();

  const usd = (own: Prisma.Decimal, row: MergedBillRow, tzs: Prisma.Decimal) =>
    row.currency === "USD" ? own : fromBase(tzs, "USD", row.rate);

  for (const row of rows) {
    if (row.totalTzs === null || row.paidTzs === null || row.outstandingTzs === null) {
      unconvertedOutstanding = unconvertedOutstanding.add(row.outstanding);
      continue;
    }
    billedTzs = (billedTzs ?? ZERO()).add(row.totalTzs);
    paidTzs = (paidTzs ?? ZERO()).add(row.paidTzs);
    outstandingTzs = (outstandingTzs ?? ZERO()).add(row.outstandingTzs);
    billedUsd = (billedUsd ?? ZERO()).add(usd(row.total, row, row.totalTzs));
    paidUsd = (paidUsd ?? ZERO()).add(usd(row.paid, row, row.paidTzs));
    outstandingUsd = (outstandingUsd ?? ZERO()).add(usd(row.outstanding, row, row.outstandingTzs));
  }

  return {
    billedTzs,
    paidTzs,
    outstandingTzs,
    billedUsd,
    paidUsd,
    outstandingUsd,
    unconvertedOutstanding,
  };
}

function statusOf(rows: MergedBillRow[]): MergedBill["status"] {
  if (rows.every((row) => row.settled)) return "PAID";
  const paid = rows.some((row) => (row.paidTzs ?? row.paid).greaterThan(0));
  return paid ? "PART_PAID" : "UNPAID";
}

/**
 * The rate the group was pinned at, when there is one.
 *
 * Two bills issued in different months carry different rates, and printing one
 * of them over both would be wrong for half the money. Nothing is said instead.
 */
function sharedRateOf(rows: MergedBillRow[]): Prisma.Decimal | null {
  const rates = rows.map((row) => row.rate);
  if (rates.some((rate) => rate === null)) return null;
  const first = rates[0]!;
  return rates.every((rate) => rate!.equals(first)) ? first : null;
}

/**
 * The floor clock for the group, counted from the consignment that landed
 * first — the one whose free days run out soonest.
 */
function storageOf(
  invoices: LoadedInvoice[],
  company: { freeStorageDays: number | null; storagePerDay: Prisma.Decimal | null; storageCurrency: string | null } | null
): MergedStorage | null {
  const freeDays = company?.freeStorageDays ?? 7;
  const perDay = company?.storagePerDay ?? 0;
  const currency = company?.storageCurrency ?? "USD";

  const arrivals = invoices
    .map((invoice) => storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.darArrivedAt))
    .filter((date): date is Date => date !== null);
  if (arrivals.length === 0) return null;

  const first = arrivals.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
  const clock = storageState({ arrivedAt: first, freeDays, perDay: null, currency, now: new Date() });

  let amount = ZERO();
  let chargeableDays = 0;
  let configured = false;
  /* What the bills carry, kept in the currency they carry it in. Two bills in
     two currencies cannot be added, and the group then says nothing rather
     than a figure made of both. */
  let charged = ZERO();
  let chargedCurrency: string | null = null;
  let mixed = false;
  for (const invoice of invoices) {
    const position = storageOnCargo(invoice.cargo, {
      freeStorageDays: freeDays,
      storagePerDay: perDay,
      storageCurrency: currency,
    });
    amount = amount.add(position.amount);
    chargeableDays = Math.max(chargeableDays, position.chargeableDays);
    configured ||= position.configured;

    const onBill = invoice.items.reduce((sum, item) => sum.add(item.amount), ZERO());
    if (onBill.isZero()) continue;
    if (chargedCurrency !== null && chargedCurrency !== invoice.currency) mixed = true;
    chargedCurrency = invoice.currency;
    charged = charged.add(onBill);
  }

  return {
    arrivedAt: first,
    freeDays: clock.freeDays,
    lastFreeDay: clock.lastFreeDay,
    chargeableDays,
    amount,
    currency,
    charged: mixed || charged.isZero() ? null : charged,
    chargedCurrency: mixed ? null : chargedCurrency,
    /* Nothing is charged where the business has set no rate: saying "free" of a
       clock that is not running would promise the customer a deadline. */
    state: !configured ? "waived" : chargeableDays > 0 ? "charged" : "free",
  };
}
