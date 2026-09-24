/**
 * A CONSIGNMENT STANDING AT EVERY STAGE, FOR A LOCAL RUN-THROUGH.
 *
 *   npx tsx scripts/demo-stages.ts
 *
 * The seed leaves everything either on the Foshan floor or checked in at Dar,
 * so the screens in between — loading a box, a sailing at sea, a container
 * landed and not yet counted off — open empty and there is nothing to press.
 * This puts one consignment at each of those stages, with its own customer,
 * measurement, boxes and container line, so every screen has something real
 * on it.
 *
 * It REFUSES to run against anything but a local database. Demo rows on a
 * customer's live system are indistinguishable from a mistake.
 */
import { PrismaClient, type CargoStatus } from "@prisma/client";

const prisma = new PrismaClient();

const url = process.env.DATABASE_URL ?? "";
if (!/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error(`Refusing to seed demo rows into ${url.replace(/:[^:@]*@/, ":***@")}`);
}

const TAG = "DEMO";

/**
 * The next free reference, in the shape this database already uses.
 *
 * Read off the highest one rather than invented: a demo row whose reference
 * does not look like every other reference is a demo row somebody mistakes
 * for a fault.
 */
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

async function customer(name: string, phone: string) {
  const found = await prisma.customer.findFirst({ where: { fullName: name } });
  if (found) return found;
  /* The next free code, read off what exists — three customers created at
     once cannot all be "the count plus one". */
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

/** One consignment, measured in Foshan, at whatever stage it is asked for. */
async function consignment(input: {
  who: { id: string };
  goods: string;
  type: string;
  cartons: number;
  cbmEach: number;
  status: CargoStatus;
  containerId?: string;
  /** The day its container landed, where it has one. */
  darArrivedAt?: Date;
  /** Set when the Dar floor has counted it off the box. */
  checkedInAt?: Date;
}) {
  const reference = await nextReference();
  const chinaWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CHINA" } });
  const darWarehouse = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
  const staff = await prisma.user.findFirstOrThrow({ where: { email: "china@bluewavecargo.co.tz" } });
  const cbm = Number((input.cartons * input.cbmEach).toFixed(4));
  const received = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);

  const cargo = await prisma.cargo.create({
    data: {
      reference,
      qrToken: `BWQ-${TAG}-${reference}`,
      senderId: input.who.id,
      receiverId: input.who.id,
      description: input.goods,
      status: input.status,
      shippingMark: null,
      darArrivedAt: input.darArrivedAt ?? null,
      commodity: input.type,
      packages: {
        create: {
          reference: `${reference}-P1`,
          packageType: "CARTON",
          description: input.goods,
          cargoType: input.type,
          quantity: input.cartons,
          pieces: input.cartons * 2,
          unit: "CM",
          length: 100,
          width: 50,
          height: input.cbmEach * 2 * 100 * 100 / (100 * 50) / 100 * 100,
          cbm,
          cbmOverridden: true,
          weightKg: input.cartons * 18,
        },
      },
      chinaReceiving: {
        create: {
          warehouseId: chinaWarehouse.id,
          receivedById: staff.id,
          receivedAt: received,
          packagesCount: input.cartons,
          piecesCount: input.cartons * 2,
          weightKg: input.cartons * 18,
          cbm,
          condition: "GOOD",
        },
      },
    },
    include: { packages: true },
  });

  /* One box per carton, each with its own code, the way the counter prints
     them — a sticker that scans to nothing is worse than no sticker. */
  await prisma.cargoBox.createMany({
    data: Array.from({ length: input.cartons }, (_, i) => ({
      cargoId: cargo.id,
      packageId: cargo.packages[0].id,
      sequence: i + 1,
      qrToken: `BWQ-${TAG}-${reference}-${i + 1}`,
      darReceivedAt: input.checkedInAt ?? null,
      darContainerId: input.checkedInAt ? (input.containerId ?? null) : null,
    })),
  });

  if (input.containerId) {
    /* Loading stamps every package with the box it went into — the scanner
       counts what is on the container off these rows, so a demo consignment
       without it opens the check-in screen reading "0 of 0". */
    await prisma.cargoPackage.updateMany({
      where: { cargoId: cargo.id, deletedAt: null },
      data: { containerId: input.containerId },
    });
    await prisma.containerCargo.create({
      data: {
        containerId: input.containerId,
        cargoId: cargo.id,
        packagesCount: input.cartons,
        weightKg: input.cartons * 18,
        cbm,
        loadedAt: received,
      },
    });
  }

  if (input.checkedInAt) {
    await prisma.darReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: darWarehouse.id,
        receivedById: (
          await prisma.user.findFirstOrThrow({ where: { email: "dar@bluewavecargo.co.tz" } })
        ).id,
        receivedAt: input.checkedInAt,
        packagesCount: input.cartons,
        piecesCount: input.cartons * 2,
        weightKg: input.cartons * 18,
        cbm,
        condition: "GOOD",
        verified: true,
      },
    });
  }

  await prisma.cargoStatusHistory.create({
    data: { cargoId: cargo.id, from: null, to: input.status, actorId: staff.id },
  });

  console.log(`  ${reference}  ${input.status.padEnd(22)} ${input.goods}`);
  return cargo;
}

/** A box, or the one already standing there under the same name. */
async function box(reference: string, status: "LOADING" | "IN_TRANSIT" | "ARRIVED") {
  const found = await prisma.container.findUnique({ where: { reference } });
  if (found) return found;
  return prisma.container.create({
    data: {
      reference,
      type: "HQ_40",
      status,
      originPort: "Foshan",
      destinationPort: "Dar es Salaam",
    },
  });
}

async function main() {
  const rate = await prisma.shippingRate.findFirst({
    where: { published: true, cargoType: { not: null } },
    select: { cargoType: true },
  });
  const type = rate?.cargoType ?? "Other";

  /* One at a time: each reads the last code written. */
  const amina = await customer("Amina Demo", "+255700000101");
  const baraka = await customer("Baraka Demo", "+255700000102");
  const chausiku = await customer("Chausiku Demo", "+255700000103");

  /* A box still being filled in Foshan, so the loading screens have work. */
  const loading = await box(`BWC-CN-${new Date().getFullYear()}-D1`, "LOADING");

  /* One at sea, due in a fortnight. */
  const sailing = await box(`BWC-CN-${new Date().getFullYear()}-D2`, "IN_TRANSIT");

  /* And one that landed three days ago and nobody has counted off yet. */
  const landed = await box(`BWC-CN-${new Date().getFullYear()}-D3`, "ARRIVED");

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

  console.log("\nAdding one consignment at each stage:\n");
  await consignment({ who: amina, goods: "Ladies shoes", type, cartons: 4, cbmEach: 0.25, status: "RECEIVED_CHINA" });
  await consignment({ who: baraka, goods: "Kitchen blenders", type, cartons: 6, cbmEach: 0.2, status: "CONTAINER_LOADED", containerId: loading.id });
  await consignment({ who: chausiku, goods: "Hand tools", type, cartons: 3, cbmEach: 0.3, status: "IN_TRANSIT", containerId: sailing.id });
  await consignment({ who: amina, goods: "Handbags", type, cartons: 5, cbmEach: 0.15, status: "ARRIVED_TANZANIA", containerId: landed.id, darArrivedAt: threeDaysAgo });
  await consignment({ who: baraka, goods: "Bicycle parts", type, cartons: 2, cbmEach: 0.4, status: "ARRIVED_TANZANIA", containerId: landed.id, darArrivedAt: threeDaysAgo });
  /* Landed ten days ago and counted off the same day: past its free storage,
     so the storage figures have something to show. */
  await consignment({ who: chausiku, goods: "Floor tiles", type, cartons: 8, cbmEach: 0.12, status: "RECEIVED_DAR", darArrivedAt: tenDaysAgo, checkedInAt: tenDaysAgo });

  console.log("\nContainers:");
  console.log(`  ${loading.reference}  LOADING     — pick cargo off the Foshan floor`);
  console.log(`  ${sailing.reference}  IN TRANSIT  — due in Dar`);
  console.log(`  ${landed.reference}  ARRIVED     — two consignments to check in`);
  console.log("\nDone. Sign in at http://localhost:3188\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
