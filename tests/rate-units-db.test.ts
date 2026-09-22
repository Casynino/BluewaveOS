import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient, type RateBasis } from "@prisma/client";

/* The hook before any file of ours: see tests/website-requests-db.test.ts. */
const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const { estimate, publicRateBook } =
  load("@/lib/public-estimate") as typeof import("@/lib/public-estimate");
const { quote } = load("@/lib/pricing") as typeof import("@/lib/pricing");

/**
 * PIECES, BALES AND TONNES, THROUGH THE SAME ENGINE THE INVOICE USES.
 *
 * The consignment-level quote and the public calculator both go through
 * lib/pricing.ts quote(). Run inside a transaction that is always rolled back.
 */

const prisma = new PrismaClient();
const ROLLBACK = new Error("rollback");

async function inRollback(fn: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await fn(tx);
        throw ROLLBACK;
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

after(() => prisma.$disconnect());

async function ownRateBook(
  tx: Prisma.TransactionClient,
  rows: { cargoType: string; basis: RateBasis; rate: string }[]
) {
  await tx.shippingRate.updateMany({ where: {}, data: { active: false } });
  await tx.customerRate.updateMany({ where: {}, data: { active: false } });
  await tx.companySetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", vatPercent: new Prisma.Decimal(18), pricesIncludeVat: true },
    update: { vatPercent: new Prisma.Decimal(18), pricesIncludeVat: true },
  });
  for (const row of rows) {
    await tx.shippingRate.create({
      data: {
        service: "LCL",
        basis: row.basis,
        cargoType: row.cargoType,
        rate: new Prisma.Decimal(row.rate),
        currency: "USD",
        published: true,
        active: true,
        effectiveFrom: new Date(Date.now() - 60_000),
      },
    });
  }
}

const BOOK = [
  { cargoType: "Smart Mobile Phones", basis: "PER_PIECE" as const, rate: "3" },
  { cargoType: "Used clothes", basis: "PER_BALE" as const, rate: "12" },
  { cargoType: "Bolt and Nuts", basis: "PER_KG" as const, rate: "0.5" },
  { cargoType: "Shoes", basis: "PER_CBM" as const, rate: "350" },
];

describe("a consignment quoted by count", () => {
  test("per piece: the pieces, never the volume", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);
      const priced = await quote(tx, {
        service: "LCL",
        cargoType: "Smart Mobile Phones",
        measured: { cbm: "0.4", weightKg: "30", pieces: 40, packages: 2 },
      });
      assert.equal(priced.blockedReason, null);
      assert.equal(priced.basis, "PER_PIECE");
      assert.equal(priced.amount.toFixed(2), "120.00");
      assert.equal(priced.billableCbm, null);
      assert.match(priced.explanation, /40 pieces at USD 3\/piece/);
    });
  });

  test("per piece with no count is blocked, not billed on the volume", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);
      const priced = await quote(tx, {
        service: "LCL",
        cargoType: "Smart Mobile Phones",
        measured: { cbm: "0.4", pieces: null, packages: 2 },
      });
      assert.match(priced.blockedReason ?? "", /per piece and no pieces were counted/);
      assert.equal(priced.amount.toFixed(2), "0.00");
    });
  });

  test("per bale: the packages", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);
      const priced = await quote(tx, {
        service: "LCL",
        cargoType: "Used clothes",
        measured: { cbm: "3", pieces: 900, packages: 7 },
      });
      assert.equal(priced.amount.toFixed(2), "84.00");
    });
  });
});

describe("the public calculator asks for the unit the goods are charged by", () => {
  test("names each type's unit, never a rate list", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);
      const book = await publicRateBook("LCL", tx);
      assert.deepEqual(
        Object.fromEntries(book.map((r) => [r.cargoType, r.unit])),
        {
          "Bolt and Nuts": "TONNE",
          Shoes: "CBM",
          "Smart Mobile Phones": "PIECE",
          "Used clothes": "BALE",
        }
      );
    });
  });

  test("pieces, bales and kilos priced, the tonne rate read per tonne", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);

      const phones = await estimate({ cargoType: "Smart Mobile Phones", pieces: 25, client: tx });
      assert.equal(phones.kind, "priced");
      if (phones.kind !== "priced") return;
      assert.equal(phones.unit, "PIECE");
      assert.equal(phones.quantityLabel, "25 pieces");
      assert.equal(phones.rateLabel, "USD 3 / piece");
      assert.equal(phones.total, "USD 75.00");

      const bales = await estimate({ cargoType: "Used clothes", bales: 1, client: tx });
      assert.equal(bales.kind === "priced" && bales.quantityLabel, "1 bale");

      const bolts = await estimate({ cargoType: "Bolt and Nuts", kg: "800", client: tx });
      assert.equal(bolts.kind, "priced");
      if (bolts.kind !== "priced") return;
      assert.equal(bolts.rateLabel, "USD 500 / tonne");
      assert.equal(bolts.total, "USD 400.00");
    });
  });

  test("a volume given for goods charged per piece is not a price", async () => {
    await inRollback(async (tx) => {
      await ownRateBook(tx, BOOK);
      const priced = await estimate({ cargoType: "Smart Mobile Phones", cbm: "1", client: tx });
      assert.equal(priced.kind, "quote-required");
    });
  });
});
