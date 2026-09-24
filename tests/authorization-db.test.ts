import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  WHO MAY REACH WHAT, DRIVEN THROUGH THE REAL SERVER ACTIONS.

  Every case here is a refusal somebody once got past. The actions are the real
  exports a form posts to, the permission table is the real one from
  lib/rbac.ts, and only the session is stood in for — see tests/stubs — so a
  refusal proved here is the refusal production gives.

  Rows are committed and removed again in `after`, so it needs a throwaway
  database — the same name check every other committing test makes, kept in one
  place so a second copy cannot drift and lock this file out of a database the
  rest of the suite happily writes to.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const { submitVisitRequest } = load("@/lib/actions/visits") as typeof import("@/lib/actions/visits");
const { submitSourcingRequest } =
  load("@/lib/actions/public-sourcing") as typeof import("@/lib/actions/public-sourcing");
const { assignRequest, quoteServiceRequest } =
  load("@/lib/actions/request-desk") as typeof import("@/lib/actions/request-desk");
const { updateException } = load("@/lib/actions/exceptions") as typeof import("@/lib/actions/exceptions");
const { saveInvoiceAdjustments } = load("@/lib/actions/invoices") as typeof import("@/lib/actions/invoices");
const { closeContainer } = load("@/lib/actions/close-container") as typeof import("@/lib/actions/close-container");
const { submitCustomerPayment } = load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");
const { customerReply } = load("@/lib/actions/messages") as typeof import("@/lib/actions/messages");
const { requestDelivery } = load("@/lib/actions/release") as typeof import("@/lib/actions/release");

const prisma = new PrismaClient();

/** Whoever the test says is at the screen. Undefined is nobody signed in. */
const seat = () => globalThis as { __TEST_ACTOR?: unknown };
const sitAs = (user: unknown) => {
  seat().__TEST_ACTOR = user;
};

type Desk = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string | null;
  warehouseId: string | null;
  customerId: string | null;
};

const tag = `AUTHAUDIT-${Date.now().toString(36).toUpperCase()}`;
const made = {
  visits: [] as string[],
  sourcing: [] as string[],
  bookings: [] as string[],
  cases: [] as string[],
  invoices: [] as string[],
  conversations: [] as string[],
  containerLines: [] as string[],
  containers: [] as string[],
  cargo: [] as string[],
  customers: [] as string[],
  users: [] as string[],
};

let china: Desk;
let dar: Desk;
let support: Desk;
let finance: Desk;
let warehouseId: string;

/** A staff seat of the given role, as the database currently describes one. */
async function deskFor(role: "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "CUSTOMER_SUPPORT" | "FINANCE"): Promise<Desk> {
  const user = await prisma.user.findFirst({
    where: { role, active: true, status: "ACTIVE" },
    select: { id: true, name: true, email: true, role: true, department: true, warehouseId: true, customerId: true },
  });
  assert.ok(user, `the seed leaves one ${role} account`);
  return user as Desk;
}

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value);
  }
  return data;
}

/** A number nobody else in the database is using. */
let phoneSeed = 0;
const phone = () => `+2557${String(Date.now()).slice(-7)}${phoneSeed++}`.slice(0, 13);

async function makeCustomer(label: string) {
  const customer = await prisma.customer.create({
    data: {
      code: `${tag}-${label}`.slice(0, 40),
      fullName: `${label} of ${tag}`,
      phone: phone(),
      shippingMark: `${tag}${label}`.slice(0, 40),
    },
    select: { id: true },
  });
  made.customers.push(customer.id);
  return customer.id;
}

async function makeCargo(label: string, ownerId: string, status: "ARRIVED_TANZANIA" | "RECEIVED_DAR" = "RECEIVED_DAR") {
  const cargo = await prisma.cargo.create({
    data: {
      reference: `${tag}-C-${label}`,
      qrToken: `${tag}-Q-${label}`,
      senderId: ownerId,
      receiverId: ownerId,
      description: "Test consignment",
      status,
    },
    select: { id: true, reference: true },
  });
  made.cargo.push(cargo.id);
  return cargo;
}

before(async () => {
  sitAs(undefined);
  [china, dar, support, finance] = await Promise.all([
    deskFor("CHINA_WAREHOUSE"),
    deskFor("DAR_WAREHOUSE"),
    deskFor("CUSTOMER_SUPPORT"),
    deskFor("FINANCE"),
  ]);
  const warehouse = await prisma.warehouse.findFirst({ where: { kind: "TANZANIA" }, select: { id: true } });
  assert.ok(warehouse, "the seed leaves a Dar warehouse");
  warehouseId = warehouse.id;
});

after(async () => {
  sitAs(undefined);
  /* Cases the actions themselves opened as well as the ones set up here: a
     take-off raises one, so a run against code without the guard leaves them. */
  const raised = await prisma.exceptionCase.findMany({
    where: { OR: [{ id: { in: made.cases } }, { cargoId: { in: made.cargo } }] },
    select: { id: true },
  });
  const caseIds = raised.map((c) => c.id);
  await prisma.exceptionEvent.deleteMany({ where: { caseId: { in: caseIds } } });
  await prisma.exceptionCase.deleteMany({ where: { id: { in: caseIds } } });
  await prisma.message.deleteMany({ where: { conversationId: { in: made.conversations } } });
  await prisma.conversation.deleteMany({ where: { id: { in: made.conversations } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: made.invoices } } });
  await prisma.invoice.deleteMany({ where: { id: { in: made.invoices } } });
  await prisma.containerCargo.deleteMany({ where: { id: { in: made.containerLines } } });
  await prisma.darReceiving.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.cargoStatusHistory.deleteMany({ where: { cargoId: { in: made.cargo } } });
  await prisma.fieldChange.deleteMany({ where: { entityId: { in: [...made.cargo, ...made.bookings, ...made.invoices] } } });
  await prisma.cargo.deleteMany({ where: { id: { in: made.cargo } } });
  await prisma.containerEvent.deleteMany({ where: { containerId: { in: made.containers } } });
  await prisma.container.deleteMany({ where: { id: { in: made.containers } } });
  await prisma.containerBooking.deleteMany({ where: { id: { in: made.bookings } } });
  await prisma.businessVisitRequest.deleteMany({ where: { reference: { in: made.visits } } });
  await prisma.sourcingRequest.deleteMany({ where: { reference: { in: made.sourcing } } });
  await prisma.notification.deleteMany({ where: { customerId: { in: made.customers } } });
  await prisma.user.deleteMany({ where: { id: { in: made.users } } });
  await prisma.customer.deleteMany({ where: { id: { in: made.customers } } });
  await prisma.$disconnect();
});

/* ------------------------------------------------------------------ public */

describe("the private status link on a website request", () => {
  test("a stranger who types somebody's number is not handed their key", async () => {
    const settings = await prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { visitsEnabled: true },
    });
    if (settings && !settings.visitsEnabled) return;

    const number = phone();
    const sent = await submitVisitRequest(
      {},
      form({ contactName: "First Traveller", contactPhone: number, travelers: "1", flexibleDates: "on", cities: ["Guangzhou"] })
    );
    assert.ok(sent.reference, sent.error);
    made.visits.push(sent.reference);
    assert.ok(sent.statusHref, "whoever sent it is given the link");

    /* The same number inside the duplicate window, typed by somebody else. */
    const guess = await submitVisitRequest(
      {},
      form({ contactName: "Somebody Else", contactPhone: number, travelers: "1", flexibleDates: "on", cities: ["Guangzhou"] })
    );
    assert.equal(guess.reference, sent.reference, "no second trip is raised");
    assert.equal(guess.statusHref, undefined, "and the key does not come back with it");

    const row = await prisma.businessVisitRequest.findUniqueOrThrow({
      where: { reference: sent.reference },
      select: { publicKey: true, contactName: true },
    });
    assert.equal(row.contactName, "First Traveller", "nor is the request overwritten");
    assert.ok(!JSON.stringify(guess).includes(row.publicKey), "the key is nowhere in the answer");
  });

  test("the same holds for a sourcing request", async () => {
    const settings = await prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { sourcingServices: true },
    });
    const service = (settings?.sourcingServices ?? ["PRODUCT"])[0];
    if (!service) return;

    const number = phone();
    const fields = {
      service,
      contactName: "First Buyer",
      contactPhone: number,
      product: `${tag} ceramic tiles`,
      quantity: "200 boxes",
    };
    const sent = await submitSourcingRequest({}, form(fields));
    assert.ok(sent.reference, sent.error);
    made.sourcing.push(sent.reference);
    assert.ok(sent.statusHref, "whoever sent it is given the link");

    const guess = await submitSourcingRequest({}, form({ ...fields, contactName: "Somebody Else" }));
    assert.equal(guess.reference, sent.reference);
    assert.equal(guess.statusHref, undefined, "the key does not come back to a stranger");
  });
});

/* ------------------------------------------------------------ the two floors */

describe("the Foshan floor works the request queue and does not price it", () => {
  test("a quotation is refused at the action, not only hidden on the screen", async () => {
    const booking = await prisma.containerBooking.create({
      data: { reference: `${tag}-BK`, type: "FULL_CONTAINER", contactName: "Enquirer", contactPhone: phone() },
      select: { id: true },
    });
    made.bookings.push(booking.id);

    sitAs(china);
    const refused = await quoteServiceRequest({}, form({ id: booking.id, amount: "4200", currency: "USD" }));
    assert.ok(refused.error, "the floor is refused");
    assert.equal(
      (await prisma.containerBooking.findUniqueOrThrow({ where: { id: booking.id } })).quotedAmount,
      null,
      "and nothing was written"
    );

    sitAs(support);
    const done = await quoteServiceRequest({}, form({ id: booking.id, amount: "4200", currency: "USD" }));
    assert.ok(done.ok, done.error);
    const after = await prisma.containerBooking.findUniqueOrThrow({ where: { id: booking.id } });
    assert.equal(after.quotedAmount?.toString(), "4200", "the counter does price it");
  });

  test("a request is not assigned to a customer's own portal login", async () => {
    const customerId = await makeCustomer("PORTAL");
    const login = await prisma.user.create({
      data: {
        name: "Portal Customer",
        email: `${tag.toLowerCase()}-portal@example.co.tz`,
        role: "CUSTOMER",
        passwordHash: "x",
        customerId,
      },
      select: { id: true },
    });
    made.users.push(login.id);

    const booking = await prisma.containerBooking.create({
      data: { reference: `${tag}-BK2`, type: "FULL_CONTAINER", contactName: "Enquirer", contactPhone: phone() },
      select: { id: true },
    });
    made.bookings.push(booking.id);

    sitAs(support);
    const refused = await assignRequest({}, form({ kind: "booking", id: booking.id, assignedToId: login.id }));
    assert.ok(refused.error, "a customer cannot be handed the queue");
    assert.equal(
      (await prisma.containerBooking.findUniqueOrThrow({ where: { id: booking.id } })).assignedToId,
      null
    );

    const taken = await assignRequest({}, form({ kind: "booking", id: booking.id, assignedToId: support.id }));
    assert.ok(taken.ok, taken.error);
  });
});

/* ------------------------------------------------------------------- cases */

describe("a case is the only thing that clears the warehouse flag", () => {
  test("a note on an already-resolved case does not clear a new discrepancy", async () => {
    const customerId = await makeCustomer("CASEA");
    const cargo = await makeCargo("CASEA", customerId);
    await prisma.darReceiving.create({
      data: { cargoId: cargo.id, warehouseId, packagesCount: 4, discrepancy: true },
    });
    const raised = await prisma.exceptionCase.create({
      data: {
        reference: `${tag}-EXC1`,
        type: "PACKAGE_MISMATCH",
        status: "RESOLVED",
        cargoId: cargo.id,
        title: "Counted short, settled",
        description: "Already answered for.",
        resolvedAt: new Date(),
      },
      select: { id: true },
    });
    made.cases.push(raised.id);

    /* Support holds `exception.raise` and neither `exception.resolve` nor
       `exception.close`. The form always sends the status select, so the
       posted status matches the one the case already stands at. */
    sitAs(support);
    const noted = await updateException(
      {},
      form({ caseId: raised.id, status: "RESOLVED", note: "Customer rang about it again." })
    );
    assert.ok(noted.ok, noted.error);

    const receiving = await prisma.darReceiving.findUniqueOrThrow({ where: { cargoId: cargo.id } });
    assert.equal(receiving.discrepancy, true, "the flag that stops release is still standing");
  });

  test("resolving one does clear it, for the desk that may resolve", async () => {
    const customerId = await makeCustomer("CASEB");
    const cargo = await makeCargo("CASEB", customerId);
    await prisma.darReceiving.create({
      data: { cargoId: cargo.id, warehouseId, packagesCount: 4, discrepancy: true },
    });
    const raised = await prisma.exceptionCase.create({
      data: {
        reference: `${tag}-EXC2`,
        type: "PACKAGE_MISMATCH",
        status: "OPEN",
        cargoId: cargo.id,
        title: "Counted short",
        description: "Two cartons short of the list.",
      },
      select: { id: true },
    });
    made.cases.push(raised.id);

    sitAs(support);
    const refused = await updateException(
      {},
      form({ caseId: raised.id, status: "RESOLVED", resolution: "Found on the next box." })
    );
    assert.ok(refused.error, "the desk that may not resolve is refused");

    sitAs(dar);
    const done = await updateException(
      {},
      form({ caseId: raised.id, status: "RESOLVED", resolution: "Found on the next box." })
    );
    assert.ok(done.ok, done.error);
    const receiving = await prisma.darReceiving.findUniqueOrThrow({ where: { cargoId: cargo.id } });
    assert.equal(receiving.discrepancy, false);
  });
});

/* ----------------------------------------------------------------- the bill */

describe("a bill the customer is holding", () => {
  test("the printed note on a paid bill is not rewritten under invoice.discount alone", async () => {
    const customerId = await makeCustomer("BILL");
    const cargo = await makeCargo("BILL", customerId);
    const invoice = await prisma.invoice.create({
      data: {
        number: `${tag}-INV`,
        customerId,
        cargoId: cargo.id,
        status: "PAID",
        currency: "USD",
        subtotal: new Prisma.Decimal(100),
        total: new Prisma.Decimal(100),
        notes: "Agreed at the counter.",
        issuedAt: new Date(),
      },
      select: { id: true },
    });
    made.invoices.push(invoice.id);

    sitAs(support);
    const refused = await saveInvoiceAdjustments(
      {},
      form({ invoiceId: invoice.id, notes: "Nothing was agreed.", reason: "tidy-up" })
    );
    assert.ok(refused.error, "a settled bill does not move");
    assert.equal(
      (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).notes,
      "Agreed at the counter."
    );

    /* Finance holds `invoice.edit`, which is what settledRefusal lets past. */
    sitAs(finance);
    const done = await saveInvoiceAdjustments(
      {},
      form({ invoiceId: invoice.id, notes: "Corrected by Finance.", reason: "correction" })
    );
    assert.ok(done.ok, done.error);
  });
});

/* ------------------------------------------------------------- the sailing */

describe("closing a sailing", () => {
  test("a desk that cannot carry out a disposal is refused before anything moves", async () => {
    const customerId = await makeCustomer("CLOSE");
    const cargo = await makeCargo("CLOSE", customerId, "ARRIVED_TANZANIA");
    const landed = await prisma.container.create({
      data: { reference: `${tag}-CTR-A`, status: "ARRIVED" },
      select: { id: true },
    });
    const loading = await prisma.container.create({
      data: { reference: `${tag}-CTR-B`, status: "LOADING" },
      select: { id: true },
    });
    made.containers.push(landed.id, loading.id);
    const line = await prisma.containerCargo.create({
      data: { containerId: landed.id, cargoId: cargo.id },
      select: { id: true },
    });
    made.containerLines.push(line.id);

    /*
      Finance closes a container and holds neither `container.load` nor
      `receiving.dar`. The take-off that used to run first commits, so a throw
      from the step after it left the consignment on no container at all.
    */
    sitAs(finance);
    const refused = await closeContainer(
      {},
      form({
        containerId: landed.id,
        reason: "It went on the next sailing.",
        [`outcome:${cargo.id}`]: `move:${loading.id}`,
      })
    );
    assert.ok(refused.error, "the close is refused");
    assert.match(refused.error!, /nothing has moved/i);

    const still = await prisma.containerCargo.findUnique({ where: { id: line.id } });
    assert.ok(still, "the consignment is still on the box it came off");
    const box = await prisma.container.findUniqueOrThrow({ where: { id: landed.id } });
    assert.equal(box.status, "ARRIVED", "and the sailing is still open");
    const after = await prisma.cargo.findUniqueOrThrow({ where: { id: cargo.id } });
    assert.equal(after.status, "ARRIVED_TANZANIA");
  });
});

/* ------------------------------------------------------------- the portal */

describe("one customer cannot reach another customer's records", () => {
  test("not a bill, not a thread, not a consignment — whatever id is posted", async () => {
    const mineId = await makeCustomer("MINE");
    const theirsId = await makeCustomer("THEIRS");
    const theirCargo = await makeCargo("THEIRS", theirsId);
    const theirInvoice = await prisma.invoice.create({
      data: {
        number: `${tag}-INV-T`,
        customerId: theirsId,
        cargoId: theirCargo.id,
        status: "ISSUED",
        currency: "USD",
        subtotal: new Prisma.Decimal(250),
        total: new Prisma.Decimal(250),
        fxRate: new Prisma.Decimal(2700),
        totalTzs: new Prisma.Decimal(675_000),
        issuedAt: new Date(),
      },
      select: { id: true },
    });
    made.invoices.push(theirInvoice.id);
    const theirThread = await prisma.conversation.create({
      data: { reference: `${tag}-TKT`, customerId: theirsId, subject: "Where are my boxes" },
      select: { id: true },
    });
    made.conversations.push(theirThread.id);

    const intruder = {
      id: `${tag}-intruder`,
      name: "Intruder",
      email: "intruder@example.co.tz",
      role: "CUSTOMER",
      department: null,
      warehouseId: null,
      customerId: mineId,
    };
    sitAs(intruder);

    const paid = await submitCustomerPayment(
      {},
      form({ invoiceId: theirInvoice.id, amount: "1000", currency: "TZS", method: "MOBILE_MONEY" })
    );
    assert.ok(paid.error, "somebody else's bill is not on their account");
    assert.equal(await prisma.payment.count({ where: { invoiceId: theirInvoice.id } }), 0);

    const replied = await customerReply({}, form({ conversationId: theirThread.id, body: "Hello?" }));
    assert.ok(replied.error, "nor is somebody else's thread");
    assert.equal(await prisma.message.count({ where: { conversationId: theirThread.id } }), 0);

    const delivery = await requestDelivery(
      {},
      form({
        cargoId: theirCargo.id,
        address: "Somewhere else entirely",
        contactName: "Intruder",
        contactPhone: "+255700000000",
      })
    );
    assert.ok(delivery.error, "nor is somebody else's consignment");
    assert.equal(await prisma.deliveryRequest.count({ where: { cargoId: theirCargo.id } }), 0);
  });
});
