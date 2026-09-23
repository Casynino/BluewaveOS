import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE DAR COUNTER, THROUGH THE REAL ACTIONS.

  Somebody is standing at the counter with a box, a printed note, or nothing at
  all, and every step here is the server action their clerk's screen calls, run
  as that desk, with the permission check from lib/rbac.ts.

  What the file is really about is the refusals. A counter that hands cargo over
  is easy; a counter that says no to a customer holding a code, to a box that
  belongs to somebody else, to a second press of the same button, and says it in
  words the customer can act on, is the whole of why the screen exists. Nothing
  is rolled back — these are the records a handover leaves behind, and they are
  read back afterwards.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const scanActions = load("@/lib/actions/scan") as typeof import("@/lib/actions/scan");
const boxActions = load("@/lib/actions/boxes") as typeof import("@/lib/actions/boxes");
const releaseActions = load("@/lib/actions/release") as typeof import("@/lib/actions/release");
const counter = load("@/lib/counter") as typeof import("@/lib/counter");
const releaseLib = load("@/lib/release") as typeof import("@/lib/release");
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
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR = desk === null ? null : desks[desk];
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

let seq = 0;
const RUN = Date.now().toString(36).toUpperCase();
const tag = () => `CTR${RUN}${seq++}`;
const phone = () => `+2557${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;

before(async () => {
  for (const [desk, email] of Object.entries({
    dar: "dar@bluewavecargo.co.tz",
    china: "china@bluewavecargo.co.tz",
    finance: "finance@bluewavecargo.co.tz",
    support: "support@bluewavecargo.co.tz",
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

/**
 * A consignment in whatever state the counter is about to meet it in.
 *
 * Written straight to the database rather than driven through twelve desks:
 * what is under test is the counter, and every earlier step has its own file.
 * "ready" is the state the release check says yes to — booked in at Dar,
 * signed off, billed, paid, note live.
 */
async function consignment(options: {
  state: "ready" | "unpaid" | "not-verified" | "case-open" | "missing" | "no-note";
  boxes?: number;
}) {
  const mark = tag();
  const boxCount = options.boxes ?? 2;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });

  const customer = await prisma.customer.create({
    data: { code: `T-${mark}`, fullName: `Counter ${mark}`, phone: phone() },
  });
  const cargo = await prisma.cargo.create({
    data: {
      reference: `T-${mark}`,
      qrToken: `BWQ-CARGO-${mark}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Counter test goods",
      shippingMark: `MARK-${mark}`,
      status: options.state === "missing" ? "MISSING_AT_DAR" : "RECEIVED_DAR",
    },
  });
  const pkg = await prisma.cargoPackage.create({
    data: {
      cargoId: cargo.id,
      reference: `${mark}-P1`,
      quantity: boxCount,
      cbm: new Prisma.Decimal(1),
    },
  });
  const boxes = [];
  for (let i = 1; i <= boxCount; i++) {
    boxes.push(
      await prisma.cargoBox.create({
        data: {
          cargoId: cargo.id,
          packageId: pkg.id,
          sequence: i,
          qrToken: `BWQ-BOX-${mark}-${i}`,
          /* Every box already off the container: the counter's job starts
             where the receiving dock's ends. */
          darReceivedAt: options.state === "missing" ? null : new Date(),
        },
      })
    );
  }

  if (options.state !== "missing") {
    await prisma.darReceiving.create({
      data: {
        cargoId: cargo.id,
        warehouseId: warehouse.id,
        packagesCount: boxCount,
        cbm: new Prisma.Decimal(1),
        condition: "GOOD",
        verified: options.state !== "not-verified",
        verifiedAt: options.state !== "not-verified" ? new Date() : null,
      },
    });
  }

  if (options.state === "case-open") {
    await prisma.exceptionCase.create({
      data: {
        reference: `EXC-${mark}`,
        cargoId: cargo.id,
        type: "DAMAGED_CARGO",
        status: "OPEN",
        title: "A carton is open",
        description: "A carton is open.",
      },
    });
  }

  /* Billed in shillings so the balance needs no exchange-rate row: the money
     is not what this file is proving, only whether it blocks. */
  const invoice = await prisma.invoice.create({
    data: {
      number: `T-INV-${mark}`,
      customerId: customer.id,
      cargoId: cargo.id,
      status: "ISSUED",
      issuedAt: new Date(),
      currency: "TZS",
      subtotal: new Prisma.Decimal(100_000),
      total: new Prisma.Decimal(100_000),
      /* A shilling bill carries its own shilling total, as issuing writes it.
         Leaving it null makes this fixture a bill the books cannot add up, and
         the finance report tests read every invoice in the database. */
      totalTzs: new Prisma.Decimal(100_000),
    },
  });
  if (options.state !== "unpaid") {
    await prisma.payment.create({
      data: {
        reference: `T-PAY-${mark}`,
        invoiceId: invoice.id,
        customerId: customer.id,
        amount: new Prisma.Decimal(100_000),
        currency: "TZS",
        baseCurrencyAmount: new Prisma.Decimal(100_000),
        status: "VERIFIED",
        verifiedAt: new Date(),
        paidAt: new Date(),
      },
    });
  }

  if (options.state !== "no-note") {
    await prisma.pickupNote.create({
      data: {
        noteNumber: `T-PN-${mark}`,
        cargoId: cargo.id,
        customerId: customer.id,
        amountPaid: new Prisma.Decimal(100_000),
        currency: "TZS",
        qrToken: `BWQ-NOTE-${mark}`,
        status: "ACTIVE",
      },
    });
  }

  return { mark, customer, cargo, pkg, boxes, invoice };
}

describe("a code opens the right consignment", () => {
  test("a box sticker opens the cargo that box belongs to", async () => {
    const one = await consignment({ state: "ready" });
    as("dar");
    /* The label prints a URL, not a bare token — the clerk's camera reads what
       is on the sticker and that is what arrives here. */
    const state = await scanActions.openScan({}, form({ code: qr.qrPayload(one.boxes[0].qrToken) }));
    assert.equal(state.error, undefined);
    assert.ok(
      state.href?.startsWith(`/app/scan/${one.cargo.id}`),
      `expected the handover screen for ${one.cargo.reference}, got ${state.href}`
    );
    /* And the box in the clerk's hand is named, so a pallet of forty cartons
       does not become forty identical rows. */
    assert.match(state.href!, new RegExp(`box=${one.boxes[0].id}$`));
  });

  test("the pickup note's own code opens the same consignment", async () => {
    const one = await consignment({ state: "ready" });
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: one.cargo.id } });
    as("dar");
    const state = await scanActions.openScan({}, form({ code: qr.qrPayload(note.qrToken) }));
    assert.equal(state.href, `/app/scan/${one.cargo.id}`);
  });

  test("a typed tracking number lands on the same screen", async () => {
    const one = await consignment({ state: "ready" });
    as("dar");
    const state = await scanActions.openScan({}, form({ code: one.cargo.reference }));
    assert.equal(state.href, `/app/scan/${one.cargo.id}`);
  });

  test("a code nobody printed opens nothing and says so", async () => {
    as("dar");
    const state = await scanActions.openScan({}, form({ code: "BWQnot-a-real-code-at-all" }));
    assert.equal(state.href, undefined);
    assert.match(state.error ?? "", /not a BlueWave Cargo label/);
  });

  test("every scan is written down, whatever it found", async () => {
    const one = await consignment({ state: "ready" });
    as("dar");
    await scanActions.openScan({}, form({ code: one.boxes[0].qrToken }));
    const events = await prisma.scanEvent.findMany({
      where: { cargoId: one.cargo.id, workflow: "counter" },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].result, "ok");
    assert.equal(events[0].userId, desks.dar.id);
    assert.equal(events[0].boxId, one.boxes[0].id);
  });
});

describe("the counter sees what the counter may see", () => {
  test("the handover screen carries no money at all", async () => {
    const one = await consignment({ state: "unpaid" });
    const view = await counter.counterHandover(one.cargo.id);
    assert.ok(view);

    /* The rule is not "no total field" — it is that no figure a customer could
       be argued with about reaches a warehouse screen. Read the whole object
       back as text and look for one. */
    const asText = JSON.stringify(view);
    assert.doesNotMatch(asText, /outstanding/i, "the amount owed must never reach a warehouse screen");
    assert.doesNotMatch(asText, /100000|100,000/, "a bill figure reached the counter");
    assert.ok(!("outstanding" in (view.check as object)));

    /* And the refusal it does carry is the check's own sentence, which has no
       figure in it by construction. */
    assert.equal(view.check.blockedBy, "Not paid in full yet, counting verified payments only.");
  });

  test("a lookup answers with the customer's own row and its refusal, not with somebody else's", async () => {
    const mine = await consignment({ state: "ready" });
    const theirs = await consignment({ state: "unpaid" });

    const found = await counter.counterLookup(mine.cargo.reference);
    assert.equal(found.length, 1);
    assert.equal(found[0].cargoId, mine.cargo.id);
    assert.ok(found.every((row) => row.cargoId !== theirs.cargo.id));
    assert.doesNotMatch(JSON.stringify(found), /100000/);
  });

  test("scanning another customer's box during a handover is refused by name", async () => {
    const mine = await consignment({ state: "ready" });
    const theirs = await consignment({ state: "ready" });
    as("dar");

    const state = await boxActions.scanBoxForRelease(
      {},
      form({ cargoId: mine.cargo.id, code: theirs.boxes[0].qrToken })
    );
    assert.match(state.error ?? "", /belongs to/);
    assert.match(state.error ?? "", new RegExp(theirs.cargo.reference));

    /* Refused means refused: nothing on the other consignment moved. */
    const box = await prisma.cargoBox.findUniqueOrThrow({ where: { id: theirs.boxes[0].id } });
    assert.equal(box.collectedAt, null);
  });
});

describe("the check decides, and the counter reads its words", () => {
  for (const [state, sentence] of [
    ["unpaid", "Not paid in full yet, counting verified payments only."],
    ["case-open", "still open."],
    ["missing", "Reported missing at Dar."],
    ["not-verified", "Dar has received it but not signed off the count."],
    ["no-note", "Finance has not issued a pickup note yet."],
  ] as const) {
    test(`release is refused when the cargo is ${state}, in lib/release.ts's own words`, async () => {
      const one = await consignment({ state });
      as("dar");

      const view = await counter.counterHandover(one.cargo.id);
      assert.ok(view);
      assert.equal(view.check.ok, false);
      assert.ok(
        view.check.blockedBy?.includes(sentence),
        `expected "${sentence}", screen said "${view.check.blockedBy}"`
      );

      /* THE SCREEN IS NOT THE GATE. Press the button anyway — with no button
         drawn, with the form filled in by hand — and the action refuses with
         the same sentence, because it runs the same check inside the
         transaction. */
      const result = await releaseActions.releaseCargo(
        {},
        form({
          cargoId: one.cargo.id,
          method: "COLLECTION",
          packagesReleased: "2",
          collectedByName: "Somebody Persuasive",
        })
      );
      assert.equal(result.ok, undefined);
      assert.ok(
        result.error?.includes(sentence),
        `expected "${sentence}", action said "${result.error}"`
      );
      assert.equal(await prisma.release.findUnique({ where: { cargoId: one.cargo.id } }), null);
    });
  }

  test("the words the screen prints are the words the library wrote", async () => {
    const one = await consignment({ state: "unpaid" });
    const view = await counter.counterHandover(one.cargo.id);
    const check = await releaseLib.releaseCheckFor(one.cargo.id);
    assert.deepEqual(view!.check.conditions, check!.conditions);
    assert.equal(view!.check.blockedBy, check!.blockedBy);
  });

  test("a refusal names the desk that can put it right, and never an amount", async () => {
    const one = await consignment({ state: "unpaid" });
    const view = await counter.counterHandover(one.cargo.id);
    const desksNamed = view!.remedies.map((r) => r.desk);
    assert.ok(desksNamed.includes("FINANCE"), "Finance takes the payment");
    assert.ok(desksNamed.includes("MANAGEMENT"), "only the manager lets goods go on credit");
    assert.doesNotMatch(JSON.stringify(view!.remedies), /100000/);
  });

  test("a consignment with no pickup note offers Finance, and refuses the handover", async () => {
    const one = await consignment({ state: "no-note" });
    const view = await counter.counterHandover(one.cargo.id);
    assert.equal(view!.note, null);
    assert.equal(view!.check.ok, false);
    assert.deepEqual(
      view!.remedies.map((r) => r.desk),
      ["FINANCE"]
    );
  });
});

describe("handing it over", () => {
  test("every box is scanned out, then the release is written", async () => {
    const one = await consignment({ state: "ready", boxes: 3 });
    as("dar");

    /* The check says yes before a box has moved — and the boxes still have to
       be scanned out one at a time. */
    const before = await counter.counterHandover(one.cargo.id);
    assert.equal(before!.check.ok, true);
    assert.equal(before!.expected, 3);
    assert.equal(before!.scannedOut, 0);

    const early = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "3",
        collectedByName: one.customer.fullName,
      })
    );
    assert.match(early.error ?? "", /Scan every box out first/);

    for (const box of one.boxes) {
      const state = await boxActions.scanBoxForRelease(
        {},
        form({ cargoId: one.cargo.id, code: box.qrToken })
      );
      assert.equal(state.error, undefined, state.error);
    }

    const mid = await counter.counterHandover(one.cargo.id);
    assert.equal(mid!.scannedOut, 3);
    assert.ok(mid!.boxes.every((b) => b.state === "collected"));

    const done = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "3",
        collectedByName: one.customer.fullName,
        noteAsked: "1",
      })
    );
    assert.equal(done.error, undefined, done.error);

    const release = await prisma.release.findUniqueOrThrow({ where: { cargoId: one.cargo.id } });
    assert.equal(release.packagesReleased, 3);
    assert.equal(release.releasedById, desks.dar.id);
    /* The screen asked and the customer had the paper. */
    assert.equal(release.notePresented, true);
    assert.equal(release.noteAbsenceReason, null);

    /* The note is spent, the status moved, and both are appended. */
    const note = await prisma.pickupNote.findUniqueOrThrow({ where: { cargoId: one.cargo.id } });
    assert.equal(note.status, "USED");

    const cargo = await prisma.cargo.findUniqueOrThrow({ where: { id: one.cargo.id } });
    assert.equal(cargo.status, "COLLECTED");

    const history = await prisma.cargoStatusHistory.findMany({
      where: { cargoId: one.cargo.id, to: "COLLECTED" },
    });
    assert.equal(history.length, 1);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: one.cargo.id, action: "cargo.release" },
    });
    assert.ok(audit, "a handover with no audit line is a handover nobody can answer for");
    assert.equal((audit.metadata as { notePresented?: boolean | null }).notePresented, true);
    assert.equal((audit.metadata as { boxesScanned?: number }).boxesScanned, 3);
  });

  test("a customer with no printed note is served, and the handover says so", async () => {
    const one = await consignment({ state: "ready", boxes: 1 });
    as("dar");
    await boxActions.scanBoxForRelease({}, form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken }));

    /* Ticking "no note" without saying how they were identified is refused —
       the whole value of the field is the sentence beside it. */
    const bare = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "1",
        collectedByName: one.customer.fullName,
        noteAsked: "1",
        noteMissing: "1",
      })
    );
    assert.match(bare.error ?? "", /how you identified/);

    const done = await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "1",
        collectedByName: one.customer.fullName,
        noteAsked: "1",
        noteMissing: "1",
        noteAbsenceReason: "National ID checked against the customer record",
      })
    );
    assert.equal(done.error, undefined, done.error);

    const release = await prisma.release.findUniqueOrThrow({ where: { cargoId: one.cargo.id } });
    assert.equal(release.notePresented, false);
    assert.equal(release.noteAbsenceReason, "National ID checked against the customer record");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: one.cargo.id, action: "cargo.release" },
    });
    assert.match(audit.summary, /no printed pickup note presented/);
    const metadata = audit.metadata as { notePresented?: boolean; noteAbsenceReason?: string };
    assert.equal(metadata.notePresented, false);
    assert.equal(metadata.noteAbsenceReason, "National ID checked against the customer record");
  });

  test("a screen that never asked records that it never asked", async () => {
    const one = await consignment({ state: "ready", boxes: 1 });
    as("dar");
    await boxActions.scanBoxForRelease({}, form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken }));
    await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "1",
        collectedByName: one.customer.fullName,
      })
    );
    const release = await prisma.release.findUniqueOrThrow({ where: { cargoId: one.cargo.id } });
    assert.equal(release.notePresented, null, "never asked is not the same answer as yes");
  });

  test("scanning the same box twice does not hand it over twice", async () => {
    const one = await consignment({ state: "ready", boxes: 1 });
    as("dar");

    const first = await boxActions.scanBoxForRelease(
      {},
      form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken })
    );
    assert.equal(first.error, undefined);
    const collectedAt = (await prisma.cargoBox.findUniqueOrThrow({ where: { id: one.boxes[0].id } }))
      .collectedAt;

    const second = await boxActions.scanBoxForRelease(
      {},
      form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken })
    );
    assert.match(second.warning ?? "", /already handed over/);
    assert.equal(second.progress?.done, 1);
    assert.deepEqual(
      (await prisma.cargoBox.findUniqueOrThrow({ where: { id: one.boxes[0].id } })).collectedAt,
      collectedAt,
      "a second scan must not re-stamp the box"
    );
  });

  test("a second press of Release finds the note spent and writes nothing", async () => {
    const one = await consignment({ state: "ready", boxes: 1 });
    as("dar");
    await boxActions.scanBoxForRelease({}, form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken }));

    const fields = {
      cargoId: one.cargo.id,
      method: "COLLECTION",
      packagesReleased: "1",
      collectedByName: one.customer.fullName,
    };
    const first = await releaseActions.releaseCargo({}, form(fields));
    assert.equal(first.error, undefined, first.error);

    const second = await releaseActions.releaseCargo({}, form(fields));
    assert.equal(second.ok, undefined);
    assert.match(second.error ?? "", /already been handed over|already left the warehouse/);

    const releases = await prisma.release.findMany({ where: { cargoId: one.cargo.id } });
    assert.equal(releases.length, 1);
    const audits = await prisma.auditLog.findMany({
      where: { entityId: one.cargo.id, action: "cargo.release" },
    });
    assert.equal(audits.length, 1);
  });

  test("the screen reports a handover that has already happened rather than offering another", async () => {
    const one = await consignment({ state: "ready", boxes: 1 });
    as("dar");
    await boxActions.scanBoxForRelease({}, form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken }));
    await releaseActions.releaseCargo(
      {},
      form({
        cargoId: one.cargo.id,
        method: "COLLECTION",
        packagesReleased: "1",
        collectedByName: "Grace Kimaro",
      })
    );

    const view = await counter.counterHandover(one.cargo.id);
    assert.ok(view!.released, "the screen has to say the goods have gone");
    assert.equal(view!.released!.collectedByName, "Grace Kimaro");
    assert.equal(view!.check.ok, false);
    assert.equal(view!.check.blockedBy, "These goods have already left the warehouse.");
  });
});

describe("the permission is checked on the server, not by hiding a button", () => {
  test("opening a scan needs cargo.scan", async () => {
    const one = await consignment({ state: "ready" });
    /* Finance reads bills; it has no business resolving a warehouse code. */
    as("finance");
    await assert.rejects(
      () => scanActions.openScan({}, form({ code: one.boxes[0].qrToken })),
      /permission/i
    );
  });

  test("scanning a box out needs release.execute", async () => {
    const one = await consignment({ state: "ready" });
    as("china");
    await assert.rejects(
      () => boxActions.scanBoxForRelease({}, form({ cargoId: one.cargo.id, code: one.boxes[0].qrToken })),
      /permission/i
    );
  });

  test("the handover itself needs release.execute", async () => {
    const one = await consignment({ state: "ready" });
    as("support");
    await assert.rejects(
      () =>
        releaseActions.releaseCargo(
          {},
          form({
            cargoId: one.cargo.id,
            method: "COLLECTION",
            packagesReleased: "1",
            collectedByName: "Anybody",
          })
        ),
      /permission/i
    );
    assert.equal(await prisma.release.findUnique({ where: { cargoId: one.cargo.id } }), null);
  });

  test("nobody signed in reaches none of it", async () => {
    const one = await consignment({ state: "ready" });
    as(null);
    await assert.rejects(() => scanActions.openScan({}, form({ code: one.boxes[0].qrToken })), /signed in/i);
  });
});
