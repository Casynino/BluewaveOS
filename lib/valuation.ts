import "server-only";

import { Prisma } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import { lineBasis, unitOfBasis, type LineBasis, type RateUnit } from "@/lib/rate-basis";

/**
 * WHAT THE WAREHOUSE'S FIGURES ARE WORTH.
 *
 * The Foshan floor records what arrived — cargo type, packages, pieces,
 * volume. This turns that into money, per line, against the live rate book.
 *
 * IT IS AN INDICATION, NOT A BILL. Nothing here is stored: the rate book can
 * change tomorrow and this figure moves with it, which is exactly right for a
 * consignment nobody has invoiced. The moment Finance raises an invoice, the
 * rate is pinned onto it and stops moving — that is the difference between an
 * estimate and a demand for money, and it is why this file writes nothing.
 *
 * WHO SEES IT is decided by the caller. The warehouse fills the form and never
 * sees a price; Finance opens the same consignment and sees every line valued.
 */

export type ValuedLine = {
  reference: string;
  /** The carbon page this kind of goods was written on, for the printed bill. */
  paperReceiptNo: string | null;
  description: string;
  descriptionZh: string | null;
  cargoType: string | null;
  quantity: number;
  pieces: number | null;
  cbm: Prisma.Decimal;
  weightKg: Prisma.Decimal | null;
  /** The rate found, or null when the book has no line for this type. */
  rate: Prisma.Decimal | null;
  basis: "PER_CBM" | "PER_KG" | "FLAT" | "PER_PIECE" | "PER_BALE" | null;
  /** What this line is charged by: its own choice, or the book's for its type.
      Set on a blocked line too, so a screen can still say what it is waiting on. */
  unit: "PER_CBM" | "PER_KG" | "FLAT" | "PER_PIECE" | "PER_BALE" | null;
  /** The line chose its own measure (CargoPackage.chargeUnit). */
  chargeUnit: LineBasis | null;
  /** Priced at a rate typed on the price list, because the book has none in
      this line's unit. */
  typedRate: boolean;
  /** The book prices these goods, but not in this line's unit: the unit a rate
      has to be typed in. Set whether or not one has been. */
  rateUnitMissing: LineBasis | null;
  amount: Prisma.Decimal;
  /** Why a line could not be valued. Null when it could. */
  blocked: string | null;
};

export type Valuation = {
  lines: ValuedLine[];
  subtotal: Prisma.Decimal;
  /** Lines the rate book could not price. Finance has to look at these. */
  unpriced: number;
  currency: string;
};

type PackageLike = {
  reference: string;
  paperReceiptNo: string | null;
  description: string | null;
  descriptionZh: string | null;
  cargoType: string | null;
  quantity: number;
  pieces: number | null;
  cbm: Prisma.Decimal;
  weightKg: Prisma.Decimal | null;
  /** Null, or absent, follows the rate book's basis for the type. */
  chargeUnit?: string | null;
};

/**
 * A RATE SOMEBODY TYPED FOR A UNIT THE BOOK DOES NOT PRICE.
 *
 * A line charged by the bale when its type is only priced by the cubic metre
 * has no book price at all. The price list is where the confirmer types one,
 * and it reaches only the lines charged in that unit that the book cannot
 * price — never a line the book already prices.
 */
export type TypedRate = { basis: LineBasis; rate: Prisma.Decimal };

/**
 * Price a consignment's lines against the live book.
 *
 * One query for every rate in play rather than one per line: a delivery of ten
 * items would otherwise be ten round trips to say the same three things.
 */
export async function valueLines(
  packages: PackageLike[],
  options: { service?: "LCL" | "FCL"; customerId?: string } = {},
  client: TxClient | typeof prisma = prisma,
  typed: TypedRate | null = null
): Promise<Valuation> {
  return valueWith(await loadRateBook(options, client), packages, typed);
}

export type RateBook = {
  rates: RateRow[];
  agreed: RateRow[];
};

type RateRow = {
  cargoType: string | null;
  rate: Prisma.Decimal;
  basis: string;
  currency: string;
};

/**
 * Read the book once.
 *
 * Split out from the arithmetic so receiving can load it BEFORE opening its
 * transaction. Pricing inside the transaction would hold the cargo record, the
 * packages and the delivery note open across two more queries, and a slow rate
 * lookup would start timing out the one write the warehouse cannot lose.
 */
export async function loadRateBook(
  options: { service?: "LCL" | "FCL"; customerId?: string } = {},
  client: TxClient | typeof prisma = prisma
): Promise<RateBook> {
  const service = options.service ?? "LCL";
  const now = new Date();

  const live = {
    active: true,
    service,
    effectiveFrom: { lte: now },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
  };

  const [rates, agreed] = await Promise.all([
    client.shippingRate.findMany({ where: live, orderBy: { effectiveFrom: "desc" } }),
    options.customerId
      ? client.customerRate.findMany({
          where: { ...live, customerId: options.customerId },
          orderBy: { effectiveFrom: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return { rates, agreed };
}

/**
 * What a line's rate is multiplied by, in the unit it is charged by: the
 * volume, the kilos, the pieces or the bales (each package on a bale line is a
 * bale). Null when the line has none of it.
 */
export function chargedQuantity(
  line: { cbm: Prisma.Decimal; weightKg: Prisma.Decimal | null; pieces: number | null; quantity: number },
  basis: string | null
): Prisma.Decimal | null {
  switch (basis) {
    case "PER_CBM":
      return line.cbm;
    case "PER_KG":
      return line.weightKg;
    case "PER_PIECE":
      return line.pieces === null ? null : new Prisma.Decimal(line.pieces);
    case "PER_BALE":
      return new Prisma.Decimal(line.quantity);
    default:
      return null;
  }
}

/* "the bale", "per-bale": the words a blocked line is explained in. */
const UNIT_WORDS: Record<LineBasis, { the: string; per: string }> = {
  PER_CBM: { the: "cubic metre", per: "per-CBM" },
  PER_KG: { the: "tonne", per: "per-tonne" },
  PER_PIECE: { the: "piece", per: "per-piece" },
  PER_BALE: { the: "bale", per: "per-bale" },
};

/** The arithmetic, against a book already read. */
export function valueWith(
  book: RateBook,
  packages: PackageLike[],
  typed: TypedRate | null = null
): Valuation {
  const { rates, agreed } = book;

  /*
    A rate agreed with this customer beats the published one. Same order as
    the invoice engine, because the estimate and the bill must never disagree
    about which rate applies.

    A TYPE WITH NO RATE OF ITS OWN TAKES THE GENERAL RATE. The owner's
    decision, copied from how the air side prices: a rate published for a
    cargo type wins, and anything the book has not banded yet is charged at
    the general rate for the service, so one press can confirm a whole
    container instead of stopping at every type nobody has priced. The price
    list shows the rate each line took, so a line on the general rate is
    visible to whoever confirms it. Only a book with no general rate either
    leaves a line unpriced, and that line is named.

    A LINE THAT CHOSE ITS OWN MEASURE is priced only by a rate in that measure.
    The candidates are the newest agreed and the newest published rate for the
    type (or, for a type the book has not banded, the general ones), in that
    order; the first charged in the line's unit wins. A per-CBM price is never
    stretched over a line charged by the bale, and the general rate is never
    borrowed for goods whose own rate is simply in another unit — that is a
    price for different goods.
  */
  const candidates = (cargoType: string | null) => {
    const exact = <T extends { cargoType: string | null }>(list: T[]) =>
      cargoType === null ? undefined : list.find((r) => r.cargoType === cargoType);
    const general = <T extends { cargoType: string | null }>(list: T[]) =>
      list.find((r) => r.cargoType === null);
    const own = [exact(agreed), exact(rates)].filter((r): r is RateRow => !!r);
    if (own.length > 0) return own;
    return [general(agreed), general(rates)].filter((r): r is RateRow => !!r);
  };

  const currency = rates[0]?.currency ?? "USD";
  let subtotal = new Prisma.Decimal(0);
  let unpriced = 0;

  const lines: ValuedLine[] = packages.map((p) => {
    const chosen = lineBasis(p.chargeUnit);
    const tier = candidates(p.cargoType);
    const found = chosen ? (tier.find((r) => r.basis === chosen) ?? null) : (tier[0] ?? null);
    const fill = chosen && !found && tier.length > 0 && typed?.basis === chosen ? typed : null;

    const shared = {
      reference: p.reference,
      paperReceiptNo: p.paperReceiptNo,
      description: p.description ?? "",
      descriptionZh: p.descriptionZh,
      cargoType: p.cargoType,
      quantity: p.quantity,
      pieces: p.pieces,
      cbm: p.cbm,
      weightKg: p.weightKg,
      chargeUnit: chosen,
    };

    if (!found && !fill) {
      unpriced++;
      const unit = chosen ?? null;
      let blocked: string;
      if (tier.length === 0) {
        blocked = p.cargoType
          ? `No live rate for "${p.cargoType}" and no general rate.`
          : "No cargo type was chosen at receiving.";
      } else {
        /* The book prices these goods, only not in the unit this line is
           charged by. Nothing is converted: there is no honest number of
           bales in a cubic metre. */
        const words = UNIT_WORDS[chosen!];
        blocked = `"${p.cargoType ?? "General cargo"}" is charged by the ${words.the} on this line and the rate book has no ${words.per} price — enter the rate on the price list.`;
      }
      return {
        ...shared,
        rate: null,
        basis: null,
        unit,
        typedRate: false,
        rateUnitMissing: tier.length > 0 ? chosen : null,
        amount: new Prisma.Decimal(0),
        blocked,
      };
    }

    const rate = new Prisma.Decimal(fill ? fill.rate : found!.rate);
    const basis = fill ? fill.basis : found!.basis;
    let amount = new Prisma.Decimal(0);
    let blocked: string | null = null;

    if (basis === "PER_KG") {
      if (!p.weightKg || p.weightKg.lessThanOrEqualTo(0)) {
        blocked = `"${p.cargoType}" is billed by weight and nothing was weighed.`;
        unpriced++;
      } else {
        amount = p.weightKg.mul(rate).toDecimalPlaces(2);
      }
    } else if (basis === "FLAT") {
      amount = rate;
    } else if (basis === "PER_PIECE") {
      /* Counted, not measured: twenty handsets are twenty handsets whatever
         carton they came in. A line with no count is held rather than priced
         on its volume, which would bill phones as a sliver of a cubic metre. */
      if (!p.pieces || p.pieces <= 0) {
        blocked = `"${p.cargoType}" is billed per piece and no pieces were counted.`;
        unpriced++;
      } else {
        amount = new Prisma.Decimal(p.pieces).mul(rate).toDecimalPlaces(2);
      }
    } else if (basis === "PER_BALE") {
      /* Each package on a bale line is a bale. The count is never below one,
         so there is nothing to block on. */
      if (p.quantity <= 0) {
        blocked = `"${p.cargoType}" is billed per bale and no bales were counted.`;
        unpriced++;
      } else {
        amount = new Prisma.Decimal(p.quantity).mul(rate).toDecimalPlaces(2);
      }
    } else if (basis === "PER_CBM") {
      if (p.cbm.lessThanOrEqualTo(0)) {
        blocked = "No volume was recorded for this line.";
        unpriced++;
      } else {
        amount = p.cbm.mul(rate).toDecimalPlaces(2);
      }
    } else {
      /* A basis this file has never heard of is not charged per cubic metre
         by default. It is held and named. */
      blocked = `"${p.cargoType}" has a rate this system cannot apply.`;
      unpriced++;
    }

    subtotal = subtotal.add(amount);

    return {
      ...shared,
      rate,
      basis: basis as ValuedLine["basis"],
      unit: basis as ValuedLine["unit"],
      typedRate: !!fill,
      rateUnitMissing: fill ? chosen : null,
      amount,
      blocked,
    };
  });

  return { lines, subtotal, unpriced, currency };
}

/**
 * The cargo types the warehouse can choose from, straight off the rate book.
 *
 * Loose cargo only. A whole-container rate — 20GP, 40HQ — is a price for hiring
 * the box, not a description of what is in it, and offering it at the receiving
 * counter invites a clerk to file three cartons of shoes as a forty-foot
 * container.
 */
export async function cargoTypeOptions(): Promise<string[]> {
  const now = new Date();
  const rates = await prisma.shippingRate.findMany({
    where: {
      active: true,
      service: "LCL",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      cargoType: { not: null },
    },
    select: { cargoType: true },
    distinct: ["cargoType"],
    orderBy: { cargoType: "asc" },
  });
  return rates.map((r) => r.cargoType!).filter(Boolean);
}

/**
 * THE SAME TYPES, EACH WITH THE FIGURE IT IS CHARGED BY.
 *
 * The warehouse never sees a price, but it does need to know which number
 * matters for the goods in front of it: phones are charged by the handset, so
 * a line of phones with no piece count cannot be billed at all. Only the unit
 * leaves this function — never the rate — so the receiving screen can say
 * "count the pieces" without saying what a piece costs.
 *
 * The newest live rate for a type decides, as it does when the line is priced.
 */
export async function cargoTypeUnits(): Promise<{ name: string; unit: RateUnit | null }[]> {
  const now = new Date();
  const rates = await prisma.shippingRate.findMany({
    where: {
      active: true,
      service: "LCL",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      cargoType: { not: null },
    },
    select: { cargoType: true, basis: true },
    orderBy: [{ cargoType: "asc" }, { effectiveFrom: "desc" }],
  });
  const out: { name: string; unit: RateUnit | null }[] = [];
  for (const r of rates) {
    if (!r.cargoType || out.some((o) => o.name === r.cargoType)) continue;
    out.push({ name: r.cargoType, unit: unitOfBasis(r.basis) });
  }
  return out;
}
