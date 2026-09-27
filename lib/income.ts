import "server-only";

import { Prisma } from "@prisma/client";

import type { BillChange } from "@/lib/bill-changes";
import { darFields, darMidnight } from "@/lib/dar-time";
import type { Locale } from "@/lib/i18n";
import { BALANCE_SELECT, balanceOf } from "@/lib/invoice-balance";
import { ledgerRows, rateOn, shillings, type LedgerFixPayment } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

/**
 * EVERY SHILLING RECEIVED, AND WHERE IT LANDED.
 *
 * Read off the general ledger's own rows — the verified payments that landed
 * in an account — and nothing else. The ledger, the account balances and this
 * page are three views of one list, so they cannot disagree about a single
 * shilling: a second reading of the payments table would, the first time a
 * rate or a reversal was handled a different way.
 *
 * WHAT COUNTS. A payment Finance has verified into an account. A claim still
 * waiting to be checked is not income yet — it is on the verify screen — and a
 * reversed payment stays on the list struck through, counted as nothing. The
 * transport a customer added arrived in the same transfer, so it is in the
 * figure received; it is shown as its own share because it leaves again to the
 * driver.
 */

/** What the money was for. A payment is one bill's, and a bill is one sailing's kind. */
export type IncomeSource = "LCL" | "FCL";

export type IncomeRow = {
  id: string;
  /** Every payment the row stands for: one, or each bill of a merged transfer. */
  paymentIds: string[];
  at: Date;
  /** yyyy-mm-dd on the Dar calendar: the day it is listed under. */
  day: string;
  who: string;
  whoHref: string | null;
  /** The kinds of sailing it paid for — two, when one transfer paid for both. */
  sources: IncomeSource[];
  /**
   * WHERE THE SHILLINGS OF THIS ROW CAME FROM, ADDING UP TO `tzs` EXACTLY.
   * Worked out bill by bill with the ledger's own conversion, so the tiles at
   * the top are a partition of the total and never a second estimate of it.
   */
  split: { LCL: number; FCL: number; transport: number };
  cargo: { id: string; reference: string }[];
  goods: string;
  invoiceNumbers: string[];
  refs: string[];
  account: { id: string; label: string; number: string | null };
  method: string;
  by: string | null;
  verifiedBy: string | null;
  /** Everything that landed, in whole shillings, exactly as the ledger has it. */
  tzs: number;
  /** As it was paid, before any conversion. */
  amount: number;
  currency: string;
  counted: boolean;
  cancelledReason: string | null;
  /** Money for cargo already let go on credit — a debt settled, not a sale. */
  credit: boolean;
  /** One transfer that paid several bills. */
  merged: boolean;
  changes: BillChange[];
  fix: LedgerFixPayment | null;
};

/** A Dar calendar day as yyyy-mm-dd. darFields counts months from 0. */
export function darDay(at: Date): string {
  const f = darFields(at);
  return `${f.year}-${String(f.month + 1).padStart(2, "0")}-${String(f.day).padStart(2, "0")}`;
}

/** The first instant of a yyyy-mm-dd Dar day, and of the day after it. */
export function dayBounds(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const start = darMidnight(y, m - 1, d);
  return { start, next: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * The income received between two Dar days, both included.
 *
 * Newest first, as the ledger lists them. Each row carries what the ledger
 * already knows about it — the correction, the storage and price tags — so
 * the page shows the same facts about a payment wherever it is opened.
 */
export async function incomeBetween(from: string, to: string, locale: Locale = "en"): Promise<IncomeRow[]> {
  const start = dayBounds(from).start;
  const end = dayBounds(to).next;

  /* The ledger names a payment's own row "p-<id>", and the transport leaving
     again "pt-<id>" — only the first is money received. */
  const ledger = (await ledgerRows(locale)).filter(
    (r) =>
      r.id.startsWith("p-") &&
      r.direction === "IN" &&
      r.at.getTime() >= start.getTime() &&
      r.at.getTime() < end.getTime()
  );
  const paymentIdOf = (rowId: string) => rowId.slice(2);
  if (ledger.length === 0) return [];

  /* Every payment each row stands for. A merged transfer is folded by the
     ledger into one row naming all its slices; each slice is its own bill,
     its own kind of sailing and its own transport. */
  const idsOf = (r: (typeof ledger)[number]) =>
    r.fix?.kind === "payment" ? r.fix.paymentIds : [paymentIdOf(r.id)];

  const [payments, rates] = await Promise.all([
    prisma.payment.findMany({
      where: { id: { in: ledger.flatMap(idsOf) } },
      select: {
        id: true,
        method: true,
        amount: true,
        currency: true,
        fxRate: true,
        baseCurrencyAmount: true,
        deliveryAdded: true,
        paidAt: true,
        createdAt: true,
        account: { select: { accountNumber: true } },
        invoice: {
          select: {
            number: true,
            cargo: { select: { id: true, reference: true, service: true } },
          },
        },
      },
    }),
    prisma.exchangeRate.findMany({
      orderBy: { effectiveFrom: "asc" },
      select: { rate: true, effectiveFrom: true },
    }),
  ]);
  const byId = new Map(payments.map((p) => [p.id, p]));

  const rows: IncomeRow[] = [];
  for (const r of ledger) {
    const slices = idsOf(r)
      .map((id) => byId.get(id))
      .filter((p): p is (typeof payments)[number] => Boolean(p));
    if (slices.length === 0) continue;

    const split = { LCL: 0, FCL: 0, transport: 0 };
    for (const p of slices) {
      /* THE LEDGER'S OWN FORMULA, slice by slice: the payment's shillings at
         the rate it was taken at, plus the fare that came in with it. Summed,
         the slices are the ledger row's figure to the shilling. */
      const rate = p.fxRate ?? rateOn(rates, p.paidAt ?? p.createdAt);
      const delivery = Number(p.deliveryAdded ?? 0);
      const transport = delivery > 0 ? shillings(delivery, p.currency, rate) : 0;
      const whole = p.baseCurrencyAmount
        ? Number(p.baseCurrencyAmount) + transport
        : shillings(Number(p.amount) + delivery, p.currency, rate);
      split.transport += transport;
      split[p.invoice.cargo.service === "FCL" ? "FCL" : "LCL"] += whole - transport;
    }

    const head = slices[0];
    rows.push({
      id: r.id,
      paymentIds: slices.map((p) => p.id),
      at: r.at,
      day: darDay(r.at),
      who: r.title,
      whoHref: r.titleHref,
      sources: [...new Set(slices.map((p) => (p.invoice.cargo.service === "FCL" ? "FCL" : "LCL") as IncomeSource))],
      split,
      cargo: [...new Map(slices.map((p) => [p.invoice.cargo.id, p.invoice.cargo])).values()].map((c) => ({
        id: c.id,
        reference: c.reference,
      })),
      goods: r.purpose ?? "",
      invoiceNumbers: [...new Set(slices.map((p) => p.invoice.number))],
      refs: r.refs,
      account: { id: r.accountId, label: r.account, number: head.account?.accountNumber ?? null },
      method: head.method,
      by: r.submittedBy?.name ?? null,
      verifiedBy: r.verifiedBy?.name ?? null,
      tzs: r.tzs,
      amount: r.amount,
      currency: r.currency,
      counted: !r.cancelled,
      cancelledReason: r.cancelledReason,
      credit: r.credit,
      merged: slices.length > 1,
      changes: r.changes,
      fix: r.fix?.kind === "payment" ? r.fix : null,
    });
  }
  return rows;
}

/* ------------------------------------------------------------------ owing */

export type OwingState = "CREDIT" | "OVERDUE" | "IN_DAR" | "AT_SEA" | "IN_CHINA";

export type OwingCustomer = {
  customerId: string;
  name: string;
  phone: string | null;
  /** The bills still open, most urgent first. */
  bills: { invoiceId: string; number: string; cargoReference: string; state: OwingState }[];
  /** The most urgent state among them — what the row is sorted and tagged by. */
  state: OwingState;
  /** Everything owed across them, in whole shillings. */
  tzs: number;
  /**
   * A bill with no rate pinned cannot be put into shillings without inventing
   * one, so it is carried in its own currency beside the shilling figure and
   * never added into it.
   */
  unconverted: { currency: string; amount: number }[];
};

const URGENCY: OwingState[] = ["CREDIT", "OVERDUE", "IN_DAR", "AT_SEA", "IN_CHINA"];
const IN_DAR = new Set(["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE"]);
const AT_SEA = new Set(["DEPARTED_CHINA", "IN_TRANSIT", "CONTAINER_LOADED", "ASSIGNED_TO_CONTAINER"]);

/**
 * WHO STILL OWES, MOST URGENT FIRST.
 *
 * One row per customer, not per bill: "Take payment" opens that customer's
 * payment screen, where every open bill of theirs is ticked and settled in one
 * transfer, so a customer with three bills is one conversation. Goods already
 * handed over on credit lead — the cargo has gone and only the money is left —
 * then bills past their due day, then cargo waiting in Dar, then at sea.
 *
 * It becomes income only when it is paid and verified, which is why it sits
 * beside the income rather than in it.
 */
export async function owingCustomers(now = new Date()): Promise<{
  customers: OwingCustomer[];
  tzs: number;
  unconverted: { currency: string; amount: number }[];
}> {
  /* ONE SNAPSHOT. Prisma reads the bills, their customers and their cargo in
     separate queries; a customer merged away between the first and the
     second left a bill whose customer "does not exist", and the whole page
     failed. Read together, they are read as of the same instant. */
  const bills = await prisma.$transaction(
    (tx) =>
      tx.invoice.findMany({
        where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
        select: {
          ...BALANCE_SELECT,
          id: true,
          number: true,
          dueAt: true,
          customer: { select: { id: true, fullName: true, phone: true } },
          cargo: { select: { reference: true, status: true, release: { select: { id: true } } } },
        },
      }),
    { isolationLevel: "RepeatableRead" }
  );

  const stateOf = (bill: (typeof bills)[number]): OwingState =>
    bill.cargo.release || bill.cargo.status === "COLLECTED" || bill.cargo.status === "DELIVERED"
      ? "CREDIT"
      : bill.dueAt && bill.dueAt.getTime() < now.getTime()
        ? "OVERDUE"
        : IN_DAR.has(bill.cargo.status)
          ? "IN_DAR"
          : AT_SEA.has(bill.cargo.status)
            ? "AT_SEA"
            : "IN_CHINA";

  const byCustomer = new Map<string, OwingCustomer>();
  let tzs = 0;
  const loose = new Map<string, number>();
  for (const bill of bills) {
    const balance = balanceOf(bill);
    if (balance.settled) continue;
    const state = stateOf(bill);
    const row =
      byCustomer.get(bill.customer.id) ??
      ({
        customerId: bill.customer.id,
        name: bill.customer.fullName,
        phone: bill.customer.phone,
        bills: [],
        state,
        tzs: 0,
        unconverted: [],
      } satisfies OwingCustomer);
    row.bills.push({ invoiceId: bill.id, number: bill.number, cargoReference: bill.cargo.reference, state });
    if (URGENCY.indexOf(state) < URGENCY.indexOf(row.state)) row.state = state;
    if (balance.outstandingTzs) {
      const owed = Number(balance.outstandingTzs.toDecimalPlaces(0));
      row.tzs += owed;
      tzs += owed;
    } else {
      const owed = Number(new Prisma.Decimal(balance.outstanding).toDecimalPlaces(2));
      const held = row.unconverted.find((u) => u.currency === bill.currency);
      if (held) held.amount += owed;
      else row.unconverted.push({ currency: bill.currency, amount: owed });
      loose.set(bill.currency, (loose.get(bill.currency) ?? 0) + owed);
    }
    byCustomer.set(bill.customer.id, row);
  }

  const customers = [...byCustomer.values()]
    .map((c) => ({
      ...c,
      bills: c.bills.sort((a, b) => URGENCY.indexOf(a.state) - URGENCY.indexOf(b.state)),
    }))
    .sort((a, b) => URGENCY.indexOf(a.state) - URGENCY.indexOf(b.state) || b.tzs - a.tzs);

  return {
    customers,
    tzs,
    unconverted: [...loose.entries()].map(([currency, amount]) => ({ currency, amount })),
  };
}
