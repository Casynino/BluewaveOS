import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

/*
  THE HOOK GOES IN BEFORE ANY FILE OF OURS DOES — see
  tests/website-requests-db.test.ts. Uploads go to a throwaway folder so the
  reference-photo test leaves nothing in storage/.
*/
const uploads = mkdtempSync(path.join(tmpdir(), "bw-china-requests-"));
process.env.UPLOAD_DIR = uploads;

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const { submitVisitRequest, updateVisitRequest } =
  load("@/lib/actions/visits") as typeof import("@/lib/actions/visits");
const { submitSourcingRequest } =
  load("@/lib/actions/public-sourcing") as typeof import("@/lib/actions/public-sourcing");

/**
 * THE CHINA REQUESTS, AGAINST THE REAL DATABASE.
 *
 * What a stranger can write (a request, and nothing the desk decides), what
 * the status link opens (its own row, and only with its key), and what the
 * desk must do before a visit reads "Confirmed" (write the plan down).
 */

const prisma = new PrismaClient();
const made = { visits: [] as string[], sourcing: [] as string[] };
const actor = () => globalThis as { __TEST_ACTOR?: unknown };

before(() => {
  actor().__TEST_ACTOR = undefined;
});

after(async () => {
  await prisma.businessVisitRequest.deleteMany({ where: { reference: { in: made.visits } } });
  await prisma.sourcingRequest.deleteMany({ where: { reference: { in: made.sourcing } } });
  await prisma.$disconnect();
  rmSync(uploads, { recursive: true, force: true });
});

function form(fields: Record<string, string | string[] | File[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value);
  }
  return data;
}

const inAMonth = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const inSixWeeks = () => new Date(Date.now() + 42 * 86_400_000).toISOString().slice(0, 10);
const phone = (n: number) => `+2557${String(Date.now()).slice(-6)}${n}`.slice(0, 13);

/** The smallest PNG there is: eight signature bytes and enough after them. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
]);

describe("a business visit off the website", () => {
  test("lands as a request, with nothing the desk decides", async () => {
    const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { visitsEnabled: true } });
    if (settings && !settings.visitsEnabled) return;

    const result = await submitVisitRequest(
      {},
      form({
        contactName: "Test Traveller",
        contactPhone: phone(1),
        whatsapp: "+255700000001",
        contactEmail: "Traveller@Example.com",
        travelFrom: inAMonth(),
        travelTo: inSixWeeks(),
        cities: ["Guangzhou", "Foshan"],
        markets: ["Baima Clothing Market"],
        categories: ["Clothing & textiles"],
        travelers: "3",
        language: "Swahili",
        wantsHotelHelp: "on",
        notes: "Looking for fabric suppliers.",
        /* What a hand-posted form might try. */
        status: "CONFIRMED",
        plan: "Everything booked",
        staffNote: "vip",
        assignedToId: "anyone",
        website: "",
      })
    );
    assert.ok(result.reference, result.error ?? "not created");
    made.visits.push(result.reference!);
    assert.match(result.reference!, /^BV-\d{4}-\d{6}$/);
    assert.ok(result.statusHref?.startsWith(`/visit/status/${result.reference}?k=`));

    const row = await prisma.businessVisitRequest.findUniqueOrThrow({ where: { reference: result.reference! } });
    assert.equal(row.status, "REQUESTED");
    assert.equal(row.plan, null);
    assert.equal(row.staffNote, null);
    assert.equal(row.assignedToId, null);
    assert.equal(row.customerId, null);
    assert.deepEqual(row.cities, ["Guangzhou", "Foshan"]);
    assert.equal(row.travelers, 3);
    assert.equal(row.wantsHotelHelp, true);
    assert.equal(row.wantsTransportHelp, false);
    assert.equal(row.contactEmail, "traveller@example.com");

    /* The key in the link is the row's own; the reference alone opens nothing. */
    const key = new URL(result.statusHref!, "http://x").searchParams.get("k")!;
    assert.equal(key, row.publicKey);
    assert.ok(await prisma.businessVisitRequest.findFirst({ where: { reference: row.reference, publicKey: key } }));
    assert.equal(await prisma.businessVisitRequest.findFirst({ where: { reference: row.reference, publicKey: "wrong" } }), null);

    /* A second press of Send is the same request. */
    const again = await submitVisitRequest(
      {},
      form({ contactName: "Test Traveller", contactPhone: row.contactPhone, flexibleDates: "on", cities: ["Yiwu"], travelers: "1" })
    );
    assert.equal(again.reference, row.reference);
  });

  test("needs dates or a tick for flexible, and somewhere to go", async () => {
    const noDates = await submitVisitRequest(
      {},
      form({ contactName: "Test Traveller", contactPhone: phone(2), cities: ["Foshan"], travelers: "1" })
    );
    assert.ok(noDates.error);
    const nowhere = await submitVisitRequest(
      {},
      form({ contactName: "Test Traveller", contactPhone: phone(2), flexibleDates: "on", travelers: "1" })
    );
    assert.ok(nowhere.error);
  });

  test("the trap field is answered and nothing is written", async () => {
    const before = await prisma.businessVisitRequest.count();
    const result = await submitVisitRequest(
      {},
      form({ contactName: "Bot", contactPhone: phone(3), flexibleDates: "on", cities: ["Foshan"], travelers: "1", website: "http://spam" })
    );
    assert.ok(result.ok);
    assert.equal(result.reference, undefined);
    assert.equal(await prisma.businessVisitRequest.count(), before);
  });
});

describe("the desk moves a visit along", () => {
  test("nobody signed in cannot, and Confirmed needs a plan", async () => {
    const reference = made.visits[0];
    if (!reference) return;
    const row = await prisma.businessVisitRequest.findUniqueOrThrow({ where: { reference } });

    actor().__TEST_ACTOR = undefined;
    const stranger = await updateVisitRequest({}, form({ id: row.id, status: "CONFIRMED", plan: "x" }));
    assert.ok(stranger.error);

    const support = await prisma.user.findFirstOrThrow({ where: { role: "CUSTOMER_SUPPORT", active: true } });
    actor().__TEST_ACTOR = {
      id: support.id,
      name: support.name,
      email: support.email,
      role: support.role,
      department: support.department,
      warehouseId: support.warehouseId,
      customerId: null,
    };
    try {
      const bare = await updateVisitRequest({}, form({ id: row.id, status: "CONFIRMED", plan: "" }));
      assert.ok(bare.error, "confirmed without a plan");

      const ok = await updateVisitRequest(
        {},
        form({
          id: row.id,
          status: "CONFIRMED",
          assignedToId: support.id,
          plan: "Day 1: Baima market with Grace.",
          staffNote: "Prefers WhatsApp.",
        })
      );
      assert.equal(ok.ok, "Saved.", ok.error);

      const saved = await prisma.businessVisitRequest.findUniqueOrThrow({ where: { id: row.id } });
      assert.equal(saved.status, "CONFIRMED");
      assert.equal(saved.assignedToId, support.id);
      assert.equal(saved.plan, "Day 1: Baima market with Grace.");

      const changes = await prisma.fieldChange.findMany({
        where: { entity: "BusinessVisitRequest", entityId: row.id },
        select: { field: true, oldValue: true, newValue: true },
      });
      const status = changes.find((c) => c.field === "status");
      assert.deepEqual(status, { field: "status", oldValue: "REQUESTED", newValue: "CONFIRMED" });
      assert.ok(changes.some((c) => c.field === "plan"));
      assert.ok(changes.some((c) => c.field === "staffNote"));
    } finally {
      actor().__TEST_ACTOR = undefined;
    }
  });
});

describe("a sourcing request off the website", () => {
  test("lands in the desk's queue as a website request, photo attached", async () => {
    const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { sourcingServices: true } });
    const service = (settings?.sourcingServices ?? ["PRODUCT"])[0];
    if (!service) return;

    const result = await submitSourcingRequest(
      {},
      form({
        service,
        product: "Solar street lights 60 W",
        category: "Lighting",
        details: "Interested in: Guzhen Lighting Market",
        quantity: "200 pieces",
        budget: "USD 12 a piece",
        specifications: "IP65, 6000K",
        preferredCity: "Foshan",
        supplierNeeds: "A factory, not a trader",
        contactName: "Test Buyer",
        contactPhone: phone(4),
        whatsapp: "+255700000004",
        contactEmail: "buyer@example.com",
        photos: [new File([PNG], "light.png", { type: "image/png" })],
        status: "COMPLETED",
        outcome: "found it",
        website: "",
      })
    );
    assert.ok(result.reference, result.error ?? "not created");
    made.sourcing.push(result.reference!);
    assert.ok(result.statusHref?.startsWith(`/sourcing/status/${result.reference}?k=`));

    const row = await prisma.sourcingRequest.findUniqueOrThrow({
      where: { reference: result.reference! },
      include: { documents: true },
    });
    assert.equal(row.channel, "WEBSITE");
    assert.equal(row.status, "NEW");
    assert.equal(row.outcome, null);
    assert.equal(row.service, service);
    assert.equal(row.specifications, "IP65, 6000K");
    assert.equal(row.preferredCity, "Foshan");
    assert.equal(row.supplierNeeds, "A factory, not a trader");
    assert.equal(row.documents.length, 1);
    assert.match(row.documents[0].url, /^\/uploads\/sourcing\//);

    const key = new URL(result.statusHref!, "http://x").searchParams.get("k")!;
    assert.ok(await prisma.sourcingRequest.findFirst({ where: { reference: row.reference, publicKey: key, channel: "WEBSITE" } }));
    assert.equal(
      await prisma.sourcingRequest.findFirst({ where: { reference: row.reference, publicKey: `${key}x`, channel: "WEBSITE" } }),
      null
    );
  });

  test("a service the company does not offer is refused", async () => {
    const refused = await submitSourcingRequest(
      {},
      form({ service: "SMUGGLING", product: "Anything", contactName: "Test Buyer", contactPhone: phone(5) })
    );
    assert.ok(refused.error);
    assert.equal(refused.reference, undefined);
  });

  test("more than three photos is refused", async () => {
    const settings = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { sourcingServices: true } });
    const service = (settings?.sourcingServices ?? ["PRODUCT"])[0];
    const photos = Array.from({ length: 4 }, (_, i) => new File([PNG], `p${i}.png`, { type: "image/png" }));
    const refused = await submitSourcingRequest(
      {},
      form({ service, product: "Anything", contactName: "Test Buyer", contactPhone: phone(6), photos })
    );
    assert.ok(refused.error);
  });
});
