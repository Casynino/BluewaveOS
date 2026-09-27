import Link from "next/link";
import type { Metadata } from "next";
import { Boxes, Container, Truck, Wallet, type LucideIcon } from "lucide-react";

import { BillChangeBadges } from "@/components/app/bill-changes";
import { FinanceTabs } from "@/components/app/finance-tabs";
import { IncomeFilters } from "@/components/app/income-filters";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { RecordPaymentButton } from "@/components/app/record-payment-button";
import { formatCurrency } from "@/lib/currency";
import { darStartOfMonth, darStartOfWeek, darStartOfYear } from "@/lib/dar-time";
import { darDay, dayBounds, incomeBetween, owingCustomers, type IncomeRow, type OwingState } from "@/lib/income";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Income" };

type Source = "LCL" | "FCL" | "TRANSPORT";

const SOURCE_LOOK: Record<Source, { icon: LucideIcon; tone: string; label: string }> = {
  LCL: { icon: Boxes, tone: "bg-sky-500/10 text-sky-600 dark:text-sky-300", label: "Loose cargo" },
  FCL: { icon: Container, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-300", label: "Full containers" },
  TRANSPORT: { icon: Truck, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "Transport" },
};

const PERIODS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["year", "This year"],
] as const;
type PeriodKey = (typeof PERIODS)[number][0] | "custom";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (day: string, days: number) => darDay(new Date(dayBounds(day).start.getTime() + days * 86_400_000 + 3_600_000));

/** The days a period covers, on the Dar calendar, both ends included. */
function readPeriod(sp: { period?: string; from?: string; to?: string }, today: string) {
  if (sp.from && sp.to && DAY.test(sp.from) && DAY.test(sp.to)) {
    const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { key: "custom" as PeriodKey, from, to };
  }
  const now = new Date();
  switch (sp.period) {
    case "yesterday":
      return { key: "yesterday" as PeriodKey, from: shift(today, -1), to: shift(today, -1) };
    case "week":
      return { key: "week" as PeriodKey, from: darDay(darStartOfWeek(now)), to: today };
    case "month":
      return { key: "month" as PeriodKey, from: darDay(darStartOfMonth(now)), to: today };
    case "year":
      return { key: "year" as PeriodKey, from: darDay(darStartOfYear(now)), to: today };
    default:
      return { key: "today" as PeriodKey, from: today, to: today };
  }
}

const longDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Dar_es_Salaam",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
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
const n = (v: number) => Math.round(v).toLocaleString("en-US");

const OWING: Record<OwingState, { label: string; tone: string }> = {
  CREDIT: { label: "released on credit", tone: "font-semibold text-rose-600" },
  OVERDUE: { label: "overdue", tone: "font-semibold text-rose-600" },
  IN_DAR: { label: "in Dar", tone: "font-semibold text-amber-600" },
  AT_SEA: { label: "at sea", tone: "" },
  IN_CHINA: { label: "in China", tone: "" },
};

/**
 * INCOME — EVERY SHILLING RECEIVED, AND THE ACCOUNT IT LANDED IN.
 *
 * Loose cargo, full containers and the transport customers add, for any day
 * or run of days, with the account each payment reached. A verified payment is
 * never moved between accounts from here — a wrong one is reversed and
 * recorded again, so the amount never changes quietly. Beside it, everybody who still owes — which becomes income only when
 * it is paid and verified.
 *
 * Read off the general ledger (lib/income.ts), so this page, the ledger and
 * the account balances cannot disagree about a shilling.
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
  const source = (["LCL", "FCL", "TRANSPORT"].includes(sp.source ?? "") ? sp.source : "") as Source | "";
  const accountId = sp.account ?? "";
  const q = (sp.q ?? "").trim().toLowerCase();

  const mayRecord = can(user.role, "payment.submit");
  const mayFix = can(user.role, "payment.verify");

  const [all, owing, accounts] = await Promise.all([
    incomeBetween(p.from, p.to, locale),
    owingCustomers(),
    prisma.bankAccount.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, bankName: true, currency: true, active: true },
    }),
  ]);
  const accountLabel = (a: { bankName: string; currency: string }) => `${a.bankName} (${a.currency})`;

  const matchesSource = (r: IncomeRow) =>
    !source || (source === "TRANSPORT" ? r.split.transport > 0 : r.sources.includes(source));
  const rows = all.filter(
    (r) =>
      matchesSource(r) &&
      (!accountId || r.account.id === accountId) &&
      (!q ||
        [r.who, r.goods, r.account.label, r.by, r.verifiedBy, ...r.refs, ...r.invoiceNumbers, ...r.cargo.map((c) => c.reference)]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)))
  );

  /* The figures at the top describe the whole period, whatever the list is
     narrowed to — the tiles ARE the narrowing, and would otherwise shrink to
     the one that was pressed. */
  const counted = all.filter((r) => r.counted);
  const total = counted.reduce((s, r) => s + r.tzs, 0);
  const tiles = (["LCL", "FCL", "TRANSPORT"] as const).map((key) => ({
    key,
    ...SOURCE_LOOK[key],
    value: counted.reduce((s, r) => s + (key === "TRANSPORT" ? r.split.transport : r.split[key]), 0),
  }));
  const byAccount = accounts
    .map((a) => ({
      id: a.id,
      name: counted.find((r) => r.account.id === a.id)?.account.label ?? a.bankName,
      amount: counted.filter((r) => r.account.id === a.id).reduce((s, r) => s + r.tzs, 0),
    }))
    .filter((a) => a.amount !== 0);

  /* Days, newest first, each with what it took in. */
  const days: { date: string; total: number; rows: IncomeRow[] }[] = [];
  for (const r of rows) {
    let d = days.at(-1);
    if (d?.date !== r.day) {
      d = { date: r.day, total: 0, rows: [] };
      days.push(d);
    }
    d.rows.push(r);
    /* Under a source filter a day adds only that source's share, so the days
       add up to the tile that was pressed. */
    if (r.counted) d.total += source === "TRANSPORT" ? r.split.transport : source ? r.split[source] : r.tzs;
  }
  const dayLabel = (d: string) =>
    d === today ? T("Today") : d === shift(today, -1) ? T("Yesterday") : shortDay.format(noonOf(d));
  const periodLabel =
    p.from === p.to ? longDay.format(noonOf(p.from)) : `${shortDay.format(noonOf(p.from))} → ${shortDay.format(noonOf(p.to))}`;

  /* Filters that survive a click on anything else. */
  const keep: Record<string, string> = Object.fromEntries(
    Object.entries({
      source,
      account: accountId,
      q: sp.q ?? "",
      ...(p.key === "custom" ? { from: p.from, to: p.to } : { period: p.key === "today" ? "" : p.key }),
    }).filter(([, v]) => v)
  );
  const link = (extra: Record<string, string>) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries({ ...keep, ...extra }).filter(([, v]) => v))
    ).toString();
    return qs ? `?${qs}` : "?";
  };
  const fixAccounts = accounts.filter((a) => a.active).map((a) => ({ id: a.id, label: accountLabel(a), currency: a.currency }));

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title={T("Income")}
        description={T("Every shilling received — loose cargo, full containers and the transport customers add — and the account it landed in. A payment that went wrong is reversed and recorded again; the amount never changes from here.")}
        actions={mayRecord ? <RecordPaymentButton primary /> : null}
      />
      <FinanceTabs />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">{periodLabel}</h2>
        {/* WHEN, as one row: the usual stretches by name, or any two days. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
            {PERIODS.map(([key, label]) => (
              <Link
                key={key}
                href={link({ period: key === "today" ? "" : key, from: "", to: "" })}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  p.key === key ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {T(label)}
              </Link>
            ))}
          </div>
          <form className="flex items-center gap-1.5">
            {Object.entries(keep)
              .filter(([k]) => !["period", "from", "to"].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <input type="date" name="from" defaultValue={p.from} max={today} className="h-9 rounded-lg border bg-card px-2.5 text-sm" />
            <span className="text-muted-foreground">→</span>
            <input type="date" name="to" defaultValue={p.to} max={today} className="h-9 rounded-lg border bg-card px-2.5 text-sm" />
            <button type="submit" className="h-9 rounded-lg bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/90">
              {T("Show")}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* WHAT CAME IN, AND WHERE IT IS NOW. */}
        <div className="relative col-span-2 flex flex-wrap items-end justify-between gap-4 overflow-hidden rounded-3xl border border-brand/40 bg-gradient-to-br from-brand/[0.14] to-card p-5 sm:col-span-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{T("Income received")}</p>
            <p className="tnum mt-2 text-3xl font-semibold tracking-tight">{tzs(total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {counted.length} {counted.length === 1 ? T("payment") : T("payments")} · {T("verified into an account")}
            </p>
          </div>
          {byAccount.length > 0 ? (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {byAccount.map((a) => (
                <Link
                  key={a.id}
                  href={link({ account: accountId === a.id ? "" : a.id })}
                  className={cn(
                    "tnum rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    accountId === a.id ? "border-foreground bg-foreground text-background" : "bg-background/50 hover:bg-secondary"
                  )}
                >
                  {a.name} · {n(a.amount)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={link({ source: source === t.key ? "" : t.key })}
            className={cn(
              "rounded-3xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-foreground/25",
              source === t.key ? "border-foreground/40 ring-1 ring-foreground/20" : ""
            )}
          >
            <span className={cn("grid size-9 place-items-center rounded-xl", t.tone)}>
              <t.icon className="size-4" />
            </span>
            <p className="mt-3 text-xs text-muted-foreground">{T(t.label)}</p>
            <p className="tnum mt-0.5 whitespace-nowrap text-base font-semibold">{tzs(t.value)}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <IncomeFilters
            sources={[
              { value: "", label: "Every source" },
              { value: "LCL", label: "Loose cargo" },
              { value: "FCL", label: "Full containers" },
              { value: "TRANSPORT", label: "With transport" },
            ]}
            accounts={[{ value: "", label: "Every account" }, ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) }))]}
          />

          {rows.length === 0 ? (
            <p className="rounded-3xl border border-dashed p-12 text-center text-sm text-muted-foreground">
              {T("No income recorded for these filters.")}
            </p>
          ) : (
            days.map((d) => (
              <section key={d.date} className="overflow-hidden rounded-3xl border bg-card">
                <header className="flex items-baseline justify-between gap-2 border-b bg-secondary/30 px-4 py-2.5">
                  <p className="text-sm font-semibold">
                    {dayLabel(d.date)}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {d.rows.length} {d.rows.length === 1 ? T("line") : T("lines")}
                    </span>
                  </p>
                  <p className="tnum text-sm font-semibold text-success">{tzs(d.total)}</p>
                </header>
                <ul className="divide-y">
                  {d.rows.map((r) => {
                    const look = SOURCE_LOOK[r.sources.length === 1 ? r.sources[0] : "LCL"];
                    return (
                      <li
                        key={r.id}
                        className={cn(
                          "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition hover:bg-secondary/30",
                          !r.counted && "opacity-60"
                        )}
                      >
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", look.tone)}>
                          <look.icon className="size-[18px]" />
                        </span>
                        <div className="min-w-0 flex-1 leading-tight">
                          <p className={cn("truncate font-semibold", !r.counted && "line-through")}>
                            {r.whoHref ? (
                              <Link href={r.whoHref} className="hover:underline">
                                {r.who}
                              </Link>
                            ) : (
                              r.who
                            )}
                            {r.counted ? (
                              r.sources.map((s) => (
                                <span key={s} className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-[10px] font-medium text-muted-foreground">
                                  {T(SOURCE_LOOK[s].label)}
                                </span>
                              ))
                            ) : (
                              <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 align-middle text-[10px] font-medium text-destructive">
                                {T("Reversed")}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[
                              clock.format(r.at),
                              r.cargo.map((c) => c.reference).join(", "),
                              r.goods,
                              r.invoiceNumbers.join(", "),
                              r.refs.filter((x) => !r.cargo.some((c) => c.reference === x)).join(", "),
                              r.by && `${T("by")} ${r.by}`,
                              r.cancelledReason,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {/* What was true of the bill when this money came in:
                              storage on it or taken off, a discount, a debt
                              settled for goods already gone. */}
                          {r.counted && (r.changes.length > 0 || r.credit || r.merged || r.split.transport > 0) ? (
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
                        <div className="hidden w-44 shrink-0 leading-tight md:block">
                          <p className="truncate text-sm font-medium">{r.account.label}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">{r.account.number ?? r.method}</p>
                        </div>
                        <span className="shrink-0 text-right sm:order-last sm:min-w-32">
                          <span className={cn("tnum block text-[15px] font-semibold", !r.counted && "line-through")}>
                            {tzs(r.tzs)}
                          </span>
                          {/* Paid in dollars: the figure the customer sent, beside
                              the shillings it came to at its own rate. */}
                          {r.currency !== "TZS" ? (
                            <span className="tnum block text-[11px] text-muted-foreground">
                              {formatCurrency(r.amount, r.currency)}
                            </span>
                          ) : null}
                        </span>
                        <div className="flex w-full flex-wrap items-center gap-1.5 pl-[52px] empty:hidden sm:w-auto sm:pl-0">
                          {mayFix && r.counted && r.fix ? (
                            <LedgerRowFix
                              subject={r.fix}
                              locale={locale}
                              mayEdit={mayFix}
                              mayCancel={mayFix}
                              accounts={fixAccounts}
                              categories={[]}
                            />
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>

        <aside className="space-y-4 2xl:sticky 2xl:top-24">
          <section className="overflow-hidden rounded-3xl border border-amber-500/30 bg-card">
            <div className="bg-gradient-to-br from-amber-500/[0.12] to-transparent p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Wallet className="size-4 text-amber-600" />
                {T("To collect")}
              </p>
              <p className="tnum mt-1 text-2xl font-semibold">{tzs(owing.tzs)}</p>
              {owing.unconverted.length > 0 ? (
                <p className="tnum text-xs text-muted-foreground">
                  + {owing.unconverted.map((u) => formatCurrency(u.amount, u.currency)).join(" + ")} {T("with no rate pinned")}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {T("Customers whose bills are still open — goods released on credit and overdue bills first. It becomes income only when paid.")}
              </p>
            </div>
            {owing.customers.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{T("Everyone has paid.")}</p>
            ) : (
              <>
                {/* Most urgent first; beyond six the rest fold away behind "Show all". */}
                <input id="collect-all" type="checkbox" className="peer sr-only" />
                <ul className="divide-y [&>li:nth-child(n+7)]:hidden peer-checked:[&>li]:flex">
                  {owing.customers.map((c) => (
                    <li key={c.customerId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-sm font-semibold">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.bills.length === 1
                            ? c.bills[0].cargoReference
                            : `${c.bills.length} ${T("bills")} · ${c.bills.map((b) => b.cargoReference).join(", ")}`}{" "}
                          · <span className={OWING[c.state].tone}>{T(OWING[c.state].label)}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tnum text-sm font-semibold">
                          {c.tzs > 0 ? tzs(c.tzs) : null}
                          {c.unconverted.map((u) => (
                            <span key={u.currency} className="block text-xs">
                              {formatCurrency(u.amount, u.currency)}
                            </span>
                          ))}
                        </p>
                        {mayRecord ? (
                          <Link
                            href={`/app/finance/payments/new/${c.customerId}`}
                            className="text-[11px] font-semibold text-brand hover:underline"
                          >
                            {T("Take payment")} →
                          </Link>
                        ) : (
                          <Link href={`/app/customers/${c.customerId}`} className="text-[11px] font-semibold text-brand hover:underline">
                            {T("Open")} →
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {owing.customers.length > 6 ? (
                  <label
                    htmlFor="collect-all"
                    className="block cursor-pointer border-t px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    <span className="[.peer:checked~label_&]:hidden">
                      {T("Show all")} {owing.customers.length}
                    </span>
                    <span className="hidden [.peer:checked~label_&]:inline">{T("Show fewer")}</span>
                  </label>
                ) : null}
              </>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
