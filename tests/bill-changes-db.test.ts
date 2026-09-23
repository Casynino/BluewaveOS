import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/* The hook before any file of ours: see tests/website-requests-db.test.ts. */
const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const confirmLib = load("@/lib/price-confirmation") as typeof import("@/lib/price-confirmation");
const invoiceActions = load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const mergeActions = load("@/lib/actions/merge") as typeof import("@/lib/actions/merge");
const claimsLib = load("@/lib/claims") as typeof import("@/lib/claims");
const changesLib = load("@/lib/bill-changes") as typeof import("@/lib/bill-changes");
const ledgerLib = load("@/lib/ledger") as typeof import("@/lib/ledger");

/**
 * WHAT A DESK DID TO A BILL, WHEREVER THE BILL IS ABOUT TO BE PAID.
 *
 * Finance agrees money against figures other desks may have moved. These drive
 * the real actions against the real database: a bill is confirmed from the rate
 * book, moved, read back on the verify row, and put back — and a merged payment
 * is checked to behave as several single ones, because that is all it is.
 *
 * Nothing here rolls back: a server action reaches for the prisma singleton,
 * not a test's transaction, so what it writes is committed and taken out again
 * in `unseed`.
 */

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

/** Whoever the test says is at the screen. */
const seat = () => globalThis as { __TEST_ACTOR?: unknown };
const sitAs = (user: unknown) => {
  seat().__TEST_ACTOR = user;
};

type Desk = { id: string; name: string; email: string; role: string };

async function desk(role: string): Promise<Desk> {
  const user = await prisma.user.findFirst({ where: { role: role as never } });
  assert.ok(user, `needs a ${role} user`);
  return { id: user.id, name: user.name ?? role, email: user.email, role: user.role };
}

/** A form as the browser posts it. */
function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** A consignment standing on the Dar floor, counted and signed off. */
async function landed(tag: string, cbm = "2") {
  const warehouse = await prisma.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const customer = await prisma.customer.create({
    data: { code: `BCT-${tag}`, fullName: `Bill changes ${tag}`, phone: `+2557911${tag}` },
  });
  const cargo = await prisma.cargo.create({
    data: {
      reference: `BCT-${tag}`,
      qrToken: `BCT-QR-${tag}`,
      senderId: customer.id,
      receiverId: customer.id,
      description: "Test goods",
      status: "RECEIVED_DAR",
    },
  });
  await prisma.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: warehouse.id,
      packagesCount: 4,
      cbm: new Prisma.Decimal(cbm),
      verified: true,
      verifiedAt: new Date(),
    },
  });
  return { cargo, customer };
}

/** The bill the rate book raises for it, issued. */
async function issuedFromBook(cargoId: string, actor: Desk) {
  const ctx = await confirmLib.confirmContext(7);
  assert.ok(ctx, "needs a published exchange rate");
  const outcome = await prisma.$transaction(
    (tx) => confirmLib.confirmCargoPrice(tx, actor as never, cargoId, ctx),
    { timeout: 30_000 }
  );
  assert.equal(outcome.kind, "issued", JSON.stringify(outcome));
  return prisma.invoice.findFirstOrThrow({
    where: { cargoId, status: { not: "DRAFT" } },
    include: { items: true },
  });
}

/** Everything the fixture wrote, taken back out in dependency order. */
async function unseed(cargoIds: string[], customerIds: string[]) {
  const invoices = await prisma.invoice.findMany({
    where: { cargoId: { in: cargoIds } },
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  const payments = await prisma.payment.findMany({
    where: { invoiceId: { in: ids } },
    select: { id: true },
  });
  const paymentIds = payments.map((p) => p.id);
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.paymentProof.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.updateMany({
    where: { invoiceId: { in: ids } },
    data: { writeOffOfId: null },
  });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...ids, ...cargoIds, ...customerIds, ...paymentIds] } },
  });
  await prisma.fieldChange.deleteMany({
    where: { entityId: { in: [...ids, ...cargoIds, ...paymentIds] } },
  });
  await prisma.invoice.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.pickupNote.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.notification.deleteMany({ where: { customerId: { in: customerIds } } });
  await prisma.cargoStatusHistory.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.darReceiving.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.cargoPackage.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.cargo.deleteMany({ where: { id: { in: cargoIds } } });
  await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  sitAs(undefined);
}

const stamp = () => Date.now().toString(36).toUpperCase().slice(-5);

describe("a re-price is named on the row, and can be put back", () => {
  test("the bill says what it charges and what the book said, and the book puts it back", async () => {
    const support = await desk("CUSTOMER_SUPPORT");
    const finance = await desk("FINANCE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      const book = bill.standardRate;
      assert.ok(book, "the book priced it");
      const wasTotal = bill.total;

      sitAs(support);
      const done = await invoiceActions.repriceInvoice(
        {},
        form({ invoiceId: bill.id, rate: "380", reason: "Agreed at the counter" })
      );
      assert.ok(done.ok, done.error);

      const [shown] = (await changesLib.billChangesFor([bill.id])).get(bill.id) ?? [];
      assert.ok(shown, "the re-price is on the row");
      assert.equal(shown.kind, "reprice");
      assert.equal(shown.figure, "USD 380.00/CBM");
      assert.equal(shown.book, `USD ${book.toFixed(2)}`);
      assert.equal(shown.volume, "2 CBM");
      assert.equal(shown.by, support.name, "named with the desk that moved it");
      assert.ok(shown.undo?.recovered, "and what puts it back");
      assert.equal(shown.undo?.to, `USD ${book.toFixed(2)}/CBM`);

      /* Finance does not agree it: back to the rate book, priced by the
         engine rather than by arithmetic on the screen. */
      sitAs(finance);
      const back = await invoiceActions.undoReprice(
        {},
        form({ invoiceId: bill.id, reason: "Not agreed" })
      );
      assert.ok(back.ok, back.error);

      const after = await prisma.invoice.findUniqueOrThrow({
        where: { id: bill.id },
        include: { items: true },
      });
      assert.equal(after.total.toString(), wasTotal.toString(), "the rate book's total");
      assert.equal(after.appliedRate?.toString(), book.toString());
      assert.equal(
        after.items.filter((i) => i.category === "Freight").length,
        bill.items.filter((i) => i.category === "Freight").length,
        "the freight lines are the book's again"
      );

      const trail = await prisma.fieldChange.findMany({
        where: { entityId: bill.id },
        orderBy: { createdAt: "asc" },
      });
      const totals = trail.filter((c) => c.field === "total");
      assert.equal(totals.length, 2, "both moves of the total are on the trail");
      assert.equal(totals[1].oldValue, totals[0].newValue, "old value first");
      assert.equal(totals[1].newValue, wasTotal.toString(), "back to the rate book's figure");
      assert.ok(
        trail.some((c) => c.field === "appliedRate" && c.newValue === book.toString()),
        "and the rate that moved"
      );
      const line = await prisma.auditLog.findFirst({
        where: { entityId: bill.id, action: "invoice.reprice.undo" },
      });
      assert.ok(line, "an audit line of its own");

      /* Put back once: the change no longer stands, so the row is clean and
         the control is gone. */
      assert.equal((await changesLib.billChangesFor([bill.id])).get(bill.id), undefined);
      const twice = await invoiceActions.undoReprice({}, form({ invoiceId: bill.id }));
      assert.match(twice.error ?? "", /no re-price/i);
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });

  test("a settled bill is refused, and only the desk that may price may put it back", async () => {
    const support = await desk("CUSTOMER_SUPPORT");
    const finance = await desk("FINANCE");
    const dar = await desk("DAR_WAREHOUSE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      sitAs(support);
      const done = await invoiceActions.repriceInvoice(
        {},
        form({ invoiceId: bill.id, rate: "380", reason: "Agreed at the counter" })
      );
      assert.ok(done.ok, done.error);

      sitAs(dar);
      await assert.rejects(
        invoiceActions.undoReprice({}, form({ invoiceId: bill.id })),
        /permission/i,
        "the floor never touches a price"
      );

      /* Paid in full: the customer has settled the figure they were given, and
         Support does not move it afterwards. */
      await prisma.invoice.update({ where: { id: bill.id }, data: { status: "PAID" } });
      sitAs(support);
      const refused = await invoiceActions.undoReprice({}, form({ invoiceId: bill.id }));
      assert.match(refused.error ?? "", /paid in full/i);

      /* Finance owns the bill and may still correct it. */
      sitAs(finance);
      const allowed = await invoiceActions.undoReprice({}, form({ invoiceId: bill.id }));
      assert.ok(allowed.ok, allowed.error);
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });
});

describe("an exchange rate moved on one bill", () => {
  test("the row says what it moved to, and it goes back to the rate it was pinned at", async () => {
    const finance = await desk("FINANCE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      const pinned = bill.fxRate;
      assert.ok(pinned, "issuing pinned a rate");

      sitAs(finance);
      const moved = await invoiceActions.changeInvoiceRate(
        {},
        form({ invoiceId: bill.id, rate: "2650", note: "Agreed at the counter" })
      );
      assert.ok(moved.ok, moved.error);

      const shown = ((await changesLib.billChangesFor([bill.id])).get(bill.id) ?? []).find(
        (c) => c.kind === "fx"
      );
      assert.ok(shown, "the rate change is on the row");
      assert.equal(shown.figure, "1 USD = 2,650 TZS");
      assert.equal(shown.by, finance.name);
      assert.ok(shown.undo?.recovered, "the rate before it is on the trail");
      assert.equal(shown.undo?.to, `1 USD = ${Number(pinned).toLocaleString("en-US")} TZS`);

      const back = await invoiceActions.undoInvoiceRate(
        {},
        form({ invoiceId: bill.id, reason: "Not agreed" })
      );
      assert.ok(back.ok, back.error);

      const after = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } });
      assert.equal(after.fxRate?.toString(), pinned.toString(), "the rate it was pinned at");
      assert.equal(
        after.totalTzs?.toString(),
        bill.totalTzs?.toString(),
        "and the shillings that go with it"
      );
      assert.equal(after.total.toString(), bill.total.toString(), "the dollar total never moved");

      const trail = await prisma.fieldChange.findMany({
        where: { entityId: bill.id, field: "fxRate" },
        orderBy: { createdAt: "asc" },
      });
      assert.equal(trail.length, 2, "both moves are on the trail");
      assert.equal(trail[1].oldValue, "2650", "old value first");
      assert.equal(trail[1].newValue, pinned.toString());
      assert.ok(
        await prisma.auditLog.findFirst({
          where: { entityId: bill.id, action: "invoice.rate.undo" },
        }),
        "an audit line of its own"
      );
      assert.equal((await changesLib.billChangesFor([bill.id])).get(bill.id), undefined);
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });

  test("a bill whose earlier rate left no trail is not guessed at", async () => {
    const finance = await desk("FINANCE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      sitAs(finance);
      const moved = await invoiceActions.changeInvoiceRate(
        {},
        form({ invoiceId: bill.id, rate: "2650" })
      );
      assert.ok(moved.ok, moved.error);

      /* An older bill, from before the trail was kept. */
      await prisma.fieldChange.deleteMany({
        where: { entity: "Invoice", entityId: bill.id, field: "fxRate" },
      });

      const shown = ((await changesLib.billChangesFor([bill.id])).get(bill.id) ?? []).find(
        (c) => c.kind === "fx"
      );
      assert.ok(shown);
      assert.equal(shown.undo?.recovered, false, "today's rate is offered, and named as today's");

      const refused = await invoiceActions.undoInvoiceRate({}, form({ invoiceId: bill.id }));
      assert.match(refused.error ?? "", /does not say what its rate was/i);

      const taken = await invoiceActions.undoInvoiceRate(
        {},
        form({ invoiceId: bill.id, useToday: "1" })
      );
      assert.ok(taken.ok, taken.error);
      const after = await prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } });
      const today = await prisma.exchangeRate.findFirstOrThrow({
        where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
        orderBy: { effectiveFrom: "desc" },
      });
      assert.equal(after.fxRate?.toString(), today.rate.toString());
      assert.equal(after.exchangeRateId, today.id, "back on the published row");
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });

  test("moving the rate back is the bill's own desk, not the counter's", async () => {
    const support = await desk("CUSTOMER_SUPPORT");
    const finance = await desk("FINANCE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      sitAs(finance);
      const moved = await invoiceActions.changeInvoiceRate(
        {},
        form({ invoiceId: bill.id, rate: "2650" })
      );
      assert.ok(moved.ok, moved.error);
      sitAs(support);
      await assert.rejects(
        invoiceActions.undoInvoiceRate({}, form({ invoiceId: bill.id })),
        /permission/i
      );
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });
});

describe("a merged payment is the same thing, just merged", () => {
  test("each slice shows both bills' changes, and one is put back without touching the other", async () => {
    const support = await desk("CUSTOMER_SUPPORT");
    const finance = await desk("FINANCE");
    const tag = stamp();
    const first = await landed(`${tag}A`);
    /* One customer, two consignments — the whole point of a merge. */
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { kind: "TANZANIA" } });
    const second = await prisma.cargo.create({
      data: {
        reference: `BCT-${tag}B`,
        qrToken: `BCT-QR-${tag}B`,
        senderId: first.customer.id,
        receiverId: first.customer.id,
        description: "Test goods",
        status: "RECEIVED_DAR",
      },
    });
    await prisma.darReceiving.create({
      data: {
        cargoId: second.id,
        warehouseId: warehouse.id,
        packagesCount: 4,
        cbm: new Prisma.Decimal("2"),
        verified: true,
        verifiedAt: new Date(),
      },
    });
    try {
      const billA = await issuedFromBook(first.cargo.id, finance);
      const billB = await issuedFromBook(second.id, finance);

      /* Support moves one bill each way. */
      sitAs(support);
      const priced = await invoiceActions.repriceInvoice(
        {},
        form({ invoiceId: billA.id, rate: "380", reason: "Agreed" })
      );
      assert.ok(priced.ok, priced.error);
      const off = await invoiceActions.discountInvoice(
        {},
        form({ invoiceId: billB.id, amount: "10", currency: "USD", reason: "Damaged carton" })
      );
      assert.ok(off.ok, off.error);

      /* One transfer covering both, handed up as a claim. */
      const owedA = await prisma.invoice.findUniqueOrThrow({ where: { id: billA.id } });
      const owedB = await prisma.invoice.findUniqueOrThrow({ where: { id: billB.id } });
      const account = await prisma.bankAccount.findFirstOrThrow({
        where: { active: true, currency: "TZS" },
      });
      const together = Number(owedA.totalTzs) + Number(owedB.totalTzs);
      const paid = await mergeActions.recordCombinedPayment(
        {},
        (() => {
          const data = form({
            customerId: first.customer.id,
            currency: "TZS",
            cargoAmount: String(together),
            accountId: account.id,
            idempotencyKey: `BCT-${tag}`,
          });
          data.append("invoiceIds", billA.id);
          data.append("invoiceIds", billB.id);
          return data;
        })()
      );
      assert.ok(paid.ok, paid.error);

      const rows = (await claimsLib.claimsAt("PENDING")).rows.filter((r) =>
        [billA.number, billB.number].includes(r.invoice)
      );
      assert.equal(rows.length, 2, "one slice per bill");
      for (const row of rows) {
        assert.equal(row.mergedOver, true, "each slice names the bills it covers");
        const kinds = (row.changes ?? []).map((c) => `${c.invoiceNumber}:${c.kind}`).sort();
        assert.deepEqual(
          kinds,
          [`${billA.number}:reprice`, `${billB.number}:discount`].sort(),
          "both bills' changes, each named by its own bill"
        );
      }

      /* Finance puts one back. The other is untouched. */
      sitAs(finance);
      const back = await invoiceActions.undoReprice({}, form({ invoiceId: billA.id }));
      assert.ok(back.ok, back.error);

      const left = await changesLib.billChangesFor([billA.id, billB.id]);
      assert.equal(left.get(billA.id), undefined, "the re-price is gone");
      assert.equal(left.get(billB.id)?.length, 1, "the discount on the other bill stands");
      const untouched = await prisma.invoice.findUniqueOrThrow({ where: { id: billB.id } });
      assert.equal(untouched.discount.toString(), owedB.discount.toString());
      assert.equal(untouched.total.toString(), owedB.total.toString(), "its total did not move");
    } finally {
      await unseed([first.cargo.id, second.id], [first.customer.id]);
    }
  });
});

describe("the general ledger says a bill was changed, and moves no money", () => {
  test("a payment row carries the badge; the rows and the totals are the same", async () => {
    const finance = await desk("FINANCE");
    const { cargo, customer } = await landed(stamp());
    try {
      const bill = await issuedFromBook(cargo.id, finance);
      const account = await prisma.bankAccount.findFirstOrThrow({
        where: { active: true, currency: "TZS" },
      });
      sitAs(finance);
      const paid = await mergeActions.recordCombinedPayment(
        {},
        (() => {
          const data = form({
            customerId: customer.id,
            currency: "TZS",
            cargoAmount: String(Number(bill.totalTzs)),
            accountId: account.id,
            idempotencyKey: `BCT-LED-${Date.now()}`,
          });
          data.append("invoiceIds", bill.id);
          return data;
        })()
      );
      assert.ok(paid.ok, paid.error);

      const before = await ledgerLib.ledgerRows();
      const mine = before.find((r) => r.search.includes(cargo.reference.toLowerCase()));
      assert.ok(mine, "the money is on the ledger");
      assert.equal(mine.changes.length, 0, "nothing has been done to the bill yet");
      const wasTzs = before.reduce((sum, r) => sum + r.tzs, 0);

      const off = await invoiceActions.discountInvoice(
        {},
        form({ invoiceId: bill.id, amount: "10", currency: "USD", reason: "Damaged carton" })
      );
      assert.ok(off.ok, off.error);

      const after = await ledgerLib.ledgerRows();
      assert.equal(after.length, before.length, "a discount is not a movement of money");
      assert.equal(
        after.reduce((sum, r) => sum + r.tzs, 0),
        wasTzs,
        "and nothing in the totals moved"
      );
      const row = after.find((r) => r.id === mine.id);
      assert.ok(row);
      assert.equal(row.changes.length, 1, "the fact is on the row the money is on");
      assert.equal(row.changes[0].kind, "discount");
      assert.equal(row.changes[0].figure, "USD 10.00");
      assert.equal(row.changes[0].invoiceNumber, bill.number);
      assert.ok(
        after.every((r) => r.kind === "payment" || r.changes.length === 0),
        "a cost or a transfer has no bill behind it"
      );
    } finally {
      await unseed([cargo.id], [customer.id]);
    }
  });

  test("the whole page asks once, however many rows it draws", () => {
    /* A derivation per row is what makes a ledger of a year's trading take
       seconds. Read off the source, because the thing worth catching is a
       call that has moved inside the loop. */
    const src = readFileSync(join(process.cwd(), "lib/ledger.ts"), "utf8");
    const calls = src.match(/billChangesFor\(/g) ?? [];
    assert.equal(calls.length, 1, "one question for the whole ledger");
    assert.ok(
      src.indexOf("billChangesFor(") < src.indexOf("for (const e of register)"),
      "asked before the rows are built, never inside them"
    );
  });
});
