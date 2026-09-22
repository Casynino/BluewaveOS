/**
 * HOW A RATE IS CHARGED, AND HOW STAFF SAY IT.
 *
 * The company charges each kind of goods by one of four figures, as its old
 * system did: cubic metres, tonnes, pieces or bales. The book stores weight
 * per kilogram (PER_KG) because that is the figure the scale gives, but nobody
 * at BlueWave quotes "$0.50 a kilo" — they say "$500 a tonne". So every screen
 * that takes or shows a rate speaks tonnes, and this file is the one place the
 * factor of a thousand lives.
 *
 * The conversion is done on the decimal digits, never through a JavaScript
 * number: 0.0003 × 1000 in floating point is 0.30000000000000004, and a rate
 * is money.
 *
 * No server-only import: the rate forms run in the browser.
 */

export const RATE_BASES = ["PER_CBM", "PER_KG", "FLAT", "PER_PIECE", "PER_BALE"] as const;
export type Basis = (typeof RATE_BASES)[number];

/** What a rate form offers. PER_TONNE is a way of typing PER_KG, not a basis. */
export const RATE_ENTRIES = ["PER_CBM", "PER_TONNE", "PER_PIECE", "PER_BALE", "FLAT"] as const;
export type RateEntry = (typeof RATE_ENTRIES)[number];

/** The English for each choice on a rate form; screens pass it through t(). */
export const RATE_ENTRY_LABEL: Record<RateEntry, string> = {
  PER_CBM: "Cubic metre",
  PER_TONNE: "Tonne",
  PER_PIECE: "Piece",
  PER_BALE: "Bale",
  FLAT: "Flat",
};

/** The figure a line is charged by, as the warehouse and the calculator see it. */
export type RateUnit = "CBM" | "TONNE" | "PIECE" | "BALE";

export function unitOfBasis(basis: string | null | undefined): RateUnit | null {
  switch (basis) {
    case "PER_CBM":
      return "CBM";
    case "PER_KG":
      return "TONNE";
    case "PER_PIECE":
      return "PIECE";
    case "PER_BALE":
      return "BALE";
    default:
      return null;
  }
}

export function entryOfBasis(basis: string | null | undefined): RateEntry {
  switch (basis) {
    case "PER_KG":
      return "PER_TONNE";
    case "PER_PIECE":
    case "PER_BALE":
    case "FLAT":
      return basis;
    default:
      return "PER_CBM";
  }
}

/** "per CBM", "per tonne" … the English, for t(). */
export const PER_UNIT: Record<Basis, string> = {
  PER_CBM: "per CBM",
  PER_KG: "per tonne",
  PER_PIECE: "per piece",
  PER_BALE: "per bale",
  FLAT: "flat",
};

/** The short unit after a slash: "$500 / tonne". Not translated: it is a unit. */
export const SLASH_UNIT: Record<Basis, string> = {
  PER_CBM: "CBM",
  PER_KG: "tonne",
  PER_PIECE: "piece",
  PER_BALE: "bale",
  FLAT: "flat",
};

/**
 * Move the decimal point `places` to the right (negative: to the left),
 * exactly. "0.5", 3 → "500"; "500", -3 → "0.5".
 */
export function shiftDecimal(value: string, places: number): string {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!m || (m[2] === "" && !m[3])) return value;
  const sign = m[1];
  const whole = m[2];
  const frac = m[3] ?? "";
  let digits = whole + frac;
  let point = whole.length + places;
  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const intPart = digits.slice(0, point).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = digits.slice(point).replace(/0+$/, "");
  const out = fracPart ? `${intPart}.${fracPart}` : intPart;
  return sign && out !== "0" ? `-${out}` : out;
}

/** The figure a person reads for a stored rate: per tonne for a per-kg rate. */
export function displayRate(rate: string, basis: string | null | undefined): string {
  return basis === "PER_KG" ? shiftDecimal(rate, 3) : rate;
}

/** Decimal places the rate column keeps (ShippingRate/CustomerRate Decimal(12,4)). */
const STORED_PLACES = 4;

/**
 * A rate as typed on a form, turned into what the book stores.
 *
 * "Tonne, 500" is stored PER_KG at 0.5. A per-tonne figure with more than one
 * decimal place would not survive the column's four places — 333.35 a tonne is
 * 0.33335 a kilo — so it is refused rather than rounded, because a rate that
 * silently changes between the form and the book is the wrong price.
 */
export function readRateEntry(
  entry: string,
  rate: string
): { basis: Basis; rate: string } | { error: string } {
  const typed = rate.trim();
  if (!/^\d*\.?\d+$|^\d+\.$/.test(typed) || !(Number(typed) > 0)) {
    return { error: "A rate has to be above zero." };
  }
  if (entry === "PER_TONNE") {
    const perKg = shiftDecimal(typed, -3);
    if ((perKg.split(".")[1] ?? "").length > STORED_PLACES) {
      return { error: "A rate per tonne can have at most one decimal place." };
    }
    return { basis: "PER_KG", rate: perKg };
  }
  if ((RATE_BASES as readonly string[]).includes(entry)) {
    return { basis: entry as Basis, rate: typed };
  }
  return { error: "Choose how it is charged." };
}
