/*
  THE OWNER'S HOME: THE WHOLE BUSINESS ON ONE SCREEN.

  The banner, the owner's own pages as pills, only what waits on a decision of
  theirs, then the money: where it sits and today since midnight, this month
  against last, a year of billing against costs, how healthy the month reads,
  what each container is making, who and what the money comes from and goes to,
  the debts by age, where the cargo is, and what the business carries.

  Every figure is read from the same books the finance pages read
  (lib/finance-report.ts, lib/manager-overview.ts) — this screen adds up
  nothing of its own, so it can never disagree with the Profit & loss page.
*/
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  ChartNoAxesCombined,
  HandCoins,
  Landmark,
  Package,
  Receipt,
  Scale,
  ShieldCheck,
  Ship,
  Trash2,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { PHONE_CHIP, PHONE_CHIP_BASE, PHONE_TILE, PHONE_WORD } from "@/components/app/action-pills";
import { AttentionCenter, type AttentionItem } from "@/components/app/attention-center";
import { CargoMix } from "@/components/app/cargo-mix";
import { ContainerProfitTable } from "@/components/app/container-profit-table";
import { DeskHero } from "@/components/app/desk-hero";
import { KpiCard } from "@/components/app/kpi-card";
import { SectionLabel } from "@/components/app/section-label";
import { AreaChart } from "@/components/charts/area-chart";
import { Donut, DonutLegend, SWATCHES, type DonutSlice } from "@/components/charts/donut";
import { FlowBars } from "@/components/charts/flow-bars";
import { approvalQueues } from "@/lib/approvals";
import { formatCurrency } from "@/lib/currency";
import { darFields, darMidnight } from "@/lib/dar-time";
import { byCategory, byCustomer, figures, loadBooks, monthRange, periodRange, type Money } from "@/lib/finance-report";
import { t } from "@/lib/i18n";
import { managerOverview } from "@/lib/manager-overview";
import { can } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer-locale";

const DAY = 86_400_000;

/* The owner's own pages, straight under the banner: the first two solid, the
   rest tinted. */
type Pill = { href: string; label: string; icon: LucideIcon; solid?: string; tint: string; show: boolean };

export async function ExecutiveHome({ user }: { user: SessionUser }) {
  const locale = await viewerLocale();
  const tr = (text: string) => t(locale, text);
  const role = user.role;

  const [overview, books, queues] = await Promise.all([managerOverview(locale), loadBooks(), approvalQueues()]);
  const money = (n: number) => formatCurrency(Math.round(n), "TZS");
  const rate = overview.rate;

  // ------------------------------------------------------------ the month
  const { current, previous } = periodRange("month");
  const now = figures(books, current);
  const before = figures(books, previous);
  /* Percent change on last month; nothing to compare against is no figure, not 0%. */
  const change = (a: Money, b: Money) => (Math.abs(b.tzs) > 0.5 ? ((a.tzs - b.tzs) / Math.abs(b.tzs)) * 100 : undefined);
  const lastMonth = (m: Money) => `${tr("last month")} ${money(m.tzs)}`;

  // --------------------------------------------- what waits on the owner
  /* The departments execute their duties. This panel shows only what a
     decision of the reader's moves — the approval queues they may rule on — and
     credit gone past its date, money that left on a promise. */
  const attention: AttentionItem[] = queues
    .filter((queue) => queue.count > 0 && can(role, queue.permission))
    .map((queue) => ({
      id: `queue-${queue.key}`,
      group: tr("Decisions"),
      count: queue.count,
      tone: queue.key === "claims" || (queue.oldestDays ?? 0) >= 5 ? ("warn" as const) : ("neutral" as const),
      title: `${queue.count} · ${tr(queue.label)}`,
      detail: tr(queue.detail),
      href: queue.href,
      meta: queue.valueTzs && queue.valueTzs.greaterThan(0) ? money(queue.valueTzs.toNumber()) : undefined,
      metaSub: queue.oldestDays ? `${tr("oldest")} ${queue.oldestDays}${tr("d")}` : undefined,
    }));
  const overdueCredit = overview.company.customers.overdueOnCredit;
  if (overdueCredit > 0) {
    attention.push({
      id: "credit-overdue",
      group: tr("Decisions"),
      count: overdueCredit,
      tone: "bad",
      title: `${overdueCredit} · ${tr("Credit past its date")}`,
      detail: tr("Cargo released on a promise, and the promise has run out."),
      href: "/app/finance/credit",
      meta: overview.money.creditOwedTzs > 0 ? money(overview.money.creditOwedTzs) : undefined,
    });
  }

  // ------------------------------------------------------------ the money
  const valued = overview.accounts
    .map((a) => ({ name: a.name, tzs: a.currency === "TZS" ? a.balance : rate ? a.balance * rate : 0 }))
    .filter((a) => a.tzs > 0.5)
    .sort((a, b) => b.tzs - a.tzs);
  const moneySlices: DonutSlice[] = [
    ...valued.slice(0, 3).map((a, i) => ({ label: a.name, value: a.tzs, tone: ([1, 4, 2] as const)[i] })),
    ...(valued.length > 3
      ? [{ label: tr("Other accounts"), value: valued.slice(3).reduce((n, a) => n + a.tzs, 0), tone: 5 as const }]
      : []),
  ];
  const held = overview.heldTzs;
  const collectedToday = overview.money.collectedTodayTzs;
  const spentToday = overview.money.spentToday.tzs;
  const netToday = collectedToday - spentToday;

  // ------------------------------------------------- a year, month by month
  const here = darFields(new Date());
  const year = Array.from({ length: 12 }, (_, i) => {
    const civil = darFields(darMidnight(here.year, here.month - 11 + i, 1));
    const r = monthRange(civil.year, civil.month);
    const f = figures(books, r);
    return {
      label: r.from.toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Dar_es_Salaam" }),
      billed: f.billed.tzs,
      costs: f.expenses.tzs,
      left: f.profit.tzs,
    };
  });

  /* Volume landed at Dar, this year against last, month by month. */
  const landed = (y: number) =>
    Array.from({ length: here.month + 1 }, (_, m) => {
      const r = monthRange(y, m);
      return books.dar.filter((d) => d.receivedAt && d.receivedAt >= r.from && d.receivedAt < r.to).reduce((s, d) => s + Number(d.cbm ?? 0), 0);
    });
  const volumeNow = landed(here.year);
  const volumeBefore = landed(here.year - 1);
  const volumeLabels = volumeNow.map((_, m) => monthRange(here.year, m).from.toLocaleDateString("en-GB", { month: "short", timeZone: "Africa/Dar_es_Salaam" }));

  // ---------------------------------------------------------- health
  const pct = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)}%`);
  const growth = (a: number, b: number) => (Math.abs(b) > 0.5 ? ((a - b) / Math.abs(b)) * 100 : null);
  const revenueGrowth = growth(now.revenue.tzs, before.revenue.tzs);
  const profitGrowth = growth(now.profit.tzs, before.profit.tzs);
  const tone = (good: boolean, warn: boolean) => (good ? "text-success" : warn ? "text-warning" : "text-destructive");
  const health = [
    { key: "collection", label: "Collection rate", value: pct(now.collectionRate), cls: now.collectionRate === null ? "text-foreground" : tone(now.collectionRate >= 80, now.collectionRate >= 50) },
    { key: "margin", label: "Profit margin", value: pct(now.margin), cls: now.margin === null ? "text-foreground" : tone(now.margin >= 20, now.margin >= 0) },
    { key: "expense", label: "Expense ratio", value: pct(now.expenseRatio), cls: now.expenseRatio === null ? "text-foreground" : tone(now.expenseRatio <= 60, now.expenseRatio <= 85) },
    { key: "outstanding", label: "Outstanding ratio", value: pct(now.outstandingRatio), cls: now.outstandingRatio === null ? "text-foreground" : tone(now.outstandingRatio <= 20, now.outstandingRatio <= 40) },
    { key: "revenue", label: "Revenue growth", value: pct(revenueGrowth), cls: revenueGrowth === null ? "text-foreground" : tone(revenueGrowth >= 0, false) },
    { key: "profit", label: "Profit growth", value: pct(profitGrowth), cls: profitGrowth === null ? "text-foreground" : tone(profitGrowth >= 0, false) },
  ];

  // ------------------------------------------- where it comes from and goes
  const services = (["LCL", "FCL"] as const)
    .map((service) => {
      const bills = now.bills.filter((b) => b.service === service);
      const billed = bills.reduce((s, b) => s + b.total.tzs, 0);
      const owing = bills.reduce((s, b) => s + b.owing.tzs, 0);
      return { service, billed, collected: Math.max(0, billed - owing) };
    })
    .filter((row) => row.billed > 0.5);
  const topCustomers = byCustomer(now.bills).slice(0, 6);
  const costs = byCategory(now.costs).slice(0, 6);
  const costsTotal = now.expenses.tzs;

  // ---------------------------------------------- what we are owed, by age
  const today = Date.now();
  const owingBills = books.bills.filter((b) => b.owing.tzs > 0.5);
  const bands = [
    { key: "week", label: "Billed this week", min: 0, max: 7, dot: "bg-success" },
    { key: "fortnight", label: "8–14 days", min: 8, max: 14, dot: "bg-chart-1" },
    { key: "month", label: "15–30 days", min: 15, max: 30, dot: "bg-warning" },
    { key: "older", label: "Over 30 days", min: 31, max: Infinity, dot: "bg-destructive" },
  ].map((band) => {
    const rows = owingBills.filter((b) => {
      const age = Math.floor((today - b.at.getTime()) / DAY);
      return age >= band.min && age <= band.max;
    });
    return { ...band, count: rows.length, value: rows.reduce((s, b) => s + b.owing.tzs, 0) };
  });
  const owedTotal = bands.reduce((s, b) => s + b.value, 0);
  const oldestDays = owingBills.length
    ? Math.max(...owingBills.map((b) => Math.floor((today - b.at.getTime()) / DAY)))
    : 0;

  // ---------------------------------------------------- where the cargo is
  const position = overview.position;
  const positionSlices: DonutSlice[] = [
    { label: tr("In Foshan"), value: position.inChina, tone: 2 },
    { label: tr("At sea"), value: position.atSea, tone: 1 },
    { label: tr("On the Dar floor"), value: position.onFloor, tone: 4 },
    { label: tr("Ready, not collected"), value: position.ready, tone: 5 },
    { label: tr("Did not come off"), value: position.flagged, tone: 3 },
  ];
  const flowNow = overview.flow[overview.flow.length - 1];
  const netThisMonth = flowNow ? flowNow.in - flowNow.out : 0;

  const pills: Pill[] = [
    { href: "/app/finance/ledger", label: "The ledger", icon: Landmark, solid: "bg-signal text-signal-foreground hover:bg-signal/90", tint: "", show: can(role, "accounting.view") },
    { href: "/app/finance/accounts", label: "Accounts", icon: Wallet, solid: "bg-brand text-brand-foreground hover:bg-brand/90", tint: "", show: can(role, "accounting.view") },
    { href: "/app/finance/reports", label: "Profit & loss", icon: TrendingUp, tint: "border-success/30 bg-success/10 text-success hover:bg-success/15", show: can(role, "profit.view") },
    { href: "/app/manager/approvals", label: "Approvals", icon: ShieldCheck, tint: "border-brand/30 bg-brand/10 text-brand hover:bg-brand/15", show: can(role, "record.review") },
    { href: "/app/exceptions", label: "Issues & claims", icon: AlertTriangle, tint: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15", show: can(role, "exception.view") },
    { href: "/app/admin/deleted", label: "Deleted records", icon: Trash2, tint: "border-chart-6/30 bg-chart-6/10 text-chart-6 hover:bg-chart-6/15", show: can(role, "records.viewDeleted") },
  ];
  const shown = pills.filter((p) => p.show);
  const CHIP: Record<string, string> = {
    "The ledger": PHONE_CHIP.signal,
    Accounts: PHONE_CHIP.brand,
    "Profit & loss": PHONE_CHIP.success,
    Approvals: PHONE_CHIP.marine,
    "Issues & claims": PHONE_CHIP.warning,
    "Deleted records": PHONE_CHIP.violet,
  };
  /* One word under each icon on a phone. */
  const WORD: Record<string, string> = {
    "The ledger": "Ledger",
    Accounts: "Accounts",
    "Profit & loss": "Profit",
    Approvals: "Approvals",
    "Issues & claims": "Issues",
    "Deleted records": "Deleted",
  };

  return (
    <div className="space-y-6">
      {/* 1. The banner every desk opens on: the name, the title, the day. */}
      <DeskHero
        greeting="Habari"
        name={user.name.split(" ")[0]}
        department={tr("CEO")}
        kicker="CEO"
        subtitle=""
        search={false}
      />

      {/* 2. The owner's own pages. On a phone, tiles three across. */}
      <nav aria-label={tr("Quick actions")} className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {shown.map((pill) => (
          <span key={pill.href} className="contents">
            <Link
              href={pill.href}
              className={cn(PHONE_TILE, "sm:hidden")}
            >
              <span className={cn(PHONE_CHIP_BASE, CHIP[pill.label])}>
                <pill.icon className="size-[22px]" />
              </span>
              <span className={PHONE_WORD}>{tr(WORD[pill.label] ?? pill.label)}</span>
            </Link>
            <Link
              href={pill.href}
              className={cn(
                "focus-ring hidden items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex sm:text-sm",
                pill.solid ? `border-transparent ${pill.solid}` : pill.tint
              )}
            >
              <pill.icon className="size-3.5" />
              {tr(pill.label)}
            </Link>
          </span>
        ))}
      </nav>

      {/* 3. Only what waits on a decision of the owner's. */}
      <section>
        <SectionLabel count={attention.length} action={{ href: "/app/manager/approvals", label: tr("Every decision") }}>
          {tr("Needs your attention")}
        </SectionLabel>
        {attention.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-[13px] shadow-soft">
            <span aria-hidden className="h-7 w-0.5 shrink-0 rounded-full bg-success" />
            {tr("Nothing needs your decision. Every desk is clear.")}
          </div>
        ) : (
          <AttentionCenter items={attention} />
        )}
      </section>

      {/* 4. The money: where it sits, as a ring, and today since midnight — one card. */}
      <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b px-5 py-3">
          <h2 className="font-semibold">{tr("The money")}</h2>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
                Math.round(netToday) === 0
                  ? "bg-muted text-muted-foreground"
                  : netToday > 0
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive"
              )}
            >
              {Math.round(netToday) === 0
                ? tr("No change today")
                : `${money(Math.abs(netToday))} ${netToday > 0 ? tr("up today") : tr("down today")}`}
            </span>
            <Link href="/app/finance/accounts" className="whitespace-nowrap text-xs font-semibold text-brand hover:underline">
              {tr("Open accounts")}
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="min-w-0 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("In the accounts")}</p>
            <p className="tnum mt-1 whitespace-nowrap text-2xl font-bold sm:text-[26px]">{money(held)}</p>
            {overview.heldUnconvertedUsd > 0 ? (
              <p className="text-xs text-muted-foreground">
                + {formatCurrency(overview.heldUnconvertedUsd, "USD")} {tr("with no rate to convert it")}
              </p>
            ) : null}
            {moneySlices.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr("No account holds any money yet.")}</p>
            ) : (
              <div className="mt-3 flex items-center gap-5">
                <Donut size={92} stroke={14} slices={moneySlices} className="shrink-0" />
                <ul className="min-w-0 flex-1 space-y-2">
                  {moneySlices.map((slice) => {
                    const share = held > 0 ? (slice.value / held) * 100 : 0;
                    return (
                      <li key={slice.label} className="min-w-0">
                        <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <span className={cn("size-2 shrink-0 rounded-full", SWATCHES[slice.tone])} />
                          <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                          <span className="tnum shrink-0">{share > 0 && share < 1 ? "<1%" : `${Math.round(share)}%`}</span>
                        </p>
                        <p className="tnum whitespace-nowrap pl-4 text-sm font-semibold">{money(slice.value)}</p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
          <div className="min-w-0 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{tr("Today")}</p>
            <dl className="mt-1 divide-y">
              {[
                { k: tr("Billed today"), v: money(overview.money.billedToday.tzs), cls: "text-foreground", href: "/app/finance/invoices" },
                { k: tr("Collected today"), v: money(collectedToday), cls: "text-success", href: "/app/finance/income" },
                { k: tr("Spent today"), v: money(spentToday), cls: spentToday > 0 ? "text-warning" : "text-foreground", href: "/app/finance/expenses" },
                { k: tr("Net cash today"), v: `${netToday < 0 ? "−" : ""}${money(Math.abs(netToday))}`, cls: netToday < 0 ? "text-destructive" : "text-success", href: "/app/finance/ledger" },
              ].map((row) => (
                <Link key={row.k} href={row.href} className="flex items-baseline justify-between gap-3 py-2 hover:opacity-80">
                  <dt className="min-w-0 truncate text-sm text-muted-foreground">{row.k}</dt>
                  <dd className={cn("tnum shrink-0 whitespace-nowrap text-base font-bold", row.cls)}>{row.v}</dd>
                </Link>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* 5. The month against the last. Two to a row on a phone. */}
      <div>
        <SectionLabel action={{ href: "/app/finance/reports", label: tr("Profit & loss") }}>
          {`${tr("This month")} · ${tr("against last month")}`}
        </SectionLabel>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard index={0} label={tr("Billed")} value={money(now.billed.tzs)} delta={change(now.billed, before.billed)} hint={lastMonth(before.billed)} icon={Receipt} tone="brand" href="/app/finance/reports" />
          <KpiCard index={1} label={tr("Collected")} value={money(now.collected.tzs)} delta={change(now.collected, before.collected)} hint={lastMonth(before.collected)} icon={HandCoins} tone="success" href="/app/finance/income" />
          <KpiCard index={2} label={tr("Costs")} value={money(now.expenses.tzs)} delta={change(now.expenses, before.expenses)} deltaGood={false} hint={lastMonth(before.expenses)} icon={Banknote} tone="warning" href="/app/finance/expenses" />
          <KpiCard
            index={3}
            label={tr("Billed less costs")}
            value={money(now.profit.tzs)}
            delta={change(now.profit, before.profit)}
            hint={now.margin === null ? tr("nothing billed this month yet") : `${Math.round(now.margin)}% ${tr("margin")}`}
            ring={now.margin === null ? undefined : { value: Math.max(0, Math.min(100, now.margin)), total: 100 }}
            icon={ChartNoAxesCombined}
            tone={now.profit.tzs < 0 ? "warning" : (now.margin ?? 0) >= 20 ? "success" : "brand"}
            href="/app/finance/reports"
          />
          <KpiCard index={4} label={tr("Owed to us")} value={money(overview.money.owedTzs)} hint={tr("Owed on every unpaid bill, not just this month")} icon={Wallet} tone={overview.money.owedTzs > 0 ? "warning" : "success"} href="/app/finance/collections" />
          <KpiCard
            index={5}
            label={tr("Collected of what was billed")}
            value={now.collectionRate === null ? "—" : `${Math.round(now.collectionRate)}%`}
            hint={`${money(Math.max(0, now.billed.tzs - now.outstanding.tzs))} ${tr("of")} ${money(now.billed.tzs)}`}
            icon={Scale}
            tone={(now.collectionRate ?? 0) >= 80 ? "success" : "marine"}
          />
          <KpiCard
            index={6}
            label={tr("Cargo this month")}
            value={`${now.cbmReceived.toFixed(2)} CBM`}
            hint={`${now.packages} ${tr("packages")} · ${now.customers} ${tr("customers")}`}
            icon={Package}
            tone="marine"
            href="/app/inventory"
          />
          <KpiCard
            index={7}
            label={tr("Containers landed")}
            value={String(now.arrived)}
            hint={`${now.closed} ${tr("closed this month")} · ${now.cbmLanded.toFixed(2)} CBM ${tr("landed")}`}
            icon={Ship}
            tone="brand"
            href="/app/containers/arrived"
          />
        </div>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {tr("Billed less costs is what was invoiced this month, not money received. What has not been paid is under Owed to us.")}
          {now.margin !== null && now.margin > 95 ? (
            <span className="text-warning">
              {" "}
              {tr("Almost no costs are recorded for this month, so this reads higher than the business earned — freight, port and clearing costs have not been entered.")}
            </span>
          ) : null}
        </p>
      </div>

      {/* 6. A year of the business, and how healthy this month reads. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft xl:col-span-2">
          <h2 className="font-semibold">{tr("Billed, costs and what was left")}</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{tr("The last twelve months")} · TZS</p>
          <AreaChart
            labels={year.map((m) => m.label)}
            format="money"
            currency="TZS"
            series={[
              { name: tr("Billed"), values: year.map((m) => m.billed), tone: 1 },
              { name: tr("Costs"), values: year.map((m) => m.costs), tone: 3 },
              { name: tr("Billed less costs"), values: year.map((m) => m.left), tone: 5 },
            ]}
          />
        </section>
        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{tr("Financial health")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("This month, read against the rules the business keeps")}</p>
          <ul className="mt-3 divide-y">
            {health.map((metric) => (
              <li key={metric.key} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 text-sm text-muted-foreground">{tr(metric.label)}</span>
                <span className={cn("tnum shrink-0 whitespace-nowrap text-base font-bold", metric.cls)}>{metric.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 7. What each container is making. */}
      <ContainerProfitTable containers={overview.containerProfit} locale={locale} />

      {/* 8. Where the money comes from, who brings it, and where it goes. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{tr("By service")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("Billed this month, and how much of it came in")}</p>
          <ul className="mt-3 space-y-3">
            {services.length === 0 ? (
              <li className="text-sm text-muted-foreground">{tr("Nothing billed this month yet")}</li>
            ) : (
              services.map((row) => {
                const share = row.billed > 0 ? Math.min(100, (row.collected / row.billed) * 100) : 0;
                return (
                  <li key={row.service}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{row.service === "LCL" ? tr("Loose cargo (LCL)") : tr("Full container (FCL)")}</span>
                      <span className="tnum shrink-0 whitespace-nowrap font-semibold">{money(row.billed)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-success" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {money(row.collected)} {tr("collected")} · {Math.round(share)}%
                    </p>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{tr("Top customers")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("Billed this month, and what they still owe")}</p>
          <ul className="mt-3 divide-y">
            {topCustomers.length === 0 ? (
              <li className="py-2 text-sm text-muted-foreground">{tr("Nothing billed this month yet")}</li>
            ) : (
              topCustomers.map((row, i) => (
                <li key={`${row.name}-${i}`} className="flex items-center gap-3 py-2">
                  <span className="tnum grid size-6 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block whitespace-nowrap text-sm font-semibold">{money(row.billed.tzs)}</span>
                    <span className={cn("tnum block whitespace-nowrap text-[11px]", row.owed.tzs > 0.5 ? "text-destructive" : "text-success")}>
                      {row.owed.tzs > 0.5 ? `${money(row.owed.tzs)} ${tr("owed")}` : tr("settled")}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="font-semibold">{tr("Where money is spent")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("This month's costs, largest first")}</p>
          <ul className="mt-3 space-y-2.5">
            {costs.length === 0 ? (
              <li className="text-sm text-muted-foreground">{tr("No costs recorded this month")}</li>
            ) : (
              costs.map((row) => (
                <li key={row.name}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{tr(row.name)}</span>
                    <span className="tnum shrink-0 whitespace-nowrap">{money(row.amount.tzs)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-destructive/60"
                      style={{ width: `${Math.max(2, Math.min(100, costsTotal > 0 ? (row.amount.tzs / costsTotal) * 100 : 0))}%` }}
                    />
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* 9. The money over the year, the debts by age, and the cargo right now. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="min-w-0 rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{tr("Money in and out")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr("What arrived against what it cost, this year")}</p>
            </div>
            <p className="shrink-0 text-right">
              <span className={cn("block font-mono text-xs font-semibold", netThisMonth < 0 ? "text-signal" : "text-success")}>
                {netThisMonth < 0 ? "−" : "+"}
                {money(Math.abs(netThisMonth))}
              </span>
              <span className="block text-[10px] text-muted-foreground">{tr("this month")}</span>
            </p>
          </div>
          <FlowBars className="mt-3" data={overview.flow} inLabel={tr("Money in")} outLabel={tr("Money out")} />
        </section>

        <section className="min-w-0 rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{tr("What we are owed, by age")}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{tr("From the day the bill became real")}</p>
            </div>
            {oldestDays > 0 ? (
              <p className="shrink-0 text-right text-xs text-muted-foreground">
                {tr("oldest")} <span className="font-mono font-semibold text-foreground">{oldestDays}d</span>
              </p>
            ) : null}
          </div>
          {owedTotal <= 0.5 ? (
            <p className="mt-3 text-sm text-muted-foreground">{tr("Nothing is owed. Every bill raised has been settled.")}</p>
          ) : (
            <>
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
                {bands
                  .filter((b) => b.value > 0)
                  .map((b) => (
                    <div key={b.key} className={cn("h-full", b.dot)} style={{ width: `${(b.value / owedTotal) * 100}%` }} />
                  ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {bands.map((b) => (
                  <li key={b.key} className="flex items-center gap-2 text-xs">
                    <span className={cn("size-2 shrink-0 rounded-full", b.dot)} />
                    <span className="min-w-0 flex-1 truncate">{tr(b.label)}</span>
                    <span className="tnum shrink-0 text-muted-foreground">
                      {b.count} {b.count === 1 ? tr("bill") : tr("bills")}
                    </span>
                    <span className="tnum w-28 shrink-0 text-right font-mono text-[11px] text-brand">{money(b.value)}</span>
                    <span className="tnum w-9 shrink-0 text-right text-muted-foreground">{Math.round((b.value / owedTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
            {tr("Credit outstanding")} <span className="tnum font-semibold text-foreground">{money(overview.money.creditOwedTzs)}</span>
          </p>
        </section>

        <section className="min-w-0 rounded-xl border bg-card p-4 shadow-soft">
          <h3 className="text-sm font-semibold">{tr("Where the cargo is")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{tr("Everything the business is carrying, Foshan to the counter")}</p>
          <div className="mt-3 flex justify-center">
            <Donut size={118} stroke={18} label={String(position.total)} caption={tr("consignments")} slices={positionSlices} />
          </div>
          <div className="mt-3">
            <DonutLegend slices={positionSlices} />
          </div>
        </section>
      </div>

      {/* 10. What the business carries. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="min-w-0">
          <CargoMix
            slices={overview.mix.slices}
            totalLines={overview.mix.totalLines}
            totalCbm={overview.mix.totalCbm}
            periodLabel={`${tr("Received in the last")} ${overview.mix.days} ${tr("days")}`}
            unclassifiedName={tr("Not classified")}
            locale={locale}
          />
        </div>
        <section className="min-w-0 rounded-xl border bg-card p-5 shadow-soft xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">{tr("Cargo volume")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {here.year} {tr("against")} {here.year - 1} · {tr("CBM landed at Dar")}
              </p>
            </div>
            <div className="text-right">
              <p className="tnum text-2xl font-bold">{volumeNow.reduce((s, v) => s + v, 0).toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">{tr("CBM this year")}</p>
            </div>
          </div>
          <AreaChart
            labels={volumeLabels}
            format="cbm"
            series={[
              { name: String(here.year), values: volumeNow, tone: 1 },
              { name: String(here.year - 1), values: volumeBefore, tone: 2 },
            ]}
          />
        </section>
      </div>
    </div>
  );
}
