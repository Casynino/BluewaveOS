import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  TWO EVENTS, NEVER ONE PRESS: ARRIVAL, THEN VERIFICATION.

  The owner's rule, driven through the real server actions as the real desks.
  Pressing "Arrived" lands the box and everything on it — the storage clock
  starts, each customer is told once — and it never waits for anybody to scan
  anything. What Dar does afterwards is a SEPARATE answer about the same
  consignment: pending, verified, missing, damaged, issue.

  What is pinned here is mostly what must NOT happen: arrival is not blocked by
  an unscanned box, a second press changes nothing, a consignment nobody could
  find is not deleted and cannot be released, and the box's own totals come
  down when goods are not in it — and back up when they are found.

  Nothing is rolled back. Run it only against a throwaway database.
*/
requireScratchDatabase();

const uploadDir = path.join(os.tmpdir(), "bluewave-arrival-verification-uploads");
mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
process.env.BLOB_READ_WRITE_TOKEN = "";

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const customerActions = load("@/lib/actions/customers") as typeof import("@/lib/actions/customers");
const cargoActions = load("@/lib/actions/cargo") as typeof import("@/lib/actions/cargo");
const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const darActions = load("@/lib/actions/dar") as typeof import("@/lib/actions/dar");
const boxActions = load("@/lib/actions/boxes") as typeof import("@/lib/actions/boxes");
const releaseLib = load("@/lib/release") as typeof import("@/lib/release");
const verification = load("@/lib/verification") as typeof import("@/lib/verification");
const value = load("@/lib/container-value") as typeof import("@/lib/container-value");
const closeActions = load("@/lib/actions/close-container") as typeof import("@/lib/actions/close-container");
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

function as(desk: string | null) {
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR =
    desk === null ? null : desks[desk];
}

function form(fields: Record<string, string | string[] | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value as string | Blob);
  }
  return data;
}

/* A real 1×1 PNG: the upload check reads the file's own bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const photo = () => new File([PNG], "damage.png", { type: "image/png" });

const RUN = Date.now().toString(36).toUpperCase();
const randomPhone = () =>
  `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

/** Three consignments on one box: one clean, one damaged, one never found. */
const s = {
  containerId: "",
  containerRef: "",
  darWarehouseId: "",
  clean: { cargoId: "", customerId: "", tokens: [] as string[], qrToken: "" },
  damaged: { cargoId: "", customerId: "", tokens: [] as string[], qrToken: "" },
  gone: { cargoId: "", customerId: "", tokens: [] as string[], qrToken: "" },
  /* The second sailing, the one the close tests shut. */
  close: { containerId: "", cargoIds: [] as string[], landedId: "", openId: "" },
};

const cargoStatus = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } }))
    .status;

/** What lib/verification.ts says about a consignment, read from the database. */
async function verificationOf(cargoId: string) {
  const cargo = await prisma.cargo.findUniqueOrThrow({
    where: { id: cargoId },
    select: {
      status: true,
      darReceiving: {
        select: { verified: true, discrepancy: true, condition: true },
      },
      exceptions: {
        where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
        select: { id: true },
      },
    },
  });
  return verification.verificationOf({
    status: cargo.status,
    darReceiving: cargo.darReceiving,
    openCases: cargo.exceptions.length,
  });
}

/** The container's summary, counted the way every screen counts it. */
async function summaryOf(containerId: string) {
  const lines = await prisma.containerCargo.findMany({
    where: { containerId },
    select: {
      cargo: {
        select: {
          status: true,
          darReceiving: {
            select: { verified: true, discrepancy: true, condition: true },
          },
          exceptions: {
            where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
            select: { id: true },
          },
        },
      },
    },
  });
  return verification.verificationSummary(
    lines.map((l) => ({
      status: l.cargo.status,
      darReceiving: l.cargo.darReceiving,
      openCases: l.cargo.exceptions.length,
    }))
  );
}

/** The box's own arithmetic: what is actually in it. */
async function boxTotals(containerId: string) {
  const lines = await prisma.containerCargo.findMany({
    where: { containerId },
    select: {
      cbm: true,
      packagesCount: true,
      weightKg: true,
      cargo: { select: { status: true, reference: true } },
    },
  });
  const present = lines.filter((l) =>
    verification.countsInContainer({ status: l.cargo.status })
  );
  return {
    listed: lines.length,
    references: lines.map((l) => l.cargo.reference),
    consignments: present.length,
    packages: present.reduce((sum, l) => sum + l.packagesCount, 0),
    cbm: present.reduce((sum, l) => sum + Number(l.cbm), 0),
    weightKg: present.reduce((sum, l) => sum + Number(l.weightKg ?? 0), 0),
  };
}


/**
 * A container of N consignments, taken in at Foshan, sealed and sailed.
 *
 * The same road every real box takes, so what the close tests act on is a
 * manifest that was actually loaded rather than rows written straight into the
 * database.
 */
async function sailedBox(tag: string, count: number) {
  as("support");
  const cargoIds: string[] = [];
  const customerIds: string[] = [];
  for (let n = 0; n < count; n += 1) {
    const made = await customerActions.createCustomer(
      {},
      form({ fullName: `AV ${tag}${n} ${RUN}`, phone: randomPhone() })
    );
    assert.ok(made.ok, made.error);
    customerIds.push(made.customerId!);
  }

  as("china");
  for (let n = 0; n < count; n += 1) {
    const res = (await cargoActions.receiveNewCargo(
      {},
      form({
        customerId: customerIds[n],
        intakeKey: `av-${RUN}-${tag}-${n}`,
        unit: "CM",
        location: "Row AV",
        itemDescription: ["Plastic chairs"],
        itemPackageType: ["CARTON"],
        itemQuantity: ["2"],
        itemLength: ["100"],
        itemWidth: ["100"],
        itemHeight: ["50"],
        itemWeightKg: ["50"],
        itemReceiptNo: [`AV${RUN}${tag}${n}`],
        photos: photo(),
      })
    )) as { ok?: string; error?: string; id?: string };
    assert.ok(res.ok, res.error);
    cargoIds.push(res.id!);
  }

  const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
  assert.ok(opened.ok, opened.error);
  const containerId = opened.id!;
  const loaded = await containerActions.loadCargo(
    {},
    form({ containerId, cargoIds })
  );
  assert.ok(loaded.ok, loaded.error);
  const sealed = await containerActions.sealContainer(
    {},
    form({ containerId, sealNumber: `SEAL-${tag}-${RUN}` })
  );
  assert.ok(sealed.ok, sealed.error);
  const departed = await containerActions.advanceContainer(
    {},
    form({ containerId, to: "DEPARTED" })
  );
  assert.ok(departed.ok, departed.error);
  return { containerId, cargoIds, customerIds };
}

async function land(containerId: string) {
  as("dar");
  const arrived = await containerActions.advanceContainer(
    {},
    form({ containerId, to: "ARRIVED" })
  );
  assert.ok(arrived.ok, arrived.error);
}

before(async () => {
  for (const [desk, email] of Object.entries({
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
  s.darWarehouseId = (
    await prisma.warehouse.findUniqueOrThrow({ where: { code: "DAR" } })
  ).id;
});

after(() => as(null));

describe("arrival and Dar verification are two different events", () => {
  test("1. Foshan takes three consignments in and sails them", async () => {
    as("support");
    for (const key of ["clean", "damaged", "gone"] as const) {
      const made = await customerActions.createCustomer(
        {},
        form({ fullName: `AV ${key} ${RUN}`, phone: randomPhone() })
      );
      assert.ok(made.ok, made.error);
      s[key].customerId = made.customerId!;
    }

    as("china");
    for (const key of ["clean", "damaged", "gone"] as const) {
      const res = (await cargoActions.receiveNewCargo(
        {},
        form({
          customerId: s[key].customerId,
          intakeKey: `av-${RUN}-${key}`,
          unit: "CM",
          location: "Row AV",
          itemDescription: ["Plastic chairs"],
          itemPackageType: ["CARTON"],
          itemQuantity: ["2"],
          itemLength: ["100"],
          itemWidth: ["100"],
          itemHeight: ["50"],
          itemWeightKg: ["50"],
          itemReceiptNo: [`AV${RUN}${key.toUpperCase()}`],
          photos: photo(),
        })
      )) as { ok?: string; error?: string; id?: string };
      assert.ok(res.ok, res.error);
      s[key].cargoId = res.id!;
      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: res.id! },
        include: { boxes: true },
      });
      s[key].qrToken = cargo.qrToken;
      s[key].tokens = cargo.boxes.filter((b) => !b.voidedAt).map((b) => b.qrToken);
      assert.equal(s[key].tokens.length, 2, "one box row per carton");
    }

    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(opened.ok, opened.error);
    s.containerId = opened.id!;
    s.containerRef = (
      await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } })
    ).reference;

    const loaded = await containerActions.loadCargo(
      {},
      form({
        containerId: s.containerId,
        cargoIds: [s.clean.cargoId, s.damaged.cargoId, s.gone.cargoId],
      })
    );
    assert.ok(loaded.ok, loaded.error);

    const sealed = await containerActions.sealContainer(
      {},
      form({ containerId: s.containerId, sealNumber: `SEAL-AV-${RUN}` })
    );
    assert.ok(sealed.ok, sealed.error);

    const departed = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "DEPARTED" })
    );
    assert.ok(departed.ok, departed.error);
    assert.equal(await cargoStatus(s.clean.cargoId), "IN_TRANSIT");
  });

  test("2. Arrival is one press, and it does not wait for a single scan", async () => {
    /* Nothing has been scanned off this box — that is the point. */
    assert.equal(
      await prisma.cargoBox.count({
        where: { darContainerId: s.containerId, darReceivedAt: { not: null } },
      }),
      0,
      "no box has been scanned yet"
    );

    as("dar");
    const arrived = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "ARRIVED" })
    );
    assert.ok(arrived.ok, arrived.error);

    const box = await prisma.container.findUniqueOrThrow({
      where: { id: s.containerId },
    });
    assert.equal(box.status, "ARRIVED");

    for (const key of ["clean", "damaged", "gone"] as const) {
      const cargo = await prisma.cargo.findUniqueOrThrow({
        where: { id: s[key].cargoId },
        select: { status: true, darArrivedAt: true },
      });
      assert.equal(cargo.status, "ARRIVED_TANZANIA", `${key} is in Dar`);
      assert.ok(cargo.darArrivedAt, `${key} has its storage day`);
      assert.equal(
        await prisma.notification.count({
          where: { customerId: s[key].customerId, kind: "CARGO_ARRIVED_DAR" },
        }),
        1,
        `${key}'s customer is told once`
      );
      /* Arrived, and nobody has verified anything: the second answer is its
         own answer, and "pending" is an answer. */
      assert.equal(await verificationOf(s[key].cargoId), "PENDING");
    }

    const summary = await summaryOf(s.containerId);
    assert.deepEqual(summary, {
      expected: 3,
      checkedIn: 0,
      pending: 3,
      verified: 0,
      missing: 0,
      damaged: 0,
      issue: 0,
    });
  });

  test("3. Pressing Arrived again is refused, and changes nothing at all", async () => {
    const before = await prisma.cargo.findMany({
      where: { containerLines: { some: { containerId: s.containerId } } },
      select: { id: true, status: true, darArrivedAt: true },
      orderBy: { id: "asc" },
    });
    const toldBefore = await prisma.notification.count({
      where: { kind: "CARGO_ARRIVED_DAR", customerId: { in: [s.clean.customerId, s.damaged.customerId, s.gone.customerId] } },
    });
    const historyBefore = await prisma.cargoStatusHistory.count({
      where: { cargoId: { in: before.map((c) => c.id) } },
    });

    /* Support and Finance hold container.arrive too: they get past the
       permission check and are refused only because the step has been taken. */
    for (const desk of ["dar", "support", "finance"]) {
      as(desk);
      const again = await containerActions.advanceContainer(
        {},
        form({ containerId: s.containerId, to: "ARRIVED" })
      );
      assert.ok(again.error, `${desk}: a second arrival is refused`);
      assert.doesNotMatch(again.error!, /cannot record an arrival/);
      assert.match(again.error!, /does not follow/);
    }

    const after = await prisma.cargo.findMany({
      where: { containerLines: { some: { containerId: s.containerId } } },
      select: { id: true, status: true, darArrivedAt: true },
      orderBy: { id: "asc" },
    });
    assert.deepEqual(
      after.map((c) => [c.id, c.status, c.darArrivedAt?.toISOString()]),
      before.map((c) => [c.id, c.status, c.darArrivedAt?.toISOString()]),
      "the storage day and every status stand untouched"
    );
    assert.equal(
      await prisma.notification.count({
        where: { kind: "CARGO_ARRIVED_DAR", customerId: { in: [s.clean.customerId, s.damaged.customerId, s.gone.customerId] } },
      }),
      toldBefore,
      "nobody is told twice"
    );
    assert.equal(
      await prisma.cargoStatusHistory.count({
        where: { cargoId: { in: before.map((c) => c.id) } },
      }),
      historyBefore,
      "and the history gains nothing"
    );
  });

  test("4. Dar scans and checks one in: pending becomes verified, and a rescan duplicates nothing", async () => {
    as("dar");
    for (const token of s.clean.tokens) {
      const scan = await boxActions.scanBoxAtDar(
        {},
        form({ containerId: s.containerId, code: qr.qrPayload(token) })
      );
      assert.ok(scan.ok, scan.error ?? scan.warning);
    }
    const scanned = await prisma.cargoBox.findMany({
      where: { cargoId: s.clean.cargoId },
      select: { id: true, darReceivedAt: true },
      orderBy: { sequence: "asc" },
    });
    assert.equal(scanned.filter((b) => b.darReceivedAt).length, 2);

    /* The same sticker again: answered, written to the scan history, and the
       box keeps the time of the first scan. */
    const scanEventsBefore = await prisma.scanEvent.count({
      where: { cargoId: s.clean.cargoId },
    });
    const twice = await boxActions.scanBoxAtDar(
      {},
      form({ containerId: s.containerId, code: qr.qrPayload(s.clean.tokens[0]) })
    );
    assert.ok(twice.warning, "a second scan says so");
    assert.match(twice.warning!, /already received/i);
    const rescanned = await prisma.cargoBox.findMany({
      where: { cargoId: s.clean.cargoId },
      select: { id: true, darReceivedAt: true },
      orderBy: { sequence: "asc" },
    });
    assert.deepEqual(
      rescanned.map((b) => b.darReceivedAt?.toISOString()),
      scanned.map((b) => b.darReceivedAt?.toISOString()),
      "the first scan's time stands"
    );
    assert.equal(
      await prisma.scanEvent.count({ where: { cargoId: s.clean.cargoId } }),
      scanEventsBefore + 1,
      "the refused scan is still recorded"
    );

    const accepted = await darActions.acceptAsExpected(
      {},
      form({ cargoId: s.clean.cargoId })
    );
    assert.ok(accepted.ok, accepted.error);
    assert.equal(await cargoStatus(s.clean.cargoId), "RECEIVED_DAR");
    assert.equal(await verificationOf(s.clean.cargoId), "VERIFIED");

    /* Checking in does not move the day the container landed. */
    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.clean.cargoId },
      select: { darArrivedAt: true, darReceiving: { select: { receivedAt: true } } },
    });
    assert.ok(cargo.darArrivedAt);
    assert.ok(cargo.darReceiving);
  });

  test("5. Dar corrects every physical figure on the bench, and a second count is a correction", async () => {
    as("dar");
    const first = await darActions.receiveInDar(
      {},
      form({
        cargoId: s.damaged.cargoId,
        warehouseId: s.darWarehouseId,
        packagesCount: "2",
        piecesCount: "20",
        weightKg: "51.5",
        cbm: "0.980",
        condition: "GOOD",
        location: "Bay AV",
        notes: "Counted off the lorry",
      })
    );
    assert.ok(first.ok, first.error);

    const counted = await prisma.darReceiving.findUniqueOrThrow({
      where: { cargoId: s.damaged.cargoId },
    });
    assert.equal(counted.packagesCount, 2);
    assert.equal(counted.piecesCount, 20);
    assert.equal(counted.weightKg?.toString(), "51.5");
    assert.equal(counted.cbm?.toString(), "0.98");
    assert.equal(counted.location, "Bay AV");
    assert.equal(counted.containerId, s.containerId);
    /* China measured its own and keeps it: two rows, never one. */
    const china = await prisma.chinaReceiving.findUniqueOrThrow({
      where: { cargoId: s.damaged.cargoId },
    });
    assert.equal(china.weightKg?.toString(), "50", "China's weight is untouched");

    /* A re-count writes the old figure down before it moves. */
    const second = await darActions.receiveInDar(
      {},
      form({
        cargoId: s.damaged.cargoId,
        warehouseId: s.darWarehouseId,
        packagesCount: "2",
        piecesCount: "20",
        weightKg: "52",
        cbm: "0.980",
        condition: "GOOD",
        discrepancyNotes: "Re-weighed on the platform scale",
      })
    );
    assert.ok(second.ok, second.error);
    const moved = await prisma.fieldChange.findFirst({
      where: { entityId: counted.id, field: "weightKg" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(moved, "the weight that moved is written down");
    assert.equal(moved.oldValue, "51.5");
    assert.equal(
      (
        await prisma.darReceiving.findUniqueOrThrow({
          where: { cargoId: s.damaged.cargoId },
        })
      ).weightKg?.toString(),
      "52"
    );
    assert.equal(
      await prisma.darReceiving.count({ where: { cargoId: s.damaged.cargoId } }),
      1,
      "a second check-in corrects the row, it does not add one"
    );
  });

  test("6. Damage is tagged with its condition, its note and its photograph", async () => {
    as("dar");
    const refused = await darActions.reportDamageAtDar(
      {},
      form({
        cargoId: s.damaged.cargoId,
        condition: "WET",
        note: "Two cartons soaked along the bottom seam",
      })
    );
    assert.match(refused.error ?? "", /photograph/i, "a claim without a picture is refused");

    const tagged = await darActions.reportDamageAtDar(
      {},
      form({
        cargoId: s.damaged.cargoId,
        condition: "WET",
        note: "Two cartons soaked along the bottom seam",
        photos: photo(),
      })
    );
    assert.ok(tagged.ok, tagged.error);

    const row = await prisma.darReceiving.findUniqueOrThrow({
      where: { cargoId: s.damaged.cargoId },
    });
    assert.equal(row.condition, "WET");
    assert.match(row.discrepancyNotes ?? "", /soaked/);
    assert.equal(row.verified, false, "a clean signature cannot stand over a damage tag");
    assert.ok(
      (await prisma.cargoPhoto.count({
        where: { cargoId: s.damaged.cargoId, kind: "DAMAGE" },
      })) > 0,
      "the photograph is filed on the consignment"
    );
    const kase = await prisma.exceptionCase.findFirstOrThrow({
      where: { cargoId: s.damaged.cargoId, type: "DAMAGED_CARGO" },
    });
    assert.ok(Array.isArray(kase.evidence) && (kase.evidence as string[]).length > 0);
    assert.equal(await verificationOf(s.damaged.cargoId), "DAMAGED");
    /* Damaged goods are here: the operational fact is still "received". */
    assert.equal(await cargoStatus(s.damaged.cargoId), "RECEIVED_DAR");
  });

  test("7. Missing keeps its row, its code and its history — and takes its goods out of the box's totals", async () => {
    const full = await boxTotals(s.containerId);
    assert.equal(full.consignments, 3);
    const historyBefore = await prisma.cargoStatusHistory.count({
      where: { cargoId: s.gone.cargoId },
    });

    as("dar");
    const reported = await darActions.reportMissingAtDar(
      {},
      form({
        cargoId: s.gone.cargoId,
        note: "Not on the floor when the box was emptied",
      })
    );
    assert.ok(reported.ok, reported.error);
    assert.equal(await cargoStatus(s.gone.cargoId), "MISSING_AT_DAR");
    assert.equal(await verificationOf(s.gone.cargoId), "MISSING");

    const kase = await prisma.exceptionCase.findFirstOrThrow({
      where: { cargoId: s.gone.cargoId, type: "MISSING_CARGO" },
    });
    assert.ok(["OPEN", "IN_PROGRESS"].includes(kase.status));

    /* NOTHING IS DELETED. The record, its code and its history stand. */
    const cargo = await prisma.cargo.findUniqueOrThrow({
      where: { id: s.gone.cargoId },
      select: { deletedAt: true, qrToken: true },
    });
    assert.equal(cargo.deletedAt, null);
    assert.equal(cargo.qrToken, s.gone.qrToken, "the QR on the label still names it");
    assert.ok(
      (await prisma.cargoStatusHistory.count({ where: { cargoId: s.gone.cargoId } })) >
        historyBefore,
      "the history is appended to, never rewritten"
    );
    assert.equal(
      (await prisma.cargoBox.count({ where: { cargoId: s.gone.cargoId, voidedAt: null } })),
      2,
      "its boxes keep their labels"
    );

    /* STILL ON THE CONTAINER'S LIST, AND OUT OF ITS ARITHMETIC. */
    const short = await boxTotals(s.containerId);
    assert.equal(short.listed, 3, "the row stays on the manifest");
    assert.ok(
      short.references.includes(
        (await prisma.cargo.findUniqueOrThrow({ where: { id: s.gone.cargoId } })).reference
      ),
      "and is still named on it"
    );
    assert.equal(short.consignments, 2, "the box holds two");
    assert.equal(short.packages, full.packages - 2);
    assert.ok(short.cbm < full.cbm, "its volume comes off the box");
    assert.ok(short.weightKg < full.weightKg, "and so does its weight");

    const summary = await summaryOf(s.containerId);
    assert.equal(summary.expected, 3, "the summary still expects it");
    assert.equal(summary.missing, 1);
    assert.equal(summary.verified, 1);
    assert.equal(summary.damaged, 1);
    assert.equal(summary.pending, 0);
    assert.equal(summary.checkedIn, 2);
  });

  test("8. Missing goods are not the sailing's money, and a bill already out still is", async () => {
    /* The rule the container page prices with. A draft is Finance's working
       and never counted for goods nobody can find; an issued bill is in a
       customer's hands and stays until Finance cancels or credits it. */
    assert.equal(
      value.expectedRevenueOf([
        { missing: false, billed: 0, issued: false, draftTotal: 400 },
        { missing: true, billed: 0, issued: false, draftTotal: 400 },
      ]),
      400,
      "the missing consignment's draft is not expected revenue"
    );
    assert.equal(
      value.expectedRevenueOf([
        { missing: true, billed: 250, issued: true, draftTotal: 400 },
      ]),
      250,
      "a bill already issued stands at its issued figure"
    );
  });

  test("9. Release refuses missing goods, and refuses an open case", async () => {
    const gone = await releaseLib.releaseCheckFor(s.gone.cargoId);
    assert.ok(gone);
    assert.equal(gone.ok, false);
    const missingCondition = gone.conditions.find((c) =>
      /missing or cancelled/i.test(c.label)
    );
    assert.ok(missingCondition && !missingCondition.passed, "named, not merely refused");
    assert.match(gone.blockedBy ?? "", /missing/i);

    const damaged = await releaseLib.releaseCheckFor(s.damaged.cargoId);
    assert.ok(damaged);
    assert.equal(damaged.ok, false, "an open case holds the damaged one");
    const openCase = damaged.conditions.find((c) => /open case/i.test(c.label));
    assert.ok(openCase && !openCase.passed);
  });

  test("10. Found after all: it is counted in, and the box's totals come back up", async () => {
    const short = await boxTotals(s.containerId);

    as("dar");
    const found = await darActions.receiveInDar(
      {},
      form({
        cargoId: s.gone.cargoId,
        warehouseId: s.darWarehouseId,
        packagesCount: "2",
        cbm: "1",
        weightKg: "50",
        condition: "GOOD",
        notes: "Found behind the other pallets",
      })
    );
    assert.ok(found.ok, found.error);
    assert.equal(await cargoStatus(s.gone.cargoId), "RECEIVED_DAR");

    const back = await boxTotals(s.containerId);
    assert.equal(back.consignments, short.consignments + 1);
    assert.equal(back.packages, short.packages + 2);
    assert.ok(back.cbm > short.cbm, "its volume is back in the box");

    const summary = await summaryOf(s.containerId);
    assert.equal(summary.missing, 0, "nothing is missing any more");
    assert.equal(summary.expected, 3);
    assert.equal(summary.checkedIn, 3);
    /* Its case is still open, so it reads as an issue rather than verified —
       and release still refuses it until somebody resolves that case. */
    assert.equal(await verificationOf(s.gone.cargoId), "ISSUE");
    const check = await releaseLib.releaseCheckFor(s.gone.cargoId);
    assert.equal(check?.ok, false);
  });
  test("11. A box with everything accounted for closes in one press", async () => {
    as("finance");
    const closed = await closeActions.closeContainer(
      {},
      form({ containerId: s.containerId })
    );
    assert.ok(closed.ok, closed.error);
    assert.equal(
      (await prisma.container.findUniqueOrThrow({ where: { id: s.containerId } }))
        .status,
      "CLOSED"
    );
    /* The missing one was found and checked in; the damaged one's case is
       still open, and an open case has never held a sailing shut. */
    const again = await closeActions.closeContainer(
      {},
      form({ containerId: s.containerId })
    );
    assert.match(again.ok ?? "", /already closed/);
  });

  test("12. A second sailing, and two boxes to move cargo onto", async () => {
    const box = await sailedBox("CLOSE", 3);
    s.close.containerId = box.containerId;
    s.close.cargoIds = box.cargoIds;
    await land(box.containerId);

    /* One landed box to move a consignment onto, and one still open in
       Foshan — the two ends of the storage-clock rule. */
    const landedBox = await sailedBox("DEST", 1);
    s.close.landedId = landedBox.containerId;
    await land(landedBox.containerId);

    as("china");
    const open = await containerActions.createContainer({}, form({ type: "GP_20" }));
    assert.ok(open.ok, open.error);
    s.close.openId = open.id!;

    /* One of the three is checked in properly, so the close has two to ask
       about rather than three. */
    as("dar");
    const accepted = await darActions.acceptAsExpected(
      {},
      form({ cargoId: box.cargoIds[0] })
    );
    assert.ok(accepted.ok, accepted.error);
  });

  test("13. Closing is Finance's, the manager's and the owner's — and 'leave it' closes nothing", async () => {
    const before = await prisma.container.findUniqueOrThrow({
      where: { id: s.close.containerId },
      select: { status: true },
    });

    for (const desk of ["dar", "support", "china"]) {
      as(desk);
      const refused = await closeActions.closeContainer(
        {},
        form({ containerId: s.close.containerId })
      );
      assert.ok(refused.error, `${desk} cannot close a sailing`);
      assert.match(refused.error!, /Finance's, the manager's and the owner's/);
    }

    /* The way out: answer "leave it" and the box stays exactly as it was. */
    as("manager");
    const left = await closeActions.closeContainer(
      {},
      form({
        containerId: s.close.containerId,
        reason: "Checking with the floor first",
        [`outcome:${s.close.cargoIds[1]}`]: "leave",
        [`outcome:${s.close.cargoIds[2]}`]: "missing",
      })
    );
    assert.ok(left.error, "one unanswered row stops the close");
    assert.match(left.error!, /stays open/);

    assert.equal(
      (
        await prisma.container.findUniqueOrThrow({
          where: { id: s.close.containerId },
        })
      ).status,
      before.status,
      "the box is untouched"
    );
    /* And neither consignment moved: nothing happens until every row is
       answered. */
    for (const id of [s.close.cargoIds[1], s.close.cargoIds[2]]) {
      assert.equal(await cargoStatus(id), "ARRIVED_TANZANIA");
      assert.equal(
        await prisma.exceptionCase.count({ where: { cargoId: id } }),
        0,
        "no case is opened by a close that did not happen"
      );
    }
  });

  test("14. Closing asks about what is left: one moves, one is reported missing", async () => {
    const moving = s.close.cargoIds[1];
    const gone = s.close.cargoIds[2];
    const wasOnBox = await prisma.containerCargo.findFirstOrThrow({
      where: { containerId: s.close.containerId, cargoId: moving },
      select: { packagesCount: true, cbm: true, weightKg: true },
    });
    const before = await prisma.cargo.findUniqueOrThrow({
      where: { id: moving },
      select: {
        reference: true,
        qrToken: true,
        darArrivedAt: true,
        _count: { select: { photos: true, history: true } },
      },
    });
    const destinationList = await prisma.packingList.findUnique({
      where: { containerId: s.close.landedId },
      select: { number: true, issuedAt: true },
    });

    as("manager");
    const closed = await closeActions.closeContainer(
      {},
      form({
        containerId: s.close.containerId,
        reason: "Sailing finished with; the floor has answered for the rest",
        [`outcome:${moving}`]: `move:${s.close.landedId}`,
        [`outcome:${gone}`]: "missing",
      })
    );
    assert.ok(closed.ok, closed.error);
    assert.equal(
      (
        await prisma.container.findUniqueOrThrow({
          where: { id: s.close.containerId },
        })
      ).status,
      "CLOSED"
    );

    /* THE MOVED CONSIGNMENT IS THE SAME CONSIGNMENT. */
    const after = await prisma.cargo.findUniqueOrThrow({
      where: { id: moving },
      select: {
        reference: true,
        qrToken: true,
        status: true,
        darArrivedAt: true,
        _count: { select: { photos: true, history: true } },
        containerLines: { select: { containerId: true, packagesCount: true, cbm: true, weightKg: true } },
      },
    });
    assert.equal(after.reference, before.reference, "same reference");
    assert.equal(after.qrToken, before.qrToken, "same code on the label");
    assert.equal(after._count.photos, before._count.photos, "its photographs stand");
    assert.ok(
      after._count.history >= before._count.history,
      "its history is appended to, never replaced"
    );
    assert.equal(after.containerLines.length, 1, "on exactly one box");
    assert.equal(after.containerLines[0].containerId, s.close.landedId);
    assert.equal(after.containerLines[0].packagesCount, wasOnBox.packagesCount);
    assert.equal(
      Number(after.containerLines[0].cbm),
      Number(wasOnBox.cbm),
      "its volume moved with it"
    );
    /* Onto a box that has landed: it arrived when that box did. */
    assert.ok(after.darArrivedAt, "the storage clock runs on the box it is on");
    const landed = await prisma.shipment.findFirstOrThrow({
      where: { containerId: s.close.landedId },
      select: { actualArrival: true },
    });
    assert.equal(
      after.darArrivedAt?.toISOString().slice(0, 10),
      landed.actualArrival?.toISOString().slice(0, 10),
      "and it is that box's arrival day"
    );

    /* The frozen packing list of the box it joined is not rewritten — it is
       what Foshan sealed. The case beside it says how the bale got there. */
    const listNow = await prisma.packingList.findUnique({
      where: { containerId: s.close.landedId },
      select: { number: true, issuedAt: true },
    });
    assert.equal(
      listNow?.number,
      destinationList?.number,
      "the sheet keeps its number"
    );
    assert.ok(
      await prisma.exceptionCase.findFirst({
        where: { cargoId: moving, containerId: s.close.landedId },
      }),
      "a case names the correction"
    );

    /* THE ONE THAT NEVER CAME OFF stays listed on the closed box. */
    assert.equal(await cargoStatus(gone), "MISSING_AT_DAR");
    assert.equal(await verificationOf(gone), "MISSING");
    const stillListed = await prisma.containerCargo.findFirst({
      where: { containerId: s.close.containerId, cargoId: gone },
    });
    assert.ok(stillListed, "the row stays on the manifest");
    const totals = await boxTotals(s.close.containerId);
    assert.equal(totals.listed, 2, "the moved one left, the missing one did not");
    assert.equal(totals.consignments, 1, "only the checked-in one counts");
    const check = await releaseLib.releaseCheckFor(gone);
    assert.equal(check?.ok, false, "and it can never be released");

    /* The decisions are on the record beside the close itself. */
    assert.ok(
      await prisma.auditLog.findFirst({
        where: {
          entityId: s.close.containerId,
          action: "container.close.decisions",
        },
      }),
      "who decided what, at the moment the box was shut"
    );
  });

  test("15. Moved onto a box that has not sailed, the storage clock stops", async () => {
    const box = await sailedBox("STOP", 1);
    await land(box.containerId);
    const cargoId = box.cargoIds[0];
    assert.ok(
      (await prisma.cargo.findUniqueOrThrow({ where: { id: cargoId } }))
        .darArrivedAt,
      "it arrived with its box"
    );

    as("manager");
    const closed = await closeActions.closeContainer(
      {},
      form({
        containerId: box.containerId,
        reason: "It was never in this box; it is loading in Foshan",
        [`outcome:${cargoId}`]: `move:${s.close.openId}`,
      })
    );
    assert.ok(closed.ok, closed.error);

    const after = await prisma.cargo.findUniqueOrThrow({
      where: { id: cargoId },
      select: { status: true, darArrivedAt: true, containerLines: { select: { containerId: true } } },
    });
    assert.equal(after.containerLines.length, 1);
    assert.equal(after.containerLines[0].containerId, s.close.openId);
    /* Not in Dar at all, so no storage is running against it. */
    assert.equal(after.darArrivedAt, null, "the clock stops when it leaves Dar");
    assert.equal(after.status, "ASSIGNED_TO_CONTAINER", "cargo in China again");
    assert.equal(
      (await prisma.container.findUniqueOrThrow({ where: { id: box.containerId } }))
        .status,
      "CLOSED"
    );
  });
});
