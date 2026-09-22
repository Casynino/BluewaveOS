/**
 * A WAREHOUSE-SIZED DATABASE, SO THE SCREENS CAN BE TIMED AGAINST ONE.
 *
 * Three consignments prove the arithmetic; they prove nothing about what the
 * cargo list does when Foshan has taken in two thousand. This invents a year of
 * trading — customers, consignments, containers, bills and payments — so
 * `scripts/perf-probe.ts` can count the queries each screen really runs.
 *
 * Development only, and it refuses a hosted database like every other seeder.
 *
 *   npx tsx scripts/perf-seed.ts [customers] [cargo] [containers]
 */
import bcrypt from "bcryptjs";
import { PrismaClient, Prisma } from "@prisma/client";

import { refuseProductionDatabase } from "../prisma/dev/guard";

refuseProductionDatabase("scripts/perf-seed.ts");
const prisma = new PrismaClient();

const CUSTOMERS = Number(process.argv[2] ?? 300);
const CARGO = Number(process.argv[3] ?? 2000);
const CONTAINERS = Number(process.argv[4] ?? 30);

const pad = (n: number, w = 6) => String(n).padStart(w, "0");

/* Deterministic, so two runs of the probe measure the same database. */
let seed = 20260923;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = ["Joseph", "Grace", "Rashid", "Fatuma", "Neema", "Hamisi", "Zainab", "Peter", "Amina", "Juma", "Halima", "Said", "Mwajuma", "Baraka", "Salma"];
const LAST = ["Mwakalinga", "Kimaro", "Juma", "Bakari", "Mushi", "Ally", "Kimambo", "Massawe", "Shirima", "Mbwana", "Ngowi", "Lyimo", "Mrema", "Kessy"];
const TYPES = ["General goods", "Electronics", "Textiles", "Machinery", "Furniture", "Building materials"];
const GOODS = ["Hardware tools and fittings", "Kitchenware and plastics", "Phone accessories and chargers", "Cotton fabric rolls", "Office chairs", "Ceramic tiles", "LED lighting", "Auto spare parts"];

async function counter(key: string, by: number) {
  const row = await prisma.counter.upsert({
    where: { key },
    create: { key, value: by },
    update: { value: { increment: by } },
  });
  return row.value - by; // the first number this block owns, minus one
}

async function main() {
  const started = Date.now();
  const year = new Date().getFullYear();

  const foshan = await prisma.warehouse.findFirstOrThrow({ where: { kind: "CHINA" } });
  const dar = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
  const staff = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const account = await prisma.bankAccount.findFirst({ where: { active: true } });
  const fx = await prisma.exchangeRate.findFirst({ orderBy: { effectiveFrom: "desc" } });
  const rate = fx?.rate ?? new Prisma.Decimal(2600);

  // ---- customers ---------------------------------------------------------
  const customerBase = await counter("customer", CUSTOMERS);
  const customers = Array.from({ length: CUSTOMERS }, (_, i) => {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const code = `CUS-${pad(customerBase + i + 1)}`;
    const digits = String(customerBase + i + 1);
    return {
      code,
      fullName: name,
      businessName: rand() < 0.4 ? `${name.split(" ")[1]} Traders` : null,
      /* Derived from the counter block, so a second run never collides with
         the first on the live-customer unique index over phone. */
      phone: `+2557${pad(customerBase + i + 1, 8)}`,
      shippingMark: `BW-${name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8)}-${digits}`,
      city: "Dar es Salaam",
      createdAt: new Date(Date.now() - between(0, 360) * 86_400_000),
    };
  });
  await prisma.customer.createMany({ data: customers, skipDuplicates: true });
  const customerIds = await prisma.customer.findMany({
    where: { code: { in: customers.map((c) => c.code) } },
    select: { id: true, shippingMark: true },
  });
  console.log(`${customerIds.length} customers`);

  // ---- containers --------------------------------------------------------
  const containerBase = await counter(`container:${year}`, CONTAINERS);
  /* Weighted towards sailings that have already landed: most of a year's
     boxes are discharged, and the finance screens only have anything to show
     for those. */
  const STATUSES = [
    "OPEN", "LOADING", "SEALED", "DEPARTED", "IN_TRANSIT",
    "ARRIVED", "ARRIVED", "CLOSED", "CLOSED", "CLOSED", "CLOSED",
  ] as const;
  await prisma.container.createMany({
    data: Array.from({ length: CONTAINERS }, (_, i) => {
      const status = i < CONTAINERS - 6 ? pick([...STATUSES]) : "OPEN";
      const age = between(0, 300);
      return {
        reference: `BWC-CN-${year}-${pad(containerBase + i + 1, 3)}`,
        containerNumber: `MSCU${pad(between(1_000_000, 9_999_999), 7)}`,
        type: pick(["GP_20", "HQ_40", "GP_40"]) as never,
        status: status as never,
        originWarehouseId: foshan.id,
        capacityCbm: new Prisma.Decimal(67),
        createdAt: new Date(Date.now() - age * 86_400_000),
        loadingStartedAt: new Date(Date.now() - age * 86_400_000),
        sealedAt: status === "OPEN" || status === "LOADING" ? null : new Date(Date.now() - (age - 2) * 86_400_000),
      };
    }),
    skipDuplicates: true,
  });
  const containers = await prisma.container.findMany({
    where: { reference: { startsWith: `BWC-CN-${year}-` } },
    select: { id: true, status: true, sealedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${containers.length} containers`);

  // ---- cargo, packages, receivings --------------------------------------
  const cargoBase = await counter(`cargo:${year}`, CARGO);
  const packageBase = Date.now();

  const cargoRows: Prisma.CargoCreateManyInput[] = [];
  const packageRows: Prisma.CargoPackageCreateManyInput[] = [];
  const chinaRows: Prisma.ChinaReceivingCreateManyInput[] = [];
  const darRows: Prisma.DarReceivingCreateManyInput[] = [];
  const lineRows: Prisma.ContainerCargoCreateManyInput[] = [];
  const historyRows: Prisma.CargoStatusHistoryCreateManyInput[] = [];

  /* createMany cannot give back ids, so they are minted here. */
  const cargoIds: string[] = [];
  const plan: { id: string; customerId: string; cbm: Prisma.Decimal; container: (typeof containers)[number] | null; status: string }[] = [];

  for (let i = 0; i < CARGO; i++) {
    const owner = customerIds[i % customerIds.length];
    const id = `perfcargo${pad(cargoBase + i, 8)}`;
    const reference = `BW-${year}-${pad(cargoBase + i + 1)}`;
    const box = rand() < 0.85 ? containers[i % containers.length] : null;
    /* The floor stage follows the box the cargo is in, so each list screen
       sees a realistic spread rather than one status repeated. */
    const status = !box
      ? "RECEIVED_CHINA"
      : box.status === "OPEN" || box.status === "LOADING"
        ? "RECEIVED_CHINA"
        : box.status === "SEALED"
          ? "CONTAINER_LOADED"
          : box.status === "DEPARTED"
            ? "DEPARTED_CHINA"
            : box.status === "IN_TRANSIT"
              ? "IN_TRANSIT"
              : box.status === "ARRIVED"
                ? "ARRIVED_TANZANIA"
                : rand() < 0.5
                  ? "READY_FOR_RELEASE"
                  : "COLLECTED";
    const age = between(1, 340);
    const createdAt = new Date(Date.now() - age * 86_400_000);
    const lines = between(1, 3);
    let cbm = new Prisma.Decimal(0);
    let kg = new Prisma.Decimal(0);
    let packages = 0;

    for (let l = 0; l < lines; l++) {
      const qty = between(2, 40);
      const [L, W, H] = [between(40, 90), between(35, 70), between(30, 60)];
      const lineCbm = new Prisma.Decimal(L).mul(W).mul(H).mul(qty).div(1_000_000).toDecimalPlaces(4);
      const lineKg = new Prisma.Decimal(between(8, 30)).mul(qty);
      cbm = cbm.add(lineCbm);
      kg = kg.add(lineKg);
      packages += qty;
      packageRows.push({
        id: `perfpkg${pad(cargoBase + i, 8)}x${l}`,
        cargoId: id,
        reference: `${reference}-P${l + 1}`,
        packageType: "CARTON",
        quantity: qty,
        pieces: rand() < 0.3 ? qty * between(2, 12) : null,
        unit: "CM",
        length: L,
        width: W,
        height: H,
        weightKg: lineKg,
        cbm: lineCbm,
        cargoType: rand() < 0.9 ? pick(TYPES) : null,
        description: pick(GOODS),
        containerId: box && status !== "RECEIVED_CHINA" ? box.id : null,
        createdAt,
      });
    }

    cargoRows.push({
      id,
      reference,
      qrToken: `BWQ${pad(cargoBase + i, 10)}perf`,
      senderId: owner.id,
      receiverId: owner.id,
      shippingMark: owner.shippingMark,
      service: "LCL",
      description: pick(GOODS),
      commodity: pick(TYPES),
      status: status as never,
      createdAt,
      darArrivedAt: ["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE", "COLLECTED"].includes(status)
        ? new Date(Date.now() - between(1, 40) * 86_400_000)
        : null,
    });
    historyRows.push({ cargoId: id, to: "REGISTERED", createdAt });
    historyRows.push({ cargoId: id, from: "REGISTERED", to: status as never, createdAt });

    chinaRows.push({
      cargoId: id,
      warehouseId: foshan.id,
      packagesCount: packages,
      weightKg: kg,
      cbm,
      condition: "GOOD",
      receivedById: staff.id,
      receivedAt: createdAt,
    });

    if (["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE", "COLLECTED"].includes(status)) {
      darRows.push({
        cargoId: id,
        warehouseId: dar.id,
        containerId: box?.id ?? null,
        packagesCount: packages,
        weightKg: kg,
        cbm,
        condition: rand() < 0.94 ? "GOOD" : "DAMAGED",
        discrepancy: rand() < 0.06,
        verified: true,
        receivedById: staff.id,
        receivedAt: new Date(Date.now() - between(1, 30) * 86_400_000),
      });
    }

    if (box && status !== "RECEIVED_CHINA") {
      lineRows.push({
        containerId: box.id,
        cargoId: id,
        packagesCount: packages,
        weightKg: kg,
        cbm,
        createdAt,
      });
    }

    cargoIds.push(id);
    plan.push({ id, customerId: owner.id, cbm, container: box, status });
  }

  await prisma.cargo.createMany({ data: cargoRows, skipDuplicates: true });
  await prisma.cargoPackage.createMany({ data: packageRows, skipDuplicates: true });
  await prisma.cargoStatusHistory.createMany({ data: historyRows, skipDuplicates: true });
  await prisma.chinaReceiving.createMany({ data: chinaRows, skipDuplicates: true });
  await prisma.darReceiving.createMany({ data: darRows, skipDuplicates: true });
  await prisma.containerCargo.createMany({ data: lineRows, skipDuplicates: true });
  console.log(`${cargoRows.length} consignments, ${packageRows.length} lines, ${lineRows.length} container lines`);

  // ---- invoices and payments --------------------------------------------
  const billable = plan.filter((p) => ["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE", "COLLECTED"].includes(p.status));
  const invoiceBase = await counter(`invoice:${year}`, billable.length);
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const itemRows: Prisma.InvoiceItemCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const notificationRows: Prisma.NotificationCreateManyInput[] = [];

  let paymentNo = await counter(`payment:${year}`, billable.length * 2);

  billable.forEach((p, i) => {
    const id = `perfinv${pad(invoiceBase + i, 8)}`;
    const freight = p.cbm.mul(380).toDecimalPlaces(2);
    const subtotal = freight;
    const vat = subtotal.mul(18).div(118).toDecimalPlaces(2);
    /* Prices include VAT, as the company's settings say. */
    const total = subtotal;
    const draft = rand() < 0.2;
    const issuedAt = new Date(Date.now() - between(1, 60) * 86_400_000);
    invoiceRows.push({
      id,
      number: `INV-${year}-${pad(invoiceBase + i + 1)}`,
      customerId: p.customerId,
      cargoId: p.id,
      status: (draft ? "DRAFT" : "ISSUED") as never,
      billableCbm: p.cbm,
      standardRate: new Prisma.Decimal(380),
      appliedRate: new Prisma.Decimal(380),
      rateBasis: "PER_CBM",
      subtotal,
      vatPercent: new Prisma.Decimal(18),
      vatAmount: vat,
      total,
      vatInclusive: true,
      currency: "USD",
      fxRate: draft ? null : rate,
      totalTzs: draft ? null : total.mul(rate).toDecimalPlaces(0),
      exchangeRateId: draft ? null : (fx?.id ?? null),
      issuedAt: draft ? null : issuedAt,
      dueAt: draft ? null : new Date(issuedAt.getTime() + 14 * 86_400_000),
      issuedById: draft ? null : staff.id,
      createdAt: issuedAt,
    });
    itemRows.push({
      invoiceId: id,
      description: "Sea freight",
      quantity: p.cbm,
      unit: "CBM",
      unitPrice: new Prisma.Decimal(380),
      amount: freight,
      category: "Freight",
      taxable: true,
    });

    if (!draft && rand() < 0.7) {
      /* Most issued bills are settled; some part-paid, some still pending. */
      const full = rand() < 0.75;
      const amount = full ? total : total.div(2).toDecimalPlaces(2);
      paymentNo += 1;
      paymentRows.push({
        reference: `PAY-${year}-${pad(paymentNo)}`,
        invoiceId: id,
        customerId: p.customerId,
        amount,
        currency: "TZS",
        fxRate: rate,
        baseCurrencyAmount: amount.mul(rate).toDecimalPlaces(0),
        method: pick(["MOBILE_MONEY", "BANK_TRANSFER", "CASH"]) as never,
        status: (rand() < 0.88 ? "VERIFIED" : "PENDING") as never,
        accountId: account?.id ?? null,
        paidAt: new Date(issuedAt.getTime() + between(1, 20) * 86_400_000),
        recordedById: staff.id,
        verifiedById: staff.id,
        verifiedAt: new Date(issuedAt.getTime() + between(1, 21) * 86_400_000),
        createdAt: new Date(issuedAt.getTime() + between(1, 20) * 86_400_000),
      });
    }

    if (rand() < 0.5) {
      notificationRows.push({
        customerId: p.customerId,
        title: "Your cargo has arrived",
        body: "Your consignment is at the Dar es Salaam warehouse.",
        kind: "CARGO",
        eventKey: `perf:${p.id}:arrived`,
        createdAt: issuedAt,
      });
    }
  });

  /* The shilling figure is the amount as handed over; a TZS payment is already
     in shillings, so baseCurrencyAmount is the amount itself. */
  for (const row of paymentRows) row.baseCurrencyAmount = row.amount as never;

  await prisma.invoice.createMany({ data: invoiceRows, skipDuplicates: true });
  await prisma.invoiceItem.createMany({ data: itemRows, skipDuplicates: true });
  await prisma.payment.createMany({ data: paymentRows, skipDuplicates: true });
  await prisma.notification.createMany({ data: notificationRows, skipDuplicates: true });
  console.log(`${invoiceRows.length} invoices, ${paymentRows.length} payments, ${notificationRows.length} notifications`);

  // ---- a portal login ----------------------------------------------------
  /* The portal screens are only measurable through a customer's own session,
     and the gate is the customerId on the login row. */
  const [busiest] = await prisma.cargo.groupBy({
    by: ["receiverId"],
    _count: { _all: true },
    orderBy: { _count: { receiverId: "desc" } },
    take: 1,
  });
  const owner = busiest
    ? await prisma.customer.findUnique({
        where: { id: busiest.receiverId },
        select: { id: true, fullName: true, phone: true, login: { select: { id: true } } },
      })
    : null;
  if (owner && !owner.login) {
    await prisma.user.create({
      data: {
        name: owner.fullName,
        email: "perf-customer@example.co.tz",
        phone: owner.phone,
        role: "CUSTOMER",
        passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "BlueWaveCargo2026!", 10),
        customerId: owner.id,
      },
    });
    console.log("portal login: perf-customer@example.co.tz");
  }

  // ---- audit trail -------------------------------------------------------
  await prisma.auditLog.createMany({
    data: Array.from({ length: 5000 }, (_, i) => ({
      actorId: staff.id,
      actorEmail: staff.email,
      action: pick(["cargo.receive", "invoice.issue", "payment.verify", "container.seal", "release.execute"]),
      entity: pick(["Cargo", "Invoice", "Payment", "Container"]),
      entityId: pick(cargoIds),
      summary: "Recorded by the perf seed",
      createdAt: new Date(Date.now() - between(0, 340) * 86_400_000),
    })),
  });

  console.log(`\nseeded in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
