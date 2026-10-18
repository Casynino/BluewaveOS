import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  DELETING AN ACCOUNT NEVER DELETES WHAT IT DID.

  An account nothing names goes completely. An account with history — here, a
  sign-in it made — is closed instead: it can never sign in again, its email
  is freed, and the record of what it did still names it. The last owner who
  can sign in is never removable, so the business is never left without one.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;

const removal = load("@/lib/account-removal") as typeof import("@/lib/account-removal");

const RUN = Date.now().toString(36);
const made: string[] = [];

async function account(tag: string, role: "FINANCE" | "ADMIN" = "FINANCE") {
  const u = await prisma.user.create({
    data: { name: `Removal ${tag} ${RUN}`, email: `removal-${tag}-${RUN}@test.invalid`, passwordHash: "x", role },
  });
  made.push(u.id);
  return u;
}

after(async () => {
  await prisma.loginEvent.deleteMany({ where: { email: { contains: `-${RUN}@` } } });
  await prisma.user.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

describe("deleting an account", () => {
  test("an account nothing names is deleted completely", async () => {
    const u = await account("fresh");
    assert.equal(await removal.accountHistory(u.id), 0);
    const done = await removal.removeAccount(u.id);
    assert.equal(done?.outcome, "deleted");
    assert.equal(await prisma.user.findUnique({ where: { id: u.id } }), null);
  });

  test("an account with history is closed, and its history still names it", async () => {
    const u = await account("used");
    const login = await prisma.loginEvent.create({ data: { userId: u.id, email: u.email, ok: true } });
    assert.equal(await removal.accountHistory(u.id), 1);

    const done = await removal.removeAccount(u.id);
    assert.equal(done?.outcome, "closed");
    assert.equal(done?.email, u.email, "the old address is reported for the audit line");

    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.equal(after.active, false);
    assert.equal(after.status, "INACTIVE");
    assert.equal(after.name, u.name, "the name stays on what they did");
    assert.equal(after.email, removal.closedEmail(u.id), "the real address is freed for a new account");
    assert.equal(after.passwordHash, "!closed", "no password can ever match");
    assert.equal((await prisma.loginEvent.findUniqueOrThrow({ where: { id: login.id } })).userId, u.id, "the sign-in still names them");
  });

  test("the last owner who can sign in is never removable; one of two is", async () => {
    const a = await account("owner-a", "ADMIN");
    const b = await account("owner-b", "ADMIN");
    assert.equal(await removal.isLastOwner(a.id), false, "another owner can still sign in");
    assert.equal(await removal.isLastOwner((await account("staff")).id), false, "not an owner at all");

    /* Every other owner suspended, inside a transaction that is then undone. */
    const ROLLBACK = new Error("rollback");
    let last: boolean | null = null;
    await prisma
      .$transaction(async (tx) => {
        await tx.user.updateMany({ where: { role: "ADMIN", id: { not: a.id } }, data: { status: "SUSPENDED" } });
        last = await removal.isLastOwner(a.id, tx);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
    assert.equal(last, true);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).status, "ACTIVE", "and nothing was really changed");
  });
});
