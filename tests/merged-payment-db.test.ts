import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { Prisma, PrismaClient } from "@prisma/client";

/* The hook before any file of ours: see tests/bill-changes-db.test.ts. */
const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

/* The link is signed with the server secret; a test process has none of its own. */
process.env.AUTH_SECRET ||= "test-secret-for-merged-payments";

const combined = load("@/lib/combined-bill") as typeof import("@/lib/combined-bill");
const pdfData = load("@/lib/combined-bill-pdf-data") as typeof import("@/lib/combined-bill-pdf-data");
const pdfLib = load("@/lib/combined-bill-pdf") as typeof import("@/lib/combined-bill-pdf");
const messages = load("@/lib/messages") as typeof import("@/lib/messages");
const links = load("@/lib/cargo-links") as typeof import("@/lib/cargo-links");
const keys = load("@/lib/track-key") as typeof import("@/lib/track-key");
const tracking = load("@/lib/tracking") as typeof import("@/lib/tracking");
const balances = load("@/lib/invoice-balance") as typeof import("@/lib/invoice-balance");
const confirmLib = load("@/lib/price-confirmation") as typeof import("@/lib/price-confirmation");
const mergeActions = load("@/lib/actions/merge") as typeof import("@/lib/actions/merge");
const invoiceRoute = load("../app/(public)/track/[code]/invoice/route") as typeof import("../app/(public)/track/[code]/invoice/route");

/**
 * ONE PAYMENT ACROSS THREE CONSIGNMENTS, AND THREE CONSIGNMENTS AFTERWARDS.
 *
 * The owner's rule, tested end to end: merge the payment, never the cargo.
 * Three real consignments for one customer are landed, priced from the rate
 * book, paid with one transfer through the real action, and then read back the
 * way the customer reads them — the WhatsApp letter, the merged tracking view
 * and the combined-bill PDF.
 *
 * What it is really watching for:
 *
 *  - every reference survives the merge, and each still tracks on its own,
 *    before and after the money lands;
 *  - the figures in all three places are the ones `balanceOf` derives, with
 *    each bill at its own pinned rate;
 *  - a draft is in none of them;
 *  - another customer's bill is in none of them, and their key opens none of
 *    this one's;
 *  - one press is one payment, however many times it is pressed.
 *
 * Nothing rolls back: the actions reach for the prisma singleton, so what they
 * write is committed and taken out again in `unseed`.
 */

const prisma = new PrismaClient();
after(() => prisma.$disconnect());

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

function form(fields: Record<string, string>, repeated: [string, string][] = []) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  for (const [key, value] of repeated) data.append(key, value);
  return data;
}

const stamp = () => Date.now().toString(36).toUpperCase().slice(-5);

/** One customer of our own, with nobody else's records anywhere near them. */
async function customerOf(tag: string) {
  return prisma.customer.create({
    data: { code: `MRG-${tag}`, fullName: `Juma Merge ${tag}`, phone: `+2557${tag}00111`, address: "Kariakoo, Dar es Salaam" },
  });
}

/** A consignment standing on the Dar floor, counted and signed off. */
async function landed(customerId: string, tag: string, goods: string, cbm: string, packages: number, pieces: number) {
  const warehouse = await prisma.warehouse.findFirst({ where: { kind: "TANZANIA" } });
  assert.ok(warehouse, "needs a Dar warehouse");
  const cargo = await prisma.cargo.create({
    data: {
      reference: `MRG-${tag}`,
      qrToken: `MRG-QR-${tag}`,
      senderId: customerId,
      receiverId: customerId,
      description: goods,
      status: "RECEIVED_DAR",
      darArrivedAt: new Date(),
    },
  });
  await prisma.darReceiving.create({
    data: {
      cargoId: cargo.id,
      warehouseId: warehouse.id,
      packagesCount: packages,
      piecesCount: pieces,
      cbm: new Prisma.Decimal(cbm),
      verified: true,
      verifiedAt: new Date(),
    },
  });
  await prisma.cargoStatusHistory.create({
    data: { cargoId: cargo.id, from: "IN_TRANSIT", to: "RECEIVED_DAR", reason: "Booked in" },
  });
  return cargo;
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
  return prisma.invoice.findFirstOrThrow({ where: { cargoId, status: { not: "DRAFT" } } });
}

async function unseed(cargoIds: string[], customerIds: string[]) {
  const invoices = await prisma.invoice.findMany({ where: { cargoId: { in: cargoIds } }, select: { id: true } });
  const ids = invoices.map((i) => i.id);
  const payments = await prisma.payment.findMany({ where: { invoiceId: { in: ids } }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  await prisma.receipt.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.paymentProof.deleteMany({ where: { paymentId: { in: paymentIds } } });
  await prisma.payment.updateMany({ where: { invoiceId: { in: ids } }, data: { writeOffOfId: null } });
  await prisma.payment.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.customerContact.deleteMany({ where: { cargoId: { in: cargoIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: ids } } });
  await prisma.auditLog.deleteMany({
    where: { entityId: { in: [...ids, ...cargoIds, ...customerIds, ...paymentIds] } },
  });
  await prisma.fieldChange.deleteMany({ where: { entityId: { in: [...ids, ...cargoIds, ...paymentIds] } } });
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

/** Three of this customer's, a draft of theirs, and a stranger's. */
async function scene() {
  const finance = await desk("FINANCE");
  const tag = stamp();
  const customer = await customerOf(tag);
  const stranger = await customerOf(`X${tag}`.slice(0, 5));

  const one = await landed(customer.id, `A${tag}`, "Ladies handbags", "1.440", 12, 240);
  const two = await landed(customer.id, `B${tag}`, "Shoes", "0.960", 8, 160);
  const three = await landed(customer.id, `C${tag}`, "Machine parts", "2.100", 4, 4);
  /* A consignment of theirs that Finance has not priced yet: a DRAFT is
     nobody's bill and belongs in none of this. */
  const draftCargo = await landed(customer.id, `D${tag}`, "Curtains", "0.500", 2, 20);
  const strangerCargo = await landed(stranger.id, `S${tag}`, "Radios", "0.300", 1, 10);

  const bills = [];
  for (const cargo of [one, two, three]) bills.push(await issuedFromBook(cargo.id, finance));
  const strangerBill = await issuedFromBook(strangerCargo.id, finance);

  await prisma.invoice.create({
    data: {
      number: `INV-MRG-${tag}`,
      customerId: customer.id,
      cargoId: draftCargo.id,
      status: "DRAFT",
      currency: "USD",
      total: new Prisma.Decimal("120.00"),
      fxRate: new Prisma.Decimal("2700"),
      totalTzs: new Prisma.Decimal("324000"),
    },
  });

  /* Three consignments do not stand in the same place, and the merge does not
     move them: one is cleared for collection while the others are on the floor. */
  await prisma.cargo.update({ where: { id: three.id }, data: { status: "READY_FOR_RELEASE" } });

  return {
    finance,
    customer,
    stranger,
    cargos: [one, two, three],
    draftCargo,
    strangerCargo,
    bills,
    strangerBill,
    cargoIds: [one.id, two.id, three.id, draftCargo.id, strangerCargo.id],
    customerIds: [customer.id, stranger.id],
  };
}

const outstandingTzsOf = async (invoiceId: string) => {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: balances.BALANCE_SELECT,
  });
  return balances.balanceOf(invoice).outstandingTzs;
};

describe("one payment across three consignments", () => {
  test("the letter carries the customer, every reference and the figures balanceOf derives", async () => {
    const s = await scene();
    try {
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(merged, "the group is found from any one of its consignments");
      assert.equal(merged.rows.length, 3, "three bills, and only three");
      assert.equal(merged.customerName, s.customer.fullName);

      /* Every figure is the one the payment desk and the release check read. */
      for (const bill of s.bills) {
        const owed = (await outstandingTzsOf(bill.id))?.toString();
        assert.equal(
          merged.rows.find((r) => r.invoiceId === bill.id)?.outstandingTzs?.toString(),
          owed,
          `${bill.number} is in the group at the figure balanceOf derives`
        );
      }
      const summed = merged.rows.reduce(
        (total, row) => total.add(row.outstandingTzs ?? 0),
        new Prisma.Decimal(0)
      );
      assert.equal(merged.totals.outstandingTzs?.toString(), summed.toString());

      const letter = messages.mergeBillLetter(combined.mergeLetterContextFor(merged));
      assert.ok(letter.startsWith("*BLUEWAVE CARGO*"), "the company's own letter");
      assert.ok(letter.includes("Habari Juma!"));
      for (const cargo of s.cargos) assert.ok(letter.includes(cargo.reference), `${cargo.reference} is named`);
      assert.ok(letter.includes("*MIZIGO ILIYOMO (3)*"));

      /* The goods added up, as the Dar counter measured them. */
      assert.ok(letter.includes("• Mizigo: 24"), letter);
      assert.ok(letter.includes("• Vipande: 404"));
      assert.ok(letter.includes("• Ujazo: 4.500 CBM"));

      /* Nothing of anybody else's, and nothing of a draft. */
      assert.equal(letter.includes(s.strangerCargo.reference), false);
      assert.equal(letter.includes(s.draftCargo.reference), false);
      assert.equal(merged.rows.some((row) => row.reference === s.draftCargo.reference), false);
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("consignments that stand in different places each keep their own status", async () => {
    const s = await scene();
    try {
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(merged);
      const stages = new Set(merged.rows.map((row) => row.stageLabel));
      assert.equal(stages.size, 2, "the group does not flatten three consignments into one status");
      assert.ok(stages.has("Arrived in Dar es Salaam"));
      assert.ok(stages.has("Ready for pickup"));

      /* Where they differ the letter says so on each line rather than
         claiming one status for all of them. */
      const letter = messages.mergeBillLetter(combined.mergeLetterContextFor(merged));
      assert.equal(letter.includes("• Status:"), false);
      assert.ok(letter.includes(`${s.cargos[2].reference}`));
      assert.ok(letter.includes("(Ready for pickup)"));
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("the rate line is printed only when every bill shares one", async () => {
    const s = await scene();
    try {
      const same = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(same?.sharedRate, "bills issued together share the rate they were pinned at");
      assert.ok(messages.mergeBillLetter(combined.mergeLetterContextFor(same)).includes("• Exchange Rate: 1 USD ="));

      /* One bill agreed at another rate: saying "the rate" over the group
         would be wrong for two thirds of the money. */
      await prisma.invoice.update({
        where: { id: s.bills[1].id },
        data: { fxRate: new Prisma.Decimal("2500") },
      });
      const apart = await combined.mergedBillFor(s.cargos[0].reference);
      assert.equal(apart?.sharedRate, null);
      assert.equal(
        messages.mergeBillLetter(combined.mergeLetterContextFor(apart!)).includes("Exchange Rate"),
        false
      );
      /* And each bill is still stated at its own rate, never at one of them. */
      const moved = apart!.rows.find((row) => row.invoiceId === s.bills[1].id);
      assert.equal(moved?.rate?.toString(), "2500");
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("storage is named once the goods are on the floor", async () => {
    const s = await scene();
    try {
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(merged?.storage, "three consignments booked in have a clock");
      assert.ok(merged.storage.freeDays > 0);
      assert.ok(merged.storage.lastFreeDay.getTime() >= merged.storage.arrivedAt.getTime());
      assert.ok(messages.mergeBillLetter(combined.mergeLetterContextFor(merged)).includes("*STORAGE:*"));
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

describe("the links a merged payment is sent with", () => {
  test("the tracking link opens the group, and every row opens its own cargo", async () => {
    const s = await scene();
    try {
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(merged);
      const anchor = combined.anchorOf(merged);
      const pair = links.mergedLinks(anchor);
      assert.ok(pair.track.includes("all=1"), "the tracking link asks for the group");
      assert.ok(pair.invoice.includes("/invoice?"), "and the other one is the document");
      assert.ok(pair.invoice.includes("all=1"), "the merged document, not one consignment's");

      const key = new URL(pair.track).searchParams.get("k");
      assert.ok(keys.trackKeyValid(anchor, key), "signed over the consignment it names");

      /* Every row carries its own key: a customer tapping their own cargo must
         never be told it is not theirs. */
      for (const row of merged.rows) {
        assert.ok(keys.trackKeyValid(row.reference, keys.trackKey(row.reference)));
        assert.equal(keys.trackKeyValid(row.reference, key), row.reference === anchor);
      }
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("tracking survives arrival, the merge and the payment", async () => {
    const s = await scene();
    try {
      /* Each consignment's own page, at every stage it reaches. */
      for (const cargo of s.cargos) {
        const found = await tracking.trackByReference(cargo.reference);
        assert.ok(found, `${cargo.reference} tracks while it stands in Dar`);
        assert.ok(found.journey.steps.length > 0, "the timeline is there");
      }

      await mergedPayment(s);

      for (const cargo of s.cargos) {
        const paid = await tracking.trackByReference(cargo.reference);
        assert.ok(paid, `${cargo.reference} still tracks after the payment`);
        assert.equal(paid.charge?.status, "PAID");
        assert.ok(paid.journey.steps.length > 0);
      }

      /* Collected is not the end of tracking either. */
      await prisma.cargo.update({ where: { id: s.cargos[2].id }, data: { status: "COLLECTED" } });
      const collected = await tracking.trackByReference(s.cargos[2].reference);
      assert.ok(collected, "a collected consignment still has a page");
      assert.ok(collected.journey.steps.length > 0);

      /* And the group is still the group: the payment tied them together. */
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.equal(merged?.rows.length, 3);
      assert.equal(merged?.status, "PAID");
      assert.ok(merged?.mergeRef?.startsWith("MERGE-"));
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

describe("a link already sent", () => {
  test("keeps the consignments it was sent about, and never picks up a later bill", async () => {
    const s = await scene();
    try {
      await mergedPayment(s);

      /* The customer ships again and a new bill is raised. The link in the
         letter they are holding is about the three that were paid, and it
         does not quietly become a demand for a fourth. */
      await prisma.invoice.updateMany({
        where: { cargoId: s.draftCargo.id },
        data: { status: "ISSUED", issuedAt: new Date() },
      });

      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.equal(merged?.rows.length, 3);
      assert.equal(merged?.rows.some((row) => row.reference === s.draftCargo.reference), false);
      assert.equal(merged?.status, "PAID");

      /* And the new bill, asked about on its own, is what is owed now. */
      const owing = await combined.mergedBillFor(s.draftCargo.reference);
      assert.equal(owing?.rows.length, 1, "one open bill is not a merge");
      assert.equal(owing?.rows[0].reference, s.draftCargo.reference);
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

describe("the combined bill a customer downloads", () => {
  test("carries every consignment in the group and nobody else's", async () => {
    const s = await scene();
    try {
      const loaded = await pdfData.loadCombinedBillPdf(s.cargos[0].reference);
      assert.ok(loaded, "three open bills make a combined bill");
      const references = loaded.input.rows.map((row) => row.reference);
      for (const cargo of s.cargos) assert.ok(references.includes(cargo.reference));
      assert.equal(references.includes(s.strangerCargo.reference), false);
      assert.equal(references.includes(s.draftCargo.reference), false);
      assert.equal(loaded.input.countLine, "3 consignments");

      /* Nothing about VAT: BlueWave's prices already include it. */
      assert.equal(JSON.stringify(loaded.input).toUpperCase().includes("VAT"), false);

      const pdf = pdfLib.renderCombinedBillPdf(loaded.input);
      assert.ok(pdf.byteLength > 0, "an empty buffer is a broken attachment");
      assert.equal(Buffer.from(pdf.slice(0, 4)).toString("latin1"), "%PDF");
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("each payment stays its own line, in the currency it arrived in", async () => {
    const s = await scene();
    try {
      await mergedPayment(s);
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.ok(merged);
      assert.equal(merged.payments.length, 3, "one slice per bill, never one invented payment");
      for (const payment of merged.payments) {
        assert.equal(payment.currency, "TZS");
        assert.ok(payment.amount.greaterThan(0));
        assert.ok(payment.reference.length > 0);
      }
      const loaded = await pdfData.loadCombinedBillPdf(s.cargos[0].reference);
      assert.equal(loaded?.input.payments.length, 3);
      assert.equal(loaded?.input.stamp.label, "Paid");
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

describe("the public route that hands the merged bill out", () => {
  test("gives it to the key we signed, and to nothing else", async () => {
    const s = await scene();
    try {
      const reference = s.cargos[0].reference;
      const ok = await get(`${reference}?all=1&k=${keys.trackKey(reference)}`, reference);
      assert.equal(ok.status, 200);
      assert.equal(ok.headers.get("Content-Type"), "application/pdf");
      assert.equal(ok.headers.get("X-Robots-Tag"), "noindex");
      assert.equal(ok.headers.get("Cache-Control"), "no-store");

      /* A reference is printed on every box, so it proves nothing on its own. */
      const noKey = await get(`${reference}?all=1`, reference);
      assert.equal(noKey.status, 404);
      const wrongKey = await get(`${reference}?all=1&k=AAAAAAAAAAAAAAAA`, reference);
      assert.equal(wrongKey.status, 404);

      /* Somebody else's key opens their own cargo and never this one. */
      const stranger = await get(
        `${reference}?all=1&k=${keys.trackKey(s.strangerCargo.reference)}`,
        reference
      );
      assert.equal(stranger.status, 404);
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });

  test("refuses a draft and a customer with nothing merged", async () => {
    const s = await scene();
    try {
      /* A draft is Finance's working. It has no document and never had one. */
      const draft = await get(
        `${s.draftCargo.reference}?all=1&k=${keys.trackKey(s.draftCargo.reference)}`,
        s.draftCargo.reference
      );
      assert.equal(draft.status, 404);

      /* One bill is not a merge, whoever holds the key. */
      const alone = await get(
        `${s.strangerCargo.reference}?all=1&k=${keys.trackKey(s.strangerCargo.reference)}`,
        s.strangerCargo.reference
      );
      assert.equal(alone.status, 404);
      assert.equal(await combined.mergedBillFor(s.draftCargo.reference), null);
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

describe("pressing Record twice", () => {
  test("is one payment, one set of bills and one contact", async () => {
    const s = await scene();
    try {
      const key = `merge-test-${stamp()}`;
      const owed = await owedAcross(s);
      const first = await mergedPayment(s, key, owed);
      assert.ok(first.ok, first.error);
      const payments = await prisma.payment.count({ where: { customerId: s.customer.id } });
      const invoices = await prisma.invoice.count({ where: { customerId: s.customer.id } });

      /* The same press arriving twice — a desk's second tap, or a phone that
         retried. It carries the figure the screen showed, not a fresh one. */
      const again = await mergedPayment(s, key, owed);
      assert.ok(again.ok, again.error);
      assert.match(again.ok ?? "", /already/i, "the second press says it is already recorded");

      assert.equal(await prisma.payment.count({ where: { customerId: s.customer.id } }), payments);
      assert.equal(await prisma.invoice.count({ where: { customerId: s.customer.id } }), invoices);
      const receipts = await prisma.receipt.count({
        where: { invoice: { customerId: s.customer.id } },
      });
      assert.equal(receipts, 3, "one receipt per bill, not two");

      /* And the letter the desk would send is still the same three. */
      const merged = await combined.mergedBillFor(s.cargos[0].reference);
      assert.equal(merged?.rows.length, 3);
    } finally {
      await unseed(s.cargoIds, s.customerIds);
    }
  });
});

/** What the three bills owe between them, in the shillings they are paid in. */
async function owedAcross(s: Awaited<ReturnType<typeof scene>>) {
  let owed = new Prisma.Decimal(0);
  for (const bill of s.bills) owed = owed.add((await outstandingTzsOf(bill.id)) ?? 0);
  return owed;
}

/** One transfer covering the three bills, recorded the way the screen does it. */
async function mergedPayment(
  s: Awaited<ReturnType<typeof scene>>,
  idempotencyKey = `merge-${stamp()}`,
  amount?: Prisma.Decimal
) {
  const account = await prisma.bankAccount.findFirstOrThrow({
    where: { active: true, currency: "TZS", kind: { not: "CASH" } },
  });
  const owed = amount ?? (await owedAcross(s));

  sitAs(s.finance);
  return mergeActions.recordCombinedPayment(
    {},
    form(
      {
        customerId: s.customer.id,
        currency: "TZS",
        cargoAmount: owed.toFixed(0),
        accountId: account.id,
        idempotencyKey,
      },
      s.bills.map((bill) => ["invoiceIds", bill.id] as [string, string])
    )
  );
}

/** The public route, called the way a phone calls it. */
async function get(path: string, code: string) {
  return invoiceRoute.GET(new Request(`https://www.bluewavecargo.co.tz/track/${path}`), {
    params: Promise.resolve({ code }),
  });
}
