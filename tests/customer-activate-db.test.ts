import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  A CUSTOMER ON THE BOOKS OPENS THEIR OWN LOGIN — ON THEIR OWN RECORD.

  The real action, against the real database: the login lands on the existing
  customer (no second customer), the password is only ever a hash, Support is
  told and the audit line is written, and a second press loses cleanly. (The
  database allows one live customer per number, so there is never a choice.)
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");
const Module = load("node:module") as { _resolveFilename: (...args: unknown[]) => string };
const resolve = Module._resolveFilename;
Module._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]) {
  if (request === "@/auth") return path.join(path.dirname(fileURLToPath(import.meta.url)), "stubs", "auth.cjs");
  return resolve.call(this, request, ...rest);
};

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;

const access = load("@/lib/actions/customer-access") as typeof import("@/lib/actions/customer-access");
const signIns = (load("./stubs/auth.cjs") as { calls: unknown[][] }).calls;

const RUN = Date.now().toString(36);
const digits = () => String(Date.now() + Math.floor(Math.random() * 1000)).slice(-8);
const made = { customers: [] as string[], emails: [] as string[] };

async function onBooks(tag: string, phone: string) {
  const c = await prisma.customer.create({ data: { code: `ACT-${tag}-${RUN}`, fullName: `Activate ${tag} ${RUN}`, phone } });
  made.customers.push(c.id);
  return c;
}

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

after(async () => {
  await prisma.notification.deleteMany({ where: { kind: "customer.activated", body: { contains: RUN } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: made.customers }, actorType: { not: "DEVELOPER" } } });
  await prisma.user.deleteMany({ where: { email: { in: made.emails } } });
  await prisma.customer.deleteMany({ where: { id: { in: made.customers } } });
  await prisma.$disconnect();
});

describe("activating a portal login", () => {
  test("lands on the existing customer, hashed, told and audited — and a second press loses", async () => {
    const phone = `+2557${digits()}`;
    const c = await onBooks("one", phone);
    const email = `act-${RUN}@test.invalid`;
    made.emails.push(email);

    assert.equal((await access.checkPhone({}, form({ phone }))).step, "activate");
    const out = await access.activateAccount({}, form({ phone, email, password: "a-good-password", confirmPassword: "a-good-password" }));
    assert.deepEqual(out, {}, JSON.stringify(out));

    const logins = await prisma.user.findMany({ where: { customerId: c.id } });
    assert.equal(logins.length, 1, "one login, on this customer");
    assert.equal(logins[0].role, "CUSTOMER");
    assert.equal(logins[0].email, email);
    assert.notEqual(logins[0].passwordHash, "a-good-password");
    assert.match(logins[0].passwordHash, /^\$2[aby]\$/, "a bcrypt hash");
    assert.equal(await prisma.customer.count({ where: { phone, deletedAt: null } }), 1, "no second customer");
    assert.equal((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).email, email, "an empty email on the record is filled");
    assert.ok(await prisma.auditLog.findFirst({ where: { action: "customer.activate", entityId: c.id } }), "audited");
    assert.ok(signIns.length >= 1, "signed straight in");

    assert.equal((await access.checkPhone({}, form({ phone }))).step, "login");
    const again = await access.activateAccount({}, form({ phone, email: `act2-${RUN}@test.invalid`, password: "another-password", confirmPassword: "another-password" }));
    assert.equal(again.error, "This number already has an account. Please sign in.");
  });

  test("an email another account holds is refused", async () => {
    const phone = `+2557${digits()}`;
    await onBooks("two", phone);
    const out = await access.activateAccount({}, form({ phone, email: `act-${RUN}@test.invalid`, password: "a-good-password", confirmPassword: "a-good-password" }));
    assert.equal(out.error, "That email is already used by another account. Use your own email.");
  });

  test("a number not on the books goes to plain registration", async () => {
    assert.equal((await access.checkPhone({}, form({ phone: `+2557${digits()}` }))).step, "new");
  });
});
