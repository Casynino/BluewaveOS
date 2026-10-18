import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * DELETING AN ACCOUNT WITHOUT DELETING WHAT IT DID.
 *
 * An account's name is on payments it recorded and verified, receipts, cargo
 * it received, releases, audit lines. Removing the row would either be refused
 * by the database or wipe "who did this" from the books — and the audit trail
 * is never rewritten. So an account with no history is deleted completely,
 * and one with history is closed: it can never sign in again, leaves every
 * list, frees its email for a new account, and keeps its name on what it did.
 *
 * The history is every list of records that points at a user, read from the
 * schema itself, so a relation added later is counted without anyone
 * remembering to add it here.
 */
const HISTORY: string[] = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "User")!
  .fields.filter((f) => f.kind === "object" && f.isList)
  .map((f) => f.name);

/** How many records name this account, across every relation. */
export async function accountHistory(userId: string, client: Prisma.TransactionClient = prisma): Promise<number> {
  const row = (await client.user.findUnique({
    where: { id: userId },
    select: { _count: { select: Object.fromEntries(HISTORY.map((n) => [n, true])) as Prisma.UserCountOutputTypeSelect } },
  })) as { _count: Record<string, number> } | null;
  if (!row) return 0;
  return Object.values(row._count).reduce((sum, n) => sum + n, 0);
}

/** True when this is the only owner who can still sign in — never suspended or removed. */
export async function isLastOwner(userId: string, client: Prisma.TransactionClient = prisma): Promise<boolean> {
  const target = await client.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (target?.role !== "ADMIN") return false;
  const others = await client.user.count({ where: { role: "ADMIN", active: true, status: "ACTIVE", id: { not: userId } } });
  return others === 0;
}

/** The address a closed account keeps — unique, never deliverable, and freeing the real one. */
export const closedEmail = (userId: string) => `closed-${userId}@closed.invalid`;

export type Removal = { outcome: "deleted" | "closed"; history: number; name: string; email: string; role: string };

/**
 * Delete the account if nothing names it; close it otherwise. Read and decided
 * in one transaction, so a record written a moment earlier cannot be lost.
 */
export async function removeAccount(userId: string): Promise<Removal | null> {
  return prisma.$transaction(
    async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
      if (!target) return null;
      const history = await accountHistory(userId, tx);
      const base = { history, name: target.name, email: target.email, role: target.role };
      if (history === 0) {
        await tx.user.delete({ where: { id: userId } });
        return { outcome: "deleted", ...base };
      }
      await tx.user.update({
        where: { id: userId },
        data: {
          active: false,
          status: "INACTIVE",
          email: closedEmail(userId),
          /* Not a bcrypt hash, so no password can ever match it. */
          passwordHash: "!closed",
        },
      });
      return { outcome: "closed", ...base };
    },
    { isolationLevel: "Serializable" }
  );
}
