import type { Metadata } from "next";
import { AlertTriangle, Package } from "lucide-react";

import { AccessPeople, type AccessPerson } from "@/components/app/access-people";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { canWorkAs } from "@/lib/developer-mode";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { primeLocale, T } from "@/lib/server-t";
import { ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Access" };

const ago = (d: Date | null) => {
  if (!d) return "never signed in";
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)} days ago`;
  return `${Math.round(s / 86400 / 30)} months ago`;
};

/**
 * ACCESS — OPEN THE SYSTEM AS ANYONE, IN ONE PRESS.
 *
 * Pick a person and press Work as: their menu, their permissions, their
 * screens, without their password. A bar on every page says who you are and
 * stops it. Everything done is recorded under the developer.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<{ refused?: string }> }) {
  await primeLocale();
  const dev = await requirePermission("developer.activity");
  const sp = await searchParams;
  const [people, suspendedByMe, warehouses] = await Promise.all([
    prisma.user.findMany({
      /* Every account but customers' and your own; a closed account has left the list for good. */
      where: { role: { not: "CUSTOMER" }, id: { not: dev.id }, status: { not: "INACTIVE" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, active: true, status: true, lastLoginAt: true },
    }),
    prisma.auditLog.findMany({ where: { action: "developer.suspend", actorId: dev.id }, select: { entityId: true } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } }),
  ]);
  const mine = new Set(suspendedByMe.map((r) => r.entityId));
  /* The one owner left who can sign in is never removable — nobody would be left to run the business. */
  const owners = people.filter((p) => p.role === "ADMIN" && p.active && p.status === "ACTIVE");
  const rows: AccessPerson[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    roleLabel: p.role === "ADMIN" ? "Owner" : (ROLE_LABELS[p.role as keyof typeof ROLE_LABELS] ?? p.role),
    suspended: p.status === "SUSPENDED",
    lastSeen: p.lastLoginAt ? `${T("Last signed in")} ${ago(p.lastLoginAt)}` : T("Never signed in"),
    canWork: canWorkAs(p, dev.id),
    reactivatable: mine.has(p.id),
    lastOwner: owners.length === 1 && owners[0].id === p.id,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">{T("Developer console")}</p>
          <h1 className="mt-1 text-2xl font-bold">{T("Access")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {people.length} {T("accounts")} · {T("Work as, suspend or delete. Everything you do is recorded under your name.")}
          </p>
        </div>
        <AddAccountDialog warehouses={warehouses} />
      </header>

      {sp.refused ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-warning" />
          {T("That account cannot be worked as — it is suspended, or not a staff account.")}
        </p>
      ) : null}

      <AccessPeople people={rows} />
      <p className="flex items-center gap-2 text-xs text-muted-foreground"><Package className="size-3.5" />{T("Customer accounts are not listed — they are managed from Customers.")}</p>
    </div>
  );
}
