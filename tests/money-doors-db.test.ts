import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/*
  THE DOORS MONEY COMES THROUGH, TRIED THE WAY SOMEBODY WOULD TRY THEM.

  Not what a form sends — what a request can send. Each case here is a figure
  the system used to accept, or a second press it used to answer with the
  database's own words. The actions are the real exports, the permission table
  is the real one, and only the session and the request headers are stood in
  for — see tests/stubs.

  Rows are committed and removed again in `after`. Run it only against a
  bluewave_test database.
*/
const url = process.env.DATABASE_URL ?? "";
if (!/\/bluewave_test[\w-]*(\?|$)/.test(url)) {
  throw new Error(
    `Refusing to run: DATABASE_URL must point at a bluewave_test database (got ${url || "nothing"}).`
  );
}

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const { recordMergedPayment, recordPayment, submitCustomerPayment } =
  load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");
const { adjustInvoice, issueInvoice } =
  load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const { requestDelivery } = load("@/lib/actions/release") as typeof import("@/lib/actions/release");
const { registerCustomer } = load("@/lib/actions/register") as typeof import("@/lib/actions/register");
const { balanceOf } = load("@/lib/invoice-balance") as typeof import("@/lib/invoice-balance");

const prisma = new PrismaClient();

const seat = () => globalThis as { __TEST_ACTOR?: unknown };
const sitAs = (user: unknown) => {
  seat().__TEST_ACTOR = user;
};

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const one of value) data.append(key, one);
    else data.append(key, value);
  }
  return data;
}

const tag = `MONEYDOOR-${Date.now().toString(36).toUpperCase()}`;
const made = {
  cargo: [] as string[],
  invoices: [] as string[],
  customers: [] as string[],
  users: [] as string[],
};

let phoneSeed = 0;
const phone = () => `+2557${String(Date.now()).slice(-7)}${phoneSeed++}`.slice(0, 13);

type Desk = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  warehouseId: string | null;
  customerId: string | null;
};

let finance: Desk;
let warehouseId: string;
let liveRate: { id: string; rate: Prisma.Decimal };
let customerId: string;
/** The customer's own login, as `authorizeCustomer` describes one. */
let portalSeat: Desk;

/** A consignment Dar has counted, so a bill on it is not blocked by the count. */
async function countedCargo(label: string) {
  const cargo = await prisma.cargo.create({
    data: {
      reference: `${tag}-${label}`,
      qrToken: `${tag}-Q-${label}`,
      senderId: customerId,
      receiverId: customerId,
      description: "Test consignment",
      status: "RECEIVED_DAR",
    },
    select: { id: true, reference: true },
  });
  made.cargo.push(cargo.id);
  await prisma.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId,
      packagesCount: 1,
      weightKg: new Prisma.Decimal(10),
      cbm: new Prisma.Decimal(1),
      receivedById: finance.id,
      verified: true,
    },
  });
  return cargo;
}

async function bill(
  label: string,
  status: "DRAFT" | "ISSUED",
  total: string,
  /** The two figures a re-price reads, for the cases that exercise one. */
  extra: { billableCbm?: Prisma.Decimal; appliedRate?: Prisma.Decimal } = {}
) {
  const cargo = await countedCargo(label);
  const invoice = await prisma.invoice.create({
    data: {
      number: `${tag}-INV-${label}`,
      customerId,
      cargoId: cargo.id,
      status,
      issuedAt: status === "ISSUED" ? new Date() : null,
      total: new Prisma.Decimal(total),
      subtotal: new Prisma.Decimal(total),
      currency: "USD",
      ...(status === "ISSUED"
        ? {
            exchangeRateId: liveRate.id,
            fxRate: liveRate.rate,
            totalTzs: new Prisma.Decimal(total).mul(liveRate.rate),
          }
        : {}),
      issuedById: finance.id,
      ...extra,
    },
    select: { id: true, number: true },
  });
  made.invoices.push(invoice.id);
  return { invoice, cargo };
}

before(async () => {
  sitAs(undefined);
  const user = await prisma.user.findFirst({
    where: { role: "FINANCE", active: true, status: "ACTIVE" },
    select: { id: true, name: true, email: true, role: true, department: true, warehouseId: true, customerId: true },
  });
  assert.ok(user, "the seed leaves one FINANCE account");
  finance = user as Desk;

  const warehouse = await prisma.warehouse.findFirst({ where: { kind: "TANZANIA" }, select: { id: true } });
  assert.ok(warehouse, "the seed leaves a Dar warehouse");
  warehouseId = warehouse.id;

  const rate = await prisma.exchangeRate.findFirst({
    where: { active: true },
    orderBy: { effectiveFrom: "desc" },
    select: { id: true, rate: true },
  });
  assert.ok(rate, "the seed leaves a live USD → TZS rate");
  liveRate = rate;

  const customer = await prisma.customer.create({
    data: {
      code: `${tag}-CUS`,
      fullName: `Buyer of ${tag}`,
      phone: phone(),
      shippingMark: tag,
    },
    select: { id: true },
  });
  made.customers.push(customer.id);
  customerId = customer.id;

  const login = await prisma.user.create({
    data: {
      name: `Buyer of ${tag}`,
      email: `${tag.toLowerCase()}@example.co.tz`,
      role: "CUSTOMER",
      passwordHash: "x",
      customerId,
    },
    select: { id: true, name: true, email: true, role: true, department: true, warehouseId: true, customerId: true },
  });
  made.users.push(login.id);
  portalSeat = login as Desk;
});

after(async () => {
  sitAs(undefined);
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: made.invoices } } });
  await prisma.paymentProof.deleteMany({ where: { payment: { invoiceId: { in: made.invoices } } } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: made.invoices } } });
  await prisma.pickupNote.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.deliveryRequest.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: made.invoices } } });
  await prisma.fieldChange.deleteMany({ where: { entityId: { in: [...made.invoices, ...made.cargo] } } });
  await prisma.invoice.deleteMany({ where: { id: { in: made.invoices } } });
  await prisma.darReceiving.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.cargoStatusHistory.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.notification.deleteMany({ where: { customerId: { in: made.customers } } });
  await prisma.cargo.deleteMany({ where: { id: { in: made.cargo } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.customer.deleteMany({ where: { id: { in: made.customers } } });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...made.invoices, ...made.cargo, ...made.customers] } },
  });
  await prisma.$disconnect();
});

/* ------------------------------------------------------------ the rate band */

describe("a rate the board would refuse settles nothing at the counter", () => {
  test("an agreed rate of two shillings to the dollar is refused on one bill", async () => {
    const { invoice } = await bill("RATE1", "ISSUED", "1000.00");

    sitAs(finance);
    const cheap = await recordPayment(
      {},
      form({
        invoiceId: invoice.id,
        amount: "2000",
        currency: "TZS",
        method: "CASH",
        fxRate: "2",
      })
    );
    assert.ok(cheap.error, "the counter refuses it");
    assert.match(cheap.error!, /sensible/, cheap.error);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
      include: { payments: true },
    });
    assert.equal(after.payments.length, 0, "and nothing was written");
    assert.equal(balanceOf(after).settled, false, "the bill still owes what it owed");
  });

  test("the same rate is refused on a handover covering several bills", async () => {
    const { invoice } = await bill("RATE2", "ISSUED", "1000.00");

    sitAs(finance);
    const cheap = await recordMergedPayment(
      {},
      form({
        customerId,
        invoiceIds: [invoice.id],
        amount: "2000",
        currency: "TZS",
        method: "CASH",
        fxRate: "2",
      })
    );
    assert.ok(cheap.error, "the merged counter refuses it too");
    assert.match(cheap.error!, /sensible/, cheap.error);
    assert.equal(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
      0,
      "and nothing was written"
    );
  });

  test("the board's own rate still goes through", async () => {
    const { invoice } = await bill("RATE3", "ISSUED", "1.00");

    sitAs(finance);
    const taken = await recordPayment(
      {},
      form({
        invoiceId: invoice.id,
        amount: liveRate.rate.toString(),
        currency: "TZS",
        method: "CASH",
        fxRate: liveRate.rate.toString(),
      })
    );
    assert.ok(taken.ok, taken.error);
  });
});

/* ------------------------------------------------------- what a bill can say */

describe("a bill cannot be talked below nothing", () => {
  test("a negative additional charge is refused rather than folded into the subtotal", async () => {
    const { invoice } = await bill("NEG", "DRAFT", "500.00", {
      billableCbm: new Prisma.Decimal("1"),
      appliedRate: new Prisma.Decimal("500"),
    });

    sitAs(finance);
    const negative = await adjustInvoice(
      {},
      form({ invoiceId: invoice.id, additionalCharge: "-900", reason: "test" })
    );
    assert.ok(negative.error, "the charge is refused");

    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.ok(after.total.greaterThan(0), `the bill is still a bill, not a debt (${after.total})`);
  });

  test("a bill is not issued already overdue", async () => {
    const { invoice } = await bill("DUE", "DRAFT", "10.00");

    sitAs(finance);
    const backdated = await issueInvoice({}, form({ invoiceId: invoice.id, dueDays: "-3650" }));
    assert.ok(backdated.error, "the term is refused");
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).status,
      "DRAFT",
      "and the bill was not issued"
    );

    const issued = await issueInvoice({}, form({ invoiceId: invoice.id, dueDays: "7" }));
    assert.ok(issued.ok, issued.error);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.ok(after.dueAt && after.dueAt.getTime() > Date.now(), "a real term lands in the future");
  });
});

/* ------------------------------------------------------------ second presses */

describe("a second press is answered, never thrown", () => {
  test("two desks issuing one bill together: one issues, the other is told so", async () => {
    const { invoice } = await bill("RACE", "DRAFT", "25.00");

    sitAs(finance);
    const both = await Promise.allSettled([
      issueInvoice({}, form({ invoiceId: invoice.id, dueDays: "7" })),
      issueInvoice({}, form({ invoiceId: invoice.id, dueDays: "7" })),
    ]);
    for (const outcome of both) {
      assert.equal(
        outcome.status,
        "fulfilled",
        `the loser is handed a sentence, not an error page: ${
          outcome.status === "rejected" ? (outcome.reason as Error).message : ""
        }`
      );
    }
    const answers = both.map((o) => (o as PromiseFulfilledResult<{ ok?: string; error?: string }>).value);
    assert.equal(answers.filter((a) => a.ok).length, 1, "exactly one of them issued it");
    assert.equal(answers.filter((a) => a.error).length, 1, "and the other was told why not");

    assert.equal(
      await prisma.auditLog.count({ where: { entityId: invoice.id, action: "invoice.issue" } }),
      1,
      "the bill was issued once"
    );
  });

  test("a customer tapping 'I have paid' twice sends one claim and reads one answer", async () => {
    const { invoice } = await bill("TWICE", "ISSUED", "10.00");

    sitAs(portalSeat);
    const key = `${tag}-KEY`;
    const both = await Promise.allSettled([
      submitCustomerPayment({}, form({ invoiceId: invoice.id, amount: "5000", currency: "TZS", idempotencyKey: key })),
      submitCustomerPayment({}, form({ invoiceId: invoice.id, amount: "5000", currency: "TZS", idempotencyKey: key })),
    ]);
    for (const outcome of both) {
      assert.equal(
        outcome.status,
        "fulfilled",
        `the second tap is answered, not thrown: ${
          outcome.status === "rejected" ? (outcome.reason as Error).message : ""
        }`
      );
      const answer = (outcome as PromiseFulfilledResult<{ ok?: string; error?: string }>).value;
      assert.ok(answer.ok, `and it is a thank-you, not a fault: ${answer.error}`);
      assert.ok(!/prisma|constraint|P\d{4}/i.test(JSON.stringify(answer)), "with no database wording in it");
    }

    assert.equal(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
      1,
      "one claim reached Finance"
    );
  });
});

/* ------------------------------------------ what a customer may put in a form */

describe("a customer's own forms are bounded", () => {
  test("a payment cannot be claimed for a day that is not a day, or one still to come", async () => {
    const { invoice } = await bill("DATE", "ISSUED", "10.00");

    sitAs(portalSeat);
    const nonsense = await submitCustomerPayment(
      {},
      form({ invoiceId: invoice.id, amount: "5000", currency: "TZS", paidAt: "whenever" })
    );
    assert.ok(nonsense.error, "an unreadable day is refused");
    assert.ok(!/prisma|invalid date/i.test(nonsense.error!), nonsense.error);

    const ahead = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    const future = await submitCustomerPayment(
      {},
      form({ invoiceId: invoice.id, amount: "5000", currency: "TZS", paidAt: ahead })
    );
    assert.ok(future.error, "so is a day that has not happened");

    assert.equal(
      await prisma.payment.count({ where: { invoiceId: invoice.id } }),
      0,
      "neither reached the verify queue"
    );
  });

  test("a delivery asked for on a day nobody can read is refused, not crashed into", async () => {
    const cargo = await countedCargo("DEL");

    sitAs(portalSeat);
    const asked = await requestDelivery(
      {},
      form({
        cargoId: cargo.id,
        address: "12 Nyerere Road, Dar es Salaam",
        contactName: "Receiver",
        contactPhone: "0712345678",
        preferredDate: "soon please",
      })
    );
    assert.ok(asked.error, "the day is refused");
    assert.ok(!/prisma|invalid date/i.test(asked.error!), asked.error);
    assert.equal(
      await prisma.deliveryRequest.count({ where: { cargoId: cargo.id } }),
      0,
      "and no lorry was booked"
    );
  });
});

/* ------------------------------------------------------------- the front door */

describe("signing up is throttled like every other public form", () => {
  test("one connection cannot open accounts as fast as it can ask", async () => {
    sitAs(undefined);
    /* Deliberately incomplete, so nothing is written whatever the answer is:
       the throttle is read before the form is, which is the point. */
    const attempt = () => registerCustomer({}, form({ fullName: "", phone: "", email: "", password: "", confirmPassword: "" }));

    let throttled: string | undefined;
    for (let i = 0; i < 12 && !throttled; i++) {
      const answer = await attempt();
      if (answer.error && /too many sign-ups/i.test(answer.error)) throttled = answer.error;
    }
    assert.ok(throttled, "a connection that keeps asking is eventually told to stop");
    assert.equal(
      await prisma.customer.count({ where: { code: { startsWith: "CUS-" }, fullName: "" } }),
      0,
      "and nothing half-formed was written on the way"
    );
  });
});
