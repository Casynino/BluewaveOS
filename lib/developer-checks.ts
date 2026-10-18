import "server-only";

import { impliedStatus } from "@/lib/invoice-balance";
import type { Finding } from "@/lib/developer-overview";
import { lastJobRuns } from "@/lib/job-runs";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";

/**
 * WHAT IS WRONG WITH THE SYSTEM, AND WHAT TO DO ABOUT IT.
 *
 * Only the system's own faults — errors, jobs that stopped, data that
 * disagrees with itself, settings that are missing. Never the business's
 * to-dos (a payment awaiting verification, a rate to refresh): those belong
 * to Finance and the floors, and are not the developer's to chase.
 *
 * Each check looks for one way this system goes wrong — a bill that disagrees
 * with its payments, a count that disagrees with its lines, storage not being
 * charged, errors, photos that will not load — and, when it finds it, says what
 * is wrong, why it matters and what to do. A check that cannot run reports
 * nothing rather than a false alarm, and never stops the others.
 */

const DAY = 86_400_000;

/** A check either finds problems, or says it is fine — or that it could not tell. */
type Note = { ok: string } | { unknown: string };
type Check = () => Promise<Finding[] | Note>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const errors: Check = async () => {
  const since = new Date(Date.now() - DAY);
  const rows = await prisma.systemEvent.findMany({
    where: { kind: "ERROR", createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { message: true, path: true },
  });
  if (rows.length === 0) return [];
  const byMessage = new Map<string, { n: number; path: string | null }>();
  for (const r of rows) {
    const cur = byMessage.get(r.message) ?? { n: 0, path: r.path };
    cur.n++;
    byMessage.set(r.message, cur);
  }
  const top = [...byMessage].sort((a, b) => b[1].n - a[1].n).slice(0, 4);
  return [
    {
      key: "errors",
      tone: rows.length >= 5 ? "fix" : "look",
      title: `${plural(rows.length, "server error")} in the last 24 hours`,
      detail: "Something failed on the server while somebody was using it. They saw an error page, or the action did not happen.",
      fix: "Open the page named below and repeat what the person was doing. If the same message keeps coming, that is the bug to fix.",
      lines: top.map(([message, v]) => `${v.n}× ${message}${v.path ? ` — ${v.path}` : ""}`),
    },
  ];
};

const photos: Check = async () => {
  const last = await prisma.cargoPhoto.findFirst({ orderBy: { createdAt: "desc" }, select: { url: true } });
  if (!last) return { unknown: "No cargo photo yet." };
  if (!last.url.startsWith("/uploads/")) return { unknown: "The newest photo is not in file storage." };
  const segments = last.url.slice("/uploads/".length).split("/");
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 4000));
  const result = await Promise.race([readUpload(segments).then((f) => (f ? "ok" : "missing")).catch(() => "failed"), timeout]);
  if (result === "ok") return [];
  return [
    {
      key: "photos",
      tone: "fix",
      title: "Photos cannot be loaded",
      detail:
        result === "missing"
          ? "The newest cargo photo is recorded but its file is not in storage."
          : "The photo storage is not answering. Every cargo photo and receipt picture will show as broken, for staff and customers.",
      fix: "Open Vercel → the project's Storage and Billing. An unpaid invoice or a blocked store is the usual cause; the photos come back as soon as it is settled.",
    },
  ];
};

const invoiceStatus: Check = async () => {
  const bills = await prisma.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] } },
    select: {
      id: true, number: true, status: true, total: true, currency: true, fxRate: true, totalTzs: true, dueAt: true,
      payments: { select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true } },
    },
    take: 3000,
  });
  const drift = bills.filter((b) => (b.status === "PAID") !== (impliedStatus(b) === "PAID"));
  if (drift.length === 0) return [];
  return [
    {
      key: "status-drift",
      tone: "fix",
      title: `${plural(drift.length, "bill")} marked paid or unpaid wrongly`,
      detail: "The status on the bill disagrees with the verified payments against it. A customer may be told they owe money they have paid — or released goods they have not paid for.",
      fix: "Open the bill and check its payments. To change it, work as Finance and refresh the status from the invoice page.", workAs: "FINANCE",
      lines: drift.slice(0, 5).map((b) => `${b.number} is marked ${b.status.toLowerCase().replace("_", " ")}`),
      href: `/app/finance/invoices/${drift[0].id}`,
    },
  ];
};

const invoiceTotals: Check = async () => {
  const rows = await prisma.$queryRaw<{ number: string; id: string }[]>`
    SELECT i."number", i."id" FROM "Invoice" i
    WHERE i."status" NOT IN ('DRAFT', 'CANCELLED')
      AND EXISTS (SELECT 1 FROM "InvoiceItem" it WHERE it."invoiceId" = i."id")
      AND abs(i."subtotal" - (SELECT COALESCE(SUM(it."amount"), 0) FROM "InvoiceItem" it WHERE it."invoiceId" = i."id")) > 0.05
    LIMIT 20`;
  if (rows.length === 0) return [];
  return [
    {
      key: "totals",
      tone: "fix",
      title: `${plural(rows.length, "bill")} whose total does not match its lines`,
      detail: "The amount the customer is asked to pay is not the sum of what the bill lists. Somebody is being over- or under-charged.",
      fix: "Open the bill and compare the lines to the total. To correct it, work as Finance and re-price it from the invoice page.", workAs: "FINANCE",
      lines: rows.slice(0, 5).map((r) => r.number),
      href: `/app/finance/invoices/${rows[0].id}`,
    },
  ];
};

const chinaCount: Check = async () => {
  const rows = await prisma.$queryRaw<{ reference: string; id: string; counted: number; lines: number }[]>`
    SELECT c."reference", c."id", cr."packagesCount" AS counted, s.q::int AS lines
    FROM "ChinaReceiving" cr
    JOIN "Cargo" c ON c."id" = cr."cargoId" AND c."deletedAt" IS NULL
    JOIN (SELECT "cargoId", SUM("quantity") q FROM "CargoPackage" WHERE "deletedAt" IS NULL GROUP BY "cargoId") s ON s."cargoId" = cr."cargoId"
    LEFT JOIN "DarReceiving" d ON d."cargoId" = cr."cargoId"
    WHERE d."id" IS NULL AND cr."packagesCount" <> s.q
    LIMIT 20`;
  if (rows.length === 0) return [];
  return [
    {
      key: "china-count",
      tone: "look",
      title: `${plural(rows.length, "consignment")} whose package count disagrees with its lines`,
      detail: "The count on the cargo card is not the sum of its package lines. Dar will see a shortage or surplus that is not real.",
      fix: "Open the cargo to see it. To correct it, work as the China warehouse and correct a line (any change re-adds the totals).", workAs: "CHINA_WAREHOUSE",
      lines: rows.slice(0, 5).map((r) => `${r.reference}: card says ${r.counted}, lines add to ${r.lines}`),
      href: `/app/cargo/${rows[0].id}`,
    },
  ];
};

const storageNotCharging: Check = async () => {
  const company = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { freeStorageDays: true, storagePerDay: true } });
  if (!company) return { unknown: "The company settings are not saved yet." };
  if (Number(company.storagePerDay) <= 0) return { ok: "Storage is switched off (rate 0)." };
  const cutoff = new Date(Date.now() - (company.freeStorageDays + 1) * DAY);
  const bills = await prisma.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
      storageWaivedAt: null,
      items: { none: { category: "Storage" } },
      /* The storage clock starts when the container is marked arrived in Dar,
         or at check-in for cargo with no arrival — lib/storage-clock.ts. */
      cargo: {
        deletedAt: null,
        release: { is: null },
        status: { notIn: ["COLLECTED", "DELIVERED", "CANCELLED", "MISSING_AT_DAR"] },
        OR: [
          { darArrivedAt: { lt: cutoff } },
          { darArrivedAt: null, darReceiving: { is: { receivedAt: { lt: cutoff } } } },
        ],
      },
    },
    select: { number: true, cargo: { select: { reference: true } } },
    take: 20,
  });
  if (bills.length === 0) return [];
  return [
    {
      key: "storage",
      tone: "fix",
      title: `Storage is not being added to ${plural(bills.length, "bill")}`,
      detail: "These goods are past their free days and the nightly job should have charged storage. It has not, so the company is losing money — or the job has stopped.",
      fix: "Check that the storage cron is listed in Vercel → Crons and ran last night. Working as Finance and pressing 'Charge storage again' on the bill adds it now.", workAs: "FINANCE",
      lines: bills.slice(0, 5).map((b) => `${b.number} · ${b.cargo.reference}`),
    },
  ];
};

const contradiction: Check = async () => {
  const rows = await prisma.cargo.findMany({
    where: { deletedAt: null, status: { in: ["IN_TRANSIT", "DEPARTED_CHINA"] }, containerLines: { some: { container: { status: "ARRIVED" } } } },
    select: { reference: true, id: true },
    take: 20,
  });
  if (rows.length === 0) return [];
  return [
    {
      key: "contradiction",
      tone: "look",
      title: `${plural(rows.length, "consignment")} still "at sea" on a container that has arrived`,
      detail: "The container was marked arrived but these consignments never moved with it, so customers are still told their goods are on the way.",
      fix: "Open the cargo to see it. To correct it, work as the Dar warehouse: undo and re-mark the container arrived, or check each consignment in.", workAs: "DAR_WAREHOUSE",
      lines: rows.slice(0, 5).map((r) => r.reference),
      href: `/app/cargo/${rows[0].id}`,
    },
  ];
};

const missingSettings: Check = async () => {
  const missing = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "BLOB_READ_WRITE_TOKEN", "CRON_SECRET", "NEXT_PUBLIC_SITE_URL"].filter((n) => !process.env[n]?.trim());
  if (missing.length === 0) return [];
  return [{ key: "env", tone: "fix", title: `${plural(missing.length, "required setting")} missing`, detail: "Parts of the system will not work without these.", fix: "Add them in Vercel → Settings → Environment Variables, then redeploy.", lines: missing }];
};

/* ---------------------------------------------- the platform under it all */

/** How long the database takes for the simplest question, three times. */
async function probe() {
  const ms: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    ms.push(Date.now() - t);
  }
  return Math.round(ms.reduce((a, b) => a + b, 0) / ms.length);
}

const reach: Check = async () => {
  const t = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  return { ok: `Answers in ${Date.now() - t} ms.` };
};

const database: Check = async () => {
  const avg = await probe();
  if (avg <= 400) return { ok: `Average ${avg} ms (healthy is under 150 ms).` };
  return [
    {
      key: "slow-db",
      tone: "look",
      title: `The database is slow (${avg} ms)`,
      detail: "The simplest question takes over 400 ms. Every page waits on the database, so the whole system feels slow.",
      fix: "Check Neon for a suspended or overloaded database, and that the app and the database are in the same region (Frankfurt).",
    },
  ];
};

const pooled: Check = async () => {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    return { unknown: "The database address could not be read." };
  }
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return { unknown: "A local database." };
  if (url.hostname.includes("-pooler") || url.searchParams.get("pgbouncer") === "true") return { ok: "Pooled." };
  return [
    {
      key: "pooled",
      tone: "look",
      title: "The database link is not the pooled one",
      detail: "Every page opens its own connection. On a busy day the database runs out of connections and pages fail.",
      fix: "In Neon, copy the pooled connection string into DATABASE_URL in Vercel → Settings → Environment Variables (keep DIRECT_URL as the direct one), then redeploy.",
    },
  ];
};

const databaseSize: Check = async () => {
  const [row] = await prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
  const mb = Number(row?.size ?? 0) / 1048576;
  if (!mb) return { unknown: "Could not be read just now." };
  if (mb <= 400) return { ok: `${mb.toFixed(0)} MB.` };
  return [
    {
      key: "db-size",
      tone: "look",
      title: `The database is ${mb.toFixed(0)} MB`,
      detail: "It is close to the plan's limit. When it is full, nothing new can be saved.",
      fix: "Check the plan in Neon and raise it before the limit is reached.",
    },
  ];
};

const failedSignIns: Check = async () => {
  const n = await prisma.loginEvent.count({ where: { ok: false, createdAt: { gte: new Date(Date.now() - DAY) } } });
  if (n < 10) return { ok: `${n} in 24 hours.` };
  return [
    {
      key: "failed-logins",
      tone: "look",
      title: `${plural(n, "failed sign-in")} in 24 hours`,
      detail: "A few are typing mistakes. Many, or many from one address, means somebody is guessing passwords.",
      fix: "Open Sign-ins & security below and look at Failed tries by address. Suspend an account that is being guessed at, from Access.",
    },
  ];
};

/** One check per automatic job: has it run, did it work, is it on time. */
async function jobChecks(): Promise<Line[]> {
  const jobs = await lastJobRuns();
  return jobs.map((j) => {
    const label = `${j.title} runs on time`;
    if (!j.last) return { label, status: "unknown", detail: "No run recorded yet.", findings: [] };
    if (!j.last.ok) {
      return {
        label,
        status: "fix",
        detail: "Failed on its last run.",
        findings: [
          {
            key: `job-${j.route}`,
            tone: "fix",
            title: `${j.title} failed on its last run`,
            detail: `The job at ${j.route} did not finish. Until it does, ${j.route.endsWith("charge") ? "bills do not carry today's storage" : "customers are not told their free days are over"}.`,
            fix: "Open Vercel → the project → Logs, find the job's last run and read the error. It runs again on its own at its next time.",
          },
        ],
      };
    }
    if (Date.now() - j.last.at.getTime() > 36 * 3_600_000) {
      return {
        label,
        status: "look",
        detail: "Its last run is more than a day and a half old.",
        findings: [
          {
            key: `job-${j.route}`,
            tone: "look",
            title: `${j.title} has not run for over a day`,
            detail: `It should run every day at ${j.runsAt} Dar time.`,
            fix: "Check that the job is listed under Vercel → Settings → Cron Jobs and that CRON_SECRET is set.",
          },
        ],
      };
    }
    return { label, status: "ok", detail: "Ran on schedule.", findings: [] };
  });
}

/* ------------------------------------------------------------ what is run */

export type CheckStatus = "ok" | "look" | "fix" | "unknown";
type Line = { label: string; status: CheckStatus; detail: string; findings: Finding[] };

const LABELLED: { label: string; ok: string; run: Check }[] = [
  { label: "The database can be reached", ok: "", run: reach },
  { label: "The database is fast", ok: "", run: database },
  { label: "The database link is the pooled one", ok: "", run: pooled },
  { label: "Required settings are in place", ok: "All required settings are set.", run: missingSettings },
  { label: "No server errors in the last 24 hours", ok: "Nothing broke.", run: errors },
  { label: "Failed sign-ins are normal", ok: "", run: failedSignIns },
  { label: "Cargo photos open", ok: "The newest photo opens.", run: photos },
  { label: "Every bill's paid or unpaid mark matches its payments", ok: "No bill disagrees.", run: invoiceStatus },
  { label: "Every bill's total matches its lines", ok: "No bill disagrees.", run: invoiceTotals },
  { label: "Package counts match their lines", ok: "No consignment disagrees.", run: chinaCount },
  { label: "Storage is added to bills past their free days", ok: "Every bill past its free days carries storage.", run: storageNotCharging },
  { label: "No cargo shows at sea on a container that has arrived", ok: "None found.", run: contradiction },
  { label: "The database size is healthy", ok: "", run: databaseSize },
];

const WORST = (fs: Finding[]): CheckStatus => (fs.some((f) => f.tone === "fix") ? "fix" : fs.some((f) => f.tone === "look") ? "look" : "ok");

/**
 * Every check, passing or not — the "what was checked" list — and the
 * problems they found. A check that throws is "not checked yet", never a
 * false alarm, and never stops the others.
 */
export async function runSystemChecks(): Promise<{ findings: Finding[]; list: Omit<Line, "findings">[] }> {
  const [settled, jobs] = await Promise.all([
    Promise.allSettled(LABELLED.map((c) => c.run())),
    jobChecks().catch(() => [] as Line[]),
  ]);
  const lines: Line[] = settled.map((r, i) => {
    const c = LABELLED[i];
    if (r.status === "rejected") return { label: c.label, status: "unknown", detail: "Could not be checked just now.", findings: [] };
    const v = r.value;
    if ("unknown" in v) return { label: c.label, status: "unknown", detail: v.unknown, findings: [] };
    if ("ok" in v) return { label: c.label, status: "ok", detail: v.ok, findings: [] };
    if (v.length === 0) return { label: c.label, status: "ok", detail: c.ok, findings: [] };
    return { label: c.label, status: WORST(v), detail: v.map((f) => f.title).join(" · "), findings: v };
  });
  const all = [...lines, ...jobs];
  return {
    findings: all.flatMap((l) => l.findings),
    list: all.map(({ label, status, detail }) => ({ label, status, detail })),
  };
}

export async function systemChecks(): Promise<Finding[]> {
  return (await runSystemChecks()).findings;
}
