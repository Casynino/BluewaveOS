import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  ONE CONSIGNMENT, FOSHAN TO THE DAR COUNTER, THROUGH THE REAL ACTIONS.

  Every step is the server action a desk's form calls, run as that desk, with
  the permission check from lib/rbac.ts. Nothing is rolled back: the records
  this file writes stay in the test database, so the run can be inspected
  afterwards. Run it only against a database whose name ends in _test.

  The hook swaps the four things a test process cannot have — the request
  headers, Next's cache, `server-only` and the session — before any project file
  is loaded. Everything else is the real code against the real database.
*/
requireScratchDatabase();

/* Uploaded photos land in a throwaway folder, never in the project or a blob store. */
const uploadDir = path.join(os.tmpdir(), "bluewave-lifecycle-e2e-uploads");
mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
process.env.BLOB_READ_WRITE_TOKEN = "";

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const financeConfig = load("@/lib/actions/finance-config") as typeof import("@/lib/actions/finance-config");
const customerActions = load("@/lib/actions/customers") as typeof import("@/lib/actions/customers");
const cargoActions = load("@/lib/actions/cargo") as typeof import("@/lib/actions/cargo");
const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const darActions = load("@/lib/actions/dar") as typeof import("@/lib/actions/dar");
const priceActions = load("@/lib/actions/price-list") as typeof import("@/lib/actions/price-list");
const paymentActions = load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");
const pickupActions = load("@/lib/actions/pickup-notes") as typeof import("@/lib/actions/pickup-notes");
const releaseActions = load("@/lib/actions/release") as typeof import("@/lib/actions/release");
const boxActions = load("@/lib/actions/boxes") as typeof import("@/lib/actions/boxes");
const releaseLib = load("@/lib/release") as typeof import("@/lib/release");
const balanceLib = load("@/lib/invoice-balance") as typeof import("@/lib/invoice-balance");
const portal = load("@/lib/portal") as typeof import("@/lib/portal");
const rbac = load("@/lib/rbac") as typeof import("@/lib/rbac");
const qr = load("@/lib/qr") as typeof import("@/lib/qr");

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  warehouseId: string | null;
  customerId: string | null;
};
const desks: Record<string, Actor> = {};

function as(desk: string | Actor | null) {
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR =
    desk === null ? null : typeof desk === "string" ? desks[desk] : desk;
}

function form(fields: Record<string, string | string[] | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value as string | Blob);
  }
  return data;
}

/* A real 1×1 PNG, so the upload check on the file's own bytes passes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const photo = () => new File([PNG], "boxes.png", { type: "image/png" });

const RUN = Date.now().toString(36).toUpperCase();
const CARGO_TYPE = `E2E Lifecycle ${RUN}`;
const randomPhone = () => `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

/* Shared through the steps, in order. */
const s = {
  rateId: "",
  customerA: "",
  customerB: "",
  cargoA: "",
  referenceA: "",
  cargoB: "",
  containerId: "",
  containerRef: "",
  invoiceId: "",
  darWarehouseId: "",
  fxId: "",
  boxTokens: [] as string[],
  boxTokensB: [] as string[],
};

before(async () => {
  for (const [desk, email] of Object.entries({
    admin: "admin@bluewavecargo.co.tz",
    manager: "manager@bluewavecargo.co.tz",
    support: "support@bluewavecargo.co.tz",
    china: "china@bluewavecargo.co.tz",
    dar: "dar@bluewavecargo.co.tz",
    finance: "finance@bluewavecargo.co.tz",
  })) {
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    desks[desk] = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      warehouseId: user.warehouseId,
      customerId: null,
    };
  }
  s.darWarehouseId = (await prisma.warehouse.findUniqueOrThrow({ where: { code: "DAR" } })).id;
  const fx = await prisma.exchangeRate.findFirstOrThrow({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  });
  assert.equal(fx.rate.toString(), "2700", "the test database carries the 2,700 rate");
  s.fxId = fx.id;
});

after(() => as(null));

const cargoStatus = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

describe("BlueWave lifecycle, end to end, committed", () => {
  test("1. Finance publishes a USD 400 / CBM LCL rate for this run's cargo type", async () => {
    as("finance");
    const res = await financeConfig.createRate(
      {},
      form({ service: "LCL", cargoType: CARGO_TYPE, basis: "PER_CBM", rate: "400", currency: "USD", published: "on" })
    );
    assert.ok(res.ok, res.error);
    const rate = await prisma.shippingRate.findFirstOrThrow({
      where: { cargoType: CARGO_TYPE, active: true },
    });
    assert.equal(rate.rate.toString(), "400");
    assert.equal(rate.basis, "PER_CBM");
    assert.equal(rate.service, "LCL");
    assert.equal(rate.minimumCbm, null);
    s.rateId = rate.id;
    assert.ok(
      await prisma.auditLog.findFirst({ where: { action: "rate.publish", entityId: rate.id } }),
      "the publish is audited"
    );
  });

  test("2. Support registers the receiver (and a second, unrelated customer)", async () => {
    as("support");
    const a = await customerActions.createCustomer(
      {},
      form({ fullName: `E2E Amina ${RUN}`, phone: randomPhone(), city: "Dar es Salaam" })
    );
    assert.ok(a.ok, a.error);
    assert.ok(a.customerId);
    s.customerA = a.customerId!;

    as("dar");
    const b = await customerActions.createCustomer(
      {},
      form({ fullName: `E2E Baraka ${RUN}`, phone: randomPhone() })
    );
    assert.ok(b.ok, b.error);
    s.customerB = b.customerId!;

    const row = await prisma.customer.findUniqueOrThrow({ where: { id: s.customerA } });
    assert.match(row.code, /^CUS-\d+$/);
    assert.ok(row.shippingMark, "a shipping mark is minted");
    assert.notEqual(s.customerA, s.customerB);
  });

  test("3. Foshan receives 2 cartons of 100×100×50 cm = exactly 1 CBM", async () => {
    as("china");
    const intake = (customerId: string, key: string, receipt: string) =>
      cargoActions.receiveNewCargo(
        {},
        form({
          customerId,
          intakeKey: key,
          unit: "CM",
          location: "Row E2E",
          supplierName: `E2E Supplier ${RUN}`,
          itemDescription: ["Plastic chairs"],
          itemCargoType: [CARGO_TYPE],
          itemPackageType: ["CARTON"],
          itemQuantity: ["2"],
          itemLength: ["100"],
          itemWidth: ["100"],
          itemHeight: ["50"],
          itemWeightKg: ["50"],
          itemReceiptNo: [receipt],
          photos: photo(),
        })
      );

    const res = (await intake(s.customerA, `e2e-${RUN}-A`, `E2E${RUN}A`)) as { ok?: string; error?: string; id?: string };
    assert.ok(res.ok, res.error);
    assert.ok(res.id);
    s.cargoA = res.id!;

    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.cargoA },
      include: { chinaReceiving: true, packages: true, boxes: true },
    });
    s.referenceA = cargo.reference;
    assert.match(cargo.reference, /^BW\d{4}$/, "cargo reference is BW + 4 digits");
    assert.equal(cargo.status, "RECEIVED_CHINA");
    assert.equal(cargo.senderId, s.customerA);
    assert.equal(cargo.receiverId, s.customerA);
    assert.equal(cargo.chinaReceiving?.cbm.toString(), "1", "China measured exactly 1 CBM");
    assert.equal(cargo.chinaReceiving?.packagesCount, 2);
    assert.equal(cargo.packages.length, 1);
    assert.equal(cargo.packages[0].cbm.toString(), "1");
    assert.equal(cargo.packages[0].cbmOverridden, false, "derived from the sides, not typed");
    assert.equal(cargo.estimatedValue?.toString(), "400", "the counter's estimate is the book's 400");

    const boxes = cargo.boxes.filter((b) => !b.voidedAt);
    assert.equal(boxes.length, 2, "one box row per carton");
    assert.deepEqual(boxes.map((b) => b.sequence).sort(), [1, 2]);
    const tokens = boxes.map((b) => b.qrToken);
    assert.equal(new Set(tokens).size, 2, "box QR tokens are unique to each other");
    assert.ok(!tokens.includes(cargo.qrToken), "and differ from the consignment code");
    assert.equal(
      await prisma.cargoBox.count({ where: { qrToken: { in: tokens } } }),
      2,
      "and unique across the database"
    );
    s.boxTokens = tokens;

    /* The same press again is the same consignment, not a second one. */
    const again = (await intake(s.customerA, `e2e-${RUN}-A`, `E2E${RUN}A`)) as { id?: string };
    assert.equal(again.id, s.cargoA, "an intake retry does not duplicate the cargo");

    /* Received in China is said once, however many times the press lands. */
    const told = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "CARGO_RECEIVED_CHINA" },
    });
    assert.equal(told.length, 1, "one received-in-China notice");
    assert.equal(told[0].eventKey, `CARGO_RECEIVED_CHINA:${s.cargoA}`);
    assert.match(told[0].title, /^BLUEWAVE CARGO — Cargo Received in China$/);
    assert.doesNotMatch(`${told[0].title} ${told[0].body}`, /in transit|umeanza safari|clear|USD|TZS/i, "China wording only, no money");

    /* The second customer's own consignment, which stays in Foshan. */
    const resB = (await intake(s.customerB, `e2e-${RUN}-B`, `E2E${RUN}B`)) as { ok?: string; error?: string; id?: string };
    assert.ok(resB.ok, resB.error);
    s.cargoB = resB.id!;
    s.boxTokensB = (await prisma.cargoBox.findMany({ where: { cargoId: s.cargoB } })).map((b) => b.qrToken);
    assert.equal(s.boxTokensB.length, 2);

    /* The China floor holds no money permission. */
    await assert.rejects(
      financeConfig.createRate({}, form({ service: "LCL", basis: "PER_CBM", rate: "1" })),
      /permission/,
      "CHINA_WAREHOUSE cannot publish a rate"
    );
    await assert.rejects(
      paymentActions.recordPayment({}, form({ invoiceId: "x", amount: "1", currency: "TZS", method: "CASH" })),
      /permission/,
      "CHINA_WAREHOUSE cannot record a payment"
    );
  });

  test("4. Foshan opens a container, loads, seals, and departs it straight into IN_TRANSIT", async () => {
    as("china");
    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(opened.ok, opened.error);
    s.containerId = opened.id!;
    const container = await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } });
    s.containerRef = container.reference;
    assert.match(container.reference, /^BWC\d{2}M\d{2}C\d+$/, "container reference format");
    assert.equal(container.status, "OPEN");

    const loaded = await containerActions.loadCargo(
      {},
      form({ containerId: s.containerId, cargoIds: [s.cargoA] })
    );
    assert.ok(loaded.ok, loaded.error);
    assert.equal(await cargoStatus(s.cargoA), "ASSIGNED_TO_CONTAINER");
    const line = await prisma.containerCargo.findUniqueOrThrow({
      where: { containerId_cargoId: { containerId: s.containerId, cargoId: s.cargoA } },
    });
    assert.equal(line.cbm.toString(), "1");
    assert.equal(line.packagesCount, 2);

    const sealed = await containerActions.sealContainer(
      {},
      form({ containerId: s.containerId, sealNumber: `SEAL-${RUN}`, containerNumber: `MSKU${RUN.slice(-7)}` })
    );
    assert.ok(sealed.ok, sealed.error);
    assert.equal((await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } })).status, "SEALED");
    assert.equal(await cargoStatus(s.cargoA), "CONTAINER_LOADED");
    assert.ok(await prisma.packingList.findUnique({ where: { containerId: s.containerId } }), "packing list frozen at the seal");

    /* Dar cannot record Foshan's departure. */
    as("dar");
    const refused = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "DEPARTED" }));
    assert.match(refused.error ?? "", /Foshan's to do/);

    /* Arrival before departure does not follow. */
    as("finance");
    const early = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "ARRIVED" }));
    assert.ok(early.error, "cannot arrive a box that has not sailed");

    as("china");
    const departed = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "DEPARTED" }));
    assert.ok(departed.ok, departed.error);
    const atSea = await prisma.container.findUniqueOrThrow({
      where: { id: s.containerId },
      include: { shipment: true, events: { orderBy: { createdAt: "asc" } } },
    });
    assert.equal(atSea.status, "IN_TRANSIT", "departing lands the box directly IN_TRANSIT");
    assert.equal(atSea.shipment?.status, "IN_TRANSIT");
    assert.ok(atSea.shipment?.departureDate);
    const tail = atSea.events.slice(-2).map((e) => `${e.from}->${e.to}`);
    assert.deepEqual(tail, ["SEALED->DEPARTED", "DEPARTED->IN_TRANSIT"], "both events written in one press");
    assert.equal(await cargoStatus(s.cargoA), "IN_TRANSIT", "the cargo follows the box to sea");
    const history = await prisma.cargoStatusHistory.findMany({
      where: { cargoId: s.cargoA },
      orderBy: { createdAt: "asc" },
      select: { to: true },
    });
    assert.deepEqual(history.slice(-2).map((h) => h.to), ["DEPARTED_CHINA", "IN_TRANSIT"]);

    /* There is no separate "in transit" milestone to press. */
    const noSuchStep = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "IN_TRANSIT" }));
    assert.equal(noSuchStep.error, "That is not a milestone.");

    /* Every customer on the box is told once, with the container; pressing
       depart again moves nothing and tells nobody twice. */
    const transit = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "CARGO_IN_TRANSIT" },
    });
    assert.equal(transit.length, 1);
    assert.match(transit[0].body ?? "", new RegExp(s.containerRef));
    assert.doesNotMatch(transit[0].body ?? "", /clear|customs/i);
    const again = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "DEPARTED" }));
    assert.ok(again.error, "departing twice is refused");
    assert.equal(await prisma.notification.count({ where: { customerId: s.customerA, kind: "CARGO_IN_TRANSIT" } }), 1);
    assert.equal(
      await prisma.cargoStatusHistory.count({ where: { cargoId: s.cargoA, to: "IN_TRANSIT" } }),
      1,
      "no second IN_TRANSIT history row"
    );
    const departAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "container.departed", entityId: s.containerId },
    });
    const meta = departAudit.metadata as { cargo: string[]; departureDate: string };
    assert.ok(meta.cargo.includes(s.referenceA), "the audit names the consignments that moved");
    assert.ok(meta.departureDate);
  });

  test("5. The port desks may mark it ARRIVED; Foshan may not", async () => {
    assert.ok(rbac.can("DAR_WAREHOUSE", "container.arrive"));
    assert.ok(rbac.can("CUSTOMER_SUPPORT", "container.arrive"));
    assert.ok(rbac.can("FINANCE", "container.arrive"));
    assert.ok(!rbac.can("CHINA_WAREHOUSE", "container.arrive"));

    as("dar");
    const tooSoon = await darActions.receiveInDar(
      {},
      form({ cargoId: s.cargoA, warehouseId: s.darWarehouseId, packagesCount: "2", cbm: "1", condition: "GOOD" })
    );
    assert.match(tooSoon.error ?? "", /has not arrived at Dar/, "no check-in while at sea");

    as("china");
    const china = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "ARRIVED" }));
    assert.equal(china.error, "Your desk cannot record an arrival.");

    as("dar");
    const arrived = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "ARRIVED" }));
    assert.ok(arrived.ok, arrived.error);
    const box = await prisma.container.findUniqueOrThrow({ where: { id: s.containerId }, include: { shipment: true } });
    assert.equal(box.status, "ARRIVED");
    assert.equal(box.shipment?.status, "ARRIVED_TANZANIA");
    assert.ok(box.shipment?.actualArrival);
    assert.equal(await cargoStatus(s.cargoA), "ARRIVED_TANZANIA");
    /* The owner's rule: the container arriving is the goods arriving. The
       customer is told once, and the storage clock starts on this day. */
    assert.equal(await prisma.notification.count({ where: { customerId: s.customerA, kind: "CARGO_ARRIVED_DAR" } }), 1);
    const dated = await prisma.cargo.findUniqueOrThrow({ where: { id: s.cargoA }, select: { darArrivedAt: true } });
    assert.ok(dated.darArrivedAt, "the arrival day is on the consignment");

    /* Support and Finance get past the permission check — they are refused only
       because the step has already been taken. */
    for (const desk of ["support", "finance"]) {
      as(desk);
      const again = await containerActions.advanceContainer({}, form({ containerId: s.containerId, to: "ARRIVED" }));
      assert.ok(again.error);
      assert.doesNotMatch(again.error!, /cannot record an arrival/, `${desk} holds container.arrive`);
      assert.match(again.error!, /does not follow/);
    }
  });

  test("6. Dar checks the cargo in and signs off the count; both measurements are kept", async () => {
    as("dar");
    /* Dar scans each box off the container first. */
    for (const token of s.boxTokens) {
      const scan = await boxActions.scanBoxAtDar({}, form({ containerId: s.containerId, code: qr.qrPayload(token) }));
      assert.ok(scan.ok, scan.error ?? scan.warning);
    }

    const res = await darActions.receiveInDar(
      {},
      form({
        cargoId: s.cargoA,
        warehouseId: s.darWarehouseId,
        packagesCount: "2",
        cbm: "1",
        weightKg: "51",
        condition: "GOOD",
        location: "Bay E2E",
      })
    );
    assert.ok(res.ok, res.error);
    assert.equal(res.ok, "Received.", "no discrepancy case");
    assert.equal(await cargoStatus(s.cargoA), "RECEIVED_DAR");

    const verified = await darActions.verifyCargo({}, form({ cargoId: s.cargoA }));
    assert.ok(verified.ok, verified.error);

    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.cargoA },
      include: { chinaReceiving: true, darReceiving: true },
    });
    assert.ok(cargo.chinaReceiving && cargo.darReceiving, "two rows, one per warehouse");
    assert.notEqual(cargo.chinaReceiving.id, cargo.darReceiving.id);
    assert.equal(cargo.chinaReceiving.cbm.toString(), "1");
    assert.equal(cargo.chinaReceiving.weightKg?.toString(), "50", "China's weight untouched");
    assert.equal(cargo.darReceiving.cbm?.toString(), "1");
    assert.equal(cargo.darReceiving.weightKg?.toString(), "51", "Dar's own weight");
    assert.equal(cargo.darReceiving.packagesCount, 2);
    assert.equal(cargo.darReceiving.verified, true);
    assert.equal(cargo.darReceiving.discrepancy, false);
    assert.equal(cargo.darReceiving.containerId, s.containerId);
  });

  test("7. Arrived in Dar: the check-in is the arrival, storage starts, no clearance step", async () => {
    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.cargoA },
      include: { darReceiving: true },
    });
    assert.ok(cargo.darReceiving?.receivedAt, "the arrival time is the receiving row's own");
    assert.equal(cargo.clearedAt, null, "nothing writes the retired clearance column");

    const arrived = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "CARGO_ARRIVED_DAR" },
    });
    assert.equal(arrived.length, 1, "arrived in Dar is said once");
    assert.match(arrived[0].title, /Arrived in Dar es Salaam/);
    assert.doesNotMatch(`${arrived[0].title} ${arrived[0].body}`, /clear|customs/i);
    assert.match(arrived[0].body ?? "", /Tabata Matumbi/, "the pickup warehouse, from its warehouse row");

    const check = await releaseLib.releaseCheckFor(s.cargoA);
    assert.ok(check && !check.conditions.some((c) => /clear|customs/i.test(c.label)), "no clearance condition");
    assert.equal(check?.ok, false, "arrived is not ready");
    assert.equal(await cargoStatus(s.cargoA), "RECEIVED_DAR");
    assert.ok(
      await prisma.auditLog.findFirst({ where: { action: "cargo.arrivedDar", entityId: s.cargoA } }),
      "the arrival is audited"
    );
  });

  test("8. Pricing: a DRAFT from the book, then Finance confirms it to ISSUED with exact money", async () => {
    const drafts = await prisma.invoice.findMany({ where: { cargoId: s.cargoA, status: { not: "CANCELLED" } } });
    assert.equal(drafts.length, 1, "exactly one bill raised by check-in / arrival");
    const draft = drafts[0];
    assert.equal(draft.status, "DRAFT");
    s.invoiceId = draft.id;

    const settings = await prisma.companySetting.findUniqueOrThrow({ where: { id: "singleton" } });
    assert.equal(settings.vatPercent.toString(), "0", "this database has VAT at 0");

    assert.equal(draft.customerId, s.customerA, "billed to the receiver");
    assert.equal(draft.subtotal.toString(), "400");
    assert.equal(draft.total.toString(), "400");
    assert.equal(draft.currency, "USD");
    assert.equal(draft.billableCbm?.toString(), "1");
    assert.equal(draft.appliedRate?.toString(), "400");
    assert.equal(draft.standardRate?.toString(), "400");
    assert.equal(draft.rateBasis, "PER_CBM");

    /* The release gate names a draft for what it is. */
    const pre = await releaseLib.releaseCheckFor(s.cargoA);
    assert.equal(pre?.ok, false);
    assert.match(pre?.blockedBy ?? "", /drafted but not issued/);

    /* Payment against a draft is refused. */
    as("finance");
    const onDraft = await paymentActions.recordPayment(
      {},
      form({ invoiceId: draft.id, amount: "1080000", currency: "TZS", method: "BANK_TRANSFER" })
    );
    assert.equal(onDraft.error, "That invoice has not been issued yet.");

    as("dar");
    await assert.rejects(
      priceActions.confirmPrices({}, form({ containerId: s.containerId, cargoIds: [s.cargoA] })),
      /permission/,
      "the Dar floor cannot confirm prices"
    );

    as("finance");
    const confirmed = await priceActions.confirmPrices({}, form({ containerId: s.containerId, cargoIds: [s.cargoA] }));
    assert.ok(confirmed.ok, confirmed.error);
    assert.match(confirmed.ok!, /^1 invoice\(s\) confirmed/);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: s.invoiceId },
      include: { items: true, exchangeRate: true },
    });
    assert.equal(invoice.status, "ISSUED");
    assert.ok(invoice.issuedAt);
    assert.ok(invoice.dueAt);
    assert.equal(invoice.issuedById, desks.finance.id);
    assert.equal(invoice.subtotal.toString(), "400");
    assert.equal(invoice.total.toString(), "400", "USD 400 for 1 CBM × 400");
    assert.ok(invoice.total.equals(new Prisma.Decimal("400.00")));
    assert.equal(invoice.vatPercent.toString(), settings.vatPercent.toString(), "VAT follows CompanySetting");
    assert.equal(invoice.vatAmount.toString(), "0");
    assert.equal(invoice.fxRate?.toString(), "2700");
    assert.equal(invoice.totalTzs?.toString(), "1080000", "TZS 1,080,000 at 2,700");
    assert.equal(invoice.exchangeRateId, s.fxId, "the exchange-rate ROW is pinned");
    assert.equal(invoice.exchangeRate?.rate.toString(), "2700");
    assert.equal(invoice.items.length, 1);
    assert.equal(invoice.items[0].quantity.toString(), "1");
    assert.equal(invoice.items[0].unitPrice.toString(), "400");
    assert.equal(invoice.items[0].amount.toString(), "400");

    const accounts = invoice.paymentSnapshot as { bankName: string; accountNumber: string; currency: string }[];
    assert.ok(Array.isArray(accounts), "collection accounts are written onto the bill");
    const numbers = accounts.map((a) => `${a.bankName}|${a.accountNumber}|${a.currency}`).sort();
    assert.deepEqual(numbers, [
      "CRDB BANK|0150696722000|TZS",
      "CRDB BANK|0250696722000|USD",
      "TIGO LIPA|9608058|TZS",
    ]);

    /* The invoice message carries the real PDF route for this bill. */
    const invoiceNotice = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "PRICE_CONFIRMED" },
    });
    assert.equal(invoiceNotice.length, 1);
    assert.equal(invoiceNotice[0].href, `/portal/invoices/${s.invoiceId}/pdf`);
    assert.match(invoiceNotice[0].body ?? "", /TZS 1,080,000/);

    /* A second confirm issues nothing new. */
    const twice = await priceActions.confirmPrices({}, form({ containerId: s.containerId, cargoIds: [s.cargoA] }));
    assert.match(twice.ok ?? "", /already been confirmed/);
    assert.equal(await prisma.invoice.count({ where: { cargoId: s.cargoA, status: { not: "CANCELLED" } } }), 1);
    assert.equal(await prisma.notification.count({ where: { customerId: s.customerA, kind: "PRICE_CONFIRMED" } }), 1);
  });

  test("9. The release gate holds while the bill is unpaid", async () => {
    const check = await releaseLib.releaseCheckFor(s.cargoA);
    assert.ok(check);
    assert.equal(check.ok, false, "not releasable while unpaid");
    assert.equal(check.outstanding.toString(), "1080000");
    assert.equal(check.currency, "TZS");
    assert.match(check.blockedBy ?? "", /Not paid in full/);
    const passed = Object.fromEntries(check.conditions.map((c) => [c.label, c.passed]));
    assert.equal(passed["Received at the Dar warehouse"], true);
    assert.equal(passed["Counted and verified"], true);
    assert.equal(passed["Invoiced"], true);
    assert.equal(passed["Paid in full"], false);
    assert.equal(passed["Pickup note issued"], false);

    as("dar");
    const scan = await boxActions.scanBoxForRelease({}, form({ cargoId: s.cargoA, code: qr.qrPayload(s.boxTokens[0]) }));
    assert.match(scan.error ?? "", /Not paid in full/, "a box cannot be scanned out unpaid");

    const released = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.cargoA, packagesReleased: "2", collectedByName: "E2E Amina", method: "COLLECTION" })
    );
    assert.ok(released.error, "releaseCargo refuses unpaid cargo");
    assert.match(released.error!, /Not paid in full/);

    as("finance");
    const note = await pickupActions.issuePickupNote({}, form({ cargoId: s.cargoA }));
    assert.match(note.error ?? "", /Still owing/, "no pickup note while owing");
    assert.equal(await prisma.release.count({ where: { cargoId: s.cargoA } }), 0);
  });

  test("10. Finance takes TZS 1,080,000; the bill is PAID and nothing is owed", async () => {
    as("finance");
    const res = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.invoiceId,
        amount: "1080000",
        currency: "TZS",
        method: "BANK_TRANSFER",
        transactionRef: `CRDB-E2E-${RUN}`,
        idempotencyKey: `e2e-pay-${RUN}`,
      })
    );
    assert.ok(res.ok, res.error);

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: s.invoiceId } });
    assert.equal(payment.amount.toString(), "1080000");
    assert.equal(payment.currency, "TZS");
    assert.equal(payment.baseCurrencyAmount?.toString(), "1080000");
    assert.equal(payment.fxRate?.toString(), "2700");
    assert.equal(payment.status, "VERIFIED", "Finance's own recording counts at once (owner's decision)");

    /* Verification is Finance's act; here it has already happened on recording. */
    const verify = await paymentActions.verifyPayment({}, form({ paymentId: payment.id }));
    assert.match(verify.error ?? "", /already verified/, "verifying again is a no-op refusal");

    as("support");
    await assert.rejects(
      paymentActions.verifyPayment({}, form({ paymentId: payment.id })),
      /permission/,
      "Support can never verify"
    );

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: s.invoiceId },
      include: { payments: true, receipts: true },
    });
    assert.equal(invoice.status, "PAID");
    const balance = balanceLib.balanceOf(invoice);
    assert.equal(balance.outstandingTzs?.toString(), "0", "outstanding is exactly zero");
    assert.equal(balance.outstanding.toString(), "0");
    assert.equal(balance.paidTzs?.toString(), "1080000");
    assert.equal(balance.creditTzs?.toString(), "0");
    assert.equal(balance.settled, true);
    assert.equal(invoice.receipts.length, 1, "a receipt is issued");

    /* Money is derived, never stored as a balance. */
    const invoiceColumns = Object.keys(Prisma.InvoiceScalarFieldEnum);
    const customerColumns = Object.keys(Prisma.CustomerScalarFieldEnum);
    for (const column of [...invoiceColumns, ...customerColumns]) {
      assert.doesNotMatch(column, /balance|outstanding|amountPaid|paidAmount|owed/i, `no stored balance column (${column})`);
    }

    /* A second press with the same key writes nothing. */
    as("finance");
    const repeat = await paymentActions.recordPayment(
      {},
      form({ invoiceId: s.invoiceId, amount: "1080000", currency: "TZS", method: "BANK_TRANSFER", idempotencyKey: `e2e-pay-${RUN}` })
    );
    assert.ok(repeat.ok);
    assert.equal(await prisma.payment.count({ where: { invoiceId: s.invoiceId } }), 1);
  });

  test("11. Pickup note, scan-out, release — and the refusals around it", async () => {
    as("finance");
    const issued = await pickupActions.issuePickupNote({}, form({ cargoId: s.cargoA }));
    assert.ok(issued.ok, issued.error);
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.cargoA } });
    assert.equal(note.status, "ACTIVE");
    assert.equal(note.customerId, s.customerA);
    assert.equal(note.onCredit, false);
    assert.equal(note.amountTzs?.toString(), "1080000");
    assert.match(note.noteNumber, /^PN-/);

    const gate = await releaseLib.releaseCheckFor(s.cargoA);
    assert.equal(gate?.ok, true, `releasable once paid (${gate?.blockedBy})`);
    assert.equal(gate?.outstanding.toString(), "0");

    /* Arrived, paid and noted: ready for pickup, said once. */
    assert.equal(await cargoStatus(s.cargoA), "READY_FOR_RELEASE");
    const ready = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "CARGO_READY_FOR_PICKUP" },
    });
    assert.equal(ready.length, 1);
    assert.equal(ready[0].href, `/portal/pickups/${note.id}`);

    as("dar");
    /* (a) Another customer's box presented against this customer's pickup. */
    const wrongBox = await boxActions.scanBoxForRelease(
      {},
      form({ cargoId: s.cargoA, code: qr.qrPayload(s.boxTokensB[0]) })
    );
    assert.match(wrongBox.error ?? "", /belongs to .*not to this pickup/, "someone else's box is refused");
    assert.equal(
      (await prisma.cargoBox.findUniqueOrThrow({ where: { qrToken: s.boxTokensB[0] } })).collectedAt,
      null
    );
    /* (a) The other customer's cargo cannot go out on anything: no bill, no note, not landed. */
    const otherRelease = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.cargoB, packagesReleased: "2", collectedByName: "E2E Amina", method: "COLLECTION" })
    );
    assert.ok(otherRelease.error, "the second customer's cargo is not released on the first's payment");
    /* (a) The pickup note's own code resolves to this cargo only. */
    const noteScan = await boxActions.scanBoxForRelease({}, form({ cargoId: s.cargoB, code: qr.qrPayload(note.qrToken) }));
    assert.ok(noteScan.error, "a pickup-note code is not a box, and not the other cargo's");

    /* Releasing before every box is scanned out is refused. */
    const early = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.cargoA, packagesReleased: "2", collectedByName: "E2E Amina", method: "COLLECTION" })
    );
    assert.match(early.error ?? "", /Scan every box out first — 2 of 2/);

    for (const token of s.boxTokens) {
      const out = await boxActions.scanBoxForRelease({}, form({ cargoId: s.cargoA, code: qr.qrPayload(token) }));
      assert.ok(out.ok, out.error ?? out.warning);
    }
    const boxes = await prisma.cargoBox.findMany({ where: { cargoId: s.cargoA } });
    assert.ok(boxes.every((b) => b.collectedAt && b.pickupNoteId === note.id), "every box out under the note");

    const released = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: s.cargoA,
        packagesReleased: "2",
        collectedByName: "E2E Amina",
        collectedByPhone: "+255700000000",
        collectedByIdNo: "E2E-ID",
        method: "COLLECTION",
        signature: photo(),
      })
    );
    assert.ok(released.ok, released.error);
    assert.equal(await cargoStatus(s.cargoA), "COLLECTED");
    const release = await prisma.release.findUniqueOrThrow({ where: { cargoId: s.cargoA } });
    assert.equal(release.releasedById, desks.dar.id);
    assert.equal(release.packagesReleased, 2);
    assert.equal((await prisma.pickupNote.findUniqueOrThrow({ where: { id: note.id } })).status, "USED");
    const collected = await prisma.notification.findMany({
      where: { customerId: s.customerA, kind: "CARGO_COLLECTED" },
    });
    assert.equal(collected.length, 1, "collected is said once");
    const releaseAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "cargo.release", entityId: s.cargoA },
    });
    const releaseMeta = releaseAudit.metadata as { collectedBy: string; boxesScanned: number; pickupNote: string };
    assert.equal(releaseMeta.collectedBy, "E2E Amina");
    assert.equal(releaseMeta.boxesScanned, 2);
    assert.equal(releaseMeta.pickupNote, note.noteNumber);

    /* (b) Second release / collection of the same cargo. */
    const twice = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.cargoA, packagesReleased: "2", collectedByName: "E2E Baraka", method: "COLLECTION" })
    );
    assert.match(twice.error ?? "", /already been handed over/);
    const rescan = await boxActions.scanBoxForRelease({}, form({ cargoId: s.cargoA, code: qr.qrPayload(s.boxTokens[0]) }));
    assert.ok(rescan.error, "a collected box cannot be scanned out again");
    as("finance");
    const newNote = await pickupActions.issuePickupNote({}, form({ cargoId: s.cargoA }));
    assert.match(newNote.error ?? "", /already been collected/, "no second note for collected cargo");
    assert.equal(await prisma.release.count({ where: { cargoId: s.cargoA } }), 1);
  });

  test("12. Customer isolation: B's portal cannot see A's cargo or bill", async () => {
    const a = await prisma.cargo.findUniqueOrThrow({ where: { id: s.cargoA } });

    const summaryB = await portal.portalSummary(s.customerB);
    assert.equal(summaryB.total, 1, "B sees only B's own consignment");
    assert.equal(summaryB.collected, 0);
    assert.equal(summaryB.invoiceCount, 0, "and none of A's bills");
    const summaryA = await portal.portalSummary(s.customerA);
    assert.equal(summaryA.total, 1);
    assert.equal(summaryA.collected, 1);
    assert.equal(summaryA.invoiceCount, 1);
    assert.equal(summaryA.owed.owes, false);

    const shipmentsB = await portal.portalShipments(s.customerB);
    assert.ok(!shipmentsB.some((e) => e.cargo.some((c) => c.id === s.cargoA)));
    assert.ok(!shipmentsB.some((e) => e.container.id === s.containerId), "B is not shown A's container");
    const activityB = await portal.portalActivity(s.customerB, 50);
    assert.ok(!activityB.some((i) => i.text.includes(a.reference) || (i.href ?? "").includes(a.reference)));

    /* The portal pages' own lookups, scoped the way they scope them. */
    assert.equal(
      await prisma.cargo.findFirst({ where: { reference: a.reference, ...portal.mine(s.customerB) } }),
      null,
      "cargo page: A's reference finds nothing for B"
    );
    assert.equal(
      await prisma.invoice.findFirst({ where: { id: s.invoiceId, customerId: s.customerB, status: { not: "DRAFT" } } }),
      null,
      "invoice page: A's invoice id finds nothing for B"
    );

    /* A customer session posting against another's invoice. */
    as({ id: `e2e-customer-${RUN}`, name: "B", email: "b@example.test", role: "CUSTOMER", department: null, warehouseId: null, customerId: s.customerB });
    const claim = await paymentActions.submitCustomerPayment(
      {},
      form({ invoiceId: s.invoiceId, amount: "1000", currency: "TZS", method: "MOBILE_MONEY" })
    );
    assert.equal(claim.error, "We cannot find that invoice on your account.");
    await assert.rejects(
      releaseActions.releaseCargo({}, form({ cargoId: s.cargoB, packagesReleased: "1", collectedByName: "B B" })),
      /Not permitted/,
      "a customer session holds no staff action"
    );
    as(null);
  });

  test("13. The trail: status history, container events and the audit log", async () => {
    const history = await prisma.cargoStatusHistory.findMany({
      where: { cargoId: s.cargoA },
      orderBy: { createdAt: "asc" },
      select: { from: true, to: true, actorId: true },
    });
    const path = history.map((h) => h.to);
    for (const step of [
      "REGISTERED",
      "RECEIVED_CHINA",
      "ASSIGNED_TO_CONTAINER",
      "CONTAINER_LOADED",
      "DEPARTED_CHINA",
      "IN_TRANSIT",
      "ARRIVED_TANZANIA",
      "RECEIVED_DAR",
      "READY_FOR_RELEASE",
      "COLLECTED",
    ]) {
      assert.ok(path.includes(step as never), `status history carries ${step} (got ${path.join(" > ")})`);
    }
    assert.equal(path.at(-1), "COLLECTED");
    assert.ok(history.every((h) => h.actorId), "every move names who made it");

    const events = await prisma.containerEvent.findMany({
      where: { containerId: s.containerId },
      orderBy: { createdAt: "asc" },
      select: { to: true },
    });
    const evs = events.map((e) => e.to);
    for (const step of ["OPEN", "LOADING", "SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED"]) {
      assert.ok(evs.includes(step as never), `container event ${step} (got ${evs.join(" > ")})`);
    }

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: s.invoiceId } });
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.cargoA } });
    const audit = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: { in: [s.cargoA, s.containerId, s.invoiceId, s.customerA, payment.id, note.id, s.rateId] } },
        ],
      },
      select: { action: true, entity: true, actorId: true },
    });
    const actions = new Set(audit.map((a) => a.action));
    for (const action of [
      "rate.publish",
      "customer.create",
      "cargo.receive.intake",
      "container.create",
      "container.load",
      "container.seal",
      "container.departed",
      "container.arrived",
      "cargo.receive.dar",
      "cargo.verify",
      "cargo.arrivedDar",
      "cargo.readyForPickup",
      "invoice.create",
      "invoice.issue",
      "payment.record",
      "payment.verify",
      "pickupNote.issue",
      "cargo.release",
    ]) {
      assert.ok(actions.has(action), `audit log carries ${action} (got ${[...actions].sort().join(", ")})`);
    }
    assert.ok(audit.every((a) => a.actorId), "every audit line has an actor");
  });
});
