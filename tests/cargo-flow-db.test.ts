import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE JOURNEY THE BUSINESS ACTUALLY RUNS, PRESS BY PRESS.

  Foshan receives → the box is loaded, sealed and sails → the sailing lands and
  everything on it arrives at once → Dar counts it in → the price is confirmed
  → money arrives in two currencies → the note is written, the boxes are
  scanned out and the cargo goes.

  What this file is for, over and above the lifecycle run, is the four things
  that only show up when the same button is pressed twice or the calendar
  moves: the storage arithmetic over days, the same figure in every place a
  person reads it, what a half-finished transaction leaves behind, and a
  hundred consignments on one box.

  Every step is the server action a desk's form calls, run as that desk, with
  the permission check from lib/rbac.ts. Nothing is rolled back.
*/
requireScratchDatabase();

const uploadDir = path.join(os.tmpdir(), "bluewave-cargo-flow-uploads");
mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
process.env.BLOB_READ_WRITE_TOKEN = "";

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

/*
  The client the actions will use, handed to them before they are loaded.

  lib/prisma keeps one client per process on globalThis; putting ours there
  first means every action in this file runs against a client that reports the
  statements it sends, which is how the hundred-consignment arrival below is
  measured rather than guessed at.
*/
const prisma = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;

let seen: string[] | null = null;
(prisma as unknown as { $on: (e: "query", cb: (event: { query: string }) => void) => void }).$on(
  "query",
  (event) => {
    if (seen) seen.push(event.query);
  }
);

/** How many statements an action sends, what they were, and how long it took. */
async function measure<T>(
  run: () => Promise<T>
): Promise<{ result: T; queries: number; ms: number; busiest: string[] }> {
  seen = [];
  const started = Date.now();
  const result = await run();
  const ms = Date.now() - started;
  const queries = seen;
  seen = null;

  /* Grouped by the table and verb, which is what names an N+1 when one shows
     up: a hundred identical reads of CompanySetting is a settings lookup
     inside the loop. */
  const shapes = new Map<string, number>();
  for (const q of queries) {
    const shape = q.replace(/\$\d+/g, "?").slice(0, 80);
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
  }
  const busiest = [...shapes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([shape, n]) => `${n}× ${shape}`);

  return { result, queries: queries.length, ms, busiest };
}

const customerActions = load("@/lib/actions/customers") as typeof import("@/lib/actions/customers");
const cargoActions = load("@/lib/actions/cargo") as typeof import("@/lib/actions/cargo");
const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const darActions = load("@/lib/actions/dar") as typeof import("@/lib/actions/dar");
const priceActions = load("@/lib/actions/price-list") as typeof import("@/lib/actions/price-list");
const invoiceActions = load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const storageCharge = load("@/lib/storage-charge") as typeof import("@/lib/storage-charge");
const paymentActions = load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");
const pickupActions = load("@/lib/actions/pickup-notes") as typeof import("@/lib/actions/pickup-notes");
const releaseActions = load("@/lib/actions/release") as typeof import("@/lib/actions/release");
const boxActions = load("@/lib/actions/boxes") as typeof import("@/lib/actions/boxes");
const financeConfig = load("@/lib/actions/finance-config") as typeof import("@/lib/actions/finance-config");

const balanceLib = load("@/lib/invoice-balance") as typeof import("@/lib/invoice-balance");
const releaseLib = load("@/lib/release") as typeof import("@/lib/release");
const storageFee = load("@/lib/storage-fee") as typeof import("@/lib/storage-fee");
const schedule = load("@/lib/sailing-schedule") as typeof import("@/lib/sailing-schedule");
const pdfData = load("@/lib/invoice-pdf-data") as typeof import("@/lib/invoice-pdf-data");
const portal = load("@/lib/portal") as typeof import("@/lib/portal");
const tracking = load("@/lib/tracking") as typeof import("@/lib/tracking");
const containerValue = load("@/lib/container-value") as typeof import("@/lib/container-value");
const supportDesk = load("@/lib/support-desk") as typeof import("@/lib/support-desk");
const qr = load("@/lib/qr") as typeof import("@/lib/qr");

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
const CARGO_TYPE = `Flow ${RUN}`;
const randomPhone = () => `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAR_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Midday in Dar, n calendar days ago.
 *
 * The storage clock counts Dar calendar days (lib/storage-clock.ts), so a
 * fixture that wants to be "on day ten" moves the arrival to the middle of
 * that day rather than to this hour minus 216, which lands either side of
 * midnight depending on when the suite is run.
 */
function darMiddayDaysAgo(days: number) {
  const today = Math.floor((Date.now() + DAR_OFFSET_MS) / DAY_MS);
  return new Date((today - days) * DAY_MS - DAR_OFFSET_MS + 12 * 60 * 60 * 1000);
}

const s = {
  customer: "",
  customerName: "",
  keeper: "",
  cargo: "",
  reference: "",
  gone: "",
  goneReference: "",
  keeperCargo: "",
  containerId: "",
  containerRef: "",
  invoiceId: "",
  keeperInvoiceId: "",
  darWarehouseId: "",
  boxTokens: [] as string[],
  keeperTokens: [] as string[],
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

  /* The floor's terms, written rather than assumed: a database seeded before
     the company set its daily rate would otherwise fail the arithmetic here
     for a reason that has nothing to do with the code under test. */
  const settings = await prisma.companySetting.update({
    where: { id: "singleton" },
    data: { freeStorageDays: 7, storagePerDay: 5, storageCurrency: "USD" },
  });
  assert.equal(settings.freeStorageDays, 7, "seven free days");
  assert.equal(settings.storagePerDay.toString(), "5", "USD 5 a day after them");
  assert.equal(settings.storageCurrency, "USD");
});

after(() => as(null));

const cargoStatus = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

const invoiceWithPayments = (id: string) =>
  prisma.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true, items: true } });

const storageItems = async (invoiceId: string) =>
  prisma.invoiceItem.findMany({
    where: { invoiceId, category: "Storage" },
    orderBy: { createdAt: "asc" },
  });

/* This consignment's own receiving row and nothing else: the other files in
   the suite are checking their own cargo in at the same moment. */
const darReceivingChanges = async () => {
  const row = await prisma.darReceiving.findUnique({
    where: { cargoId: s.cargo },
    select: { id: true },
  });
  return row
    ? prisma.fieldChange.count({ where: { entity: "DarReceiving", entityId: row.id } })
    : 0;
};

/** What the storage rule says today, through the helper every screen uses. */
async function calculatedStorage(cargoId: string) {
  const cargo = await prisma.cargo.findUniqueOrThrow({
    where: { id: cargoId },
    include: { darReceiving: true, release: true },
  });
  return storageFee.storagePosition({
    receivedAt: cargo.darArrivedAt ?? cargo.darReceiving?.receivedAt ?? null,
    collectedAt: cargo.release?.releasedAt ?? null,
    freeDays: 7,
    perDay: new Prisma.Decimal(5),
    currency: "USD",
  });
}

describe("the BlueWave journey, driven through the real actions", () => {
  test("1. a rate, a customer, and three consignments taken in at Foshan", async () => {
    as("finance");
    const rate = await financeConfig.createRate(
      {},
      form({ service: "LCL", cargoType: CARGO_TYPE, basis: "PER_CBM", rate: "400", currency: "USD", published: "on" })
    );
    assert.ok(rate.ok, rate.error);

    as("support");
    s.customerName = `Flow Zawadi ${RUN}`;
    const customer = await customerActions.createCustomer(
      {},
      form({ fullName: s.customerName, phone: randomPhone(), city: "Dar es Salaam" })
    );
    assert.ok(customer.ok, customer.error);
    s.customer = customer.customerId!;

    const keeper = await customerActions.createCustomer(
      {},
      form({ fullName: `Flow Neema ${RUN}`, phone: randomPhone() })
    );
    assert.ok(keeper.ok, keeper.error);
    s.keeper = keeper.customerId!;

    as("china");
    const intake = (customerId: string, key: string) =>
      cargoActions.receiveNewCargo(
        {},
        form({
          customerId,
          intakeKey: key,
          unit: "CM",
          location: "Row FLOW",
          supplierName: `Flow Supplier ${RUN}`,
          itemDescription: ["Plastic chairs"],
          itemCargoType: [CARGO_TYPE],
          itemPackageType: ["CARTON"],
          itemQuantity: ["2"],
          itemLength: ["100"],
          itemWidth: ["100"],
          itemHeight: ["50"],
          itemWeightKg: ["50"],
          itemReceiptNo: [`FL${RUN}${key.slice(-1)}`],
          photos: photo(),
        })
      );

    const first = (await intake(s.customer, `flow-${RUN}-1`)) as { ok?: string; error?: string; id?: string };
    assert.ok(first.ok, first.error);
    s.cargo = first.id!;

    const second = (await intake(s.keeper, `flow-${RUN}-2`)) as { ok?: string; error?: string; id?: string };
    assert.ok(second.ok, second.error);
    s.keeperCargo = second.id!;

    const third = (await intake(s.customer, `flow-${RUN}-3`)) as { ok?: string; error?: string; id?: string };
    assert.ok(third.ok, third.error);
    s.gone = third.id!;

    const rows = await prisma.cargo.findMany({
      where: { id: { in: [s.cargo, s.keeperCargo, s.gone] } },
      include: { chinaReceiving: true, boxes: true },
    });
    s.reference = rows.find((c) => c.id === s.cargo)!.reference;
    s.goneReference = rows.find((c) => c.id === s.gone)!.reference;
    s.boxTokens = rows.find((c) => c.id === s.cargo)!.boxes.map((b) => b.qrToken);
    s.keeperTokens = rows.find((c) => c.id === s.keeperCargo)!.boxes.map((b) => b.qrToken);
    for (const row of rows) {
      assert.equal(row.status, "RECEIVED_CHINA");
      assert.equal(row.chinaReceiving?.cbm.toString(), "1", "1 CBM each");
      assert.equal(row.boxes.length, 2, "a box row per carton");
    }
  });

  test("2. loaded, sealed and sailed: the ETA is thirty-five days out and day thirty-six is late", async () => {
    as("china");
    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(opened.ok, opened.error);
    s.containerId = opened.id!;
    s.containerRef = (await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } })).reference;

    const loaded = await containerActions.loadCargo(
      {},
      form({ containerId: s.containerId, cargoIds: [s.cargo, s.keeperCargo, s.gone] })
    );
    assert.ok(loaded.ok, loaded.error);

    const sealed = await containerActions.sealContainer(
      {},
      form({ containerId: s.containerId, sealNumber: `SEAL-F${RUN}`, containerNumber: `MSKF${RUN.slice(-7)}` })
    );
    assert.ok(sealed.ok, sealed.error);

    /* The packing list is the box read back out, frozen by the seal. */
    const list = await prisma.packingList.findUniqueOrThrow({ where: { containerId: s.containerId } });
    assert.ok(list.number, "the frozen list carries a number");

    const departed = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "DEPARTED" })
    );
    assert.ok(departed.ok, departed.error);

    const shipment = await prisma.shipment.findFirstOrThrow({ where: { containerId: s.containerId } });
    assert.equal(shipment.status, "IN_TRANSIT");
    const departure = shipment.departureDate!;
    assert.equal(
      shipment.eta!.getTime(),
      departure.getTime() + 35 * DAY_MS,
      "thirty-five days from the day it left"
    );
    assert.equal(
      schedule.expectedArrival(departure, null)!.getTime(),
      shipment.eta!.getTime(),
      "the rule and the stored date are the same date"
    );

    /* Day 35 is still the crossing; day 36 is the first that is late. */
    assert.equal(schedule.delayFor(shipment.eta, new Date(departure.getTime() + 35 * DAY_MS)), null);
    const late = schedule.delayFor(shipment.eta, new Date(departure.getTime() + 36 * DAY_MS));
    assert.equal(late?.days, 1);
    assert.equal(late?.label, "1 day late");

    for (const id of [s.cargo, s.keeperCargo, s.gone]) {
      assert.equal(await cargoStatus(id), "IN_TRANSIT", "every consignment on the box is at sea");
    }
    assert.equal(
      await prisma.notification.count({ where: { customerId: s.customer, kind: "CARGO_IN_TRANSIT" } }),
      2,
      "the customer with two consignments on the box hears about each of them, once"
    );
  });

  test("3. the sailing lands: everything arrives at once, and the second press is a no-op", async () => {
    as("dar");
    const arrived = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "ARRIVED" })
    );
    assert.ok(arrived.ok, arrived.error);

    for (const id of [s.cargo, s.keeperCargo, s.gone]) {
      const row = await prisma.cargo.findUniqueOrThrow({
        where: { id },
        select: { status: true, darArrivedAt: true },
      });
      assert.equal(row.status, "ARRIVED_TANZANIA");
      assert.ok(row.darArrivedAt, "the storage clock starts on the day the box landed");
    }
    /* Nothing was scanned to make that happen. */
    assert.equal(
      await prisma.cargoBox.count({ where: { darContainerId: s.containerId, darReceivedAt: { not: null } } }),
      0
    );

    const told = await prisma.notification.count({
      where: { customerId: { in: [s.customer, s.keeper] }, kind: "CARGO_ARRIVED_DAR" },
    });
    assert.equal(told, 3, "one notice per consignment, no more");

    const eventsBefore = await prisma.containerEvent.count({ where: { containerId: s.containerId } });
    const again = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "ARRIVED" })
    );
    assert.match(again.error ?? "", /does not follow/);
    assert.equal(
      await prisma.notification.count({
        where: { customerId: { in: [s.customer, s.keeper] }, kind: "CARGO_ARRIVED_DAR" },
      }),
      told,
      "nobody is told twice"
    );
    assert.equal(
      await prisma.containerEvent.count({ where: { containerId: s.containerId } }),
      eventsBefore,
      "and no second arrival event"
    );
  });

  test("4. Dar checks two in; the same check-in pressed twice changes nothing", async () => {
    as("dar");
    for (const [cargoId, tokens] of [
      [s.cargo, s.boxTokens],
      [s.keeperCargo, s.keeperTokens],
    ] as const) {
      for (const token of tokens) {
        const scan = await boxActions.scanBoxAtDar(
          {},
          form({ containerId: s.containerId, code: qr.qrPayload(token) })
        );
        assert.ok(scan.ok, scan.error ?? scan.warning);
      }
      const received = await darActions.receiveInDar(
        {},
        form({
          cargoId,
          warehouseId: s.darWarehouseId,
          packagesCount: "2",
          cbm: "1",
          weightKg: "50",
          condition: "GOOD",
          location: "Bay FLOW",
        })
      );
      assert.equal(received.ok, "Received.", received.error);
      const verified = await darActions.verifyCargo({}, form({ cargoId }));
      assert.ok(verified.ok, verified.error);
    }

    const before = {
      receivings: await prisma.darReceiving.count({ where: { cargoId: s.cargo } }),
      history: await prisma.cargoStatusHistory.count({ where: { cargoId: s.cargo } }),
      changes: await darReceivingChanges(),
      cases: await prisma.exceptionCase.count({ where: { cargoId: s.cargo } }),
      invoices: await prisma.invoice.count({ where: { cargoId: s.cargo, status: { not: "CANCELLED" } } }),
    };

    const twice = await darActions.receiveInDar(
      {},
      form({
        cargoId: s.cargo,
        warehouseId: s.darWarehouseId,
        packagesCount: "2",
        cbm: "1",
        weightKg: "50",
        condition: "GOOD",
        location: "Bay FLOW",
      })
    );
    assert.ok(twice.ok, twice.error);
    assert.deepEqual(
      {
        receivings: await prisma.darReceiving.count({ where: { cargoId: s.cargo } }),
        history: await prisma.cargoStatusHistory.count({ where: { cargoId: s.cargo } }),
        changes: await darReceivingChanges(),
        cases: await prisma.exceptionCase.count({ where: { cargoId: s.cargo } }),
        invoices: await prisma.invoice.count({ where: { cargoId: s.cargo, status: { not: "CANCELLED" } } }),
      },
      before,
      "one receiving row, no new history, no case, no second bill"
    );
    assert.equal(await cargoStatus(s.cargo), "RECEIVED_DAR");
  });

  test("5. the consignment that never came off: out of the counts, still on the box, never released", async () => {
    as("dar");
    const missing = await darActions.reportMissingAtDar(
      {},
      form({ cargoId: s.gone, note: "Not on the container when it was stripped." })
    );
    assert.ok(missing.ok, missing.error);
    assert.equal(await cargoStatus(s.gone), "MISSING_AT_DAR");

    const gone = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.gone },
      include: { containerLines: true, history: true },
    });
    assert.equal(gone.containerLines.length, 1, "still listed on the container it sailed on");
    assert.ok(gone.qrToken, "and keeps its code");
    assert.ok(gone.history.some((h) => h.to === "IN_TRANSIT"), "its history is untouched");

    const check = await releaseLib.releaseCheckFor(s.gone);
    assert.equal(check?.ok, false, "goods nobody can find are never releasable");

    /* Reported missing twice is the same case, not two. */
    const againMissing = await darActions.reportMissingAtDar({}, form({ cargoId: s.gone, note: "Still not here." }));
    assert.ok(againMissing.error || againMissing.ok);
    assert.equal(
      await prisma.exceptionCase.count({ where: { cargoId: s.gone, type: "MISSING_CARGO" } }),
      1,
      "one case, however often it is reported"
    );

    /* GOODS NOBODY CAN FIND ARE NOT THE SAILING'S MONEY. Its draft is kept —
       a draft is Finance's working — and simply not counted. */
    const lines = await prisma.containerCargo.findMany({
      where: { containerId: s.containerId },
      select: {
        cargo: {
          select: {
            status: true,
            invoices: { where: { status: { not: "CANCELLED" } }, select: { status: true, total: true } },
          },
        },
      },
    });
    const valued = lines.map((l) => {
      const live = l.cargo.invoices.filter((i) => i.status !== "DRAFT");
      return {
        missing: l.cargo.status === "MISSING_AT_DAR",
        issued: live.length > 0,
        billed: live.reduce((sum, i) => sum + Number(i.total), 0),
        draftTotal: Number(l.cargo.invoices.find((i) => i.status === "DRAFT")?.total ?? 0),
      };
    });
    assert.equal(valued.length, 3, "all three are still on the manifest");
    assert.equal(
      containerValue.expectedRevenueOf(valued),
      800,
      "two consignments at USD 400, and nothing for the one nobody can find"
    );
    assert.equal(
      containerValue.expectedRevenueOf(valued.map((v) => ({ ...v, missing: false }))),
      1200,
      "it would have been 1,200 had it come off the box"
    );
  });

  test("6. the price is confirmed: the rate row is pinned and the accounts are copied onto the bill", async () => {
    as("finance");
    const confirmed = await priceActions.confirmPrices(
      {},
      form({ containerId: s.containerId, cargoIds: [s.cargo, s.keeperCargo] })
    );
    assert.ok(confirmed.ok, confirmed.error);

    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { cargoId: s.cargo, status: { not: "CANCELLED" } },
    });
    s.invoiceId = invoice.id;
    s.keeperInvoiceId = (
      await prisma.invoice.findFirstOrThrow({ where: { cargoId: s.keeperCargo, status: { not: "CANCELLED" } } })
    ).id;

    assert.equal(invoice.status, "ISSUED");
    assert.equal(invoice.total.toString(), "400", "1 CBM at USD 400");
    assert.equal(invoice.fxRate?.toString(), "2700");
    assert.ok(invoice.exchangeRateId, "the exchange-rate row itself is pinned");
    assert.equal(invoice.totalTzs?.toString(), "1080000");
    assert.ok(Array.isArray(invoice.paymentSnapshot), "the collection accounts are on the bill");
  });
});

describe("what the floor space costs, day by day", () => {
  test("7. three days past the free week bills USD 15", async () => {
    /* The clock is moved rather than the calendar: the consignment landed ten
       Dar days ago, which is day ten — three days past the seven free ones. */
    await prisma.cargo.update({
      where: { id: s.cargo },
      data: { darArrivedAt: darMiddayDaysAgo(9) },
    });

    const position = await calculatedStorage(s.cargo);
    assert.equal(position.daysHeld, 10);
    assert.equal(position.chargeableDays, 3);
    assert.equal(position.amount.toString(), "15");

    as("finance");
    const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: s.invoiceId }));
    assert.ok(charged.ok, charged.error);

    const items = await storageItems(s.invoiceId);
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity.toString(), "3");
    assert.equal(items[0].unitPrice.toString(), "5");
    assert.equal(items[0].amount.toString(), "15");

    const invoice = await invoiceWithPayments(s.invoiceId);
    assert.equal(invoice.total.toString(), "415", "400 of freight and 15 of storage");
    assert.equal(invoice.totalTzs?.toString(), "1120500", "415 × 2,700");
  });

  test("8. the nightly run grows the one line, and never charges a day twice", async () => {
    /* The bill carries ONE storage line and the run brings it up to today.
       Nobody presses anything: the button is for the exception, and pressing
       it on a bill that already carries storage is told so. */
    as("finance");
    const again = await invoiceActions.chargeStorage({}, form({ invoiceId: s.invoiceId }));
    assert.ok(again.ok, again.error);
    assert.match(again.ok ?? "", /already on this bill/);
    assert.equal((await storageItems(s.invoiceId)).length, 1, "no second storage line for the same days");
    assert.equal((await invoiceWithPayments(s.invoiceId)).total.toString(), "415");

    /* Three more days go by, and the run that happens each night past Dar
       midnight takes the line to six. */
    await prisma.cargo.update({
      where: { id: s.cargo },
      data: { darArrivedAt: darMiddayDaysAgo(12) },
    });
    const position = await calculatedStorage(s.cargo);
    assert.equal(position.chargeableDays, 6);
    assert.equal(position.amount.toString(), "30");

    await storageCharge.accrueStorage({ cargoIds: [s.cargo] });

    const items = await storageItems(s.invoiceId);
    const billed = items.reduce((sum, i) => sum.add(i.amount), new Prisma.Decimal(0));
    const days = items.reduce((sum, i) => sum.add(i.quantity), new Prisma.Decimal(0));
    assert.equal(items.length, 1, "one line, grown — never a second line beside it");
    assert.equal(days.toString(), "6", "six chargeable days on the bill, each charged once");
    assert.equal(billed.toString(), "30", "USD 30, never 15 again on top of 15");

    const invoice = await invoiceWithPayments(s.invoiceId);
    assert.equal(invoice.total.toString(), "430");
    assert.equal(invoice.totalTzs?.toString(), "1161000", "430 × 2,700");

    /* The run again, with no day having passed. */
    await storageCharge.accrueStorage({ cargoIds: [s.cargo] });
    assert.equal(
      (await invoiceWithPayments(s.invoiceId)).total.toString(),
      "430",
      "and a bill already at today's figure is left alone"
    );
  });

  test("9. taking it off recalculates the bill and says who took it off, when and why", async () => {
    as("finance");
    const off = await invoiceActions.chargeStorage(
      {},
      form({ invoiceId: s.invoiceId, remove: "1", reason: "Waived: the customer was waiting on our own paperwork" })
    );
    assert.ok(off.ok, off.error);

    assert.equal((await storageItems(s.invoiceId)).length, 0);
    const invoice = await invoiceWithPayments(s.invoiceId);
    assert.equal(invoice.total.toString(), "400", "the bill is the freight again");
    assert.equal(invoice.totalTzs?.toString(), "1080000");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "invoice.storage.waive", entityId: s.invoiceId },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(audit.actorId, desks.finance.id, "who");
    assert.ok(audit.createdAt, "when");
    assert.match(audit.summary ?? "", /waiting on our own paperwork/, "why");

    const change = await prisma.fieldChange.findFirstOrThrow({
      where: { entity: "Invoice", entityId: s.invoiceId, field: "total" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(change.oldValue, "430", "the old value first");
    assert.equal(change.newValue, "400");
    assert.match(change.reason ?? "", /waiting on our own paperwork/);

    /* And the waiver's own mark, which is what stops the nightly run putting
       the same days straight back on. */
    const waived = await prisma.fieldChange.findFirstOrThrow({
      where: { entity: "Invoice", entityId: s.invoiceId, field: "storageWaived" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(waived.newValue, "Waived");
    assert.match(waived.oldValue ?? "", /USD 30 storage/, "what came off");

    await storageCharge.accrueStorage({ cargoIds: [s.cargo] });
    assert.equal(
      (await invoiceWithPayments(s.invoiceId)).total.toString(),
      "400",
      "a waived bill is never charged again by the run"
    );

    const twice = await invoiceActions.chargeStorage(
      {},
      form({ invoiceId: s.invoiceId, remove: "1", reason: "Asked again by mistake" })
    );
    assert.match(twice.error ?? "", /no storage on those bills/, "taking off nothing is refused, not repeated");
    assert.equal((await invoiceWithPayments(s.invoiceId)).total.toString(), "400");
  });

  test("10. charged again after the waiver, the whole run is billed once", async () => {
    as("finance");
    const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: s.invoiceId }));
    assert.ok(charged.ok, charged.error);
    const items = await storageItems(s.invoiceId);
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity.toString(), "6");
    assert.equal(items[0].amount.toString(), "30");
    assert.equal((await invoiceWithPayments(s.invoiceId)).total.toString(), "430");
  });

  test("11. the chase list counts the same days the bill is charged on", async () => {
    const queue = await supportDesk.followUpQueue();
    const row = queue.find((r) => r.invoiceId === s.invoiceId);
    assert.ok(row, "an unpaid bill on the Dar floor is on the call list");
    const position = await calculatedStorage(s.cargo);
    assert.equal(
      row.storageDays,
      position.chargeableDays,
      "days past free on the call list and on the storage card are one figure"
    );

    const floor = await supportDesk.darWarehouse();
    const held = floor.find((r) => r.cargoId === s.cargo);
    assert.equal(held?.daysInWarehouse, position.daysHeld, "and so is the day number");
  });
});

describe("the money, in two currencies and in every place it is read", () => {
  test("12. a part payment in shillings settles part of a dollar bill at the bill's own rate", async () => {
    as("finance");
    const part = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.invoiceId,
        amount: "500000",
        currency: "TZS",
        method: "MOBILE_MONEY",
        transactionRef: `MPESA-${RUN}`,
        idempotencyKey: `flow-part-${RUN}`,
      })
    );
    assert.ok(part.ok, part.error);

    const payment = await prisma.payment.findFirstOrThrow({ where: { invoiceId: s.invoiceId } });
    assert.equal(payment.status, "VERIFIED", "Finance's own recording counts at once");
    assert.equal(payment.fxRate?.toString(), "2700", "taken at the bill's pinned rate");
    assert.equal(payment.baseCurrencyAmount?.toString(), "500000");

    const invoice = await invoiceWithPayments(s.invoiceId);
    const balance = balanceLib.balanceOf(invoice);
    assert.equal(invoice.status, "PARTIALLY_PAID");
    assert.equal(balance.totalTzs?.toString(), "1161000");
    assert.equal(balance.paidTzs?.toString(), "500000");
    assert.equal(balance.outstandingTzs?.toString(), "661000");
    assert.equal(balance.outstanding.toFixed(2), "244.81", "661,000 ÷ 2,700, rounded once");
    assert.equal(
      invoice.totalTzs?.toString(),
      balance.totalTzs?.toString(),
      "the stored shilling total the PDF prints and the computed one agree"
    );
  });

  test("13. Finance, the customer's portal, the tracking page and the PDF all say TZS 661,000", async () => {
    const invoice = await invoiceWithPayments(s.invoiceId);
    const balance = balanceLib.balanceOf(invoice);
    const owed = balance.outstandingTzs!.toString();

    const queue = await supportDesk.followUpQueue();
    const row = queue.find((r) => r.invoiceId === s.invoiceId);
    assert.equal(row?.owedTzs?.toString(), owed, "the chase list");

    const summary = await portal.portalSummary(s.customer);
    assert.equal(summary.owed.tzs.toString(), owed, "the customer's own portal");
    assert.equal(summary.owed.primary, "TZS 661,000");

    const track = await tracking.trackByReference(s.reference);
    assert.equal(track?.charge?.outstandingTzs, owed, "the tracking page");
    assert.equal(track?.charge?.status, "PART_PAID");
    assert.equal(track?.charge?.total, "430.00");

    const pdf = await pdfData.loadInvoicePdf(s.invoiceId);
    assert.equal(pdf?.input.due?.headline, "TZS 661,000", "the PDF the customer is sent");
    assert.equal(pdf?.input.totals.totalTzs, "1,161,000 TZS");
    assert.equal(pdf?.input.totals.total, "430.00 USD");
    assert.equal(pdf?.input.totals.paid, "500,000 TZS");
    assert.equal(pdf?.input.stamp.label, "Part paid");

    const gate = await releaseLib.releaseCheckFor(s.cargo);
    assert.equal(gate?.outstanding.toString(), owed, "the release gate");
    assert.equal(gate?.ok, false);
  });

  test("14. the same press twice is one payment", async () => {
    as("finance");
    const before = await prisma.payment.count({ where: { invoiceId: s.invoiceId } });
    const again = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.invoiceId,
        amount: "500000",
        currency: "TZS",
        method: "MOBILE_MONEY",
        idempotencyKey: `flow-part-${RUN}`,
      })
    );
    assert.ok(again.ok, again.error);
    assert.match(again.ok!, /Already recorded/);
    assert.equal(await prisma.payment.count({ where: { invoiceId: s.invoiceId } }), before);

    const invoice = await invoiceWithPayments(s.invoiceId);
    assert.equal(
      balanceLib.balanceOf(invoice).outstandingTzs?.toString(),
      "661000",
      "and the balance did not move"
    );
  });

  test("15. the rest of the money, and more than the bill owes is refused", async () => {
    as("finance");
    const rest = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.invoiceId,
        amount: "661000",
        currency: "TZS",
        method: "BANK_TRANSFER",
        transactionRef: `CRDB-${RUN}`,
        idempotencyKey: `flow-rest-${RUN}`,
      })
    );
    assert.ok(rest.ok, rest.error);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: s.invoiceId },
      include: { payments: true, receipts: true },
    });
    const balance = balanceLib.balanceOf(invoice);
    assert.equal(invoice.status, "PAID");
    assert.equal(balance.outstandingTzs?.toString(), "0");
    assert.equal(balance.creditTzs?.toString(), "0", "paid to the shilling, nothing over");
    assert.equal(invoice.payments.length, 2);
    assert.ok(invoice.receipts.length >= 1, "a receipt is issued");

    /* A second press without the key it was minted with is caught by the
       bill's own arithmetic instead. */
    const overpaid = await paymentActions.recordPayment(
      {},
      form({ invoiceId: s.invoiceId, amount: "661000", currency: "TZS", method: "BANK_TRANSFER" })
    );
    assert.match(overpaid.error ?? "", /more than .* still owes/);
    assert.equal(await prisma.payment.count({ where: { invoiceId: s.invoiceId } }), 2);
  });
});

describe("the handover, and what stops when the goods go", () => {
  test("16. the note, the scan and one release — pressed twice, still one", async () => {
    /* The note is written by the last shilling landing; Finance pressing the
       button after that finds it already there. */
    as("finance");
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.cargo } });
    assert.equal(note.status, "ACTIVE");
    assert.equal(note.amountTzs?.toString(), "1161000", "the note carries the bill it rests on");
    const twiceIssued = await pickupActions.issuePickupNote({}, form({ cargoId: s.cargo }));
    assert.ok(twiceIssued.ok ?? twiceIssued.error);
    assert.equal(await prisma.pickupNote.count({ where: { cargoId: s.cargo } }), 1);

    assert.equal(await cargoStatus(s.cargo), "READY_FOR_RELEASE");
    assert.equal(
      await prisma.notification.count({ where: { customerId: s.customer, kind: "CARGO_READY_FOR_PICKUP" } }),
      1,
      "ready for pickup is said once"
    );

    as("dar");
    for (const token of s.boxTokens) {
      const out = await boxActions.scanBoxForRelease({}, form({ cargoId: s.cargo, code: qr.qrPayload(token) }));
      assert.ok(out.ok, out.error ?? out.warning);
    }

    const released = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: s.cargo,
        packagesReleased: "2",
        collectedByName: s.customerName,
        collectedByIdNo: `ID-${RUN}`,
        method: "COLLECTION",
        signature: photo(),
      })
    );
    assert.ok(released.ok, released.error);
    assert.equal(await cargoStatus(s.cargo), "COLLECTED");

    const again = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.cargo, packagesReleased: "2", collectedByName: s.customerName, method: "COLLECTION" })
    );
    assert.match(again.error ?? "", /already been handed over/);
    assert.equal(await prisma.release.count({ where: { cargoId: s.cargo } }), 1);
    assert.equal(
      await prisma.notification.count({ where: { customerId: s.customer, kind: "CARGO_COLLECTED" } }),
      1,
      "collected is said once"
    );
    assert.equal(
      (await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.cargo } })).status,
      "USED"
    );

    /* The clock stopped with the handover: the bill carries the days it stood
       on the floor and not one more. */
    as("finance");
    const nothingMore = await invoiceActions.chargeStorage({}, form({ invoiceId: s.invoiceId }));
    assert.ok(nothingMore.ok, nothingMore.error);
    assert.equal((await invoiceWithPayments(s.invoiceId)).total.toString(), "430");
  });

  test("17. a bill that grows after it was settled withdraws the note the customer is holding", async () => {
    as("finance");
    const paid = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.keeperInvoiceId,
        amount: "1080000",
        currency: "TZS",
        method: "CASH",
        idempotencyKey: `flow-keeper-${RUN}`,
      })
    );
    assert.ok(paid.ok, paid.error);
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.keeperCargo } });
    assert.equal(note.status, "ACTIVE", "the last shilling writes the permission to collect");
    assert.equal(await cargoStatus(s.keeperCargo), "READY_FOR_RELEASE");

    /* It has been sitting on the floor for ten days after all. */
    await prisma.cargo.update({
      where: { id: s.keeperCargo },
      data: { darArrivedAt: darMiddayDaysAgo(9) },
    });
    const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: s.keeperInvoiceId }));
    assert.ok(charged.ok, charged.error);
    assert.equal((await invoiceWithPayments(s.keeperInvoiceId)).total.toString(), "415");

    const withdrawn = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.keeperCargo } });
    assert.equal(withdrawn.status, "CANCELLED", "the paper that says paid is taken back");
    const gate = await releaseLib.releaseCheckFor(s.keeperCargo);
    assert.equal(gate?.ok, false, "and the goods cannot go");

    as("dar");
    const refused = await boxActions.scanBoxForRelease(
      {},
      form({ cargoId: s.keeperCargo, code: qr.qrPayload(s.keeperTokens[0]) })
    );
    assert.ok(refused.error, "a box cannot be scanned out on a withdrawn note");

    /* The storage is paid — USD 15 at the bill's own 2,700 — and a new note is
       written with a new code. */
    as("finance");
    const settle = await paymentActions.recordPayment(
      {},
      form({
        invoiceId: s.keeperInvoiceId,
        amount: "40500",
        currency: "TZS",
        method: "CASH",
        idempotencyKey: `flow-keeper-storage-${RUN}`,
      })
    );
    assert.ok(settle.ok, settle.error);
    const reissued = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.keeperCargo } });
    assert.equal(reissued.status, "ACTIVE");
    assert.notEqual(reissued.noteNumber, note.noteNumber, "a new code: the old paper stays dead");
    assert.equal(
      balanceLib.balanceOf(await invoiceWithPayments(s.keeperInvoiceId)).outstandingTzs?.toString(),
      "0"
    );
  });

  test("18. a failure inside the handover leaves nothing behind", async () => {
    as("dar");
    for (const token of s.keeperTokens) {
      const out = await boxActions.scanBoxForRelease(
        {},
        form({ cargoId: s.keeperCargo, code: qr.qrPayload(token) })
      );
      assert.ok(out.ok, out.error ?? out.warning);
    }

    /* The floor's own worst case: the write that appends the status fails
       halfway through the handover. */
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION bluewave_flow_fail() RETURNS trigger AS $fn$
      BEGIN RAISE EXCEPTION 'the line went down'; END;
      $fn$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER bluewave_flow_fail_release BEFORE INSERT ON "CargoStatusHistory"
      FOR EACH ROW WHEN (NEW."cargoId" = '${s.keeperCargo}')
      EXECUTE FUNCTION bluewave_flow_fail();
    `);

    const failed = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.keeperCargo, packagesReleased: "2", collectedByName: "Flow Neema", method: "COLLECTION" })
    );
    assert.ok(failed.error, "the handover is refused");

    assert.equal(await prisma.release.count({ where: { cargoId: s.keeperCargo } }), 0, "no release row");
    assert.equal(
      (await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: s.keeperCargo } })).status,
      "ACTIVE",
      "the note is not spent"
    );
    assert.equal(await cargoStatus(s.keeperCargo), "READY_FOR_RELEASE", "the status stands");
    assert.equal(
      await prisma.notification.count({ where: { customerId: s.keeper, kind: "CARGO_COLLECTED" } }),
      0,
      "nobody is told the goods went"
    );
    assert.equal(
      await prisma.auditLog.count({ where: { action: "cargo.release", entityId: s.keeperCargo } }),
      0,
      "and nothing is written to the trail"
    );

    await prisma.$executeRawUnsafe(`DROP TRIGGER bluewave_flow_fail_release ON "CargoStatusHistory";`);

    const released = await releaseActions.releaseCargo(
      {},
      form({ cargoId: s.keeperCargo, packagesReleased: "2", collectedByName: "Flow Neema", method: "COLLECTION" })
    );
    assert.ok(released.ok, released.error);
    assert.equal(await cargoStatus(s.keeperCargo), "COLLECTED");
  });

  test("19. collected on day ten is charged for three days, however long ago that was", async () => {
    /* It landed thirteen days ago and was collected on its tenth day. */
    await prisma.cargo.update({
      where: { id: s.keeperCargo },
      data: { darArrivedAt: darMiddayDaysAgo(12) },
    });
    await prisma.release.update({
      where: { cargoId: s.keeperCargo },
      data: { releasedAt: darMiddayDaysAgo(3) },
    });

    const stopped = await calculatedStorage(s.keeperCargo);
    assert.equal(stopped.daysHeld, 10, "day one to the day it was collected");
    assert.equal(stopped.chargeableDays, 3);
    assert.equal(stopped.amount.toString(), "15");

    const stillRunning = storageFee.storagePosition({
      receivedAt: darMiddayDaysAgo(12),
      collectedAt: null,
      freeDays: 7,
      perDay: new Prisma.Decimal(5),
      currency: "USD",
    });
    assert.equal(stillRunning.chargeableDays, 6, "had it stayed on the floor it would be six");

    /* The three days it stood there are on the bill and were paid; three more
       days on the calendar since it went add nothing. */
    const items = await storageItems(s.keeperInvoiceId);
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity.toString(), "3", "the three days it was actually there");
    assert.equal(items[0].amount.toString(), "15");

    as("finance");
    const charged = await invoiceActions.chargeStorage({}, form({ invoiceId: s.keeperInvoiceId }));
    assert.ok(charged.ok, charged.error);
    assert.equal((await storageItems(s.keeperInvoiceId)).length, 1, "nothing is added after it went");
    const invoice = await invoiceWithPayments(s.keeperInvoiceId);
    assert.equal(invoice.total.toString(), "415");
    assert.equal(
      balanceLib.balanceOf(invoice).outstandingTzs?.toString(),
      "0",
      "and the customer owes nothing for a floor they are not standing on"
    );
  });
});

describe("a hundred consignments on one box", () => {
  const big = { containerId: "", customerId: "", cargoIds: [] as string[] };
  const COUNT = 100;

  test("20. a box is filled, sealed and sailed with a hundred consignments on it", async (t) => {
    as("support");
    const customer = await customerActions.createCustomer(
      {},
      form({ fullName: `Flow Hundred ${RUN}`, phone: randomPhone() })
    );
    assert.ok(customer.ok, customer.error);
    big.customerId = customer.customerId!;

    /* Written straight to the rows rather than through a hundred intakes: what
       is being measured is the arrival, and a hundred presses of the receiving
       form is a different test. */
    await prisma.cargo.createMany({
      data: Array.from({ length: COUNT }, (_, i) => ({
        reference: `BWX${RUN}${String(i).padStart(3, "0")}`,
        qrToken: `BWX-QR-${RUN}-${i}`,
        senderId: big.customerId,
        receiverId: big.customerId,
        description: "Assorted goods",
        status: "RECEIVED_CHINA" as const,
      })),
    });
    const rows = await prisma.cargo.findMany({
      where: { reference: { startsWith: `BWX${RUN}` } },
      select: { id: true },
    });
    big.cargoIds = rows.map((r) => r.id);
    assert.equal(big.cargoIds.length, COUNT);

    await prisma.cargoPackage.createMany({
      data: big.cargoIds.map((cargoId, i) => ({
        cargoId,
        reference: `BWX${RUN}-${i}-P1`,
        quantity: 2,
        cbm: new Prisma.Decimal("1"),
        weightKg: new Prisma.Decimal("50"),
      })),
    });

    as("china");
    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(opened.ok, opened.error);
    big.containerId = opened.id!;

    const loaded = await containerActions.loadCargo(
      {},
      form({ containerId: big.containerId, cargoIds: big.cargoIds })
    );
    assert.ok(loaded.ok, loaded.error);
    assert.equal(
      await prisma.containerCargo.count({ where: { containerId: big.containerId } }),
      COUNT
    );

    const sealed = await containerActions.sealContainer(
      {},
      form({ containerId: big.containerId, sealNumber: `SEAL-X${RUN}`, containerNumber: `MSKX${RUN.slice(-7)}` })
    );
    assert.ok(sealed.ok, sealed.error);
    const departure = await measure(() =>
      containerActions.advanceContainer({}, form({ containerId: big.containerId, to: "DEPARTED" }))
    );
    assert.ok(departure.result.ok, departure.result.error);
    t.diagnostic(`departure of ${COUNT} consignments: ${departure.queries} statements in ${departure.ms} ms`);
    assert.equal(
      await prisma.notification.count({ where: { customerId: big.customerId, kind: "CARGO_IN_TRANSIT" } }),
      COUNT,
      "every consignment's customer is told it sailed"
    );
    /* Flat, not per consignment: the whole box is read and told in one go. */
    assert.ok(
      departure.queries < COUNT,
      `the departure sends ${departure.queries} statements for ${COUNT} consignments`
    );
  });

  test("21. a failure part-way through the arrival leaves the box at sea", async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION bluewave_flow_fail() RETURNS trigger AS $fn$
      BEGIN RAISE EXCEPTION 'the line went down'; END;
      $fn$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER bluewave_flow_fail_arrive BEFORE INSERT ON "AuditLog"
      FOR EACH ROW WHEN (NEW."entityId" = '${big.containerId}')
      EXECUTE FUNCTION bluewave_flow_fail();
    `);

    as("dar");
    const failed = await containerActions.advanceContainer(
      {},
      form({ containerId: big.containerId, to: "ARRIVED" })
    );
    assert.ok(failed.error, "the arrival is refused");

    const container = await prisma.container.findUniqueOrThrow({ where: { id: big.containerId } });
    assert.equal(container.status, "IN_TRANSIT", "the box is still at sea");
    assert.equal(
      await prisma.containerEvent.count({ where: { containerId: big.containerId, to: "ARRIVED" } }),
      0
    );
    assert.equal(
      await prisma.cargo.count({ where: { id: { in: big.cargoIds }, darArrivedAt: { not: null } } }),
      0,
      "no storage clock started"
    );
    assert.equal(
      await prisma.cargo.count({ where: { id: { in: big.cargoIds }, status: "ARRIVED_TANZANIA" } }),
      0,
      "no consignment moved"
    );
    assert.equal(
      await prisma.notification.count({ where: { customerId: big.customerId, kind: "CARGO_ARRIVED_DAR" } }),
      0,
      "and nobody was told"
    );

    await prisma.$executeRawUnsafe(`DROP TRIGGER bluewave_flow_fail_arrive ON "AuditLog";`);
  });

  test("22. one press moves all hundred, and the work it costs is counted", async (t) => {
    as("dar");
    const { result, queries, ms, busiest } = await measure(() =>
      containerActions.advanceContainer({}, form({ containerId: big.containerId, to: "ARRIVED" }))
    );
    assert.ok(result.ok, result.error);
    t.diagnostic(`arrival of ${COUNT} consignments: ${queries} statements in ${ms} ms`);
    for (const line of busiest) t.diagnostic(`  ${line}`);

    assert.equal(
      await prisma.cargo.count({ where: { id: { in: big.cargoIds }, status: "ARRIVED_TANZANIA" } }),
      COUNT,
      "every consignment on the box arrived"
    );
    assert.equal(
      await prisma.cargo.count({ where: { id: { in: big.cargoIds }, darArrivedAt: null } }),
      0,
      "each with its storage day"
    );
    assert.equal(
      await prisma.notification.count({ where: { customerId: big.customerId, kind: "CARGO_ARRIVED_DAR" } }),
      COUNT,
      "one notice each"
    );

    /* The shape of the cost, not a benchmark: the statement count has to stay
       proportional to the consignments on the box. Anything that reads the
       company settings or the warehouse address per consignment shows up here
       long before a clerk finds it on a Monday morning. */
    assert.ok(
      queries < COUNT * 10,
      `the arrival sends ${queries} statements for ${COUNT} consignments — that is an N+1`
    );
    assert.ok(ms < 60_000, `the arrival took ${ms} ms`);
  });
});
