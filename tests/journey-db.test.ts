import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/**
 * The BlueWave journey against the real database, always rolled back.
 *
 * Arrived in Dar is the check-in and starts the storage clock; ready needs the
 * money and the paperwork as well; each stage message is written once however
 * often its event is retried; and no message, anywhere, speaks of clearance.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };
process.env.AUTH_SECRET ||= "journey-test-secret";

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

let events: typeof import("@/lib/cargo-events");
let release: typeof import("@/lib/release");
let clock: typeof import("@/lib/storage-clock");

before(async () => {
  events = await import("@/lib/cargo-events");
  release = await import("@/lib/release");
  clock = await import("@/lib/storage-clock");
});
after(() => prisma.$disconnect());

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      },
      { timeout: 60_000 }
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

let seq = 0;
const tag = () => `JRN${Date.now().toString(36)}${seq++}`;

/**
 * A consignment in the state asked for. Booked in at Dar means a receiving row
 * signed off at `arrivedAt`; billed means an issued USD 100 bill; paid means
 * verified money covering it and Finance's pickup note.
 */
async function consignment(
  tx: Prisma.TransactionClient,
  options: { status: "IN_TRANSIT" | "ARRIVED_TANZANIA" | "RECEIVED_DAR"; arrivedAt?: Date; billed?: boolean; paid?: boolean }
) {
  const mark = tag();
  const customer = await tx.customer.create({
    data: { code: `T-${mark}`, fullName: `Test ${mark}`, phone: `+2557${String(Date.now()).slice(-6)}${seq % 100}`.slice(0, 13) },
  });
  const cargo = await tx.cargo.create({
    data: {
      reference: `T-${mark}`,
      qrToken: `T-QR-${mark}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test goods",
      status: options.status,
    },
  });
  if (options.status === "RECEIVED_DAR") {
    const warehouse = await tx.warehouse.findFirstOrThrow({ where: { code: "DAR" } });
    await tx.darReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: warehouse.id,
        packagesCount: 2,
        cbm: new Prisma.Decimal("0.5"),
        condition: "GOOD",
        verified: true,
        verifiedAt: new Date(),
        receivedAt: options.arrivedAt ?? new Date(),
      },
    });
  }
  if (options.billed || options.paid) {
    const invoice = await tx.invoice.create({
      data: {
        number: `T-INV-${mark}`,
        customerId: customer.id,
        cargoId: cargo.id,
        status: options.paid ? "PAID" : "ISSUED",
        issuedAt: new Date(),
        subtotal: new Prisma.Decimal("100"),
        total: new Prisma.Decimal("100"),
        currency: "USD",
        fxRate: new Prisma.Decimal("2700"),
        totalTzs: new Prisma.Decimal("270000"),
      },
    });
    if (options.paid) {
      await tx.payment.create({
        data: {
          reference: `T-PAY-${mark}`,
          invoiceId: invoice.id,
          customerId: customer.id,
          amount: new Prisma.Decimal("100"),
          currency: "USD",
          fxRate: new Prisma.Decimal("2700"),
          baseCurrencyAmount: new Prisma.Decimal("270000"),
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });
      await tx.pickupNote.create({
        data: {
          noteNumber: `T-PN-${mark}`,
          cargoId: cargo.id,
          customerId: customer.id,
          amountPaid: new Prisma.Decimal("100"),
          status: "ACTIVE",
        },
      });
    }
  }
  return { cargo, customer };
}

const notices = (tx: Prisma.TransactionClient, customerId: string) =>
  tx.notification.findMany({ where: { customerId }, orderBy: { createdAt: "asc" } });

describe("the BlueWave journey", () => {
  test("a stage message is written once, however often the event is retried", async () => {
    await inRollback(async (tx) => {
      const { cargo, customer } = await consignment(tx, { status: "IN_TRANSIT" });
      assert.equal(await events.announceCargoEvent(tx, "CARGO_IN_TRANSIT", cargo.id), 1);
      assert.equal(await events.announceCargoEvent(tx, "CARGO_IN_TRANSIT", cargo.id), 0, "the retry writes nothing");
      const rows = await notices(tx, customer.id);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, "CARGO_IN_TRANSIT");
      assert.equal(rows[0].eventKey, `CARGO_IN_TRANSIT:${cargo.id}`);
      assert.match(rows[0].title, /^BLUEWAVE CARGO — Your Cargo Is Now In Transit$/);
    });
  });

  test("arrived in Dar: the check-in time is the arrival and the storage clock runs from it", async () => {
    await inRollback(async (tx) => {
      const arrivedAt = new Date("2026-09-10T08:00:00Z");
      const { cargo, customer } = await consignment(tx, { status: "RECEIVED_DAR", arrivedAt });
      const settings = await events.storageSettings(tx);
      const subject = await events.noticeSubject(tx, cargo.id, { now: new Date("2026-09-12T08:00:00Z") });
      assert.ok(subject);
      assert.deepEqual(subject.facts.arrivedAt, arrivedAt);
      const expected = clock.storageState({
        arrivedAt,
        freeDays: settings.freeStorageDays,
        perDay: null,
        currency: "USD",
        now: arrivedAt,
      });
      assert.deepEqual(subject.facts.freeUntil, expected.lastFreeDay, "free storage counted from the check-in");
      assert.equal(clock.storageStart(arrivedAt), arrivedAt);
      assert.equal(clock.storageStart(null), null, "no check-in, no clock");

      await events.announceDarArrival(tx, cargo, {});
      const rows = await notices(tx, customer.id);
      assert.deepEqual(rows.map((r) => r.kind), ["CARGO_ARRIVED_DAR"], "arrived, and not ready — nothing is paid");
      assert.doesNotMatch(`${rows[0].title} ${rows[0].body}`, /clear|customs/i);
      assert.match(rows[0].body ?? "", /Free storage until/);
    });
  });

  test("the ship at the port starts nothing: no clock, no arrival", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await consignment(tx, { status: "ARRIVED_TANZANIA", paid: true });
      const subject = await events.noticeSubject(tx, cargo.id);
      assert.equal(subject?.facts.arrivedAt, null);
      assert.equal(subject?.facts.freeUntil, null);
      assert.equal(await events.announceIfReady(tx, cargo.id, null), false, "paid is not ready before Dar has it");
    });
  });

  test("ready for pickup needs the money: arrived and unpaid is not ready", async () => {
    await inRollback(async (tx) => {
      const { cargo, customer } = await consignment(tx, { status: "RECEIVED_DAR", billed: true });
      const row = await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id }, include: release.RELEASE_INCLUDE });
      const check = release.checkRelease(row);
      assert.equal(check.ok, false);
      assert.match(check.blockedBy ?? "", /Not paid in full/);
      assert.equal(await events.announceIfReady(tx, cargo.id, null), false);
      assert.equal((await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } })).status, "RECEIVED_DAR");
      assert.equal((await notices(tx, customer.id)).length, 0);
    });
  });

  test("arrived, paid and noted is ready, said exactly once, and audited", async () => {
    await inRollback(async (tx) => {
      const { cargo, customer } = await consignment(tx, { status: "RECEIVED_DAR", paid: true });
      await events.announceDarArrival(tx, cargo, {});
      const after = await tx.cargo.findUniqueOrThrow({ where: { id: cargo.id } });
      assert.equal(after.status, "READY_FOR_RELEASE");
      assert.ok(after.readyNotifiedAt);
      assert.deepEqual((await notices(tx, customer.id)).map((r) => r.kind), ["CARGO_ARRIVED_DAR", "CARGO_READY_FOR_PICKUP"]);

      assert.equal(await events.announceIfReady(tx, cargo.id, null), false, "a second call says nothing");
      await events.announceDarArrival(tx, cargo, {});
      assert.equal((await notices(tx, customer.id)).length, 2, "a retried check-in adds nothing");
      assert.equal(
        await tx.cargoStatusHistory.count({ where: { cargoId: cargo.id, to: "READY_FOR_RELEASE" } }),
        1,
        "one history row"
      );
      assert.ok(await tx.auditLog.findFirst({ where: { action: "cargo.readyForPickup", entityId: cargo.id } }));
    });
  });

  test("a hold keeps arrived, paid goods from being ready", async () => {
    await inRollback(async (tx) => {
      const { cargo } = await consignment(tx, { status: "RECEIVED_DAR", paid: true });
      await tx.cargo.update({ where: { id: cargo.id }, data: { operationalHold: true, operationalHoldReason: "Check" } });
      assert.equal(await events.announceIfReady(tx, cargo.id, null), false);
    });
  });

  test("the pickup location is the Dar warehouse row, not the office", async () => {
    await inRollback(async (tx) => {
      await tx.warehouse.update({ where: { code: "DAR" }, data: { addressEnglish: "Test Street, Dar es Salaam" } });
      assert.equal(await events.pickupAddress(tx), "BlueWave Cargo, Test Street, Dar es Salaam");
      const settings = await tx.companySetting.findUnique({ where: { id: "singleton" }, select: { darAddress: true } });
      assert.notEqual(await events.pickupAddress(tx), settings?.darAddress, "the office address is a different fact");
    });
  });
});
