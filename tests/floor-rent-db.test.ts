import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE FLOOR RENT, WHERE IT IS READ RATHER THAN WHERE IT IS CHARGED.

  tests/cargo-flow-db.test.ts proves the charge itself: seven free days, day
  eight, the same day never billed twice, the waiver and the clock stopping at
  the handover. This is about the other half — every place a person reads that
  figure before anybody presses anything, and the sentence the customer is sent.

  Two rules it exists to hold:

   - THE CLOCK THE SCREENS READ IS THE CLOCK THE BUTTON HONOURS. A consignment
     handed over on credit has gone and is still unpaid, so it stays on the
     chase list, on the merged payment screen and in the letter — and the rent
     stopped the day it left. A screen counting past that offers a charge the
     action refuses.

   - A CALCULATION IS NOT A CHARGE. Storage becomes money when Finance presses
     the button. Until then nothing may tell a customer it has been charged.

  Rows are committed and taken out again, like the other database tests here.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

process.env.AUTH_SECRET ||= "test-secret-for-floor-rent";

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;
after(() => prisma.$disconnect());

const invoiceActions = load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const combined = load("@/lib/combined-bill") as typeof import("@/lib/combined-bill");
const messages = load("@/lib/messages") as typeof import("@/lib/messages");
const storageFee = load("@/lib/storage-fee") as typeof import("@/lib/storage-fee");
const balances = load("@/lib/invoice-balance") as typeof import("@/lib/invoice-balance");
const pdfData = load("@/lib/invoice-pdf-data") as typeof import("@/lib/invoice-pdf-data");
const status = load("@/lib/invoice-status") as typeof import("@/lib/invoice-status");

const seat = () => globalThis as { __TEST_ACTOR?: unknown };

type Desk = { id: string; name: string; email: string; role: string };
async function desk(role: string): Promise<Desk> {
  const user = await prisma.user.findFirst({ where: { role: role as never } });
  assert.ok(user, `needs a ${role} user`);
  return { id: user.id, name: user.name ?? role, email: user.email, role: user.role };
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const DAY = 86_400_000;
/** Midday Dar time, `days` Dar calendar days back, so the day number is exact. */
const darMiddayDaysAgo = (days: number) => {
  const now = Date.now();
  const darDay = Math.floor((now + 3 * 3_600_000) / DAY) - days;
  return new Date(darDay * DAY - 3 * 3_600_000 + 12 * 3_600_000);
};

const tag = () => Date.now().toString(36).toUpperCase().slice(-6);

/** Seven free days at USD 5, which is the company's own default. */
async function storageSettings() {
  return prisma.companySetting.update({
    where: { id: "singleton" },
    data: { freeStorageDays: 7, storagePerDay: new Prisma.Decimal(5), storageCurrency: "USD" },
  });
}

type Scene = {
  finance: Desk;
  customerId: string;
  cargoIds: string[];
  invoiceIds: string[];
};

/**
 * A consignment on the Dar floor with an issued bill against it.
 *
 * Written straight in rather than driven through the desks: what is under test
 * is the arithmetic of the clock, and the journey that puts a box on that floor
 * is proved press by press in tests/cargo-flow-db.test.ts.
 */
async function landedAndBilled(
  scene: Scene,
  suffix: string,
  options: { arrivedDaysAgo: number; total: string; currency?: string; fxRate?: string }
) {
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
  const reference = `RNT-${suffix}`;
  const cargo = await prisma.cargo.create({
    data: {
      reference,
      qrToken: `RNT-QR-${suffix}`,
      senderId: scene.customerId,
      receiverId: scene.customerId,
      description: "Ladies handbags",
      status: "RECEIVED_DAR",
      darArrivedAt: darMiddayDaysAgo(options.arrivedDaysAgo),
    },
  });
  await prisma.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: warehouse.id,
      packagesCount: 4,
      piecesCount: 40,
      cbm: new Prisma.Decimal("1.000"),
      verified: true,
      verifiedAt: new Date(),
      receivedAt: darMiddayDaysAgo(options.arrivedDaysAgo),
    },
  });
  const currency = options.currency ?? "USD";
  const fxRate = options.fxRate ?? "2700";
  const total = new Prisma.Decimal(options.total);
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-RNT-${suffix}`,
      customerId: scene.customerId,
      cargoId: cargo.id,
      status: "ISSUED",
      issuedAt: new Date(),
      currency,
      subtotal: total,
      total,
      vatPercent: new Prisma.Decimal(0),
      vatAmount: new Prisma.Decimal(0),
      vatInclusive: true,
      fxRate: new Prisma.Decimal(fxRate),
      totalTzs: currency === "TZS" ? total : total.mul(fxRate),
      billableCbm: new Prisma.Decimal("1.000"),
      appliedRate: total,
      standardRate: total,
      rateBasis: "PER_CBM",
      items: {
        create: [
          {
            description: "Sea freight",
            quantity: new Prisma.Decimal("1.000"),
            unit: "CBM",
            unitPrice: total,
            amount: total,
            category: "Freight",
          },
        ],
      },
    },
  });
  scene.cargoIds.push(cargo.id);
  scene.invoiceIds.push(invoice.id);
  return { cargo, invoice, reference };
}

/** The boxes go out of the gate on a given day. */
async function handedOver(cargoId: string, daysAgo: number, suffix: string) {
  await prisma.release.create({
    data: {
      number: `REL-RNT-${suffix}`,
      cargoId,
      method: "COLLECTION",
      packagesReleased: 4,
      collectedByName: "Neema",
      releasedAt: darMiddayDaysAgo(daysAgo),
    },
  });
  await prisma.cargo.update({ where: { id: cargoId }, data: { status: "COLLECTED" } });
}

async function scene(): Promise<Scene> {
  await storageSettings();
  const finance = await desk("FINANCE");
  seat().__TEST_ACTOR = finance;
  const suffix = tag();
  const customer = await prisma.customer.create({
    data: { code: `RNT-${suffix}`, fullName: `Asha Rent ${suffix}`, phone: `+2557${suffix}1` },
  });
  return { finance, customerId: customer.id, cargoIds: [], invoiceIds: [] };
}

async function unseed(s: Scene) {
  const payments = await prisma.payment.findMany({
    where: { invoiceId: { in: s.invoiceIds } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: s.invoiceIds } } });
  await prisma.paymentProof.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.updateMany({ where: { id: { in: paymentIds } }, data: { writeOffOfId: null } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.customerContact.deleteMany({ where: { invoiceId: { in: s.invoiceIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: s.invoiceIds } } });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...s.invoiceIds, ...s.cargoIds, s.customerId, ...paymentIds] } },
  });
  await prisma.fieldChange.deleteMany({
    where: { entityId: { in: [...s.invoiceIds, ...s.cargoIds, ...paymentIds] } },
  });
  await prisma.invoice.deleteMany({ where: { id: { in: s.invoiceIds } } });
  await prisma.pickupNote.deleteMany({ where: { cargoId: { in: s.cargoIds } } });
  await prisma.release.deleteMany({ where: { cargoId: { in: s.cargoIds } } });
  await prisma.notification.deleteMany({ where: { customerId: s.customerId } });
  await prisma.cargoStatusHistory.deleteMany({ where: { cargoId: { in: s.cargoIds } } });
  await prisma.darReceiving.deleteMany({ where: { cargoId: { in: s.cargoIds } } });
  await prisma.cargo.deleteMany({ where: { id: { in: s.cargoIds } } });
  await prisma.customer.deleteMany({ where: { id: s.customerId } });
  seat().__TEST_ACTOR = undefined;
}

describe("a calculation is not a charge", () => {
  test("day seven is still free, and pressing the button adds nothing", async () => {
    const s = await scene();
    try {
      const { cargo, invoice } = await landedAndBilled(s, tag(), {
        arrivedDaysAgo: 6,
        total: "400.00",
      });
      const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
      const clock = storageFee.storageOnCargo(
        await prisma.cargo.findUniqueOrThrow({
          where: { id: cargo.id },
          select: storageFee.STORAGE_CARGO_SELECT,
        }),
        settings
      );
      assert.equal(clock.daysHeld, 7, "the last of the seven free days");
      assert.equal(clock.chargeableDays, 0);
      assert.equal(clock.amount.toString(), "0");

      const pressed = await invoiceActions.chargeStorage({}, form({ invoiceId: invoice.id }));
      assert.match(pressed.ok ?? "", /inside the 7 free days/);
      assert.equal(
        await prisma.invoiceItem.count({ where: { invoiceId: invoice.id, category: "Storage" } }),
        0
      );
      assert.equal(
        (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).total.toString(),
        "400"
      );
    } finally {
      await unseed(s);
    }
  });

  test("twenty days on the floor move nothing until somebody presses it", async () => {
    const s = await scene();
    try {
      const { cargo, invoice, reference } = await landedAndBilled(s, tag(), {
        arrivedDaysAgo: 19,
        total: "400.00",
      });
      const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
      const clock = storageFee.storageOnCargo(
        await prisma.cargo.findUniqueOrThrow({
          where: { id: cargo.id },
          select: storageFee.STORAGE_CARGO_SELECT,
        }),
        settings
      );
      assert.equal(clock.chargeableDays, 13, "thirteen days past the free seven");
      assert.equal(clock.amount.toString(), "65");

      /* Everything that reads this bill is read, including the two that
         rewrite something on it. None of them may turn the clock into money. */
      await status.refreshInvoiceStatus(invoice.id);
      const merged = await combined.mergedBillFor(reference);
      const document = await pdfData.loadInvoicePdf(invoice.id);
      assert.ok(document, "the bill still draws");

      const after = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        include: { payments: true, items: true },
      });
      assert.equal(after.items.filter((i) => i.category === "Storage").length, 0);
      assert.equal(after.total.toString(), "400", "the total nobody changed");
      assert.equal(after.subtotal.toString(), "400");
      assert.equal(after.totalTzs?.toString(), "1080000");
      assert.equal(
        balances.balanceOf(after).outstandingTzs?.toString(),
        "1080000",
        "and the amount due is the bill, not the bill plus the clock"
      );
      assert.ok(merged, "the bill reads back as its own group");
      assert.equal(
        merged.totals.outstandingTzs?.toString(),
        "1080000",
        "and the group asks for the bill, never the bill plus the clock"
      );
      assert.ok(merged.storage?.amount.greaterThan(0), "the clock is still shown for what it is");
      assert.equal(merged.storage?.charged, null, "with nothing of it charged");
      assert.equal(
        document.input.totals.total,
        "400.00 USD",
        "the document the customer downloads says the same figure"
      );
      assert.equal(document.input.totals.totalTzs, "1,080,000 TZS");
      assert.equal(document.input.due?.headline, "TZS 1,080,000");
      assert.equal(
        document.input.items.some((line) => /storage/i.test(line.description)),
        false,
        "and carries no storage line"
      );
    } finally {
      await unseed(s);
    }
  });
});

describe("the clock a screen reads is the clock the button honours", () => {
  test("a consignment handed over on credit stops accruing the day it went", async () => {
    const s = await scene();
    try {
      const suffix = tag();
      /* Landed twenty days ago, collected on its tenth day and still unpaid:
         the credit release, which is the case that keeps an outstanding bill
         on every chase list long after the boxes have gone. */
      const { cargo, invoice } = await landedAndBilled(s, suffix, {
        arrivedDaysAgo: 19,
        total: "400.00",
      });
      await handedOver(cargo.id, 10, suffix);

      const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
      const onScreen = storageFee.storageOnCargo(
        await prisma.cargo.findUniqueOrThrow({
          where: { id: cargo.id },
          select: storageFee.STORAGE_CARGO_SELECT,
        }),
        settings
      );
      assert.equal(onScreen.daysHeld, 10, "day one to the day it was handed over");
      assert.equal(onScreen.chargeableDays, 3, "three days past the free seven, and no more");
      assert.equal(onScreen.amount.toString(), "15", "USD 5 a day for three days");

      /* Twenty days on the floor would have been thirteen chargeable. The
         screen must not offer thirteen and the action three. */
      const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: invoice.id }));
      assert.ok(charged.ok, charged.error);
      const lines = await prisma.invoiceItem.findMany({
        where: { invoiceId: invoice.id, category: "Storage" },
      });
      assert.equal(lines.length, 1);
      assert.equal(
        lines[0].quantity.toString(),
        String(onScreen.chargeableDays),
        "the days the button adds are the days the screen showed"
      );
      assert.equal(lines[0].amount.toString(), onScreen.amount.toString());

      const second = storageFee.storageOnCargo(
        await prisma.cargo.findUniqueOrThrow({
          where: { id: cargo.id },
          select: storageFee.STORAGE_CARGO_SELECT,
        }),
        settings
      );
      assert.equal(
        second.amount.sub(lines[0].amount).toString(),
        "0",
        "and afterwards there is nothing left for it to offer"
      );
    } finally {
      await unseed(s);
    }
  });

  test("still on the floor, it keeps running — the stop is the handover, not the status", async () => {
    const s = await scene();
    try {
      const { cargo } = await landedAndBilled(s, tag(), { arrivedDaysAgo: 19, total: "400.00" });
      const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
      const running = storageFee.storageOnCargo(
        await prisma.cargo.findUniqueOrThrow({
          where: { id: cargo.id },
          select: storageFee.STORAGE_CARGO_SELECT,
        }),
        settings
      );
      assert.equal(running.daysHeld, 20);
      assert.equal(running.chargeableDays, 13);
      assert.equal(running.amount.toString(), "65");
    } finally {
      await unseed(s);
    }
  });
});

describe("the merged group's floor clock", () => {
  test("stops on the consignment that has gone and runs on the one that has not", async () => {
    const s = await scene();
    try {
      const gone = tag();
      const staying = `${gone}B`;
      const first = await landedAndBilled(s, gone, { arrivedDaysAgo: 19, total: "400.00" });
      await landedAndBilled(s, staying, { arrivedDaysAgo: 9, total: "300.00" });
      await handedOver(first.cargo.id, 10, gone);

      const merged = await combined.mergedBillFor(first.reference);
      assert.ok(merged, "two open bills for one customer are a group");
      assert.ok(merged.storage, "and the group has a clock");
      /* Three chargeable days on the one that went, three on the one that is
         still standing there on its tenth day: USD 30, never the USD 80 the
         collected one alone would have reached by now. */
      assert.equal(merged.storage.amount.toString(), "30");
      assert.equal(merged.storage.chargeableDays, 3);
    } finally {
      await unseed(s);
    }
  });
});

describe("what the merged letter says about storage", () => {
  test("never calls the clock a charge while no bill carries one", async () => {
    const s = await scene();
    try {
      const suffix = tag();
      const first = await landedAndBilled(s, suffix, { arrivedDaysAgo: 19, total: "400.00" });
      await landedAndBilled(s, `${suffix}B`, { arrivedDaysAgo: 19, total: "300.00" });

      const merged = await combined.mergedBillFor(first.reference);
      assert.ok(merged?.storage);
      assert.ok(merged.storage.amount.greaterThan(0), "the clock has certainly run");
      assert.equal(merged.storage.charged, null, "and nothing of it is on a bill");

      const context = combined.mergeLetterContextFor(merged);
      assert.equal(context.storageCharge, null);
      const letter = messages.mergeBillLetter(context);
      assert.ok(letter.includes("📦 *STORAGE*"), "the free-days paragraph still goes out");
      assert.equal(
        letter.includes("Storage iliyokwisha tozwa"),
        false,
        "but a customer is never told money was charged that no invoice is asking for"
      );
    } finally {
      await unseed(s);
    }
  });

  test("names the storage the bills carry, not the clock's reading", async () => {
    const s = await scene();
    try {
      const suffix = tag();
      const first = await landedAndBilled(s, suffix, { arrivedDaysAgo: 19, total: "400.00" });
      await landedAndBilled(s, `${suffix}B`, { arrivedDaysAgo: 19, total: "300.00" });

      /* One of the two is charged; the other is left as a judgement nobody has
         made yet. The clock across the group reads USD 130 and the group has
         been charged USD 65. */
      const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: first.invoice.id }));
      assert.ok(charged.ok, charged.error);

      const merged = await combined.mergedBillFor(first.reference);
      assert.ok(merged?.storage);
      assert.equal(merged.storage.amount.toString(), "130", "the clock over both");
      assert.equal(merged.storage.charged?.toString(), "65", "what the bills actually ask for");

      const letter = messages.mergeBillLetter(combined.mergeLetterContextFor(merged));
      assert.ok(
        letter.includes("Storage iliyokwisha tozwa: USD 65.00."),
        `the charged figure, not the clock: ${letter}`
      );
      assert.equal(letter.includes("USD 130"), false);
    } finally {
      await unseed(s);
    }
  });

  test("two currencies in one group are never added together to make a sentence", async () => {
    const s = await scene();
    try {
      const suffix = tag();
      const first = await landedAndBilled(s, suffix, { arrivedDaysAgo: 19, total: "400.00" });
      const second = await landedAndBilled(s, `${suffix}B`, {
        arrivedDaysAgo: 19,
        total: "810000",
        currency: "TZS",
      });
      for (const invoice of [first.invoice, second.invoice]) {
        const done = await invoiceActions.chargeStorage({}, form({ invoiceId: invoice.id }));
        assert.ok(done.ok, done.error);
      }

      const merged = await combined.mergedBillFor(first.reference);
      assert.ok(merged?.storage);
      assert.equal(merged.storage.charged, null, "dollars and shillings do not add up");
      assert.equal(combined.mergeLetterContextFor(merged).storageCharge, null);
    } finally {
      await unseed(s);
    }
  });
});

describe("two desks on the same bill at the same time", () => {
  test("a waiver and a discount that land together both survive", async () => {
    const s = await scene();
    try {
      const suffix = tag();
      const { invoice } = await landedAndBilled(s, suffix, {
        arrivedDaysAgo: 19,
        total: "400.00",
      });
      const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: invoice.id }));
      assert.ok(charged.ok, charged.error);
      assert.equal(
        (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).total.toString(),
        "465",
        "400 of freight and 65 of floor rent"
      );

      /*
        THE ORDINARY COLLISION, MADE TO HAPPEN RATHER THAN RACED FOR.

        Support gives a little off on the phone while Finance takes the floor
        rent back off the same bill. Each works its new total out from the one
        it read, so whichever writes second used to write the other's change
        back out of a bill the customer had already been given.

        A lock on the discount's own line pins it open between taking the bill
        and writing to it; the waiver, arriving in that gap, is made to wait
        and then works from what the discount left.
      */
      const gate = 918_273_645;
      const holder = new PrismaClient();
      let waiver: Promise<{ ok?: string; error?: string }> | null = null;
      let discount: Promise<{ ok?: string; error?: string }> | null = null;
      try {
        await holder.$executeRawUnsafe(`SELECT pg_advisory_lock(${gate})`);
        await prisma.$executeRawUnsafe(`
          CREATE OR REPLACE FUNCTION bluewave_rent_gate() RETURNS trigger AS $fn$
          BEGIN PERFORM pg_advisory_lock(${gate}); RETURN NEW; END;
          $fn$ LANGUAGE plpgsql;
        `);
        await prisma.$executeRawUnsafe(`
          CREATE TRIGGER bluewave_rent_gate_discount BEFORE INSERT ON "InvoiceItem"
          FOR EACH ROW WHEN (NEW."invoiceId" = '${invoice.id}' AND NEW."category" = 'Discount')
          EXECUTE FUNCTION bluewave_rent_gate();
        `);

        discount = invoiceActions.discountInvoice(
          {},
          form({ invoiceId: invoice.id, amount: "40", currency: "USD", reason: "Agreed on the phone" })
        );
        /* Wait until the discount is standing at the gate: its own field
           change is written before the line it is blocked on. */
        for (let i = 0; i < 400; i++) {
          const standing = await holder.fieldChange.count({
            where: { entity: "Invoice", entityId: invoice.id, field: "total" },
          });
          if (standing > 0) break;
          await new Promise((r) => setTimeout(r, 25));
        }

        waiver = invoiceActions.chargeStorage(
          {},
          form({ invoiceId: invoice.id, remove: "1", reason: "Our own paperwork held them up" })
        );
        /* Long enough for the waiver to have reached the bill and be held at
           it. Without the lock it does not wait, and writes its answer over
           the discount's. */
        await new Promise((r) => setTimeout(r, 750));

        await holder.$executeRawUnsafe(`SELECT pg_advisory_unlock(${gate})`);
        const gave = await discount;
        assert.ok(gave.ok, gave.error);
        const took = await waiver;
        assert.ok(took.ok, took.error);
      } finally {
        await Promise.allSettled([discount, waiver]);
        await prisma
          .$executeRawUnsafe(`DROP TRIGGER IF EXISTS bluewave_rent_gate_discount ON "InvoiceItem";`)
          .catch(() => {});
        await holder.$executeRawUnsafe(`SELECT pg_advisory_unlock_all()`).catch(() => {});
        await holder.$disconnect();
      }

      const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      assert.equal(
        after.total.toString(),
        "360",
        "the freight less the discount — the waiver took its own storage and nothing else"
      );
      assert.equal(after.subtotal.toString(), "360");
      assert.equal(after.totalTzs?.toString(), "972000", "360 × 2,700, and the two agree");
      assert.equal(
        await prisma.invoiceItem.count({ where: { invoiceId: invoice.id, category: "Discount" } }),
        1,
        "the discount line is still on the bill"
      );
      assert.equal(
        await prisma.invoiceItem.count({ where: { invoiceId: invoice.id, category: "Storage" } }),
        0,
        "and the storage lines are off it"
      );

      /* The waiver is still answerable for: who, their desk, when, what it was
         worth and why. */
      const trail = await prisma.auditLog.findFirstOrThrow({
        where: { action: "invoice.storage.waive", entityId: invoice.id },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(trail.actorId, s.finance.id, "who");
      assert.equal(trail.actorRole, "FINANCE", "which desk");
      assert.ok(trail.createdAt, "when");
      assert.match(trail.summary, /USD 65 of storage/, "what it was worth");
      assert.match(trail.summary, /Our own paperwork held them up/, "why");
      const metadata = trail.metadata as { wasTotal?: string; nowTotal?: string };
      assert.equal(metadata.wasTotal, "425", "the bill it actually came off");
      assert.equal(metadata.nowTotal, "360");
    } finally {
      await unseed(s);
    }
  });
});
