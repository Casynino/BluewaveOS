import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  CORRECTING WHAT IS INSIDE A BOX THAT HAS ALREADY SAILED.

  Loading stops at the seal and the landed amendments start at the port, so the
  stretch in between — sealed, departed, at sea — had nothing at all, and a
  consignment found inside a container on the water could not be recorded until
  it landed. Every step here is the server action the edit page calls, run as
  the desk that presses it, with the permission check from lib/rbac.ts.

  Committed, not rolled back, like the lifecycle run: the records stay in the
  test database so a failure can be read afterwards.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const rbac = load("@/lib/rbac") as typeof import("@/lib/rbac");
const constants = load("@/lib/constants") as typeof import("@/lib/constants");

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

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value);
  }
  return data;
}

const RUN = Date.now().toString(36).toUpperCase();
let seq = 0;

/**
 * A consignment on the Foshan floor, with one measured line.
 *
 * Written straight to the database rather than through the counter: what is
 * being tested is the container, and the intake form has its own file.
 */
async function aConsignment(cbm: number, quantity = 2) {
  seq += 1;
  const stamp = `AM${RUN}${seq}`;
  const customer = await prisma.customer.create({
    data: {
      code: `C${stamp}`,
      fullName: `Amend ${stamp}`,
      phone: `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`,
    },
  });
  const cargo = await prisma.cargo.create({
    data: {
      reference: stamp,
      qrToken: `BWQ${stamp}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Plastic chairs",
      status: "RECEIVED_CHINA",
    },
  });
  await prisma.cargoPackage.create({
    data: {
      cargoId: cargo.id,
      reference: `${stamp}-P1`,
      quantity,
      cbm: new Prisma.Decimal(cbm),
      weightKg: new Prisma.Decimal(40),
    },
  });
  return cargo;
}

/** A sealed box with `first` inside it, ready to be corrected. */
async function aSealedBox(first: { id: string }) {
  as("china");
  const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
  assert.ok(opened.ok, opened.error);
  const containerId = opened.id!;
  const loaded = await containerActions.loadCargo(
    {},
    form({ containerId, cargoIds: [first.id] })
  );
  assert.ok(loaded.ok, loaded.error);
  const sealed = await containerActions.sealContainer(
    {},
    form({ containerId, sealNumber: `SEAL-${RUN}-${seq}` })
  );
  assert.ok(sealed.ok, sealed.error);
  return containerId;
}

const statusOf = async (id: string) =>
  (await prisma.cargo.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

const historyOf = async (id: string) =>
  (
    await prisma.cargoStatusHistory.findMany({
      where: { cargoId: id },
      orderBy: { createdAt: "asc" },
      select: { to: true },
    })
  ).map((h) => h.to);

const listVersion = async (containerId: string) => {
  const list = await prisma.packingList.findUniqueOrThrow({ where: { containerId } });
  const snapshot = list.snapshot as { version?: number; lines: { cargoReference: string }[] };
  return {
    number: list.number,
    version: snapshot.version ?? 0,
    references: snapshot.lines.map((l) => l.cargoReference),
  };
};

before(async () => {
  for (const [desk, email] of Object.entries({
    admin: "admin@bluewavecargo.co.tz",
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
});

after(() => as(null));

describe("cargo found inside a box that has already sailed", () => {
  test("a consignment goes onto a SEALED box and stands exactly where the box stands", async () => {
    const onBoard = await aConsignment(1);
    const found = await aConsignment(2.5, 3);
    const containerId = await aSealedBox(onBoard);
    const before = await listVersion(containerId);
    assert.deepEqual(before.references, [onBoard.reference], "the seal froze one line");

    as("china");
    const res = await containerActions.putOnSailedContainer(
      {},
      form({
        containerId,
        cargoId: found.id,
        reason: "Loaded at the last minute, never went on the list",
      })
    );
    assert.ok(res.ok, res.error);

    /* Sealed is loaded — never a rung past the box. */
    assert.equal(await statusOf(found.id), "CONTAINER_LOADED");
    assert.deepEqual(
      (await historyOf(found.id)).slice(-1),
      ["CONTAINER_LOADED"],
      "the move is on the consignment's own history"
    );

    /* The line, summed from the goods and not typed. */
    const line = await prisma.containerCargo.findUniqueOrThrow({
      where: { containerId_cargoId: { containerId, cargoId: found.id } },
    });
    assert.equal(line.cbm.toString(), "2.5");
    assert.equal(line.packagesCount, 3);
    assert.equal(line.weightKg?.toString(), "40");
    assert.equal(line.notes, "Loaded at the last minute, never went on the list");

    /* The container's totals are the lines added up, and both are in them. */
    const totals = await prisma.containerCargo.aggregate({
      where: { containerId },
      _sum: { cbm: true, packagesCount: true },
      _count: true,
    });
    assert.equal(totals._count, 2);
    assert.equal(totals._sum.cbm?.toString(), "3.5");
    assert.equal(totals._sum.packagesCount, 5);

    /* Old value first, with the reason. */
    const change = await prisma.fieldChange.findFirstOrThrow({
      where: { entity: "Cargo", entityId: found.id, field: "container" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(change.oldValue, null);
    assert.equal(change.newValue, (await prisma.container.findUniqueOrThrow({ where: { id: containerId } })).reference);
    assert.match(change.reason ?? "", /last minute/);
    assert.equal(change.actorId, desks.china.id);

    /* The box's own timeline, and the audit log. */
    const event = await prisma.containerEvent.findFirstOrThrow({
      where: { containerId, note: { contains: found.reference } },
    });
    assert.match(event.note ?? "", /added to the manifest after sealing/);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "container.amendSailed", entityId: containerId },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(audit.actorId, desks.china.id);
    assert.match(audit.summary ?? "", new RegExp(found.reference));

    /* The frozen sheet keeps its number and gains a drawing. */
    const now = await listVersion(containerId);
    assert.equal(now.number, before.number, "the number on paper at a port does not move");
    assert.equal(now.version, before.version + 1);
    assert.deepEqual(now.references.sort(), [found.reference, onBoard.reference].sort());
  });

  test("a consignment goes onto a DEPARTED box and walks the journey it missed", async () => {
    const onBoard = await aConsignment(1);
    const found = await aConsignment(1.25);
    const containerId = await aSealedBox(onBoard);

    as("china");
    const departed = await containerActions.advanceContainer(
      {},
      form({ containerId, to: "DEPARTED" })
    );
    assert.ok(departed.ok, departed.error);
    assert.equal(
      (await prisma.container.findUniqueOrThrow({ where: { id: containerId } })).status,
      "IN_TRANSIT"
    );

    const res = await containerActions.putOnSailedContainer(
      {},
      form({ containerId, cargoId: found.id, reason: "Found in the box on the CCTV" })
    );
    assert.ok(res.ok, res.error);

    assert.equal(await statusOf(found.id), "IN_TRANSIT", "never ahead of its own box");
    assert.deepEqual(
      (await historyOf(found.id)).slice(-3),
      ["CONTAINER_LOADED", "DEPARTED_CHINA", "IN_TRANSIT"],
      "the rungs it missed are each written, so the customer's timeline is honest"
    );

    const line = await prisma.containerCargo.findUniqueOrThrow({
      where: { containerId_cargoId: { containerId, cargoId: found.id } },
    });
    assert.equal(line.cbm.toString(), "1.25");
    assert.ok(
      await prisma.auditLog.findFirst({
        where: { action: "container.amendSailed", entityId: containerId },
      }),
      "the amendment is audited"
    );
  });

  test("a consignment already on another live container is refused", async () => {
    const onBoardA = await aConsignment(1);
    const onBoardB = await aConsignment(1);
    const shared = await aConsignment(0.5);
    const boxA = await aSealedBox(onBoardA);
    const boxB = await aSealedBox(onBoardB);

    as("china");
    const first = await containerActions.putOnSailedContainer(
      {},
      form({ containerId: boxA, cargoId: shared.id, reason: "In the first box" })
    );
    assert.ok(first.ok, first.error);

    const second = await containerActions.putOnSailedContainer(
      {},
      form({ containerId: boxB, cargoId: shared.id, reason: "No, the second box" })
    );
    assert.ok(second.error, "one box at a time");
    assert.match(second.error!, /Take it off that container/);
    assert.equal(
      await prisma.containerCargo.count({ where: { cargoId: shared.id } }),
      1,
      "it is counted on one sailing, not two"
    );
  });

  test("nothing moves without a reason", async () => {
    const onBoard = await aConsignment(1);
    const found = await aConsignment(1);
    const containerId = await aSealedBox(onBoard);

    as("china");
    const res = await containerActions.putOnSailedContainer(
      {},
      form({ containerId, cargoId: found.id, reason: "   " })
    );
    assert.match(res.error ?? "", /Say why/);
    assert.equal(await prisma.containerCargo.count({ where: { cargoId: found.id } }), 0);

    const off = await containerActions.takeOffSailedContainer(
      {},
      form({ containerId, cargoId: onBoard.id })
    );
    assert.match(off.error ?? "", /Say why/);
  });

  test("taken off a sailed box with a reason, and the last one never comes off", async () => {
    const onBoard = await aConsignment(1);
    const wrong = await aConsignment(3, 4);
    const containerId = await aSealedBox(onBoard);
    const reference = (
      await prisma.container.findUniqueOrThrow({ where: { id: containerId } })
    ).reference;

    as("china");
    await containerActions.putOnSailedContainer(
      {},
      form({ containerId, cargoId: wrong.id, reason: "Thought it was in there" })
    );
    const drawn = await listVersion(containerId);

    const res = await containerActions.takeOffSailedContainer(
      {},
      form({ containerId, cargoId: wrong.id, reason: "It is still on the Foshan shelf" })
    );
    assert.ok(res.ok, res.error);

    assert.equal(await statusOf(wrong.id), "RECEIVED_CHINA", "back to being Foshan's");
    assert.equal(
      await prisma.containerCargo.count({
        where: { containerId, cargoId: wrong.id },
      }),
      0
    );
    assert.equal(
      await prisma.cargoPackage.count({ where: { cargoId: wrong.id, containerId } }),
      0,
      "its boxes are out of the container too"
    );

    const change = await prisma.fieldChange.findFirstOrThrow({
      where: { entity: "Cargo", entityId: wrong.id, field: "container" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(change.oldValue, reference, "old value first");
    assert.equal(change.newValue, null);
    assert.match(change.reason ?? "", /Foshan shelf/);

    const after = await listVersion(containerId);
    assert.equal(after.version, drawn.version + 1);
    assert.deepEqual(after.references, [onBoard.reference]);

    /* A sealed box at sea is never left with nothing in it. */
    const last = await containerActions.takeOffSailedContainer(
      {},
      form({ containerId, cargoId: onBoard.id, reason: "Take the lot off" })
    );
    assert.match(last.error ?? "", /only thing on/);
    assert.equal(await prisma.containerCargo.count({ where: { containerId } }), 1);
  });

  test("an open box and a landed one are sent to their own tools", async () => {
    const onBoard = await aConsignment(1);
    const loose = await aConsignment(1);

    as("china");
    const opened = await containerActions.createContainer({}, form({ type: "HQ_40" }));
    const openId = opened.id!;
    await containerActions.loadCargo({}, form({ containerId: openId, cargoIds: [onBoard.id] }));
    const stillOpen = await containerActions.putOnSailedContainer(
      {},
      form({ containerId: openId, cargoId: loose.id, reason: "Wrong tool" })
    );
    assert.match(stillOpen.error ?? "", /still open/);

    const containerId = await aSealedBox(await aConsignment(1));
    await containerActions.advanceContainer({}, form({ containerId, to: "DEPARTED" }));
    as("dar");
    await containerActions.advanceContainer({}, form({ containerId, to: "ARRIVED" }));
    as("china");
    const landed = await containerActions.putOnSailedContainer(
      {},
      form({ containerId, cargoId: loose.id, reason: "Wrong tool again" })
    );
    assert.match(landed.error ?? "", /has landed/);
  });

  test("a consignment added to a landed box takes the day that box arrived", async () => {
    const onBoard = await aConsignment(1);
    const found = await aConsignment(1);
    const containerId = await aSealedBox(onBoard);

    as("china");
    await containerActions.advanceContainer({}, form({ containerId, to: "DEPARTED" }));
    as("dar");
    await containerActions.advanceContainer({}, form({ containerId, to: "ARRIVED" }));
    const shipment = await prisma.shipment.findUniqueOrThrow({ where: { containerId } });
    assert.ok(shipment.actualArrival);

    const res = await containerActions.putOnArrivedContainer(
      {},
      form({ containerId, cargoId: found.id, reason: "Came off this box, not on the list" })
    );
    assert.ok(res.ok, res.error);

    /* The storage clock and the "arrived" message both hang off this day, so a
       bale found in the box is dated by the box, never by the afternoon
       somebody noticed it. */
    const dated = await prisma.cargo.findUniqueOrThrow({
      where: { id: found.id },
      select: { darArrivedAt: true, status: true },
    });
    assert.equal(dated.status, "ARRIVED_TANZANIA");
    assert.equal(
      dated.darArrivedAt?.toISOString(),
      shipment.actualArrival!.toISOString(),
      "it arrived when its container did"
    );
  });
});

describe("who may correct a container", () => {
  test("the sailed pair is Foshan's and management's, never the Dar floor's", async () => {
    /* `container.load` and `shipment.edit`: the desk that packs the box and
       the desk that owns the sailing. Nobody has opened a container at sea, so
       the only people who can say what is inside it are the people who put it
       there. */
    for (const role of ["CHINA_WAREHOUSE", "MANAGER", "ADMIN"] as const) {
      assert.ok(
        rbac.canAny(role, ["container.load", "shipment.edit"]),
        `${role} may correct a sailed box`
      );
    }
    for (const role of ["DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE", "CUSTOMER"] as const) {
      assert.ok(
        !rbac.canAny(role, ["container.load", "shipment.edit"]),
        `${role} may not`
      );
    }

    const onBoard = await aConsignment(1);
    const found = await aConsignment(1);
    const containerId = await aSealedBox(onBoard);

    for (const desk of ["dar", "support", "finance"]) {
      as(desk);
      await assert.rejects(
        containerActions.putOnSailedContainer(
          {},
          form({ containerId, cargoId: found.id, reason: "Not mine to say" })
        ),
        /permission/,
        `${desk} cannot put cargo on a box at sea`
      );
      await assert.rejects(
        containerActions.takeOffSailedContainer(
          {},
          form({ containerId, cargoId: onBoard.id, reason: "Not mine to say" })
        ),
        /permission/,
        `${desk} cannot take cargo off a box at sea`
      );
    }
    assert.equal(await prisma.containerCargo.count({ where: { containerId } }), 1);
  });

  test("the edit page opens for every desk with work on it, and for no customer", () => {
    /* Three jobs on one screen: the sailing, cargo on an open box, cargo on a
       landed one. A desk holding any of them has something to do there. */
    for (const role of [
      "CHINA_WAREHOUSE",
      "DAR_WAREHOUSE",
      "CUSTOMER_SUPPORT",
      "FINANCE",
      "MANAGER",
      "ADMIN",
    ] as const) {
      assert.ok(
        rbac.canAny(role, constants.CONTAINER_EDIT_PERMISSIONS),
        `${role} may open the container edit page`
      );
    }
    assert.ok(!rbac.canAny("CUSTOMER", constants.CONTAINER_EDIT_PERMISSIONS));

    /* And the sailing itself stays with the desk that books the space. */
    assert.ok(rbac.can("CHINA_WAREHOUSE", "shipment.edit"));
    for (const role of ["DAR_WAREHOUSE", "CUSTOMER_SUPPORT", "FINANCE"] as const) {
      assert.ok(!rbac.can(role, "shipment.edit"), `${role} reads the voyage, never writes it`);
    }
  });
});
