import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  A PRICE MAY BE CONFIRMED THE DAY THE BOXES ARE RECEIVED.

  Every press here names the consignments it is pressing. The button with
  nothing ticked confirms the whole China floor, which on a database several
  suites are committing to would bill their fixtures as well as ours — the
  action is the same one either way, and the rows it takes are the rows named.

  Finance prices from Foshan's measurement; waiting for a container, a sailing
  or a Dar check-in is a queue nobody is working. The same list, the same one
  press, the same rate book — the only thing that changes is that a consignment
  with no container on it appears the moment China measures it.

  The other half of the rule is that the money never holds the goods up: a
  consignment with no price loads, sails and lands exactly as one with a price
  does. Both halves are proved here against the real actions.
*/
requireScratchDatabase();

const uploadDir = path.join(os.tmpdir(), "bluewave-china-pricing-uploads");
mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;
process.env.BLOB_READ_WRITE_TOKEN = "";

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const financeConfig = load("@/lib/actions/finance-config") as typeof import("@/lib/actions/finance-config");
const customerActions = load("@/lib/actions/customers") as typeof import("@/lib/actions/customers");
const cargoActions = load("@/lib/actions/cargo") as typeof import("@/lib/actions/cargo");
const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const priceActions = load("@/lib/actions/price-list") as typeof import("@/lib/actions/price-list");
const priceList = load("@/lib/price-list") as typeof import("@/lib/price-list");

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
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR = desk === null ? null : desks[desk];
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
const CARGO_TYPE = `China Blender ${RUN}`;
const randomPhone = () => `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

const s = {
  /** Priced while it sat in Foshan. */
  early: { cargoId: "", reference: "", customerId: "" },
  /** Left unpriced on purpose, to prove the money never holds the boxes. */
  late: { cargoId: "", reference: "", customerId: "" },
  containerId: "",
};

const statusOf = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

const liveBills = (cargoId: string) =>
  prisma.invoice.count({
    where: { cargoId, status: { notIn: ["DRAFT", "CANCELLED"] } },
  });

/** The row this consignment has on the China floor's own price list. */
async function rowFor(cargoId: string) {
  const list = await priceList.priceListForChinaFloor();
  return list.rows.find((r) => r.cargoId === cargoId) ?? null;
}

let intakes = 0;

async function receive(key: "early" | "late", name: string) {
  as("support");
  const made = await customerActions.createCustomer(
    {},
    form({ fullName: `China Price ${name} ${RUN}`, phone: randomPhone(), city: "Dar es Salaam" })
  );
  assert.ok(made.ok, made.error);
  s[key].customerId = made.customerId!;

  as("china");
  const res = (await cargoActions.receiveNewCargo(
    {},
    form({
      customerId: s[key].customerId,
      /* One key per press, or the second intake is correctly refused as the
         same press twice — which is a different test's subject. */
      intakeKey: `china-price-${RUN}-${key}-${++intakes}`,
      unit: "CM",
      location: "Row CN",
      supplierName: `China Supplier ${RUN}`,
      itemDescription: ["Blender"],
      itemCargoType: [CARGO_TYPE],
      itemPackageType: ["CARTON"],
      itemQuantity: ["2"],
      itemLength: ["100"],
      itemWidth: ["50"],
      itemHeight: ["50"],
      itemWeightKg: ["30"],
      itemReceiptNo: [`CNP${RUN}${key.slice(0, 1).toUpperCase()}`],
      photos: photo(),
    })
  )) as { ok?: string; error?: string; id?: string };
  assert.ok(res.ok, res.error);

  const cargo = await prisma.cargo.findFirstOrThrow({
    where: { receiverId: s[key].customerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, reference: true, status: true },
  });
  s[key].cargoId = cargo.id;
  s[key].reference = cargo.reference;
  assert.equal(cargo.status, "RECEIVED_CHINA");
  as(null);
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

  as("finance");
  const rate = await financeConfig.createRate(
    {},
    form({
      service: "LCL",
      cargoType: CARGO_TYPE,
      basis: "PER_CBM",
      rate: "380",
      currency: "USD",
      published: "on",
    })
  );
  assert.ok(rate.ok, rate.error);
  as(null);

  await receive("early", "Honest");
  await receive("late", "John");
});

after(() => as(null));

describe("cargo received in China is waiting for a price, with the price already worked out", () => {
  test("it is on the China floor's list, and nowhere Dar is asked to look", async () => {
    const dar = await priceList.priceListWithoutContainer();
    assert.equal(
      dar.rows.some((r) => r.cargoId === s.early.cargoId),
      false,
      "a consignment in Foshan is not on the screen about arrived containers"
    );
  });

  test("it is on the list the moment Foshan measures it — no container, no check-in", async () => {
    const row = await rowFor(s.early.cargoId);
    assert.ok(row, `${s.early.reference} is not on the price list`);
    assert.equal(row.reference, s.early.reference);
    /* 2 cartons of 0.25 m³ at USD 380: the book's own figure, on the row,
       before anybody presses anything. */
    assert.equal(Number(row.cbm), 0.5);
    assert.equal(Number(row.rate), 380);
    assert.equal(Number(row.totalUsd), 190);
    assert.equal(row.blockedReason, null);
  });

  test("nothing is billed until somebody confirms it", async () => {
    assert.equal(await liveBills(s.early.cargoId), 0);
  });

  test("one press confirms it, and the bill is issued", async () => {
    as("finance");
    const done = await priceActions.confirmPrices({}, form({ scope: "china", cargoIds: [s.early.cargoId, s.late.cargoId] }));
    assert.ok(done.ok, done.error);
    as(null);

    const bills = await prisma.invoice.findMany({
      where: { cargoId: s.early.cargoId, status: { notIn: ["CANCELLED"] } },
      select: { id: true, status: true, total: true, fxRate: true },
    });
    assert.equal(bills.length, 1, "one bill, not one per press");
    assert.notEqual(bills[0].status, "DRAFT");
    assert.equal(Number(bills[0].total), 190);
    assert.ok(bills[0].fxRate, "the bill pinned the rate it was issued at");
  });

  test("pressing again bills nobody twice", async () => {
    as("finance");
    await priceActions.confirmPrices({}, form({ scope: "china", cargoIds: [s.early.cargoId, s.late.cargoId] }));
    await priceActions.confirmPrices({}, form({ scope: "china", cargoIds: [s.early.cargoId, s.late.cargoId] }));
    as(null);
    assert.equal(await liveBills(s.early.cargoId), 1);
  });

  test("once confirmed it leaves the list", async () => {
    assert.equal(await rowFor(s.early.cargoId), null);
  });
});

describe("the money never holds the boxes up", () => {
  test("an unpriced consignment loads, sails and lands like any other", async () => {
    /* Taken in after the press above, so nothing has been confirmed for it —
       which is the whole point of the walk that follows. */
    await receive("late", "John");

    as("china");
    const made = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    assert.ok(made.ok, made.error);
    s.containerId = made.id!;
    assert.ok(s.containerId);

    const loaded = await containerActions.loadCargo(
      {},
      form({ containerId: s.containerId, cargoIds: [s.late.cargoId] })
    );
    assert.ok(loaded.ok, loaded.error);

    const sealed = await containerActions.sealContainer(
      {},
      form({
        containerId: s.containerId,
        sealNumber: `CNP-${RUN}`,
        containerNumber: `TCNP${RUN.slice(-7)}`,
      })
    );
    assert.ok(sealed.ok, sealed.error);

    const departed = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "DEPARTED" })
    );
    assert.ok(departed.ok, departed.error);
    assert.equal(await statusOf(s.late.cargoId), "IN_TRANSIT");

    as("dar");
    const landed = await containerActions.advanceContainer(
      {},
      form({ containerId: s.containerId, to: "ARRIVED" })
    );
    assert.ok(landed.ok, landed.error);
    as(null);
    assert.equal(await statusOf(s.late.cargoId), "ARRIVED_TANZANIA");
  });

  test("and Finance confirms it later, from the same list and the same press", async () => {
    const onBox = await priceList
      .priceListForContainer(s.containerId)
      .then((l) => l.rows.some((r) => r.cargoId === s.late.cargoId));
    const loose = await rowFor(s.late.cargoId);
    assert.ok(onBox || loose, "it is still on a list Finance can press");

    as("finance");
    const done = await priceActions.confirmPrices({}, form({ containerId: s.containerId }));
    assert.ok(done.ok, done.error);
    as(null);
    assert.equal(await liveBills(s.late.cargoId), 1);
  });
});

describe("pricing is Finance's, wherever the boxes are", () => {
  test("the floor that measured the goods cannot price them", async () => {
    await receive("late", "Refused");
    as("china");
    /* Refused either way — thrown by the guard or returned as a sentence.
       What matters is that nothing was billed. */
    const tried = await priceActions
      .confirmPrices({}, form({ scope: "china", cargoIds: [s.early.cargoId, s.late.cargoId] }))
      .catch((error: unknown) => ({ error: String(error) }));
    assert.ok(!("ok" in tried && tried.ok), "the China floor was refused");
    as(null);
    assert.equal(await liveBills(s.late.cargoId), 0);
  });

  test("the manager and the owner may", async () => {
    for (const desk of ["manager", "admin"]) {
      as(desk);
      const done = await priceActions.confirmPrices({}, form({ scope: "china", cargoIds: [s.early.cargoId, s.late.cargoId] }));
      assert.ok(done.ok || done.error, `${desk} reached the action`);
      as(null);
    }
    assert.equal(await liveBills(s.late.cargoId), 1, "and it is billed once");
  });
});
