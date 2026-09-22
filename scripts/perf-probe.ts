/**
 * WHAT EACH SCREEN ACTUALLY COSTS THE DATABASE.
 *
 * Signs in as a real desk, requests the real pages off a running dev server,
 * and counts the statements out of Postgres's own log, so nothing here has to
 * guess at, or re-implement, the query a page runs. A page is warmed first
 * (the dev server compiles on the first request) and then measured over
 * several passes, because a query count that includes the compiler is a
 * measurement of the compiler.
 *
 * Development only, against a loaded database — `scripts/perf-seed.ts`.
 *
 *   psql -d postgres -c "ALTER DATABASE bluewave_audit_db SET log_min_duration_statement = 0"
 *   DATABASE_URL=…bluewave_audit_db npx next dev -p 3199 &
 *   npx tsx scripts/perf-probe.ts [baseUrl]
 *
 * Put the logging back afterwards:
 *   psql -d postgres -c "ALTER DATABASE bluewave_audit_db RESET log_min_duration_statement"
 */
import { open, stat } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

import { refuseProductionDatabase } from "../prisma/dev/guard";

refuseProductionDatabase("scripts/perf-probe.ts");

const BASE = process.argv[2] ?? "http://localhost:3199";
const PASSES = 3;

const prisma = new PrismaClient();

const SCREENS: { name: string; path: string; as: "staff" | "customer" | "public" }[] = [
  { name: "dashboard", path: "/app/dashboard", as: "staff" },
  { name: "cargo list", path: "/app/cargo", as: "staff" },
  { name: "cargo list (search)", path: "/app/cargo?q=Kimaro", as: "staff" },
  { name: "containers list", path: "/app/containers", as: "staff" },
  { name: "arrived containers", path: "/app/containers/arrived", as: "staff" },
  { name: "arrived containers (pricing)", path: "/app/containers/arrived?view=pricing", as: "staff" },
  { name: "collections", path: "/app/finance/collections", as: "staff" },
  { name: "collections (overdue)", path: "/app/finance/collections?view=overdue", as: "staff" },
  { name: "inventory / floor", path: "/app/inventory", as: "staff" },
  { name: "pickup notes", path: "/app/finance/pickup-notes", as: "staff" },
  { name: "ledger", path: "/app/finance/ledger", as: "staff" },
  { name: "notifications", path: "/app/notifications", as: "staff" },
  { name: "audit log", path: "/app/admin/audit", as: "staff" },
  { name: "customers list", path: "/app/customers", as: "staff" },
  { name: "customer page", path: "CUSTOMER_PAGE", as: "staff" },
  { name: "portal cargo list", path: "/portal/cargo", as: "customer" },
  { name: "portal invoices", path: "/portal/invoices", as: "customer" },
  { name: "public tracking", path: "PUBLIC_TRACK", as: "public" },
];

/*
  COUNTED FROM POSTGRES'S OWN LOG, NOT FROM THE APPLICATION.

  `pg_stat_database` is no use here: a backend reports its counters at most
  once a second and an idle one does not report at all, so a page that runs
  forty queries in a fifth of a second shows as nothing. The server's log has
  every statement as it happens. `log_min_duration_statement` is set on this
  database alone, and the lines are matched to the connections this database
  is holding — the machine's other databases share the file.
*/
const LOG = process.env.PG_LOG ?? "/opt/homebrew/var/log/postgresql@16.log";

async function backendPids(): Promise<Set<string>> {
  /* This probe's own connection is on the same database and its bookkeeping
     is logged like anything else; it is not part of what a page costs. */
  const rows = await prisma.$queryRaw<{ pid: number }[]>`
    SELECT pid FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()`;
  return new Set(rows.map((r) => String(r.pid)));
}

async function logSize() {
  return (await stat(LOG)).size;
}

/** The statements those backends logged in the slice of file that just grew. */
async function statementsSince(from: number, pids: Set<string>) {
  const to = await logSize();
  if (to <= from) return 0;
  const handle = await open(LOG, "r");
  const buffer = Buffer.alloc(to - from);
  await handle.read(buffer, 0, to - from, from);
  await handle.close();
  let n = 0;
  for (const line of buffer.toString("utf8").split("\n")) {
    const match = /^\S+ \S+ \S+ \[(\d+)\] LOG:  duration: /.exec(line);
    if (match && pids.has(match[1])) n++;
  }
  return n;
}

/** A signed-in cookie jar, by driving the real credentials endpoint. */
async function signIn(email: string, password: string) {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const jar = new Map<string, string>();
  const keep = (res: Response) => {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const at = pair.indexOf("=");
      jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
  };
  keep(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
    body: new URLSearchParams({ email, password, csrfToken, callbackUrl: `${BASE}/app/dashboard` }),
  });
  keep(res);
  const session = await fetch(`${BASE}/api/auth/session`, { headers: { cookie: cookie() } });
  const who = (await session.json()) as { user?: { email?: string } };
  if (!who?.user?.email) throw new Error(`could not sign in as ${email}`);
  return cookie();
}

/* The log is written by the backend, so a line can land a moment after the
   response does. The clock stops at the response; the pause is only so the
   last statements are on disk before the slice is read. */
const settle = () => new Promise((done) => setTimeout(done, 250));

/* The dev server restarts itself when it approaches its memory ceiling, which
   on these screens it does. A dropped socket is that, not a result. */
async function get(url: string, cookie: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(url, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    } catch (error) {
      if (attempt >= 8) throw error;
      await new Promise((done) => setTimeout(done, 3000));
    }
  }
}

async function measure(url: string, cookie: string) {
  const from = await logSize();
  const started = process.hrtime.bigint();
  const res = await get(url, cookie);
  await res.text();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  await settle();
  const pids = await backendPids();
  const queries = await statementsSince(from, pids);
  return { status: res.status, ms, queries };
}

async function main() {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is not set");

  const staff = await signIn("admin@bluewavecargo.co.tz", password);
  const customerLogin = await prisma.user.findFirst({
    where: { role: "CUSTOMER" },
    select: { email: true },
  });
  const customer = customerLogin ? await signIn(customerLogin.email, password).catch(() => "") : "";

  /* The busiest customer and a consignment that has actually landed, so the
     two "one record" screens are measured on a record with a history. */
  const busiest = await prisma.cargo.groupBy({
    by: ["receiverId"],
    _count: { _all: true },
    orderBy: { _count: { receiverId: "desc" } },
    take: 1,
  });
  const tracked = await prisma.cargo.findFirst({
    where: { status: { in: ["READY_FOR_RELEASE", "COLLECTED"] } },
    select: { reference: true },
  });

  const resolve = (path: string) =>
    path === "CUSTOMER_PAGE"
      ? `/app/customers/${busiest[0]?.receiverId ?? ""}`
      : path === "PUBLIC_TRACK"
        ? `/track/${tracked?.reference ?? ""}`
        : path;

  console.log(`\n${"screen".padEnd(32)}${"queries".padStart(9)}${"ms".padStart(9)}`);
  console.log("-".repeat(50));

  for (const screen of SCREENS) {
    const url = `${BASE}${resolve(screen.path)}`;
    const cookie = screen.as === "staff" ? staff : screen.as === "customer" ? customer : "";
    if (screen.as === "customer" && !cookie) {
      console.log(`${screen.name.padEnd(32)}${"(no customer login)".padStart(28)}`);
      continue;
    }
    await measure(url, cookie); // warm: the dev server compiles on first sight
    const runs = [];
    for (let i = 0; i < PASSES; i++) runs.push(await measure(url, cookie));
    const best = runs.reduce((a, b) => (a.ms < b.ms ? a : b));
    const queries = Math.max(...runs.map((r) => r.queries));
    const flag = best.status === 200 ? "" : ` !${best.status}`;
    console.log(
      `${screen.name.padEnd(32)}${String(queries).padStart(9)}${best.ms.toFixed(0).padStart(9)}${flag}`
    );
  }

  console.log("");
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
