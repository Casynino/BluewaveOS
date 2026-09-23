import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { describe, test } from "node:test";

/**
 * THE LETTER A MERGED PAYMENT GOES OUT IN.
 *
 * The owner's rule: merge the payment, never the cargo. So the letter has to
 * carry every consignment by name with what its own bill still owes — a
 * customer who cannot see what the total is made of has to ring the office to
 * find out — one figure to send, and two links that plainly do different
 * things.
 *
 * Pure: everything it prints was handed to it, which is what lets these
 * assertions be about wording rather than about a database.
 *
 * `server-only` refuses to load outside the Next server; answered with an
 * empty module, as in tests/tracking-public.test.ts.
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

const { mergeBillLetter } = require("@/lib/messages") as typeof import("@/lib/messages");

type Context = Parameters<typeof mergeBillLetter>[0];

const TRACK = "https://www.bluewavecargo.co.tz/track/BW0019?s=2&k=abcdefgh12345678&all=1";
const INVOICE = "https://www.bluewavecargo.co.tz/track/BW0019/invoice?k=abcdefgh12345678&all=1";

function letter(over: Partial<Context> = {}): string {
  return mergeBillLetter({
    customerName: "Juma Ally Kileo",
    cargo: [
      {
        reference: "BW0019",
        description: "Ladies handbags",
        outstanding: "TZS 1,146,960",
        stage: "Arrived in Dar es Salaam",
      },
      {
        reference: "BW0020",
        description: "Shoes",
        outstanding: "TZS 540,000",
        stage: "Arrived in Dar es Salaam",
      },
    ],
    packages: 24,
    pieces: 480,
    cbm: "4.320",
    containers: ["BWC-CNT-0007", "BWC-CNT-0007"],
    billedTzs: "1,686,960",
    amountTzs: "1,686,960",
    amountUsd: "624.80",
    freeStorageDays: 7,
    trackLink: TRACK,
    invoiceLink: INVOICE,
    ...over,
  });
}

describe("the merged payment letter", () => {
  test("wears the company's own letter: heading, greeting, blocks, storage, links", () => {
    const text = letter();
    const blocks = text.split("\n\n");

    assert.equal(blocks[0], "*BLUEWAVE CARGO*");
    /* First name only, as every other BlueWave letter greets. */
    assert.equal(blocks[1], "Habari Juma!");
    assert.match(blocks[2], /^Mizigo yako 2 /);
    assert.ok(text.includes("*MIZIGO ILIYOMO (2)*"), "the consignments are named as a block");
    assert.ok(text.includes("*MAELEZO YA MZIGO*"), "the goods, in the block every letter uses");
    assert.ok(text.includes("*MALIPO*"));
    assert.match(text, /\*STORAGE:\* [\w]+ siku 7 bure /);
  });

  test("names every consignment with what its own bill owes", () => {
    const text = letter();
    assert.ok(text.includes("• BW0019 — Ladies handbags: TZS 1,146,960"));
    assert.ok(text.includes("• BW0020 — Shoes: TZS 540,000"));
    /* The total is the figure to send, and it is the bold one. */
    assert.ok(text.includes("• *Kiasi cha kulipa: TZS 1,686,960*"));
    assert.ok(text.includes("• Sawa na: USD 624.80"));
  });

  test("one consignment reads as one consignment", () => {
    const text = letter({
      cargo: [{ reference: "BW0019", description: "Ladies handbags", outstanding: "TZS 1,146,960" }],
      packages: 12,
      pieces: 240,
      cbm: "1.440",
      billedTzs: "1,146,960",
      amountTzs: "1,146,960",
      amountUsd: "424.80",
    });
    assert.ok(text.includes("*MIZIGO ILIYOMO (1)*"));
    assert.ok(text.includes("• BW0019 — Ladies handbags: TZS 1,146,960"));
    assert.equal(text.includes("BW0020"), false);
    assert.ok(text.includes("• *Kiasi cha kulipa: TZS 1,146,960*"));
  });

  test("the goods are added up, and the totals of two consignments are one block", () => {
    const text = letter();
    assert.ok(text.includes("• Mizigo: 24"));
    assert.ok(text.includes("• Vipande: 480"));
    assert.ok(text.includes("• Ujazo: 4.320 CBM"));
    /* One container named once, however many consignments came off it. */
    assert.ok(text.includes("• Kontena: BWC-CNT-0007"));
    assert.equal(text.includes("BWC-CNT-0007, BWC-CNT-0007"), false);
  });

  test("the rate is printed only when every bill was pinned at the same one", () => {
    /* A bill agreed in August and one agreed in September carry two rates.
       Printing one of them over both would be wrong for half the money, so
       nothing is said instead. */
    assert.equal(letter().includes("Exchange Rate"), false);
    assert.ok(letter({ fxRate: "2,700" }).includes("• Exchange Rate: 1 USD = 2,700 TZS"));
  });

  test("says where the payment stands, and never guesses", () => {
    assert.ok(letter().includes("• Hali ya malipo: Haijalipwa"));
    assert.ok(
      letter({ partlyPaid: true, paidTzs: "500,000", amountTzs: "1,186,960" }).includes(
        "• Hali ya malipo: Imelipwa kiasi"
      )
    );
    assert.ok(letter({ paidTzs: "500,000" }).includes("• Imelipwa: TZS 500,000"));
    const settled = letter({ paid: true, paidTzs: "1,686,960", amountTzs: null, amountUsd: null });
    assert.ok(settled.includes("• Hali ya malipo: Imelipwa yote"));
    assert.equal(settled.includes("Kiasi cha kulipa"), false);
  });

  test("a consignment that stands somewhere else carries its own status", () => {
    const apart = letter({
      cargo: [
        { reference: "BW0019", description: "Handbags", outstanding: "TZS 1,146,960", stage: "Arrived in Dar es Salaam" },
        { reference: "BW0020", description: "Shoes", outstanding: "TZS 540,000", stage: "In transit" },
      ],
    });
    assert.ok(apart.includes("• BW0019 — Handbags: TZS 1,146,960 (Arrived in Dar es Salaam)"));
    assert.ok(apart.includes("• BW0020 — Shoes: TZS 540,000 (In transit)"));
    /* Two different places is not one status, so the block does not claim one. */
    assert.equal(apart.includes("• Status:"), false);
    /* Where they agree, it is said once. */
    assert.ok(letter().includes("• Status: Arrived in Dar es Salaam"));
  });

  test("two links, and they say which is which", () => {
    const text = letter();
    assert.ok(text.includes(`*Fuatilia mizigo yako yote:*\n${TRACK}`));
    assert.ok(text.includes(`*Pakua invoice ya pamoja (PDF):*\n${INVOICE}`));
    /* The document is the last thing in the letter — the thing to act on. */
    assert.ok(text.trimEnd().endsWith(INVOICE));
  });

  test("the storage clock is only promised once the goods have landed", () => {
    const waiting = letter({ storageFrom: null });
    assert.match(waiting, /Utapata siku 7 bure .* itakapofika\./);
    const landed = letter({ storageFrom: new Date("2026-09-01T08:00:00Z"), lastFreeDay: new Date("2026-09-07T08:00:00Z") });
    assert.match(landed, /hadi 7 Sept? 2026\./);
    const charged = letter({
      storageFrom: new Date("2026-09-01T08:00:00Z"),
      lastFreeDay: new Date("2026-09-07T08:00:00Z"),
      storageCharge: "USD 12.00",
    });
    assert.ok(charged.includes("Storage iliyokwisha tozwa: USD 12.00."));
  });
});
