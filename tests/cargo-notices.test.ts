import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import Module from "node:module";
import path from "node:path";
import { before, describe, test } from "node:test";

import {
  CARGO_EVENTS,
  buildCargoNotice,
  noticePortal,
  noticeWhatsApp,
  type CargoEvent,
  type NoticeFacts,
} from "@/lib/cargo-notices";
import { BLUEWAVE_STAGES, bluewaveStageOf } from "@/lib/tracking-stage";

/**
 * The seven stage messages: each knows its event and borrows no other's
 * words, none speaks of clearance, nothing unknown is invented, and every link
 * opens a page that exists.
 */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };
process.env.AUTH_SECRET ||= "notice-test-secret";

let links: typeof import("@/lib/cargo-links");
before(async () => {
  links = await import("@/lib/cargo-links");
});

const NOW = new Date("2026-09-22T09:00:00Z");

/** Everything a consignment could know, so a template that leaks has something to leak. */
const FULL: NoticeFacts = {
  customerName: "Fatuma Hassan",
  reference: "BW0125",
  description: "Plastic chairs",
  cbm: "1.440",
  packages: 12,
  pieces: 240,
  shippingMark: "FATUMA-DSM",
  receiptNo: "R-5521",
  containerRef: "BWC26M09C3 (MSKU1234567)",
  departedAt: new Date("2026-09-01T09:00:00Z"),
  eta: new Date("2026-09-30T09:00:00Z"),
  invoiceNumber: "INV-2026-000125",
  amountTzs: "1,080,000",
  amountUsd: "400.00",
  fxRate: "2,700",
  paid: false,
  stageLabel: "Arrived in Dar es Salaam",
  arrivedAt: NOW,
  freeDays: 7,
  freeUntil: new Date("2026-09-28T09:00:00Z"),
  pickupAddress: "BlueWave Cargo, Tabata Matumbi, nyuma ya Azania Group, Dar es Salaam, Tanzania",
  pickupNoteNumber: "PN-2026-000044",
  collectedAt: NOW,
  collectedBy: "Fatuma Hassan",
  releaseNumber: "REL-2026-000031",
};

const LINKS = {
  track: "https://www.bluewavecargo.co.tz/track/BW0125?k=abc",
  viewCargo: "https://www.bluewavecargo.co.tz/portal/cargo/BW0125",
  invoice: "https://www.bluewavecargo.co.tz/track/BW0125/invoice?i=inv1&k=abc",
  payNow: "https://www.bluewavecargo.co.tz/portal/invoices/inv1",
  pickup: "https://www.bluewavecargo.co.tz/portal/pickups/pn1",
  warehouse: "https://www.bluewavecargo.co.tz/contact#dar-warehouse",
};

const text = (event: CargoEvent, facts: NoticeFacts = FULL, given = LINKS) =>
  noticeWhatsApp(buildCargoNotice(event, facts, given, NOW));

/* Words that belong to one event and must never appear in another's message. */
const SIGNATURE: Record<CargoEvent, RegExp> = {
  CARGO_RECEIVED_CHINA: /umepokelewa salama katika warehouse yetu nchini China/,
  CARGO_STORED_CHINA: /umehifadhiwa katika warehouse yetu nchini China/,
  CARGO_IN_TRANSIT: /umeanza safari/,
  PRICE_CONFIRMED: /invoice yako sasa iko tayari/,
  CARGO_ARRIVED_DAR: /umefika salama Dar es Salaam/,
  CARGO_READY_FOR_PICKUP: /uko tayari kuchukuliwa katika warehouse/,
  CARGO_COLLECTED: /umekabidhiwa/,
};

describe("stage messages", () => {
  test("each template says its own event and no other's", () => {
    for (const event of CARGO_EVENTS) {
      const body = text(event);
      assert.match(body, SIGNATURE[event], `${event} says what it is`);
      for (const other of CARGO_EVENTS) {
        if (other === event) continue;
        assert.doesNotMatch(body, SIGNATURE[other], `${event} borrows ${other}'s words`);
      }
      assert.match(body, /^\*BLUEWAVE CARGO\*/, "the company leads");
      assert.match(body, /Habari Fatuma!/, "the greeting uses the first name");
      assert.match(body, /Tracking: BW0125/);
      assert.ok(body.includes(LINKS.track), "one link: the keyed tracking page");
      assert.ok(!body.includes("/portal/"), "never a portal link most customers cannot open");
    }
  });

  test("no customer message speaks of clearance or customs", () => {
    for (const event of CARGO_EVENTS) {
      for (const paid of [false, true]) {
        const notice = buildCargoNotice(event, { ...FULL, paid, issue: true }, LINKS, NOW);
        const all = `${noticeWhatsApp(notice)} ${noticePortal(notice).title} ${noticePortal(notice).body}`;
        assert.doesNotMatch(all, /clear|customs|forodha/i, event);
      }
    }
  });

  test("received in China carries the counter's facts and no money, and never in-transit words", () => {
    const body = text("CARGO_RECEIVED_CHINA");
    for (const fact of ["Plastic chairs", "Ujazo: 1.440 CBM", "Mizigo: 12", "Vipande: 240", "Shipping mark: FATUMA-DSM", "Namba ya risiti: R-5521", "Status: Received in China"]) {
      assert.ok(body.includes(fact), fact);
    }
    assert.doesNotMatch(body, /TZS|USD|In transit|Inatarajiwa kufika|Kontena/);
    assert.ok(body.includes(LINKS.track));
  });

  test("in transit names the container, China to Dar, and an ETA only when one is recorded", () => {
    const known = text("CARGO_IN_TRANSIT");
    assert.match(known, /Kontena: BWC26M09C3 \(MSKU1234567\)/);
    assert.match(known, /Kuondoka: China/);
    assert.match(known, /Kuelekea: Dar es Salaam, Tanzania/);
    assert.match(known, /Inatarajiwa kufika: 30 Sept? 2026/);
    const unknown = text("CARGO_IN_TRANSIT", { ...FULL, eta: null });
    assert.doesNotMatch(unknown, /Inatarajiwa kufika/, "an unknown ETA is left out, never invented");
    assert.match(unknown, /Fuatilia mzigo wako/);
  });

  test("the invoice message gives shillings first, the dollar equivalent, and the real links", () => {
    const body = text("PRICE_CONFIRMED");
    assert.match(body, /\*Kiasi cha kulipa: TZS 1,080,000\*/);
    assert.match(body, /Sawa na: USD 400.00/);
    assert.match(body, /Invoice: INV-2026-000125/);
    assert.match(body, /Angalia invoice na njia za malipo/);
    assert.ok(body.includes(LINKS.track));
  });

  test("arrived in Dar gives the pickup warehouse and the storage countdown from today", () => {
    const body = text("CARGO_ARRIVED_DAR");
    assert.match(body, /Tabata Matumbi, nyuma ya Azania Group/);
    assert.match(body, /Storage bure: 7 days/);
    assert.match(body, /Storage inaanza: today/);
    assert.match(body, /Storage bure hadi: 28 Sept? 2026/);
    assert.match(body, /Status: Arrived in Dar es Salaam/);
    assert.ok(body.includes(LINKS.track));
  });

  test("ready for pickup sends to the pickup note and the warehouse", () => {
    const body = text("CARGO_READY_FOR_PICKUP");
    assert.match(body, /Pickup note: PN-2026-000044/);
    assert.match(body, /Tabata Matumbi, nyuma ya Azania Group/);
    assert.ok(body.includes(LINKS.track));
  });

  test("a letter with no tracking page draws no link", () => {
    const body = text("PRICE_CONFIRMED", FULL, { ...LINKS, track: "" });
    assert.doesNotMatch(body, /https?:\/\//);
  });

  test("the six stages cover every status, and none of them is clearance", () => {
    assert.deepEqual(
      BLUEWAVE_STAGES.map((s) => s.label),
      ["Received in China", "Stored in China", "In transit", "Arrived in Dar es Salaam", "Ready for pickup", "Collected"]
    );
    assert.equal(bluewaveStageOf("RECEIVED_CHINA"), "RECEIVED_IN_CHINA");
    assert.equal(bluewaveStageOf("ASSIGNED_TO_CONTAINER"), "STORED_IN_CHINA");
    assert.equal(bluewaveStageOf("CONTAINER_LOADED"), "STORED_IN_CHINA");
    assert.equal(bluewaveStageOf("DEPARTED_CHINA"), "IN_TRANSIT");
    assert.equal(bluewaveStageOf("IN_TRANSIT"), "IN_TRANSIT");
    assert.equal(bluewaveStageOf("ARRIVED_TANZANIA"), "IN_TRANSIT", "the port is not arrival");
    assert.equal(bluewaveStageOf("RECEIVED_DAR"), "ARRIVED_IN_DAR");
    assert.equal(bluewaveStageOf("READY_FOR_RELEASE"), "READY_FOR_PICKUP");
    assert.equal(bluewaveStageOf("COLLECTED"), "COLLECTED");
    assert.equal(bluewaveStageOf("DELIVERED"), "COLLECTED");
    assert.equal(bluewaveStageOf("MISSING_AT_DAR"), "IN_TRANSIT");
    assert.equal(bluewaveStageOf("CANCELLED"), null);
  });
});

/* ------------------------------------------------------------ real routes */

const APP = path.join(__dirname, "..", "app");

/** Does this site path resolve to a page or route handler under app/? */
function routeExists(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const walk = (dir: string, rest: string[]): boolean => {
    if (rest.length === 0) {
      if (existsSync(path.join(dir, "page.tsx")) || existsSync(path.join(dir, "route.ts"))) return true;
      /* A route group adds a folder and no segment. */
      return readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\(.+\)$/.test(d.name))
        .some((d) => walk(path.join(dir, d.name), rest));
    }
    const [head, ...tail] = rest;
    const entries = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    return entries.some((d) => {
      if (/^\(.+\)$/.test(d.name)) return walk(path.join(dir, d.name), rest);
      if (d.name === head || /^\[[^.]+\]$/.test(d.name)) return walk(path.join(dir, d.name), tail);
      return false;
    });
  };
  return walk(APP, segments);
}

describe("notification links", () => {
  test("every link a message carries opens a real page", () => {
    const input = { reference: "BW0125", invoiceId: "inv1", pickupNoteId: "pn1" };
    const sets = [links.messageLinks(input), links.portalLinks(input), links.messageLinks({ reference: "BW0125" })];
    for (const set of sets) {
      for (const [key, href] of Object.entries(set)) {
        if (!href) continue;
        const url = new URL(href, "https://www.bluewavecargo.co.tz");
        assert.ok(routeExists(url.pathname), `${key}: ${url.pathname} is not a route`);
      }
    }
    assert.equal(routeExists("/portal/nowhere/x"), false, "the check can fail");
  });

  test("the WhatsApp links are absolute on the public site and the tracking one carries its key", () => {
    const set = links.messageLinks({ reference: "BW0125", invoiceId: "inv1" });
    for (const href of Object.values(set)) if (href) assert.match(href, /^https:\/\//);
    assert.match(set.track!, /\/track\/BW0125\?s=2&k=[\w-]{16}$/);
    assert.match(set.invoice!, /\/track\/BW0125\/invoice\?i=inv1&k=/);
  });

  test("the portal links stay inside the site, and the invoice is the portal's own PDF", () => {
    const set = links.portalLinks({ reference: "BW0125", invoiceId: "inv1", pickupNoteId: "pn1" });
    for (const href of Object.values(set)) if (href) assert.match(href, /^\/(?!\/)/);
    assert.equal(set.invoice, "/portal/invoices/inv1/pdf");
    assert.equal(set.pickup, "/portal/pickups/pn1");
  });
});
