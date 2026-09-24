/**
 * CARGO SITTING ON THE DAR FLOOR, LATE, FOR A LOCAL RUN-THROUGH.
 *
 *   npx tsx scripts/demo-storage.ts
 *
 * Three consignments landed and checked in, each a different distance past its
 * free days, each with a bill of its own — so the storage card, the "Remove
 * storage" press and the daily run at /api/cron/storage all have something real
 * to work on. Without them every storage screen reads "within the free days"
 * and there is nothing to test.
 *
 * It only puts the cargo and the bills there. The storage lines themselves are
 * added by the run that does it in production — see the line it prints at the
 * end — so what you are testing is the real path and not something this script
 * wrote to look like it.
 *
 * It REFUSES to run against anything but a local database. Demo rows on a
 * customer's live system are indistinguishable from a mistake.
 */
import "dotenv/config";

import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`Refusing to seed demo rows into ${url.replace(/:[^:@]*@/, ":***@")}`);
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** The next free reference, in the shape this database already uses. */
async function nextReference() {
  const year = new Date().getFullYear();
  const last = await prisma.cargo.findFirst({
    where: { reference: { startsWith: `BW-${year}-` } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const n = Number(last?.reference.split("-").at(-1) ?? 0) + 1;
  return `BW-${year}-${String(n).padStart(6, "0")}`;
}

/** The invoice counter the real numbering uses, so nothing collides later. */
async function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const counter = await prisma.counter.upsert({
    where: { key: `invoice:${year}` },
    create: { key: `invoice:${year}`, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `INV-${year}-${String(counter.value).padStart(6, "0")}`;
}

async function customer(name: string, phone: string) {
  const found = await prisma.customer.findFirst({ where: { fullName: name } });
  if (found) return found;
  const last = await prisma.customer.findFirst({
    where: { code: { startsWith: "CUS-" } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const next = Number(last?.code.replace(/\D/g, "") ?? 0) + 1;
  return prisma.customer.create({
    data: {
      code: `CUS-${String(next).padStart(6, "0")}`,
      fullName: name,
      phone,
      city: "Dar es Salaam",
    },
  });
}

/** One consignment, landed and checked in that many days ago, with its bill. */
async function late(input: {
  who: { id: string };
  goods: string;
  cartons: number;
  cbmEach: number;
  landedDaysAgo: number;
  freightUsd: number;
  /** Left as a draft rather than issued, to see an unissued bill accrue. */
  draft?: boolean;
}) {
  const reference = await nextReference();
  const china = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CHINA" } });
  const dar = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
  const chinaStaff = await prisma.user.findFirstOrThrow({
    where: { email: "china@bluewavecargo.co.tz" },
  });
  const darStaff = await prisma.user.findFirstOrThrow({
    where: { email: "dar@bluewavecargo.co.tz" },
  });
  const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
  /* The live board rate, the way issuing pins it. */
  const board = await prisma.exchangeRate.findFirst({
    where: { active: true, fromCurrency: "USD", toCurrency: "TZS" },
    orderBy: { effectiveFrom: "desc" },
    select: { rate: true },
  });
  const rate = board?.rate ?? new Prisma.Decimal(2650);

  const landed = daysAgo(input.landedDaysAgo);
  const cbm = Number((input.cartons * input.cbmEach).toFixed(4));

  const cargo = await prisma.cargo.create({
    data: {
      reference,
      qrToken: `BWQ-DEMO-${reference}`,
      senderId: input.who.id,
      receiverId: input.who.id,
      description: input.goods,
      status: "RECEIVED_DAR",
      /* The day the box landed: what the storage clock is counted from. */
      darArrivedAt: landed,
      commodity: "Other",
      packages: {
        create: {
          reference: `${reference}-P1`,
          packageType: "CARTON",
          description: input.goods,
          cargoType: "Other",
          quantity: input.cartons,
          pieces: input.cartons * 2,
          unit: "CM",
          length: 100,
          width: 50,
          height: 50,
          cbm,
          cbmOverridden: true,
          weightKg: input.cartons * 18,
        },
      },
      chinaReceiving: {
        create: {
          warehouseId: china.id,
          receivedById: chinaStaff.id,
          receivedAt: daysAgo(input.landedDaysAgo + 32),
          packagesCount: input.cartons,
          piecesCount: input.cartons * 2,
          weightKg: input.cartons * 18,
          cbm,
          condition: "GOOD",
        },
      },
      darReceiving: {
        create: {
          warehouseId: dar.id,
          receivedById: darStaff.id,
          receivedAt: landed,
          packagesCount: input.cartons,
          piecesCount: input.cartons * 2,
          weightKg: input.cartons * 18,
          cbm,
          condition: "GOOD",
          verified: true,
        },
      },
    },
    include: { packages: true },
  });

  await prisma.cargoBox.createMany({
    data: Array.from({ length: input.cartons }, (_, i) => ({
      cargoId: cargo.id,
      packageId: cargo.packages[0].id,
      sequence: i + 1,
      qrToken: `BWQ-DEMO-${reference}-${i + 1}`,
      darReceivedAt: landed,
    })),
  });

  await prisma.cargoStatusHistory.create({
    data: { cargoId: cargo.id, from: null, to: "RECEIVED_DAR", actorId: darStaff.id },
  });

  const freight = new Prisma.Decimal(input.freightUsd);
  const number = await nextInvoiceNumber();
  await prisma.invoice.create({
    data: {
      number,
      cargoId: cargo.id,
      customerId: input.who.id,
      status: input.draft ? "DRAFT" : "ISSUED",
      currency: "USD",
      subtotal: freight,
      total: freight,
      billableCbm: new Prisma.Decimal(cbm),
      /* Pinned at issue, as every real bill is — the storage line added later
         is converted to shillings at this rate and no other. */
      fxRate: input.draft ? null : rate,
      totalTzs: input.draft ? null : freight.mul(rate).toDecimalPlaces(0),
      issuedAt: input.draft ? null : landed,
      items: {
        create: {
          description: `Sea freight — ${cbm} CBM`,
          quantity: new Prisma.Decimal(cbm),
          unit: "CBM",
          unitPrice: freight.div(cbm).toDecimalPlaces(4),
          amount: freight,
          category: "Freight",
          taxable: true,
        },
      },
    },
  });

  const free = settings?.freeStorageDays ?? 7;
  const day = input.landedDaysAgo + 1;
  const owed = Math.max(0, day - free);
  console.log(
    `  ${reference}  ${input.goods.padEnd(18)} landed ${input.landedDaysAgo}d ago · day ${day} of ${free} free · ${
      owed > 0 ? `${owed} day(s) chargeable` : "still free"
    } · ${number} ${input.draft ? "(draft)" : ""}`
  );
}

async function main() {
  const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
  const free = settings?.freeStorageDays ?? 7;
  const perDay = Number(settings?.storagePerDay ?? 0);
  const currency = settings?.storageCurrency ?? "USD";
  console.log(`\nStorage terms: ${free} free days, then ${currency} ${perDay} a day.\n`);
  if (perDay <= 0) {
    console.log("No storage rate is set, so nothing will ever be charged.");
    console.log("Set one in Settings before testing.\n");
  }

  const halima = await customer("Halima Storage", "+255700000201");
  const juma = await customer("Juma Storage", "+255700000202");
  const neema = await customer("Neema Storage", "+255700000203");

  console.log("Landed cargo with bills:\n");
  /* Inside the free days: the card should read "within the free days" and the
     run should leave it alone. */
  await late({ who: halima, goods: "Kitchen sinks", cartons: 4, cbmEach: 0.3, landedDaysAgo: 3, freightUsd: 456 });
  /* Just past: a few days to charge. */
  await late({ who: juma, goods: "Car tyres", cartons: 6, cbmEach: 0.25, landedDaysAgo: 10, freightUsd: 570 });
  /* Long past, and on a draft bill — storage goes onto a draft as readily as
     an issued one, and survives the draft being re-priced. */
  await late({ who: neema, goods: "Sofa sets", cartons: 3, cbmEach: 0.9, landedDaysAgo: 20, freightUsd: 1026, draft: true });

  console.log(`\nNothing is charged yet. Run the daily job the way the schedule does:\n`);
  console.log(`  curl -H "x-vercel-cron: 1" http://localhost:3188/api/cron/storage\n`);
  console.log(`Then open each bill: the storage line, the day count and "Remove storage".\n`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
