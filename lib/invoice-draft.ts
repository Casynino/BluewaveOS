import "server-only";

import { Prisma, type RateBasis, type ServiceType } from "@prisma/client";

import { prisma, type TxClient } from "@/lib/prisma";
import { quote, quoteFrom, resolveRateFrom } from "@/lib/pricing";
import { lineBasis, type LineBasis } from "@/lib/rate-basis";
import {
  chargedQuantity,
  loadRateBook,
  valueWith,
  type PackageLike,
  type RateBook,
  type TypedRate,
} from "@/lib/valuation";

/** One measured line, as `priceConsignment` reads it. */
export type PricingLine = PackageLike;

export type DraftItem = {
  description: string;
  /** Copied onto the bill so a customer can check it against their receipt. */
  paperReceiptNo: string | null;
  packages: number | null;
  pieces: number | null;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: Prisma.Decimal;
  amount: Prisma.Decimal;
  category: string;
  taxable: boolean;
};

export type PricedConsignment = {
  billableCbm: Prisma.Decimal | null;
  billableKg: Prisma.Decimal | null;
  standardRate: Prisma.Decimal | null;
  appliedRate: Prisma.Decimal | null;
  basis: RateBasis | null;
  discount: Prisma.Decimal;
  amount: Prisma.Decimal;
  currency: string;
  explanation: string;
  blockedReason: string | null;
  /**
   * BLOCKED ONLY FOR WANT OF A RATE IN ONE UNIT.
   *
   * Every line the book could not price is charged in this unit and the book
   * has these goods in another: typing one rate on the price list prices the
   * lot. `quantity` is what that rate multiplies across those lines, and
   * `freight` is what the other lines already come to.
   */
  needsRate: { basis: LineBasis; quantity: Prisma.Decimal; freight: Prisma.Decimal } | null;
  items: DraftItem[];
};

const ZERO = new Prisma.Decimal(0);

/** The unit an invoice line is charged in, by the rate's basis. */
const UNIT_OF: Record<RateBasis, string> = {
  PER_CBM: "CBM",
  PER_KG: "kg",
  PER_PIECE: "piece",
  PER_BALE: "bale",
  FLAT: "container",
};

/**
 * WHAT TO CHARGE FOR ONE CONSIGNMENT.
 *
 * A delivery is rarely one commodity. Two hundred cartons of shoes and a
 * machine on the same note are not the same money per cubic metre, and billing
 * the whole lot at one rate is how a company either loses on the machine or
 * overcharges on the shoes. So each recorded line is priced at the rate for its
 * own cargo type and the invoice carries one item per line — the customer can
 * see which goods cost what, and an argument about the bill is an argument
 * about one line rather than the whole thing.
 *
 * Consignments received before cargo types existed have no typed lines. Those
 * still price the old way, on the consignment's commodity, so historic cargo
 * remains billable.
 *
 * The lines are read as they stand. They belong to whichever floor holds the
 * cargo, and Dar corrects them after check-in the way Foshan does before
 * departure, so a bill is struck on the last corrected figure rather than on
 * the first one typed.
 *
 * NOTHING HERE IS FROZEN. The caller writes these figures onto an invoice, and
 * that write is what pins them.
 */
export async function priceConsignment(
  cargo: {
  id: string;
  description: string;
  commodity: string | null;
  service: ServiceType;
  receiverId: string;
  measuredCbm: Prisma.Decimal | null;
  measuredKg: Prisma.Decimal | null;
  /** Counts, for a book that charges this cargo by the piece or the bale. */
  measuredPieces: number | null;
  measuredPackages: number | null;
  },
  /* A transaction when the caller has just corrected the lines and must price
     what it wrote rather than what was committed before it. */
  client: TxClient | typeof prisma = prisma,
  /* A rate typed on the price list for lines charged in a unit the book does
     not price. See TypedRate. */
  typed: TypedRate | null = null,
  /*
    THE LINES AND THE BOOK, WHEN THE CALLER ALREADY HOLDS THEM.

    A list screen has read both for every row it is about to price. Asking for
    them again is three round trips per consignment, which on a container of
    ninety is what makes the price list take seconds. The lines must be this
    cargo's live ones ordered by reference, and the book the live one for its
    service and receiver — the same two things this function would otherwise
    fetch, so a caller that passes them gets the same answer.
  */
  loaded: { packages?: PricingLine[]; book?: RateBook } | null = null
): Promise<PricedConsignment> {
  const packages =
    loaded?.packages ??
    (await client.cargoPackage.findMany({
      where: { cargoId: cargo.id, deletedAt: null, cargoType: { not: null } },
      orderBy: { reference: "asc" },
    }));

  const book =
    loaded?.book ??
    (packages.length === 0
      ? null
      : await loadRateBook({ service: cargo.service, customerId: cargo.receiverId }, client));

  if (packages.length === 0) {
    const input = {
      customerId: cargo.receiverId,
      service: cargo.service,
      cargoType: cargo.commodity,
      measured: {
        cbm: cargo.measuredCbm,
        weightKg: cargo.measuredKg,
        pieces: cargo.measuredPieces,
        packages: cargo.measuredPackages,
      },
    };
    const priced = loaded?.book
      ? quoteFrom(resolveRateFrom(loaded.book, input), input)
      : await quote(client, input);
    const counted =
      priced.basis === "PER_PIECE"
        ? cargo.measuredPieces
        : priced.basis === "PER_BALE"
          ? cargo.measuredPackages
          : null;

    return {
      ...priced,
      needsRate: null,
      items: priced.blockedReason
        ? []
        : [
            {
              description: `Sea freight — ${cargo.description}`,
              paperReceiptNo: null,
              packages: null,
              pieces: null,
              quantity: new Prisma.Decimal(
                priced.billableCbm ?? priced.billableKg ?? counted ?? 1
              ),
              unit: UNIT_OF[priced.basis ?? "FLAT"] ?? "container",
              unitPrice: new Prisma.Decimal(priced.appliedRate ?? 0),
              amount: priced.amount,
              category: "Freight",
              taxable: true,
            },
          ],
    };
  }

  const valuation = valueWith(book!, packages, typed);

  const unpriceable = valuation.lines.find((l) => l.blocked);
  if (unpriceable) {
    const held = valuation.lines.filter((l) => l.blocked);
    const gap = held[0].rateUnitMissing;
    const onlyGap = gap !== null && held.every((l) => l.rateUnitMissing === gap);
    return {
      needsRate: onlyGap
        ? {
            basis: gap,
            quantity: held.reduce(
              (sum, l) => sum.add(chargedQuantity(l, gap) ?? 0),
              ZERO
            ),
            freight: valuation.subtotal,
          }
        : null,
      billableCbm: null,
      billableKg: null,
      standardRate: null,
      appliedRate: null,
      basis: null,
      discount: ZERO,
      amount: ZERO,
      currency: valuation.currency,
      explanation: "",
      blockedReason: `${unpriceable.reference}: ${unpriceable.blocked}`,
      items: [],
    };
  }

  let cbm = ZERO;
  let kg = ZERO;
  const items: DraftItem[] = valuation.lines.map((line) => {
    /* Each line carries the figure its own rate multiplied: the volume, the
       weight, the pieces or the bales. A per-piece line is never also counted
       into the billable volume. */
    let quantity: Prisma.Decimal;
    let unit: string;
    switch (line.basis) {
      case "PER_KG":
        quantity = line.weightKg ?? ZERO;
        kg = kg.add(quantity);
        unit = "kg";
        break;
      case "PER_PIECE":
        quantity = new Prisma.Decimal(line.pieces ?? 0);
        unit = "piece";
        break;
      case "PER_BALE":
        quantity = new Prisma.Decimal(line.quantity);
        unit = "bale";
        break;
      case "FLAT":
        quantity = line.cbm;
        cbm = cbm.add(line.cbm);
        unit = "consignment";
        break;
      default:
        quantity = line.cbm;
        cbm = cbm.add(line.cbm);
        unit = "CBM";
    }

    return {
      description: [line.description, line.cargoType]
        .filter(Boolean)
        .join(" — "),
      paperReceiptNo: line.paperReceiptNo,
      packages: line.quantity,
      pieces: line.pieces,
      quantity,
      unit,
      unitPrice: line.rate ?? ZERO,
      amount: line.amount,
      category: "Freight",
      taxable: true,
    };
  });

  /* One rate can be named on the invoice header only when every line shares it.
     Mixed loads leave it blank rather than pick a winner: a header saying $380
     over lines charged at $500 is worse than a header saying nothing. */
  const bases = new Set(valuation.lines.map((l) => l.basis));
  const rates = new Set(valuation.lines.map((l) => l.rate?.toString()));
  const single = rates.size === 1 ? valuation.lines[0].rate : null;

  const types = [...new Set(valuation.lines.map((l) => l.cargoType))];

  /*
    A RATE THE BOOK DOES NOT HAVE IS NOT THE BOOK'S.

    When a line took a rate typed on the price list, the bill carries that rate
    as the one agreed and no standard beside it: there is no book figure for a
    bale of goods the book prices by the cubic metre. That is also what keeps it
    standing — confirming leaves an agreed rate alone, and a re-price reads the
    typed rate back off the draft (typedRateOf) rather than blocking again.
  */
  const typedUsed = typed !== null && valuation.lines.some((l) => l.typedRate);

  return {
    billableCbm: cbm.greaterThan(0) ? cbm.toDecimalPlaces(4) : null,
    billableKg: kg.greaterThan(0) ? kg.toDecimalPlaces(3) : null,
    standardRate: typedUsed ? null : single,
    appliedRate: typedUsed ? (single ?? typed.rate) : single,
    basis:
      bases.size === 1
        ? (valuation.lines[0].basis as RateBasis)
        : typedUsed
          ? typed.basis
          : null,
    discount: ZERO,
    amount: valuation.subtotal,
    needsRate: null,
    currency: valuation.currency,
    explanation:
      types.length === 1
        ? `${types[0]} at ${valuation.currency} ${single?.toString() ?? "?"}`
        : `${valuation.lines.length} lines across ${types.length} cargo types`,
    blockedReason: null,
    items,
  };
}

/**
 * THE RATE A DRAFT WAS GIVEN FOR A UNIT THE BOOK DOES NOT PRICE.
 *
 * Read back off the draft whenever it is priced again, so a bale count
 * corrected in Dar re-multiplies the rate the confirmer typed instead of
 * blocking the bill a second time. Only an agreed rate counts (one differing
 * from the book's, or with no book figure beside it), and it only ever reaches
 * lines the book cannot price in that unit.
 */
export function typedRateOf(invoice: {
  appliedRate: Prisma.Decimal | null;
  standardRate: Prisma.Decimal | null;
  rateBasis: RateBasis | null;
}): TypedRate | null {
  const basis = lineBasis(invoice.rateBasis);
  if (!basis || invoice.appliedRate === null) return null;
  if (invoice.standardRate !== null && invoice.appliedRate.equals(invoice.standardRate)) {
    return null;
  }
  return { basis, rate: invoice.appliedRate };
}

/**
 * The totals an untyped consignment is billed on: Dar's where Dar recorded one,
 * China's where it did not. Dar weighed and measured what actually came off the
 * container, so its figure replaces Foshan's for billing — Foshan's stays
 * on its own row as the other half of the comparison.
 */
export function billingMeasurement(cargo: {
  darReceiving: Measurement | null;
  chinaReceiving: Measurement | null;
}) {
  return {
    measuredCbm: cargo.darReceiving?.cbm ?? cargo.chinaReceiving?.cbm ?? null,
    measuredKg: cargo.darReceiving?.weightKg ?? cargo.chinaReceiving?.weightKg ?? null,
    measuredPieces: cargo.darReceiving?.piecesCount ?? cargo.chinaReceiving?.piecesCount ?? null,
    measuredPackages:
      cargo.darReceiving?.packagesCount ?? cargo.chinaReceiving?.packagesCount ?? null,
  };
}

type Measurement = {
  cbm: Prisma.Decimal | null;
  weightKg: Prisma.Decimal | null;
  piecesCount: number | null;
  packagesCount: number;
};
