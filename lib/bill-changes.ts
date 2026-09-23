import "server-only";

import { Prisma } from "@prisma/client";

import type { BillChange } from "@/components/app/bill-changes";
import { formatCurrency, formatRate } from "@/lib/currency";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type { BillChange };

/** The actions that move a figure a customer has already been shown. */
const MADE = {
  discount: "invoice.discount",
  reprice: "invoice.reprice",
  fx: "invoice.rate",
} as const;
const PUT_BACK = {
  discount: "invoice.discount.undo",
  reprice: "invoice.reprice.undo",
  fx: "invoice.rate.undo",
} as const;

const WATCHED: string[] = [...Object.values(MADE), ...Object.values(PUT_BACK)];

/**
 * WHAT WAS DONE TO THESE BILLS, IN ONE PLACE.
 *
 * Finance agrees money against a figure somebody else may have moved — and a
 * discount is not the only way to move one. A bill re-priced under the rate
 * book, or pinned to an exchange rate the board never published, reads on the
 * verify row exactly like a bill nobody touched. Each such change is named
 * here, with the desk that made it, the day, and the figure putting it back
 * would restore.
 *
 * One derivation, because three screens ask the same question: the verify row,
 * the correction dialog and the merge form — and a merged payment asks it over
 * several bills at once. Figures are worded here (money is never translated);
 * the words around them belong to the component, which has the locale.
 *
 * WHAT IS NOT SHOWN. A change already put back leaves the row — the trail still
 * carries both halves, but a badge for a discount no longer on the bill is a
 * warning about nothing. Nor is a bill first priced at an agreed rate a change:
 * nobody moved it after the customer was told.
 */
export async function billChangesFor(
  invoiceIds: string[]
): Promise<Map<string, BillChange[]>> {
  const ids = [...new Set(invoiceIds.filter(Boolean))];
  const out = new Map<string, BillChange[]>();
  if (ids.length === 0) return out;

  const [invoices, lines, fxTrail, today] = await Promise.all([
    prisma.invoice.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        number: true,
        currency: true,
        total: true,
        discount: true,
        appliedRate: true,
        standardRate: true,
        billableCbm: true,
        fxRate: true,
      },
    }),
    prisma.auditLog.findMany({
      where: { entity: "Invoice", entityId: { in: ids }, action: { in: WATCHED } },
      orderBy: { createdAt: "desc" },
      select: {
        entityId: true,
        action: true,
        createdAt: true,
        actor: { select: { name: true } },
        actorEmail: true,
      },
    }),
    /* The rate this bill carried before it was moved. Read off the field trail
       rather than an audit summary, because the trail is what every other
       screen answers "what has this been?" from. */
    prisma.fieldChange.findMany({
      where: { entity: "Invoice", entityId: { in: ids }, field: "fxRate" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, oldValue: true },
    }),
    prisma.exchangeRate.findFirst({
      where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
      orderBy: { effectiveFrom: "desc" },
      select: { rate: true },
    }),
  ]);

  /* Newest line of each action, per bill — a change made twice is one change,
     and a change put back after it was made is no change at all. */
  const newest = new Map<string, { at: Date; by: string | null }>();
  for (const line of lines) {
    if (!line.entityId) continue;
    const key = `${line.entityId}:${line.action}`;
    if (newest.has(key)) continue;
    newest.set(key, {
      at: line.createdAt,
      by: line.actor?.name ?? line.actorEmail ?? null,
    });
  }

  for (const invoice of invoices) {
    const standing = (kind: keyof typeof MADE) => {
      const made = newest.get(`${invoice.id}:${MADE[kind]}`);
      if (!made) return null;
      const back = newest.get(`${invoice.id}:${PUT_BACK[kind]}`);
      return back && back.at >= made.at ? null : made;
    };
    const changes: BillChange[] = [];
    const head = { invoiceId: invoice.id, invoiceNumber: invoice.number };

    /* Taken off the bill: the figure is on the invoice, who and when is the
       line that wrote it. A bill discounted before that line existed keeps its
       badge and loses only the name. */
    if (new Prisma.Decimal(invoice.discount).greaterThan(0)) {
      const made = standing("discount") ?? newest.get(`${invoice.id}:${MADE.reprice}`) ?? null;
      const off = formatCurrency(invoice.discount, invoice.currency);
      changes.push({
        ...head,
        kind: "discount",
        figure: off,
        book: null,
        volume: null,
        by: made?.by ?? null,
        at: made ? formatDateTime(made.at) : null,
        undo: { to: off, recovered: true },
      });
    }

    const repriced = standing("reprice");
    if (repriced) {
      const book = invoice.standardRate;
      changes.push({
        ...head,
        kind: "reprice",
        figure: invoice.appliedRate
          ? `${formatCurrency(invoice.appliedRate, invoice.currency)}/CBM`
          : /* Several freight lines at several rates: no one rate to name, so
               the bill's own total stands in for it. */
            formatCurrency(invoice.total, invoice.currency),
        book: book ? formatCurrency(book, invoice.currency) : null,
        volume: invoice.billableCbm
          ? `${invoice.billableCbm.toDecimalPlaces(3).toString()} CBM`
          : null,
        by: repriced.by,
        at: formatDateTime(repriced.at),
        /* Nothing to put back to when the bill does not say what the book
           said: the goods took a rate typed for a unit the book has no price
           for, or the bill predates the column. */
        undo: book
          ? { to: `${formatCurrency(book, invoice.currency)}/CBM`, recovered: true }
          : null,
      });
    }

    const moved = standing("fx");
    if (moved) {
      /* The rate pinned immediately before the last move — the figure the
         customer was told. An older bill whose move left no trail cannot be
         put back to it, and says so rather than guessing. */
      const was = fxTrail.find((c) => c.entityId === invoice.id && c.oldValue)?.oldValue ?? null;
      changes.push({
        ...head,
        kind: "fx",
        figure: formatRate(invoice.fxRate),
        book: null,
        volume: null,
        by: moved.by,
        at: formatDateTime(moved.at),
        undo: was
          ? { to: formatRate(was), recovered: true }
          : today
            ? { to: formatRate(today.rate), recovered: false }
            : null,
      });
    }

    if (changes.length) out.set(invoice.id, changes);
  }

  return out;
}

/**
 * THE BILLS ONE TRANSFER COVERS.
 *
 * A merged payment is one transfer recorded as a slice per bill, tied together
 * by a shared MERGE- reference (lib/actions/merge.ts). Finance verifying one
 * slice is agreeing money that arrived for all of them, so every bill in the
 * merge answers for its own changes on that row. Anything else in
 * `transactionRef` is the customer's own bank or M-Pesa reference and groups
 * nothing — two customers may type the same one.
 */
export async function mergedWith(
  payments: { id: string; invoiceId: string; transactionRef: string | null }[]
): Promise<Map<string, string[]>> {
  const merged = (ref: string | null): ref is string => !!ref && ref.startsWith("MERGE-");
  const refs = [...new Set(payments.map((p) => p.transactionRef).filter(merged))];
  const byPayment = new Map<string, string[]>(payments.map((p) => [p.id, [p.invoiceId]]));
  if (refs.length === 0) return byPayment;

  const slices = await prisma.payment.findMany({
    where: { transactionRef: { in: refs } },
    orderBy: { createdAt: "asc" },
    select: { invoiceId: true, transactionRef: true },
  });
  const byRef = new Map<string, string[]>();
  for (const slice of slices) {
    const held = byRef.get(slice.transactionRef!) ?? [];
    if (!held.includes(slice.invoiceId)) held.push(slice.invoiceId);
    byRef.set(slice.transactionRef!, held);
  }
  for (const payment of payments) {
    if (!merged(payment.transactionRef)) continue;
    const covered = byRef.get(payment.transactionRef);
    if (covered?.length) byPayment.set(payment.id, covered);
  }
  return byPayment;
}
