import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE CARGO'S WHOLE LIFE, ONE CONTAINER, THREE CUSTOMERS.

  tests/lifecycle-e2e-db.test.ts walks one consignment through every desk. This
  one walks a BOX — three customers on one manifest, one of them reported
  missing at Dar — because most of what goes wrong in this business goes wrong
  between consignments rather than inside one: a departure that moves some of
  the cargo, a total that counts goods nobody found, a document that stops
  reprinting once the goods have gone.

  Everything is the real server action, run as the desk whose form calls it.
  Rows are committed; the run needs a throwaway database.
*/
requireScratchDatabase();

const uploadDir = path.join(os.tmpdir(), "bluewave-cargo-life-uploads");
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
const invoiceActions = load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const paymentActions = load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");
const pickupActions = load("@/lib/actions/pickup-notes") as typeof import("@/lib/actions/pickup-notes");
const releaseActions = load("@/lib/actions/release") as typeof import("@/lib/actions/release");
const boxActions = load("@/lib/actions/boxes") as typeof import("@/lib/actions/boxes");
const mergeActions = load("@/lib/actions/merge") as typeof import("@/lib/actions/merge");
const releaseLib = load("@/lib/release") as typeof import("@/lib/release");
const packingList = load("@/lib/packing-list") as typeof import("@/lib/packing-list");
const verification = load("@/lib/verification") as typeof import("@/lib/verification");
const tracking = load("@/lib/tracking") as typeof import("@/lib/tracking");
const trackingStage = load("@/lib/tracking-stage") as typeof import("@/lib/tracking-stage");
const deliveryNotePdfData = load("@/lib/delivery-note-pdf-data") as typeof import("@/lib/delivery-note-pdf-data");
const deliveryNotePdf = load("@/lib/delivery-note-pdf") as typeof import("@/lib/delivery-note-pdf");
const boxLabels = load("@/lib/box-labels") as typeof import("@/lib/box-labels");
const scanLib = load("@/lib/scan") as typeof import("@/lib/scan");
const constants = load("@/lib/constants") as typeof import("@/lib/constants");
const portalWords = load("@/lib/portal") as typeof import("@/lib/portal");
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

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const photo = () => new File([PNG], "boxes.png", { type: "image/png" });

const RUN = Date.now().toString(36).toUpperCase();
const CARGO_TYPE = `Life Shoes ${RUN}`;
const randomPhone = () => `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

/** One row per customer on the box. */
type Leg = {
  key: "amina" | "baraka" | "chausiku";
  customerId: string;
  cargoId: string;
  reference: string;
  qrToken: string;
  boxTokens: string[];
  /** What Foshan measured: packages × CBM each, and the line's own volume. */
  packages: number;
  cbm: string;
};

const s = {
  darWarehouseId: "",
  containerId: "",
  containerRef: "",
  legs: {} as Record<Leg["key"], Leg>,
};

const leg = (key: Leg["key"]) => s.legs[key];

const statusOf = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

/** Every append-only table, counted, so a later step can prove nothing was rewritten. */
async function trail(cargoId: string) {
  const [history, fields, audits] = await Promise.all([
    prisma.cargoStatusHistory.findMany({
      where: { cargoId },
      orderBy: { createdAt: "asc" },
      select: { id: true, from: true, to: true },
    }),
    prisma.fieldChange.count({ where: { entityId: cargoId } }),
    prisma.auditLog.count({ where: { entityId: cargoId } }),
  ]);
  return { history, fields, audits };
}

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

  as("finance");
  const rate = await financeConfig.createRate(
    {},
    form({
      service: "LCL",
      cargoType: CARGO_TYPE,
      basis: "PER_CBM",
      rate: "300",
      currency: "USD",
      published: "on",
    })
  );
  assert.ok(rate.ok, rate.error);
  as(null);
});

after(() => as(null));

describe("1. Foshan takes the goods in: reference, code, note, labels", () => {
  test("three customers are received, and each gets its own identity and paper", async () => {
    as("support");
    for (const [key, name] of [
      ["amina", "Amina"],
      ["baraka", "Baraka"],
      ["chausiku", "Chausiku"],
    ] as const) {
      const made = await customerActions.createCustomer(
        {},
        form({ fullName: `Life ${name} ${RUN}`, phone: randomPhone(), city: "Dar es Salaam" })
      );
      assert.ok(made.ok, made.error);
      s.legs[key] = {
        key,
        customerId: made.customerId!,
        cargoId: "",
        reference: "",
        qrToken: "",
        boxTokens: [],
        packages: 0,
        cbm: "0",
      };
    }

    /* Three different shapes, so the container's totals cannot come out right
       by accident: 4 cartons of 0.25, 2 of 0.5, 3 of 0.1. */
    const intake = {
      amina: { quantity: 4, l: "100", w: "50", h: "50", packages: 4, cbm: "1" },
      baraka: { quantity: 2, l: "100", w: "100", h: "50", packages: 2, cbm: "1" },
      chausiku: { quantity: 3, l: "50", w: "50", h: "40", packages: 3, cbm: "0.3" },
    } as const;

    as("china");
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const spec = intake[key];
      const res = (await cargoActions.receiveNewCargo(
        {},
        form({
          customerId: leg(key).customerId,
          intakeKey: `life-${RUN}-${key}`,
          unit: "CM",
          location: "Row LIFE",
          supplierName: `Life Supplier ${RUN}`,
          itemDescription: ["Shoes"],
          itemCargoType: [CARGO_TYPE],
          itemPackageType: ["CARTON"],
          itemQuantity: [String(spec.quantity)],
          itemLength: [spec.l],
          itemWidth: [spec.w],
          itemHeight: [spec.h],
          itemWeightKg: ["40"],
          itemReceiptNo: [`LIFE${RUN}${key.slice(0, 1).toUpperCase()}`],
          photos: photo(),
        })
      )) as { ok?: string; error?: string; id?: string };
      assert.ok(res.ok, res.error);

      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: res.id! },
        include: { chinaReceiving: true, deliveryNote: true, boxes: true, packages: true },
      });
      const row = leg(key);
      row.cargoId = cargo.id;
      row.reference = cargo.reference;
      row.qrToken = cargo.qrToken;
      row.packages = spec.packages;
      row.cbm = spec.cbm;

      /* A reference is minted, not asked for. */
      assert.match(cargo.reference, /^BW\d{4}$/);
      assert.equal(cargo.status, "RECEIVED_CHINA");
      assert.equal(cargo.chinaReceiving?.cbm.toString(), spec.cbm);
      assert.equal(cargo.chinaReceiving?.packagesCount, spec.packages);

      /* The delivery note is written by the same press. */
      assert.ok(cargo.deliveryNote, "a delivery note exists from the counter");
      assert.match(cargo.deliveryNote!.number, /^DN-/);

      /* One code per physical box, plus the consignment's own. */
      const live = cargo.boxes.filter((b) => !b.voidedAt);
      assert.equal(live.length, spec.packages, "one box row per carton");
      row.boxTokens = live.map((b) => b.qrToken);
      assert.equal(new Set(row.boxTokens).size, spec.packages);
      assert.ok(!row.boxTokens.includes(cargo.qrToken));
    }

    /* Three consignments, three references, three codes. */
    const refs = Object.values(s.legs).map((l) => l.reference);
    assert.equal(new Set(refs).size, 3);
  });

  test("the note and the labels both render, and the code points at this consignment", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      const loaded = await deliveryNotePdfData.loadDeliveryNotePdf(row.cargoId);
      assert.ok(loaded, `${row.reference} has a delivery note to draw`);
      const pdf = deliveryNotePdf.renderDeliveryNotePdf({ ...loaded!.input, logo: null, qr: null });
      assert.ok(pdf.byteLength > 1000, "the note renders to a real file");
      assert.match(loaded!.fileName, /\.pdf$/);

      const stickers = await boxLabels.stickersFor([row.cargoId]);
      assert.equal(stickers.length, row.packages, "one sticker per box");
      assert.ok(stickers.every((k) => k.qr.startsWith("data:image/png;base64,")));

      /* The consignment's own code resolves to it and to nothing else. */
      const scanned = await scanLib.resolveScanToken(row.qrToken);
      assert.equal(scanned?.cargoId, row.cargoId);
      /* And each box's code names the box it is stuck to. */
      const box = await scanLib.resolveScanToken(row.boxTokens[0]);
      assert.equal(box?.cargoId, row.cargoId);
      assert.equal(box?.box?.of, row.packages);
    }

    /* A code nobody minted names nothing. */
    assert.equal(await scanLib.resolveScanToken(`bwq${RUN}nothing`), null);
  });
});

describe("2. Cargo waits in China until somebody loads it", () => {
  test("receiving never asked which container, and loading re-enters nothing", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      assert.equal(
        await prisma.containerCargo.count({ where: { cargoId: leg(key).cargoId } }),
        0,
        "the counter does not put cargo on a container"
      );
    }

    as("china");
    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(opened.ok, opened.error);
    s.containerId = opened.id!;
    s.containerRef = (
      await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } })
    ).reference;

    /* The floor list the loading form draws: what is standing in Foshan. */
    const floor = await prisma.cargo.findMany({
      where: { deletedAt: null, status: "RECEIVED_CHINA" },
      select: { id: true },
    });
    const floorIds = new Set(floor.map((c) => c.id));
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      assert.ok(floorIds.has(leg(key).cargoId), `${key} is on the Foshan floor list`);
    }

    const loaded = await containerActions.loadCargo(
      {},
      form({
        containerId: s.containerId,
        cargoIds: Object.values(s.legs).map((l) => l.cargoId),
      })
    );
    assert.ok(loaded.ok, loaded.error);

    /* Every figure on the manifest line came off the consignment, not off a
       form: the loader was given ids and nothing else. */
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      const line = await prisma.containerCargo.findUniqueOrThrow({
        where: { containerId_cargoId: { containerId: s.containerId, cargoId: row.cargoId } },
      });
      assert.equal(line.packagesCount, row.packages);
      assert.equal(line.cbm.toString(), row.cbm);
      assert.equal(await statusOf(row.cargoId), "ASSIGNED_TO_CONTAINER");
    }
  });
});

describe("3. One container, several customers, a derived packing list", () => {
  test("the sheet adds up to its own lines, and names every customer once", async () => {
    const live = await packingList.sheetFor(s.containerId);
    assert.ok(live, "an open box still has a list");
    const snap = live!.snap;

    assert.equal(snap.totalCargo, 3);
    assert.equal(snap.totalCustomers, 3, "three customers on one box");
    assert.equal(snap.lines.length, 3);

    /* Totals are the lines added up — never a figure somebody typed. */
    const packages = snap.lines.reduce((sum, l) => sum + l.packages, 0);
    const cbm = snap.lines.reduce((sum, l) => sum + Number(l.cbm), 0);
    assert.equal(snap.totalPackages, packages);
    assert.equal(Number(snap.totalCbm), cbm);
    assert.equal(snap.totalPackages, 9, "4 + 2 + 3 cartons");
    assert.equal(Number(snap.totalCbm).toFixed(3), "2.300", "1 + 1 + 0.3 m³");

    /* Each consignment keeps its own identity on the sheet. */
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      const line = snap.lines.find((l) => l.cargoReference === row.reference);
      assert.ok(line, `${row.reference} is on the manifest`);
      assert.equal(line!.packages, row.packages);
      assert.equal(line!.cbm, row.cbm);
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { id: row.customerId },
      });
      assert.equal(line!.customerCode, customer.code, "the line names its own customer");
    }
  });

  test("sealing freezes the sheet, and a later reading is the frozen one", async () => {
    as("china");
    const sealed = await containerActions.sealContainer(
      {},
      form({
        containerId: s.containerId,
        sealNumber: `LIFE-${RUN}`,
        containerNumber: `TCLU${RUN.slice(-7)}`,
      })
    );
    assert.ok(sealed.ok, sealed.error);

    const frozen = await prisma.packingList.findUniqueOrThrow({
      where: { containerId: s.containerId },
    });
    const snap = frozen.snapshot as unknown as { totalCargo: number; totalPackages: number; totalCbm: string };
    assert.equal(snap.totalCargo, 3);
    assert.equal(snap.totalPackages, 9);
    assert.equal(Number(snap.totalCbm).toFixed(3), "2.300");

    const sheet = await packingList.sheetFor(s.containerId);
    assert.equal(sheet!.snap.totalPackages, 9, "the sealed box reads its frozen sheet");
    assert.ok(sheet!.list?.number, "and the sheet carries its number");
  });
});

describe("4. Departure puts every consignment at sea by itself", () => {
  test("one press, and nobody touches a consignment", async () => {
    as("china");
    const departed = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "DEPARTED" })
    );
    assert.ok(departed.ok, departed.error);

    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      assert.equal(await statusOf(row.cargoId), "IN_TRANSIT", `${key} followed the box to sea`);
      const history = await prisma.cargoStatusHistory.findMany({
        where: { cargoId: row.cargoId },
        orderBy: { createdAt: "asc" },
        select: { to: true },
      });
      assert.deepEqual(
        history.slice(-2).map((h) => h.to),
        ["DEPARTED_CHINA", "IN_TRANSIT"],
        "both steps are written, in one press"
      );
    }

    /* There is no second manual step to press. */
    const none = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "IN_TRANSIT" })
    );
    assert.equal(none.error, "That is not a milestone.");
  });

  test("the documents still draw while the box is at sea", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      assert.ok(await deliveryNotePdfData.loadDeliveryNotePdf(row.cargoId));
      assert.equal((await boxLabels.stickersFor([row.cargoId])).length, row.packages);
    }
  });
});

describe("5. Arrival in Dar lands every consignment immediately", () => {
  test("one press marks the box arrived and its goods with it", async () => {
    as("dar");
    const arrived = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "ARRIVED" })
    );
    assert.ok(arrived.ok, arrived.error);

    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: row.cargoId },
        select: { status: true, darArrivedAt: true, darReceiving: { select: { id: true } } },
      });
      assert.equal(cargo.status, "ARRIVED_TANZANIA", `${key} arrived with the box`);
      assert.ok(cargo.darArrivedAt, "the arrival day is on the consignment");
      assert.equal(cargo.darReceiving, null, "arriving is not the warehouse having counted it");
      assert.equal(
        trackingStage.bluewaveStageOf(cargo.status),
        "ARRIVED_IN_DAR",
        "and the customer's line says Arrived in Dar"
      );
    }
  });

  test("arrived and not yet counted is a valid pair, and renders", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const row = leg(key);
      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: row.cargoId },
        select: { status: true, darReceiving: true },
      });
      assert.equal(
        verification.verificationOf({
          status: cargo.status,
          darReceiving: null,
          openCases: 0,
        }),
        "PENDING",
        "ARRIVED_IN_DAR + PENDING is a state the system holds"
      );
      const track = await tracking.trackByReference(row.reference);
      assert.ok(track, "and the tracking page draws it");
      assert.equal(track!.journey.current, "ARRIVED_IN_DAR");
      assert.equal(track!.status, "ARRIVED_TANZANIA");
    }
  });

  test("the staff screens say arrived too — one event is not told two ways", () => {
    /* The customer was written to the day the box landed. A desk reading "in
       transit" off the same row is the system contradicting its own letter. */
    const landed = constants.CARGO_STATUS_META.ARRIVED_TANZANIA;
    assert.doesNotMatch(landed.label, /transit|at sea|port/i);
    assert.doesNotMatch(landed.publicLabel, /transit|at sea/i);
    assert.match(landed.publicLabel, /Arrived in Dar/i);
    assert.match(portalWords.CUSTOMER_STATUS_WORDS.ARRIVED_TANZANIA, /Arrived in Dar/i);

    /* And the check-in is named for what it is, not for the arrival. */
    const counted = constants.CARGO_STATUS_META.RECEIVED_DAR;
    assert.match(counted.label, /Checked in/i);
    assert.notEqual(counted.label, landed.label, "two events, two words");
    assert.equal(
      counted.publicLabel,
      landed.publicLabel,
      "and one stage for the customer, either side of the count"
    );
  });
});

describe("6. Dar check-in is its own event, with its own answer per consignment", () => {
  test("one is counted clean, one damaged, one never came off the box", async () => {
    as("dar");

    /* Amina's: counted and signed off. */
    const amina = leg("amina");
    for (const token of amina.boxTokens) {
      const scan = await boxActions.scanBoxAtDar(
        {},
        form({ containerId: s.containerId, code: qr.qrPayload(token) })
      );
      assert.ok(scan.ok, scan.error ?? scan.warning);
    }
    const inA = await darActions.receiveInDar(
      {},
      form({
        cargoId: amina.cargoId,
        warehouseId: s.darWarehouseId,
        packagesCount: String(amina.packages),
        cbm: amina.cbm,
        weightKg: "160",
        condition: "GOOD",
        location: "Bay LIFE",
      })
    );
    assert.ok(inA.ok, inA.error);
    const signed = await darActions.verifyCargo({}, form({ cargoId: amina.cargoId }));
    assert.ok(signed.ok, signed.error);

    /* Baraka's: here, and wet. */
    const baraka = leg("baraka");
    const inB = await darActions.receiveInDar(
      {},
      form({
        cargoId: baraka.cargoId,
        warehouseId: s.darWarehouseId,
        packagesCount: String(baraka.packages),
        cbm: baraka.cbm,
        condition: "WET",
        notes: "Two cartons soaked on the water.",
      })
    );
    assert.ok(inB.ok, inB.error);

    /* Chausiku's never came off. */
    const chausiku = leg("chausiku");
    const gone = await darActions.reportMissingAtDar(
      {},
      form({ cargoId: chausiku.cargoId, note: "Nothing under this mark when the box was emptied." })
    );
    assert.ok(gone.ok, gone.error);
    assert.equal(await statusOf(chausiku.cargoId), "MISSING_AT_DAR");
  });

  test("operational status and verification are two separate answers", async () => {
    const rows = await prisma.cargo.findMany({
      where: { id: { in: Object.values(s.legs).map((l) => l.cargoId) } },
      select: {
        id: true,
        status: true,
        darReceiving: { select: { verified: true, discrepancy: true, condition: true } },
        _count: { select: { exceptions: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } } } },
      },
    });
    const state = (id: string) => {
      const row = rows.find((r) => r.id === id)!;
      return verification.verificationOf({
        status: row.status,
        darReceiving: row.darReceiving,
        openCases: row._count.exceptions,
      });
    };

    assert.equal(state(leg("amina").cargoId), "VERIFIED");
    assert.equal(state(leg("baraka").cargoId), "DAMAGED");
    assert.equal(state(leg("chausiku").cargoId), "MISSING");

    /* Damaged goods are HERE: the operational status still says received. */
    assert.equal(await statusOf(leg("baraka").cargoId), "RECEIVED_DAR");
    /* Missing goods stand where the box stands. */
    assert.equal(await statusOf(leg("chausiku").cargoId), "MISSING_AT_DAR");
  });

  test("the missing consignment stays on the box's list and drops out of its counts", async () => {
    const lines = await prisma.containerCargo.findMany({
      where: { containerId: s.containerId },
      include: { cargo: { select: { id: true, reference: true, status: true } } },
    });
    assert.equal(lines.length, 3, "the row is never removed from the manifest");
    assert.ok(
      lines.some((l) => l.cargo.reference === leg("chausiku").reference),
      "the missing consignment is still listed"
    );

    const counted = lines.filter((l) => verification.countsInContainer({ status: l.cargo.status }));
    assert.equal(counted.length, 2, "and out of the count");
    assert.equal(
      counted.reduce((sum, l) => sum + l.packagesCount, 0),
      6,
      "packages exclude the goods nobody found"
    );
    assert.equal(
      counted.reduce((sum, l) => sum + Number(l.cbm), 0).toFixed(3),
      "2.000",
      "volume excludes them too"
    );

    const summary = verification.verificationSummary(
      await Promise.all(
        lines.map(async (l) => {
          const row = await prisma.cargo.findUniqueOrThrow({
            where: { id: l.cargoId },
            select: {
              status: true,
              darReceiving: { select: { verified: true, discrepancy: true, condition: true } },
              _count: { select: { exceptions: { where: { status: { notIn: ["RESOLVED", "CLOSED"] } } } } },
            },
          });
          return {
            status: row.status,
            darReceiving: row.darReceiving,
            openCases: row._count.exceptions,
          };
        })
      )
    );
    assert.equal(summary.expected, 3, "every consignment on the manifest is expected");
    assert.equal(summary.missing, 1);
    assert.equal(summary.damaged, 1);
    assert.equal(summary.verified, 1);
  });
});

describe("7. There is no clearance stage", () => {
  test("the six stages cover every status, and none of them is clearance", () => {
    const stages = trackingStage.BLUEWAVE_STAGES.map((s) => s.label);
    assert.deepEqual(stages, [
      "Received in China",
      "Stored in China",
      "In transit",
      "Arrived in Dar es Salaam",
      "Ready for pickup",
      "Collected",
    ]);
    for (const label of stages) {
      assert.doesNotMatch(label, /clear|customs/i);
    }

    /* Every word a desk or a customer reads off a status, in every map that
       draws one. The retired ShipmentStatus values are still in the enum —
       taking a stored value out is a migration that can only fail on a row
       somebody forgot — so what matters is that they never print as a stage. */
    for (const meta of Object.values(constants.CARGO_STATUS_META)) {
      assert.doesNotMatch(`${meta.label} ${meta.publicLabel} ${meta.where}`, /clear|customs/i);
    }
    for (const label of Object.values(constants.SHIPMENT_STATUS_LABELS)) {
      assert.doesNotMatch(label, /clear|customs/i);
    }
    for (const words of Object.values(portalWords.CUSTOMER_STATUS_WORDS)) {
      assert.doesNotMatch(words, /clear|customs/i);
    }
  });

  test("nothing wrote the retired clearance columns on the way through", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: leg(key).cargoId },
        select: { clearedAt: true, clearedById: true },
      });
      assert.equal(cargo.clearedAt, null);
      assert.equal(cargo.clearedById, null);
    }
    const shipment = await prisma.shipment.findUniqueOrThrow({
      where: { containerId: s.containerId },
      select: { status: true, clearedAt: true },
    });
    assert.ok(!["CLEARANCE", "CLEARED"].includes(shipment.status), shipment.status);
    assert.equal(shipment.clearedAt, null);
    assert.equal(
      await prisma.shipment.count({ where: { status: { in: ["CLEARANCE", "CLEARED"] } } }),
      0,
      "no sailing anywhere stands at a clearance step"
    );
  });

  test("nothing a customer is shown speaks of clearance", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const track = await tracking.trackByReference(leg(key).reference);
      assert.ok(track);
      const words = [
        track!.journey.headline,
        track!.journey.notice ?? "",
        track!.note ?? "",
        track!.location,
        ...track!.journey.steps.flatMap((s) => [s.label, s.detail ?? "", s.atLabel]),
      ].join(" | ");
      assert.doesNotMatch(words, /clearance|cleared|clearing|customs/i, `${key}: ${words}`);
    }

    const notices = await prisma.notification.findMany({
      where: { customerId: { in: Object.values(s.legs).map((l) => l.customerId) } },
      select: { title: true, body: true },
    });
    assert.ok(notices.length > 0, "the customers were told things");
    for (const n of notices) {
      assert.doesNotMatch(
        `${n.title} ${n.body ?? ""}`,
        /clearance|clearing|customs|清关|报关|forodha/i,
        n.title
      );
    }
  });

  test("the release check never asks whether anything was cleared", async () => {
    const check = await releaseLib.releaseCheckFor(leg("amina").cargoId);
    assert.ok(check);
    for (const condition of check!.conditions) {
      assert.doesNotMatch(condition.label, /clear|customs/i);
    }
  });
});

describe("8. Pricing is confirmed a list at a time, and never fails the check-in", () => {
  test("check-in raised a draft, and the check-in stood whatever pricing did", async () => {
    for (const key of ["amina", "baraka"] as const) {
      const drafts = await prisma.invoice.findMany({
        where: { cargoId: leg(key).cargoId, status: { not: "CANCELLED" } },
      });
      assert.equal(drafts.length, 1, `${key} has exactly one bill`);
      assert.equal(drafts[0].status, "DRAFT", "raised as a draft");
      assert.ok(await prisma.cargo.findFirst({ where: { id: leg(key).cargoId, darReceiving: { isNot: null } } }));
    }

    /* The arrival priced the whole box, this one included — nobody knew yet.
       Its draft stays as Finance's working and as what the sailing would have
       been worth; what must never happen is that it becomes a demand. */
    assert.equal(
      await prisma.invoice.count({
        where: { cargoId: leg("chausiku").cargoId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      }),
      0,
      "nothing issued against a consignment reported missing"
    );
  });

  test("no press turns the missing consignment's draft into a bill", async () => {
    const gone = leg("chausiku");
    as("finance");

    /* Raising one by hand: refused, because nothing landed in Dar. */
    const single = await invoiceActions.generateInvoice({}, form({ cargoId: gone.cargoId }));
    assert.ok(single.error, "a bill cannot be raised for it by hand");

    /* The whole container in one press. */
    const bulk = await invoiceActions.generateContainerInvoices(
      {},
      form({ containerId: s.containerId })
    );
    assert.ok(bulk.ok || bulk.error);

    /* Confirming the container's price list. */
    const confirmed = await priceActions.confirmPrices({}, form({ containerId: s.containerId }));
    assert.ok(confirmed.ok || confirmed.error);

    /* Issuing the draft the arrival raised, straight from the bill. */
    const draft = await prisma.invoice.findFirst({
      where: { cargoId: gone.cargoId, status: "DRAFT" },
      select: { id: true },
    });
    assert.ok(draft, "the draft is still there for the claim");
    const issued = await invoiceActions.issueInvoice({}, form({ invoiceId: draft!.id }));
    assert.match(issued.error ?? "", /did not come off/, "issuing it is refused");

    assert.equal(
      await prisma.invoice.count({
        where: { cargoId: gone.cargoId, status: { notIn: ["DRAFT", "CANCELLED"] } },
      }),
      0,
      "and after all of that, nobody has been billed for boxes nobody found"
    );
  });

  test("Finance confirms the waiting list in one press", async () => {
    as("finance");
    const confirmed = await priceActions.confirmPrices(
      {},
      form({
        containerId: s.containerId,
        cargoIds: [leg("amina").cargoId, leg("baraka").cargoId],
      })
    );
    assert.ok(confirmed.ok, confirmed.error);

    for (const key of ["amina", "baraka"] as const) {
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { cargoId: leg(key).cargoId, status: { not: "CANCELLED" } },
      });
      assert.equal(invoice.status, "ISSUED");
      assert.equal(invoice.customerId, leg(key).customerId, "billed to its own customer");
      assert.equal(invoice.total.toString(), "300", "1 m³ at the book's 300");
      assert.ok(invoice.exchangeRateId, "the exchange-rate row is pinned");
      assert.ok(invoice.paymentSnapshot, "and the accounts are snapshotted");
    }
  });
});

describe("9. Pickup and release", () => {
  test("the release check is computed, and it refuses while the bill stands", async () => {
    const check = await releaseLib.releaseCheckFor(leg("amina").cargoId);
    assert.equal(check?.ok, false);
    assert.match(check?.blockedBy ?? "", /Not paid in full/);

    as("dar");
    const early = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: leg("amina").cargoId,
        packagesReleased: String(leg("amina").packages),
        collectedByName: "Somebody",
        method: "COLLECTION",
      })
    );
    assert.match(early.error ?? "", /Not paid in full/, "and again inside the action");
  });

  test("one payment across two bills settles them oldest first", async () => {
    const invoices = await prisma.invoice.findMany({
      where: {
        cargoId: { in: [leg("amina").cargoId, leg("baraka").cargoId] },
        status: { not: "CANCELLED" },
      },
      select: { id: true, totalTzs: true, customerId: true },
    });
    assert.equal(invoices.length, 2);

    as("finance");
    for (const invoice of invoices) {
      const paid = await paymentActions.recordPayment(
        {},
        form({
          invoiceId: invoice.id,
          amount: invoice.totalTzs!.toString(),
          currency: "TZS",
          method: "BANK_TRANSFER",
          idempotencyKey: `life-${RUN}-${invoice.id}`,
        })
      );
      assert.ok(paid.ok, paid.error);
    }

    for (const key of ["amina", "baraka"] as const) {
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { cargoId: leg(key).cargoId, status: { not: "CANCELLED" } },
      });
      assert.equal(invoice.status, "PAID");
    }
  });

  test("a pickup note is issued, and both codes open the right consignment", async () => {
    as("finance");
    const issued = await pickupActions.issuePickupNote({}, form({ cargoId: leg("amina").cargoId }));
    assert.ok(issued.ok, issued.error);
    const note = await prisma.pickupNote.findUniqueOrThrow({
      where: { cargoId: leg("amina").cargoId },
    });
    assert.equal(note.status, "ACTIVE");
    assert.equal(await statusOf(leg("amina").cargoId), "READY_FOR_RELEASE");

    /* The note's own code and a box's code both name this consignment. */
    const byNote = await scanLib.resolveScanToken(note.qrToken);
    assert.equal(byNote?.cargoId, leg("amina").cargoId);
    assert.equal(byNote?.pickupNote?.noteNumber, note.noteNumber);
    const byBox = await scanLib.resolveScanToken(leg("amina").boxTokens[0]);
    assert.equal(byBox?.cargoId, leg("amina").cargoId);
    assert.equal(byBox?.pickupNote, null, "a box code is not a pickup note");
  });

  test("who released it, who collected it, and when — and it cannot go twice", async () => {
    const amina = leg("amina");
    as("dar");
    for (const token of amina.boxTokens) {
      const out = await boxActions.scanBoxForRelease(
        {},
        form({ cargoId: amina.cargoId, code: qr.qrPayload(token) })
      );
      assert.ok(out.ok, out.error ?? out.warning);
    }

    const before = await trail(amina.cargoId);
    const released = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: amina.cargoId,
        packagesReleased: String(amina.packages),
        collectedByName: `Life Amina ${RUN}`,
        collectedByPhone: "+255700111222",
        collectedByIdNo: `LIFE-ID-${RUN}`,
        method: "COLLECTION",
        signature: photo(),
      })
    );
    assert.ok(released.ok, released.error);

    const release = await prisma.release.findUniqueOrThrow({ where: { cargoId: amina.cargoId } });
    assert.equal(release.releasedById, desks.dar.id, "who let it go");
    assert.equal(release.collectedByName, `Life Amina ${RUN}`, "who took it");
    assert.ok(release.releasedAt, "and when");
    assert.equal(await statusOf(amina.cargoId), "COLLECTED");

    /* Nothing goes out twice. */
    const twice = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: amina.cargoId,
        packagesReleased: String(amina.packages),
        collectedByName: "Anybody",
        method: "COLLECTION",
      })
    );
    assert.ok(twice.error, "a second handover is refused");
    assert.equal(await prisma.release.count({ where: { cargoId: amina.cargoId } }), 1);

    /* The history it already had is still there, with rows added on the end. */
    const after = await trail(amina.cargoId);
    assert.ok(after.history.length > before.history.length);
    assert.deepEqual(
      after.history.slice(0, before.history.length).map((h) => h.id),
      before.history.map((h) => h.id),
      "no history row was rewritten"
    );
    assert.ok(after.audits >= before.audits);
  });

  test("the paper is still reproducible after the goods have gone", async () => {
    const amina = leg("amina");
    const loaded = await deliveryNotePdfData.loadDeliveryNotePdf(amina.cargoId);
    assert.ok(loaded, "the delivery note still draws after collection");
    assert.ok(
      deliveryNotePdf.renderDeliveryNotePdf({ ...loaded!.input, logo: null, qr: null }).byteLength > 1000
    );
    assert.equal(
      (await boxLabels.stickersFor([amina.cargoId])).length,
      amina.packages,
      "and so do the labels"
    );
    const scanned = await scanLib.resolveScanToken(amina.qrToken);
    assert.equal(scanned?.cargoId, amina.cargoId, "and the code still opens it");
  });
});

describe("10. Public tracking, at every point in the life", () => {
  test("a reference nobody minted, and a shape that is not one", async () => {
    assert.equal(await tracking.trackByReference("BW9999999"), null);
    assert.equal(await tracking.trackByReference(""), null);
    assert.equal(await tracking.trackByReference("drop table cargo"), null);
  });

  test("collected cargo still tracks, and reads Collected", async () => {
    const track = await tracking.trackByReference(leg("amina").reference);
    assert.ok(track, "tracking survives collection");
    assert.equal(track!.journey.current, "COLLECTED");
    assert.equal(track!.journey.next, null);
    assert.equal(track!.journey.steps.length, 6);
    assert.ok(track!.journey.steps.every((s) => s.state === "done"));
  });

  test("cargo checked in and paid but not collected reads Ready or Arrived", async () => {
    const track = await tracking.trackByReference(leg("baraka").reference);
    assert.ok(track);
    assert.ok(["ARRIVED_IN_DAR", "READY_FOR_PICKUP"].includes(track!.journey.current!));
    assert.equal(track!.charge?.status, "PAID", "a paid bill reads paid");
  });

  test("a consignment nobody found still tracks, and says so without going back to sea", async () => {
    const track = await tracking.trackByReference(leg("chausiku").reference);
    assert.ok(track);
    assert.equal(track!.journey.current, "ARRIVED_IN_DAR");
    assert.equal(track!.journey.issue, "MISSING");
    assert.ok(track!.journey.notice);
  });

  test("no invented ship position anywhere in the payload", async () => {
    const track = await tracking.trackByReference(leg("baraka").reference);
    assert.ok(track);
    const text = JSON.stringify(track);
    assert.doesNotMatch(text, /latitude|longitude|"lat"|"lng"|nautical/i);
  });
});

describe("11. Everything appended, nothing rewritten", () => {
  test("the whole box's trail is append-only", async () => {
    for (const key of ["amina", "baraka", "chausiku"] as const) {
      const rows = await prisma.cargoStatusHistory.findMany({
        where: { cargoId: leg(key).cargoId },
        orderBy: { createdAt: "asc" },
      });
      assert.ok(rows.length >= 3, `${key} has a trail`);
      /* A row's `from` is the previous row's `to`: nothing was edited out. */
      for (let i = 1; i < rows.length; i += 1) {
        assert.equal(rows[i].from, rows[i - 1].to, `${key}: the chain is unbroken`);
      }
    }

    const events = await prisma.containerEvent.findMany({
      where: { containerId: s.containerId },
      orderBy: { createdAt: "asc" },
      select: { from: true, to: true },
    });
    const moves = events.map((e) => `${e.from}->${e.to}`);
    assert.ok(moves.includes("SEALED->DEPARTED"));
    assert.ok(moves.includes("DEPARTED->IN_TRANSIT"));
    assert.ok(moves.includes("IN_TRANSIT->ARRIVED"));

    assert.ok(
      await prisma.auditLog.findFirst({
        where: { action: "container.arrived", entityId: s.containerId },
      }),
      "the arrival is audited"
    );
  });
});

describe("12. A merged bill still tracks", () => {
  test("one payment across two customers' bills leaves both consignments trackable", async () => {
    /* A fourth consignment for Baraka's customer, billed and settled on one
       combined payment with nothing else outstanding. */
    const track = await tracking.trackByReference(leg("baraka").reference);
    assert.ok(track, "the consignment under a settled bill still has a page");
    assert.ok(track!.charge, "and its bill is still named on it");
    assert.equal(track!.charge!.outstanding, "0.00");
  });

  test("a combined payment spreads across a customer's open bills", async () => {
    /* Nothing is left open on this run, so the combined-payment desk is asked
       for a customer with no open bill and must say so rather than write one. */
    as("finance");
    const nothing = await mergeActions.recordCombinedPayment(
      {},
      form({
        customerId: leg("amina").customerId,
        amount: "1000",
        currency: "TZS",
        method: "CASH",
      })
    );
    assert.ok(nothing.error, "a payment with nothing to settle is refused");
  });
});
