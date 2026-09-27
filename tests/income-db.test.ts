import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE INCOME PAGE SAYS WHAT THE LEDGER SAYS, TO THE SHILLING.

  Income is read off the ledger's own rows, so the two cannot disagree — this
  proves it, against real payments: one on loose cargo with transport added,
  one on a full container, one reversed, and one transfer that paid two bills
  at once. The tiles at the top of the page are a partition of the total, and
  the list of who still owes counts only what is really unpaid.

  Rows are committed and taken out again, like the other database tests here.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;
after(() => prisma.$disconnect());

const income = load("@/lib/income") as typeof import("@/lib/income");
const ledger = load("@/lib/ledger") as typeof import("@/lib/ledger");

const RUN = Date.now().toString(36).toUpperCase();
const RATE = new Prisma.Decimal(2650);

const s = {
  customerId: "",
  accountId: "",
  lclInvoice: "",
  fclInvoice: "",
  splitA: "",
  splitB: "",
  paidOff: "",
  owed: "",
  payments: [] as string[],
  invoices: [] as string[],
  cargo: [] as string[],
};

async function cargoWithBill(tag: string, service: "LCL" | "FCL", totalUsd: number) {
  const cargo = await prisma.cargo.create({
    data: {
      reference: `INC-${RUN}-${tag}`,
      qrToken: `INCQ-${RUN}-${tag}`,
      senderId: s.customerId,
      receiverId: s.customerId,
      description: `Income test goods ${tag}`,
      status: "RECEIVED_DAR",
      service,
    },
  });
  s.cargo.push(cargo.id);
  const invoice = await prisma.invoice.create({
    data: {
      number: `INV-INC-${RUN}-${tag}`,
      customerId: s.customerId,
      cargoId: cargo.id,
      status: "ISSUED",
      currency: "USD",
      subtotal: totalUsd,
      total: totalUsd,
      fxRate: RATE,
      totalTzs: new Prisma.Decimal(totalUsd).mul(RATE),
      issuedAt: new Date(),
    },
  });
  s.invoices.push(invoice.id);
  return invoice.id;
}

async function pay(
  tag: string,
  invoiceId: string,
  usd: number,
  extra: Partial<{ deliveryAdded: number; status: "VERIFIED" | "REVERSED"; transactionRef: string }> = {}
) {
  const payment = await prisma.payment.create({
    data: {
      reference: `PAY-INC-${RUN}-${tag}`,
      invoiceId,
      customerId: s.customerId,
      accountId: s.accountId,
      amount: usd,
      currency: "USD",
      fxRate: RATE,
      baseCurrencyAmount: new Prisma.Decimal(usd).mul(RATE),
      deliveryAdded: extra.deliveryAdded ?? null,
      method: "BANK_TRANSFER",
      status: extra.status ?? "VERIFIED",
      transactionRef: extra.transactionRef ?? null,
      paidAt: new Date(),
    },
  });
  s.payments.push(payment.id);
  return payment.id;
}

before(async () => {
  const customer = await prisma.customer.create({
    data: { code: `INC-${RUN}`, fullName: `Income Test ${RUN}`, phone: `+2557${RUN.slice(-8)}` },
  });
  s.customerId = customer.id;
  const account = await prisma.bankAccount.create({
    data: {
      bankName: `Income Bank ${RUN}`,
      accountName: "BlueWave",
      accountNumber: `ACC-${RUN}`,
      currency: "USD",
      active: true,
    },
  });
  s.accountId = account.id;

  s.lclInvoice = await cargoWithBill("LCL", "LCL", 400);
  s.fclInvoice = await cargoWithBill("FCL", "FCL", 3000);
  const mergedLcl = await cargoWithBill("MLCL", "LCL", 200);
  const mergedFcl = await cargoWithBill("MFCL", "FCL", 1000);

  /* Loose cargo, paid in full with USD 20 of transport on top. */
  await pay("LCL", s.lclInvoice, 400, { deliveryAdded: 20 });
  /* A full container, half paid — it stays on the list of who owes. */
  await pay("FCL", s.fclInvoice, 1500);
  /* A payment reversed: on the list, counted as nothing. */
  await pay("REV", s.lclInvoice, 50, { status: "REVERSED" });
  /* One transfer paying a loose-cargo bill and a container bill together. */
  s.splitA = await pay("MA", mergedLcl, 200, { transactionRef: `MERGE-${RUN}` });
  s.splitB = await pay("MB", mergedFcl, 1000, { transactionRef: `MERGE-${RUN}` });

  s.paidOff = s.lclInvoice;
  s.owed = s.fclInvoice;

  /* A bill issued on a day nothing else was, broken into its lines. */
  const old = await cargoWithBill("OLD", "LCL", 385);
  await prisma.invoice.update({ where: { id: old }, data: { status: "PAID", issuedAt: new Date("2001-02-03T09:00:00+03:00") } });
  await prisma.invoiceItem.createMany({
    data: [
      { invoiceId: old, description: "Freight", amount: 400, category: "Freight" },
      { invoiceId: old, description: "Discount", amount: -30, category: "Discount" },
      { invoiceId: old, description: "Storage", amount: 12, category: "Storage" },
      { invoiceId: old, description: "Loading", amount: 3, category: "Other" },
    ],
  });
});

after(async () => {
  await prisma.payment.deleteMany({ where: { id: { in: s.payments } } });
  await prisma.invoice.deleteMany({ where: { id: { in: s.invoices } } });
  await prisma.cargo.deleteMany({ where: { id: { in: s.cargo } } });
  await prisma.bankAccount.deleteMany({ where: { id: s.accountId } });
  await prisma.customer.deleteMany({ where: { id: s.customerId } });
});

const today = () => income.darDay(new Date());
const ours = async () =>
  (await income.incomeBetween(today(), today())).filter((r) => r.account.id === s.accountId);

describe("income is the ledger's money in, and nothing else", () => {
  test("every row is a ledger row, with the ledger's own shilling figure", async () => {
    const rows = await ours();
    const book = (await ledger.ledgerRows()).filter(
      (r) => r.accountId === s.accountId && r.direction === "IN" && r.id.startsWith("p-")
    );
    /* Four rows, not zero: loose cargo, the container, the reversal, and the
       two-bill transfer folded into one. Without this every check below would
       pass on an empty list. */
    assert.equal(rows.length, 4, "the four movements this test made");
    assert.equal(rows.length, book.length, "one income row per ledger row");
    for (const r of rows) {
      const same = book.find((b) => b.id === r.id);
      assert.ok(same, `${r.id} is on the ledger`);
      assert.equal(r.tzs, same.tzs, "and comes to the same shillings");
    }
  });

  test("the shares of every row add up to the row, exactly", async () => {
    for (const r of await ours()) {
      assert.equal(r.split.LCL + r.split.FCL + r.split.transport, r.tzs, `${r.id} is partitioned without remainder`);
    }
  });

  test("loose cargo with transport: freight and fare kept apart", async () => {
    const row = (await ours()).find((r) => r.paymentIds.length === 1 && r.sources[0] === "LCL" && r.counted);
    assert.ok(row);
    assert.equal(row.split.transport, 20 * 2650, "USD 20 of transport at the payment's own rate");
    assert.equal(row.split.LCL, 400 * 2650);
    assert.equal(row.split.FCL, 0);
  });

  test("a reversed payment is listed, and counts as nothing", async () => {
    const reversed = (await ours()).find((r) => !r.counted);
    assert.ok(reversed, "the reversed payment is still on the list");
    const counted = (await ours()).filter((r) => r.counted).reduce((sum, r) => sum + r.tzs, 0);
    assert.equal(counted, (420 + 1500 + 200 + 1000) * 2650, "and is not in the total");
  });

  test("one transfer paying two bills is one row, split by what each bill was", async () => {
    const merged = (await ours()).find((r) => r.merged);
    assert.ok(merged, "the merged transfer is one row");
    assert.deepEqual([...merged.paymentIds].sort(), [s.splitA, s.splitB].sort());
    assert.deepEqual([...merged.sources].sort(), ["FCL", "LCL"]);
    assert.equal(merged.split.LCL, 200 * 2650);
    assert.equal(merged.split.FCL, 1000 * 2650);
    assert.equal(merged.tzs, 1200 * 2650);
  });

  test("a day with no payments has no income", async () => {
    const rows = (await income.incomeBetween("2001-01-01", "2001-01-01")).filter(
      (r) => r.account.id === s.accountId
    );
    assert.equal(rows.length, 0);
  });
});

describe("what the bills were made of", () => {
  test("freight less its discount, storage, and the rest, each at the bill's own rate", async () => {
    const billed = await income.billedBetween("2001-02-03", "2001-02-03");
    assert.deepEqual(billed, { freight: 370 * 2650, storage: 12 * 2650, other: 3 * 2650 });
  });

  test("a day with no bills issued has nothing billed", async () => {
    assert.deepEqual(await income.billedBetween("2001-02-04", "2001-02-04"), { freight: 0, storage: 0, other: 0 });
  });
});

describe("who still owes", () => {
  test("a half-paid bill is on the list with what is left, a paid one is not", async () => {
    const { customers } = await income.owingCustomers();
    const row = customers.find((c) => c.customerId === s.customerId);
    assert.ok(row, "the customer is on the list");
    const bills = row.bills.map((b) => b.invoiceId);
    assert.ok(bills.includes(s.owed), "the half-paid container bill is owed");
    assert.ok(!bills.includes(s.paidOff), "the loose-cargo bill paid in full is not");
    assert.equal(row.tzs, 1500 * 2650, "USD 1,500 left, in shillings at the bill's own rate");
    assert.equal(row.state, "IN_DAR", "the goods are in Dar");
  });
});
