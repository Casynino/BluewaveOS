import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import { before, describe, test } from "node:test";
import { Prisma } from "@prisma/client";

import { RATE_BOOK, rateRow } from "@/prisma/data/rate-book";
import { displayRate, readRateEntry, shiftDecimal } from "@/lib/rate-basis";

/* lib/valuation is server code and says so; answered with an empty module so
   the arithmetic can be read without a Next server. */
const resolve = (Module as unknown as { _resolveFilename: (...args: unknown[]) => string })
  ._resolveFilename;
(Module as unknown as { _resolveFilename: (...args: unknown[]) => string })._resolveFilename =
  function (this: unknown, request: unknown, ...rest: unknown[]) {
    if (request === "server-only") {
      return path.join(__dirname, "..", "node_modules", "server-only", "empty.js");
    }
    return resolve.call(this, request, ...rest);
  };

type Valuation = typeof import("@/lib/valuation");
type Intake = typeof import("@/lib/intake-lines");
let valueWith: Valuation["valueWith"];
let readIntakeLines: Intake["readIntakeLines"];

before(async () => {
  valueWith = (await import("@/lib/valuation")).valueWith;
  readIntakeLines = (await import("@/lib/intake-lines")).readIntakeLines;
});

/**
 * Charged by the piece, the bale, the tonne or the cubic metre — the four
 * figures BlueWave has always billed on. No database: the book is handed in.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

const book = {
  rates: [
    { cargoType: "Smart Mobile Phones", rate: D(3), basis: "PER_PIECE", currency: "USD" },
    { cargoType: "Used clothes", rate: D(12), basis: "PER_BALE", currency: "USD" },
    { cargoType: "Shoes", rate: D(350), basis: "PER_CBM", currency: "USD" },
    { cargoType: "Bolt and Nuts", rate: D("0.5"), basis: "PER_KG", currency: "USD" },
  ],
  agreed: [],
};

const line = (over: Partial<Parameters<Valuation["valueWith"]>[1][number]>) => ({
  reference: "BW-2026-000001-P1",
  paperReceiptNo: "0001",
  description: "Goods",
  descriptionZh: null,
  cargoType: null,
  quantity: 1,
  pieces: null,
  cbm: D("0.25"),
  weightKg: null,
  ...over,
});

describe("a line charged per piece", () => {
  test("is the pieces times the rate, whatever its volume", () => {
    const v = valueWith(book, [line({ cargoType: "Smart Mobile Phones", quantity: 2, pieces: 40 })]);
    assert.equal(v.lines[0].basis, "PER_PIECE");
    assert.equal(v.lines[0].blocked, null);
    assert.equal(v.lines[0].amount.toFixed(2), "120.00");
    assert.equal(v.subtotal.toFixed(2), "120.00");
    assert.equal(v.unpriced, 0);
  });

  test("with no pieces counted is held, never priced on its volume", () => {
    for (const pieces of [null, 0]) {
      const v = valueWith(book, [line({ cargoType: "Smart Mobile Phones", pieces })]);
      assert.match(v.lines[0].blocked ?? "", /per piece and no pieces were counted/);
      assert.equal(v.lines[0].amount.toFixed(2), "0.00");
      assert.equal(v.unpriced, 1);
    }
  });
});

describe("a line charged per bale", () => {
  test("is the packages times the rate: each package is a bale", () => {
    const v = valueWith(book, [line({ cargoType: "Used clothes", quantity: 7, pieces: 300, cbm: D("3.5") })]);
    assert.equal(v.lines[0].basis, "PER_BALE");
    assert.equal(v.lines[0].blocked, null);
    assert.equal(v.lines[0].amount.toFixed(2), "84.00");
  });
});

describe("the other units are unchanged beside them", () => {
  test("volume and weight on one delivery with phones", () => {
    const v = valueWith(book, [
      line({ cargoType: "Shoes", cbm: D("1.2") }),
      line({ cargoType: "Bolt and Nuts", weightKg: D("800") }),
      line({ cargoType: "Smart Mobile Phones", pieces: 10 }),
    ]);
    assert.deepEqual(
      v.lines.map((l) => l.amount.toFixed(2)),
      ["420.00", "400.00", "30.00"]
    );
    assert.equal(v.subtotal.toFixed(2), "850.00");
  });
});

describe("the rate book file", () => {
  test("maps each unit to the basis the engine charges by", () => {
    assert.deepEqual(rateRow(["Shoes", "Viatu", "CBM", 350]), {
      cargoType: "Shoes",
      basis: "PER_CBM",
      rate: 350,
      notes: "Swahili: Viatu",
    });
    const tonne = rateRow(["Bolt and Nuts", "Bolti na nuts", "TONNE", 500]);
    assert.equal(tonne.basis, "PER_KG");
    assert.equal(tonne.rate, 0.5);
    const piece = rateRow(["Cheap Mobile Phones", "Simu ndogo", "PIECE", 1]);
    assert.equal(piece.basis, "PER_PIECE");
    assert.equal(piece.rate, 1);
    assert.match(piece.notes ?? "", /per piece/);
    const bale = rateRow(["Used clothes", "Mitumba", "BALE", 12]);
    assert.equal(bale.basis, "PER_BALE");
    assert.equal(bale.rate, 12);
  });

  test("carries both phones per piece", () => {
    const phones = RATE_BOOK.filter(([name]) => /Mobile Phones$/.test(name)).map(rateRow);
    assert.deepEqual(
      phones.map((p) => [p.cargoType, p.basis, p.rate]),
      [
        ["Cheap Mobile Phones", "PER_PIECE", 1],
        ["Smart Mobile Phones", "PER_PIECE", 3],
      ]
    );
  });
});

describe("a tonne rate typed by staff", () => {
  test("is stored per kilo, exactly", () => {
    assert.deepEqual(readRateEntry("PER_TONNE", "500"), { basis: "PER_KG", rate: "0.5" });
    assert.deepEqual(readRateEntry("PER_TONNE", "482.5"), { basis: "PER_KG", rate: "0.4825" });
    assert.deepEqual(readRateEntry("PER_PIECE", "3"), { basis: "PER_PIECE", rate: "3" });
    assert.deepEqual(readRateEntry("PER_BALE", "12.50"), { basis: "PER_BALE", rate: "12.50" });
  });

  test("is refused rather than rounded when the column cannot hold it", () => {
    assert.ok("error" in readRateEntry("PER_TONNE", "333.35"));
    assert.ok("error" in readRateEntry("PER_TONNE", "0"));
    assert.ok("error" in readRateEntry("PER_WHATEVER", "3"));
  });

  test("reads back per tonne", () => {
    assert.equal(displayRate("0.5000", "PER_KG"), "500");
    assert.equal(displayRate("0.4825", "PER_KG"), "482.5");
    assert.equal(displayRate("350", "PER_CBM"), "350");
    assert.equal(shiftDecimal("0.0003", 3), "0.3");
    assert.equal(shiftDecimal("5", -3), "0.005");
  });
});

describe("the receiving counter, for goods charged per piece", () => {
  const form = (pieces: string) => {
    const data = new FormData();
    data.append("itemDescription", "Phones");
    data.append("itemDescriptionZh", "");
    data.append("itemCargoType", "Smart Mobile Phones");
    data.append("itemCbm", "0.2");
    data.append("itemPackageType", "CARTON");
    data.append("itemQuantity", "2");
    data.append("itemPieces", pieces);
    data.append("itemReceiptNo", "0007");
    return data;
  };
  const units = { "Smart Mobile Phones": "PIECE" as const, Shoes: "CBM" as const };

  test("refuses a line with no pieces", () => {
    for (const pieces of ["", "0"]) {
      const read = readIntakeLines(form(pieces), units);
      assert.match(read.error ?? "", /Item 1: .*charged by the piece/);
    }
  });

  test("takes the line once they are counted", () => {
    const read = readIntakeLines(form("40"), units);
    assert.equal(read.error, undefined);
    assert.equal(read.lines[0].pieces, 40);
  });

  test("asks nothing of a type without a unit map", () => {
    assert.equal(readIntakeLines(form("")).error, undefined);
  });
});

/**
 * A line that chose its own measure — the old system's "Quantity Measure" per
 * item. Priced only by a rate in that measure; otherwise held and named.
 */
describe("a line charged by its own measure", () => {
  test("in the book's own unit is priced as the book says", () => {
    const v = valueWith(book, [
      line({ cargoType: "Used clothes", quantity: 5, chargeUnit: "PER_BALE" }),
      line({ reference: "P2", cargoType: "Shoes", cbm: D("2"), chargeUnit: "PER_CBM" }),
    ]);
    assert.equal(v.lines[0].blocked, null);
    assert.equal(v.lines[0].amount.toFixed(2), "60.00");
    assert.equal(v.lines[0].chargeUnit, "PER_BALE");
    assert.equal(v.lines[1].amount.toFixed(2), "700.00");
    assert.equal(v.unpriced, 0);
  });

  test("in a unit the book has no price in is blocked, with the reason", () => {
    const v = valueWith(book, [
      line({ cargoType: "Shoes", quantity: 12, cbm: D("3"), chargeUnit: "PER_BALE" }),
    ]);
    assert.equal(
      v.lines[0].blocked,
      '"Shoes" is charged by the bale on this line and the rate book has no per-bale price — enter the rate on the price list.'
    );
    assert.equal(v.lines[0].rate, null);
    assert.equal(v.lines[0].unit, "PER_BALE");
    assert.equal(v.lines[0].rateUnitMissing, "PER_BALE");
    assert.equal(v.lines[0].amount.toFixed(2), "0.00");
    assert.equal(v.unpriced, 1);
  });

  test("never borrows the general rate for goods priced in another unit", () => {
    const withGeneral = {
      ...book,
      rates: [...book.rates, { cargoType: null, rate: D(5), basis: "PER_BALE", currency: "USD" }],
    };
    const v = valueWith(withGeneral, [
      line({ cargoType: "Shoes", quantity: 12, chargeUnit: "PER_BALE" }),
      /* A type the book has not banded takes the general rate, in its unit. */
      line({ reference: "P2", cargoType: "Toys", quantity: 3, chargeUnit: "PER_BALE" }),
      line({ reference: "P3", cargoType: "Toys", chargeUnit: "PER_PIECE", pieces: 9 }),
    ]);
    assert.match(v.lines[0].blocked ?? "", /no per-bale price/);
    assert.equal(v.lines[1].blocked, null);
    assert.equal(v.lines[1].amount.toFixed(2), "15.00");
    assert.match(v.lines[2].blocked ?? "", /"Toys" is charged by the piece on this line/);
  });

  test("a rate typed for that unit prices those lines, and only those", () => {
    const v = valueWith(
      book,
      [
        line({ cargoType: "Shoes", quantity: 12, chargeUnit: "PER_BALE" }),
        line({ reference: "P2", cargoType: "Shoes", cbm: D("2") }),
        line({ reference: "P3", cargoType: "Used clothes", quantity: 2 }),
      ],
      { basis: "PER_BALE", rate: D(40) }
    );
    assert.equal(v.lines[0].blocked, null);
    assert.equal(v.lines[0].typedRate, true);
    assert.equal(v.lines[0].amount.toFixed(2), "480.00");
    /* The book's own lines keep the book's rate, including a per-bale one. */
    assert.equal(v.lines[1].amount.toFixed(2), "700.00");
    assert.equal(v.lines[2].typedRate, false);
    assert.equal(v.lines[2].amount.toFixed(2), "24.00");
    assert.equal(v.subtotal.toFixed(2), "1204.00");
  });

  test("a rate typed in another unit does not reach the line", () => {
    const v = valueWith(
      book,
      [line({ cargoType: "Shoes", quantity: 12, chargeUnit: "PER_BALE" })],
      { basis: "PER_PIECE", rate: D(40) }
    );
    assert.match(v.lines[0].blocked ?? "", /no per-bale price/);
  });

  test("an agreed rate comes first, when it is in the line's unit", () => {
    const agreedBook = {
      rates: book.rates,
      agreed: [
        { cargoType: "Shoes", rate: D(300), basis: "PER_CBM", currency: "USD" },
        { cargoType: "Used clothes", rate: D(10), basis: "PER_CBM", currency: "USD" },
      ],
    };
    const v = valueWith(agreedBook, [
      line({ cargoType: "Shoes", cbm: D("2"), chargeUnit: "PER_CBM" }),
      /* Agreed per CBM, published per bale: a bale line takes the published. */
      line({ reference: "P2", cargoType: "Used clothes", quantity: 4, chargeUnit: "PER_BALE" }),
      /* No choice of its own: the agreed rate, as it always was. */
      line({ reference: "P3", cargoType: "Used clothes", cbm: D("2") }),
    ]);
    assert.equal(v.lines[0].rate?.toString(), "300");
    assert.equal(v.lines[0].amount.toFixed(2), "600.00");
    assert.equal(v.lines[1].rate?.toString(), "12");
    assert.equal(v.lines[1].amount.toFixed(2), "48.00");
    assert.equal(v.lines[2].basis, "PER_CBM");
    assert.equal(v.lines[2].amount.toFixed(2), "20.00");
  });

  test("by the tonne multiplies the kilos", () => {
    const v = valueWith(book, [
      line({ cargoType: "Bolt and Nuts", weightKg: D("1200"), chargeUnit: "PER_KG" }),
    ]);
    assert.equal(v.lines[0].amount.toFixed(2), "600.00");
  });
});

describe("the receiving counter, with a measure per line", () => {
  const form = (row: Record<string, string>) => {
    const data = new FormData();
    const fields: Record<string, string> = {
      itemDescription: "Clothes",
      itemDescriptionZh: "",
      itemCargoType: "Shoes",
      itemChargeUnit: "",
      itemCbm: "0.5",
      itemPackageType: "CARTON",
      itemQuantity: "12",
      itemPieces: "",
      itemWeightKg: "",
      itemReceiptNo: "0008",
      ...row,
    };
    for (const [k, v] of Object.entries(fields)) data.append(k, v);
    return data;
  };
  const units = { "Smart Mobile Phones": "PIECE" as const, Shoes: "CBM" as const };

  test("stores a measure other than the book's", () => {
    const read = readIntakeLines(form({ itemChargeUnit: "BALE", itemPackageType: "BALE" }), units);
    assert.equal(read.error, undefined);
    assert.equal(read.lines[0].chargeUnit, "PER_BALE");
    assert.equal(read.lines[0].packageType, "BALE");
    assert.equal(
      readIntakeLines(form({ itemChargeUnit: "TONNE", itemWeightKg: "800" }), units).lines[0]
        .chargeUnit,
      "PER_KG"
    );
  });

  test("leaves the book's own measure, or none, as null", () => {
    assert.equal(readIntakeLines(form({ itemChargeUnit: "CBM" }), units).lines[0].chargeUnit, null);
    assert.equal(readIntakeLines(form({}), units).lines[0].chargeUnit, null);
    /* A type the book gives no unit: any choice is the line's own. */
    assert.equal(
      readIntakeLines(form({ itemCargoType: "Toys", itemChargeUnit: "CBM" }), units).lines[0]
        .chargeUnit,
      "PER_CBM"
    );
  });

  test("asks for the figure the line's own measure multiplies", () => {
    assert.match(
      readIntakeLines(form({ itemChargeUnit: "PIECE" }), units).error ?? "",
      /Item 1: this line is charged by the piece/
    );
    assert.match(
      readIntakeLines(form({ itemChargeUnit: "TONNE" }), units).error ?? "",
      /Item 1: this line is charged by the tonne/
    );
    /* Phones by the bale need no piece count. */
    assert.equal(
      readIntakeLines(
        form({ itemCargoType: "Smart Mobile Phones", itemChargeUnit: "BALE" }),
        units
      ).error,
      undefined
    );
  });

  test("refuses a measure that is not one of the four", () => {
    assert.match(
      readIntakeLines(form({ itemChargeUnit: "FLAT" }), units).error ?? "",
      /choose how it is charged/
    );
  });
});
