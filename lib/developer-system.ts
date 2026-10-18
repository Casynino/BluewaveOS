import "server-only";

import { darDay } from "@/lib/income";
import { prisma } from "@/lib/prisma";

/**
 * WHAT IS REALLY GOING ON, BEYOND WHO SIGNED IN.
 *
 * Who uses the system, the security picture, what it has told customers and
 * the size of the data — never the business's money or cargo — counted from
 * the records themselves. Nothing is stored for it, so it cannot disagree with
 * the screens it summarises.
 */

const DAY = 86_400_000;

const days14 = () => Array.from({ length: 14 }, (_, i) => darDay(new Date(Date.now() - (13 - i) * DAY)));
const label = (d: string) =>
  new Date(`${d}T12:00:00+03:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });

export async function securityPulse() {
  const now = Date.now();
  const since14 = new Date(now - 14 * DAY);
  const since7 = new Date(now - 7 * DAY);
  const [failed, okLogins, denied, locked] = await Promise.all([
    prisma.loginEvent.findMany({ where: { ok: false, createdAt: { gte: since14 } }, select: { createdAt: true, ipAddress: true, email: true } }),
    prisma.loginEvent.count({ where: { ok: true, createdAt: { gte: since14 } } }),
    prisma.auditLog.findMany({ where: { outcome: "DENIED", createdAt: { gte: since14 } }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, actorName: true, summary: true } }),
    prisma.loginEvent.groupBy({ by: ["email"], where: { ok: false, createdAt: { gte: new Date(now - 15 * 60_000) } }, _count: true }),
  ]);
  const days = days14();
  const failedPerDay = days.map((d) => ({ label: label(d), value: failed.filter((f) => darDay(f.createdAt) === d).length }));
  const byIp = new Map<string, { count: number; emails: Set<string>; last: Date }>();
  for (const f of failed.filter((f) => f.createdAt >= since7)) {
    const k = f.ipAddress ?? "unknown";
    const cur = byIp.get(k) ?? { count: 0, emails: new Set<string>(), last: f.createdAt };
    cur.count++;
    cur.emails.add(f.email);
    if (f.createdAt > cur.last) cur.last = f.createdAt;
    byIp.set(k, cur);
  }
  return {
    failedPerDay,
    failedTotal: failed.length,
    okLogins,
    byIp: [...byIp].map(([ip, v]) => ({ ip, count: v.count, accounts: v.emails.size, last: v.last })).sort((a, b) => b.count - a.count).slice(0, 8),
    denied,
    lockedNow: locked.filter((l) => l._count >= 10).length,
  };
}

export async function dataPulse() {
  const [customers, cargo, packages, boxes, containers, invoices, payments, receipts, audit, fieldChanges, logins, users, photos] = await Promise.all([
    prisma.customer.count(),
    prisma.cargo.count(),
    prisma.cargoPackage.count(),
    prisma.cargoBox.count(),
    prisma.container.count(),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.receipt.count(),
    prisma.auditLog.count(),
    prisma.fieldChange.count(),
    prisma.loginEvent.count(),
    prisma.user.count(),
    prisma.cargoPhoto.count(),
  ]);
  const oldest = await prisma.auditLog.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
  return {
    rows: [
      { name: "Customers", count: customers },
      { name: "Cargo consignments", count: cargo },
      { name: "Package lines", count: packages },
      { name: "Boxes with a label", count: boxes },
      { name: "Cargo photos", count: photos },
      { name: "Containers", count: containers },
      { name: "Invoices", count: invoices },
      { name: "Payments", count: payments },
      { name: "Receipts", count: receipts },
      { name: "Accounts (staff and customers)", count: users },
      { name: "Audit lines", count: audit },
      { name: "Field changes (before and after)", count: fieldChanges },
      { name: "Sign-in attempts", count: logins },
    ],
    since: oldest?.createdAt ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* The pages that teach: activity numbers, messages, settings, people,  */
/* speed. Each is counted from the records, never stored.               */
/* ------------------------------------------------------------------ */

export async function activityKpis() {
  const now = Date.now();
  const d1 = new Date(now - DAY);
  const d7 = new Date(now - 7 * DAY);
  const [in24, in7, logins24, failed24, acts] = await Promise.all([
    prisma.loginEvent.findMany({ where: { ok: true, createdAt: { gte: d1 }, userId: { not: null } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.loginEvent.findMany({ where: { ok: true, createdAt: { gte: d7 }, userId: { not: null } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.loginEvent.count({ where: { ok: true, createdAt: { gte: d1 } } }),
    prisma.loginEvent.count({ where: { ok: false, createdAt: { gte: d1 } } }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: d1 }, actorType: "STAFF", outcome: "SUCCESS" }, select: { createdAt: true } }),
  ]);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const a of acts) byHour[Number(a.createdAt.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Dar_es_Salaam" })) % 24]++;
  const peak = byHour.indexOf(Math.max(...byHour));
  return { people24: in24.length, people7: in7.length, actions24: acts.length, peak: acts.length ? peak : null, signins24: logins24, failed24 };
}

export async function messagesPulse() {
  const since14 = new Date(Date.now() - 14 * DAY);
  const rows = await prisma.notification.findMany({
    where: { createdAt: { gte: since14 }, user: { role: "CUSTOMER" } },
    orderBy: { createdAt: "desc" },
    select: { kind: true, createdAt: true, readAt: true },
  });
  const days = days14();
  const perDay = days.map((d) => ({ label: label(d), value: rows.filter((r) => darDay(r.createdAt) === d).length }));
  const kinds = new Map<string, number>();
  for (const r of rows) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  const unreadStaff = await prisma.notification.count({ where: { readAt: null, user: { role: { notIn: ["CUSTOMER", "DEVELOPER"] } } } });
  return {
    total: rows.length,
    read: rows.filter((r) => r.readAt).length,
    perDay,
    kinds: [...kinds].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    unreadStaff,
  };
}

/** Which settings the system needs are in place. Names only — never a value. */
const REQUIRED_ENV = ["AUTH_SECRET", "DATABASE_URL", "DIRECT_URL", "BLOB_READ_WRITE_TOKEN", "CRON_SECRET", "NEXT_PUBLIC_SITE_URL"];

export async function settingsPulse() {
  const [company, rate, accounts, warehouses, lastCharge, roles] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { name: true, vatPercent: true, pricesIncludeVat: true, freeStorageDays: true, storagePerDay: true, storageCurrency: true } }),
    prisma.exchangeRate.findFirst({ where: { active: true, fromCurrency: "USD", toCurrency: "TZS" }, orderBy: { effectiveFrom: "desc" }, select: { rate: true, effectiveFrom: true } }),
    prisma.bankAccount.count({ where: { active: true } }),
    prisma.warehouse.count({ where: { active: true } }),
    prisma.fieldChange.findFirst({ where: { entity: "Invoice", field: "storage" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.user.groupBy({ by: ["role"], where: { active: true, status: "ACTIVE" }, _count: true }),
  ]);
  const rateAge = rate ? Math.floor((Date.now() - rate.effectiveFrom.getTime()) / DAY) : null;
  return {
    company,
    rate: rate ? Number(rate.rate) : null,
    rateAge,
    accounts,
    warehouses,
    lastCharge: lastCharge?.createdAt ?? null,
    roles: roles.map((r) => ({ role: r.role as string, count: r._count })),
    env: REQUIRED_ENV.map((name) => ({ name, set: Boolean(process.env[name]?.trim()) })),
  };
}

export async function peoplePulse() {
  const d7 = new Date(Date.now() - 7 * DAY);
  const [staff, acts, mine] = await Promise.all([
    prisma.user.findMany({
      where: { role: { notIn: ["CUSTOMER", "DEVELOPER"] } },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, status: true, lastLoginAt: true },
    }),
    prisma.auditLog.groupBy({ by: ["actorId"], where: { createdAt: { gte: d7 }, actorType: "STAFF", actorId: { not: null } }, _count: true }),
    prisma.auditLog.findMany({ where: { actorType: "DEVELOPER" }, orderBy: { createdAt: "desc" }, take: 10, select: { createdAt: true, summary: true, action: true } }),
  ]);
  const count = new Map(acts.map((a) => [a.actorId, a._count]));
  return { staff: staff.map((s) => ({ ...s, actions7: count.get(s.id) ?? 0 })), mine };
}

export async function speedPulse() {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    times.push(Date.now() - t);
  }
  const t = Date.now();
  await prisma.cargo.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, reference: true } });
  const list = Date.now() - t;
  return { avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length), max: Math.max(...times), list };
}
