import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Boxes, Clock3, Container, Package, Warehouse, type LucideIcon } from "lucide-react";

import { BillChangeBadges } from "@/components/app/bill-changes";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { IncomeFilters } from "@/components/app/income-filters";
import { PageHeader } from "@/components/app/page-header";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";
import { darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
import {
  billedBetween,
  darDay,
  dayBounds,
  incomeBetween,
  owingCustomers,
  type IncomeRow,
  type IncomeSource,
  type OwingState,
} from "@/lib/income";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Income" };

type Source = IncomeSource | "TRANSPORT";

const SOURCE_ICON: Record<IncomeSource, LucideIcon> = { LCL: Boxes, FCL: Container };
const SOURCE_LABEL: Record<IncomeSource, string> = { LCL: "Loose cargo", FCL: "Full container" };

const PERIODS = [
  /* EVERYTHING FIRST. A register that opens on today is an empty page under
     a heading that says Income on a quiet morning; the periods narrow it when
     somebody wants a day or a month. */
  ["all", "All time"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
] as const;
type PeriodKey = (typeof PERIODS)[number][0] | "custom";

/** Before this business existed, so "all time" is a stretch like any other. */
const DAWN = "2000-01-01";
/** Enough of a stretch to read, few enough to render fast. */
const LIST_CAP = 200;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day: string, days: number) => darDay(new Date(dayBounds(day).start.getTime() + days * 86_400_000 + 3_600_000));

/** The days a period covers, on the Dar calendar, both ends included. */
function readPeriod(sp: { period: string; from: string; to: string }, today: string) {
  if (DAY.test(sp.from) && DAY.test(sp.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { key: "custom" as PeriodKey, from, to };
  }
  const now = new Date();
  switch (sp.period) {
    case "today":
      return { key: "today" as PeriodKey, from: today, to: today };
    case "yesterday":
      return { key: "yesterday" as PeriodKey, from: shift(today, -1), to: shift(today, -1) };
    case "week":
      return { key: "week" as PeriodKey, from: darDay(darStartOfWeek(now)), to: today };
    case "month":
      return { key: "month" as PeriodKey, from: darDay(darStartOfMonth(now)), to: today };
    case "year":
      return { key: "year" as PeriodKey, from: darDay(darStartOfYear(now)), to: today };
    default:
      return { key: "all" as PeriodKey, from: DAWN, to: today };
  }
}

const shortDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Dar_es_Salaam",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Dar_es_Salaam",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
/* Midday of a Dar day: safe to format in any zone without sliding a day. */
const noonOf = (day: string) => new Date(dayBounds(day).start.getTime() + 12 * 3_600_000);

const tzs = (n: number) => formatCurrency(n, "TZS");

const OWING: Record<OwingState, { label: string; tone: string }> = {
  CREDIT: { label: "released on credit", tone: "font-medium text-destructive" },
  OVERDUE: { label: "overdue", tone: "font-medium text-destructive" },
  IN_DAR: { label: "in Dar", tone: "font-medium text-warning" },
  AT_SEA: { label: "at sea", tone: "" },
  IN_CHINA: { label: "in China", tone: "" },
};

/**
 * INCOME — EVERY SHILLING THAT ACTUALLY ARRIVED.
 *
 * One register of money in, for a stretch the reader picks: what came in,
 * from whom, against which bill, and which account it landed in.
 *
 * TWO FIGURES THAT ARE NOT THE SAME QUESTION, AND ARE NEVER ADDED.
 * What ARRIVED is a payment: it can honestly be split by the account that
 * received it. What was BILLED is the invoice, which really does have freight,
 * storage and other charges in it. So the takings lead, the composition of the
 * bills sits underneath, and each says which it is.
 *
 * Read off the general ledger (lib/income.ts), so this page, the ledger and
 * the account balances cannot disagree about a shilling. A payment that was
 * wrong is reversed and recorded again; nothing is edited from here.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<"period" | "from" | "to" | "source" | "account" | "q", string | string[] | undefined>>;
}) {
  const locale = await primeLocale();
  const user = await requirePermission("accounting.view");
  const raw = await searchParams;
  /* A link can carry a parameter twice; Next hands that over as an array. */
  const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
  const sp = {
    period: one(raw.period),
    from: one(raw.from),
    to: one(raw.to),
    source: one(raw.source),
    account: one(raw.account),
    q: one(raw.q),
  };
  const today = darDay(new Date());
  const p = readPeriod(sp, today);
  const source = (["LCL", "FCL", "TRANSPORT"].includes(sp.source) ? sp.source : "") as Source | "";
  const accountId = sp.account;
  const q = sp.q.trim().toLowerCase();

  const mayRecord = can(user.role, "payment.submit");

  const [all, owing, billed, accounts] = await Promise.all([
    incomeBetween(p.from, p.to, locale),
    owingCustomers(),
    billedBetween(p.from, p.to),
    prisma.bankAccount.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true } }),
  ]);

  /* Cancelled money is not money: the ledger keeps the reversal, the takings
     leave it out. */
  const counted = all.filter((r) => r.counted);
  const total = counted.reduce((s, r) => s + r.tzs, 0);
  const byAccount = accounts
    .map((a) => {
      const mine = counted.filter((r) => r.account.id === a.id);
      return { id: a.id, name: mine[0]?.account.label ?? "", amount: mine.reduce((s, r) => s + r.tzs, 0) };
    })
    .filter((a) => a.amount !== 0);
  /* Shillings handed over as shillings — a dollar payment is not in it. */
  const tendered = counted.filter((r) => r.currency === "TZS").reduce((s, r) => s + r.tzs, 0);

  const matchesSource = (r: IncomeRow) =>
    !source || (source === "TRANSPORT" ? r.split.transport > 0 : r.sources.includes(source));
  const rows = counted.filter(
    (r) =>
      matchesSource(r) &&
      (!accountId || r.account.id === accountId) &&
      (!q ||
        [r.who, r.goods, r.account.label, r.by, r.verifiedBy, ...r.refs, ...r.invoiceNumbers, ...r.cargo.map((c) => c.reference)]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)))
  );
  const shown = rows.slice(0, LIST_CAP);

  /* One day per heading, newest first. Under a source filter a day adds only
     that source's share, so the days add up to what was asked for. */
  const days: { date: string; total: number; rows: IncomeRow[] }[] = [];
  for (const r of shown) {
    let d = days.at(-1);
    if (d?.date !== r.day) {
      d = { date: r.day, total: 0, rows: [] };
      days.push(d);
    }
    d.rows.push(r);
    d.total += source === "TRANSPORT" ? r.split.transport : source ? r.split[source] : r.tzs;
  }

  const windowLabel =
    p.key === "all"
      ? T("Everything received")
      : p.from === p.to
        ? shortDay.format(noonOf(p.from))
        : `${shortDay.format(noonOf(p.from))} → ${shortDay.format(noonOf(p.to))}`;

  /* Every control keeps the others, so narrowing never silently resets. */
  const keep: Record<string, string> = {
    source,
    account: accountId,
    q: sp.q,
    ...(p.key === "custom" ? { from: p.from, to: p.to } : { period: p.key === "all" ? "" : p.key }),
  };
  const link = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...keep, ...extra }).filter(([, v]) => v))
    ).toString();
    return qs ? `?${qs}` : "?";
  };

  /* A bill nobody has paid and money the company agreed to wait for are
     different positions; one "owed" figure hides which this business is
     carrying. */
  const cash = owing.tzs - owing.creditTzs;
  const chase = owing.customers;

  const tiles = [
    { label: "Freight billed", hint: "What the rate book charged to ship it", value: tzs(billed.freight), Icon: Package },
    { label: "Storage billed", hint: "Days past the free days, at the daily rate", value: tzs(billed.storage), Icon: Warehouse },
    { label: "Other charges billed", hint: "Anything added to a bill by hand", value: tzs(billed.other), Icon: Banknote },
    {
      label: "Tendered in shillings",
      hint: "What customers actually handed over, before any conversion",
      value: tendered > 0 ? tzs(tendered) : "—",
      Icon: Clock3,
    },
  ];

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title={T("Income")}
        description={T(
          "Every shilling received from customers, and the account it landed in. Cargo is what this business sells, so this is the freight and storage its customers paid for."
        )}
        actions={mayRecord ? <RecordPaymentButton primary /> : null}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{windowLabel}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(([key, label]) => (
            <Link
              key={key}
              href={link({ period: key === "all" ? "" : key, from: "", to: "" })}
              aria-pressed={p.key === key}
              className={cn(
                "focus-ring inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                p.key === key
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "border-transparent bg-card text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )}
            >
              {T(label)}
            </Link>
          ))}
          {/* A stretch nobody thought to offer. Plain GET, so it survives a
              reload and can be sent to somebody as a link. */}
          <form className="flex items-center gap-1.5 text-xs">
            {Object.entries(keep)
              .filter(([k, v]) => v && !["period", "from", "to"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input
              type="date"
              name="from"
              aria-label={T("From")}
              defaultValue={p.key === "custom" ? p.from : ""}
              max={today}
              className="focus-ring h-8 rounded-lg border bg-card px-2"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              name="to"
              aria-label={T("To")}
              defaultValue={p.key === "custom" ? p.to : ""}
              max={today}
              className="focus-ring h-8 rounded-lg border bg-card px-2"
            />
            <button className="focus-ring h-8 rounded-lg bg-foreground px-3 font-medium text-background">{T("Show")}</button>
          </form>
        </div>
      </div>

      {/* THE TAKINGS. */}
      <section className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 to-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{T("Income received")}</p>
            <p className="tnum mt-2 font-display text-3xl font-bold">{tzs(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counted.length} {counted.length === 1 ? T("payment") : T("payments")} · {T("cancelled ones taken off")}
            </p>
          </div>
          {byAccount.length > 0 ? (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {byAccount.map((a) => (
                <Link
                  key={a.id}
                  href={link({ account: accountId === a.id ? "" : a.id })}
                  className={cn(
                    "focus-ring tnum rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    accountId === a.id ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent"
                  )}
                >
                  {a.name} · {tzs(a.amount)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* WHAT THE BILLS WERE MADE OF — billed, not collected. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <tile.Icon className="size-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">{T(tile.label)}</p>
            </div>
            <p className="tnum mt-1.5 font-display text-xl font-bold">{tile.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{T(tile.hint)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <IncomeFilters
              sources={[
                { value: "", label: "Every source" },
                { value: "LCL", label: "Loose cargo" },
                { value: "FCL", label: "Full containers" },
                { value: "TRANSPORT", label: "With transport" },
              ]}
            />
            {accountId ? (
              <Link
                href={link({ account: "" })}
                className="focus-ring inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium hover:bg-accent"
              >
                {T("Every account")}
              </Link>
            ) : null}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {T("Nothing came in over this period.")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              {days.map((d) => (
                <div key={d.date}>
                  <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
                    <p className="text-sm font-semibold">
                      {shortDay.format(noonOf(d.date))}{" "}
                      <span className="font-normal text-muted-foreground">
                        {d.rows.length} {d.rows.length === 1 ? T("line") : T("lines")}
                      </span>
                    </p>
                    <p className="tnum text-sm font-semibold text-success">{tzs(d.total)}</p>
                  </div>
                  {d.rows.map((r) => {
                    const Icon = SOURCE_ICON[r.sources.length === 1 ? r.sources[0] : "LCL"];
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0">
                        <span
                          className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"
                          title={r.sources.map((s) => T(SOURCE_LABEL[s])).join(" + ")}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            {r.whoHref ? (
                              <Link href={r.whoHref} className="truncate hover:underline">
                                {r.who}
                              </Link>
                            ) : (
                              <span className="truncate">{r.who}</span>
                            )}
                            {r.cargo.map((c) => (
                              <Badge key={c.id} tone="neutral">
                                {c.reference}
                              </Badge>
                            ))}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {[
                              clock.format(r.at),
                              r.refs.filter((x) => !r.cargo.some((c) => c.reference === x)).join(" · ") || T("no receipt"),
                              r.invoiceNumbers.join(", "),
                              r.by && `${T("by")} ${r.by}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {/* What was true of the bill when this money came in:
                              storage on it or taken off, a discount, a debt
                              settled for goods already gone. */}
                          {r.changes.length > 0 || r.credit || r.merged || r.split.transport > 0 ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {r.merged ? (
                                <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                  {r.paymentIds.length} {T("bills in one transfer")}
                                </span>
                              ) : null}
                              {r.split.transport > 0 ? (
                                <span className="tnum rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                                  {T("Includes transport")} {tzs(r.split.transport)}
                                </span>
                              ) : null}
                              {r.credit ? (
                                <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-700 dark:text-sky-300">
                                  {T("Settles a credit release")}
                                </span>
                              ) : null}
                              <BillChangeBadges changes={r.changes} withBill={r.merged} />
                            </div>
                          ) : null}
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="truncate text-sm">{r.account.label}</p>
                          {r.account.number ? (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">{r.account.number}</p>
                          ) : null}
                        </div>
                        {/* The amount is never edited here — a payment that was
                            wrong is reversed and recorded again. */}
                        <Link
                          href={r.receiptId ? `/app/finance/receipts/${r.receiptId}` : (r.whoHref ?? "/app/finance/ledger")}
                          className="focus-ring shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                        >
                          {T("Open")}
                        </Link>
                        <div className="w-32 shrink-0 text-right">
                          <p className="tnum whitespace-nowrap font-display text-base font-bold">{tzs(r.tzs)}</p>
                          {/* Paid in dollars: the figure the customer sent,
                              beside the shillings it came to at its own rate. */}
                          {r.currency !== "TZS" ? (
                            <p className="tnum text-[11px] text-muted-foreground">{formatCurrency(r.amount, r.currency)}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {rows.length > LIST_CAP ? (
                <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
                  {T("Showing the most recent")} {LIST_CAP} {T("payments of this period — narrow the dates to see the rest.")}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* WHAT IS STILL OUT THERE — right now, not over the period. It sits
            to the top of its column and stays there while the list scrolls. */}
        <aside className="self-start rounded-xl border border-warning/30 bg-warning/5 p-4 lg:sticky lg:top-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="size-4 text-warning" />
            {T("To collect")}
          </p>
          <p className="tnum mt-2 font-display text-2xl font-bold">{tzs(cash)}</p>
          <p className="text-xs text-muted-foreground">{T("Billed and not paid")}</p>
          {owing.creditTzs > 0 ? (
            <p className="mt-2 text-sm">
              <span className="tnum font-semibold">{tzs(owing.creditTzs)}</span>{" "}
              <span className="text-xs text-muted-foreground">{T("on credit we agreed to wait for")}</span>
            </p>
          ) : null}
          {owing.unconverted.length > 0 ? (
            <p className="tnum mt-1 text-xs text-muted-foreground">
              + {owing.unconverted.map((u) => formatCurrency(u.amount, u.currency)).join(" + ")} {T("with no rate pinned")}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {T("It becomes income only when the money is actually received.")}
          </p>

          {chase.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">{T("Everyone has paid.")}</p>
          ) : (
            <>
              {/* Most urgent first; beyond six the rest fold away behind "Show all". */}
              <input id="collect-all" type="checkbox" className="peer sr-only" />
              <div className="mt-3 space-y-2 [&>div:nth-child(n+7)]:hidden peer-checked:[&>div]:block">
                {chase.map((c) => (
                  <div key={c.customerId} className="rounded-lg border bg-card p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.bills.length === 1 ? c.bills[0].cargoReference : `${c.bills.length} ${T("bills")}`}
                          {OWING[c.state].tone ? <span className={cn("ml-1", OWING[c.state].tone)}>· {T(OWING[c.state].label)}</span> : null}
                        </p>
                      </div>
                      <p className="tnum shrink-0 text-sm font-semibold">
                        {c.tzs > 0 ? tzs(c.tzs) : null}
                        {c.unconverted.map((u) => (
                          <span key={u.currency} className="block text-xs">
                            {formatCurrency(u.amount, u.currency)}
                          </span>
                        ))}
                      </p>
                    </div>
                    <Link
                      href={mayRecord ? `/app/finance/payments/new/${c.customerId}` : `/app/customers/${c.customerId}`}
                      className="focus-ring mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
                    >
                      {mayRecord ? T("Take payment") : T("Open")} →
                    </Link>
                  </div>
                ))}
              </div>
              {chase.length > 6 ? (
                <label
                  htmlFor="collect-all"
                  className="mt-3 block cursor-pointer rounded-lg border bg-card py-2 text-center text-xs font-medium hover:bg-accent"
                >
                  <span className="[.peer:checked~label_&]:hidden">
                    {T("Show all")} {chase.length}
                  </span>
                  <span className="hidden [.peer:checked~label_&]:inline">{T("Show fewer")}</span>
                </label>
              ) : null}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
