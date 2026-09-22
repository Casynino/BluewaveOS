import "server-only";

import type { CargoStatus } from "@prisma/client";

import { messageLinks, trackLink, trackUrl } from "@/lib/cargo-links";
import {
  CARGO_EVENT_LABEL,
  buildCargoNotice,
  isCargoEvent,
  noticeWhatsApp,
  type CargoEvent,
  type CargoNotice,
  type NoticeFacts,
} from "@/lib/cargo-notices";
import { COMPANY } from "@/lib/constants";
import { storageState } from "@/lib/storage-clock";
import { BLUEWAVE_STAGE_LABEL, bluewaveStageOf } from "@/lib/tracking-stage";

export { trackUrl };

/**
 * WHAT WE SAY TO CUSTOMERS ON WHATSAPP, AND WHEN.
 *
 * Two honest constraints shaped this file:
 *
 *  1. The system does not deliver anything. It composes the wording and opens
 *     WhatsApp with it; a member of staff presses send. A logged contact means
 *     "we contacted them", never "the system notified them".
 *
 *  2. Swahili first. These go to traders in Dar es Salaam and Swahili is what
 *     they read.
 *
 * The seven stage messages are the templates in lib/cargo-notices.ts — the
 * same ones the portal notification is written from. What is left here is the
 * payment reminder, the storage notice and a blank letter.
 */

export type ContactKind = CargoEvent | "payment.reminder" | "storage.expired" | "general";

export const CONTACT_KIND_LABELS: Record<ContactKind, string> = {
  ...CARGO_EVENT_LABEL,
  "payment.reminder": "Payment reminder",
  "storage.expired": "Free storage ended",
  general: "Something else",
};

/**
 * What a message logged before the stages were rewritten was about. The log
 * keeps the kind it was written with; this only names it on a screen.
 */
const EARLIER_KINDS: Record<string, string> = {
  "cargo.received_china": "Received in China",
  "cargo.loaded": "Loaded into a container",
  "cargo.departed": "Departed China",
  "cargo.arrived": "Container at Dar port",
  "cargo.received_dar": "At our Dar warehouse",
  "cargo.cleared_unpaid": "Payment required",
  "invoice.issued": "Invoice issued",
  "cargo.ready": "Ready for pickup",
};

export function contactKindLabel(kind: string): string {
  return (CONTACT_KIND_LABELS as Record<string, string>)[kind] ?? EARLIER_KINDS[kind] ?? kind;
}

export const CONTACT_CHANNELS = [
  ["WHATSAPP", "WhatsApp"],
  ["PHONE", "Phone call"],
  ["SMS", "SMS"],
  ["EMAIL", "Email"],
  ["IN_PERSON", "In person"],
] as const;

export type MessageContext = {
  customerName: string;
  reference?: string | null;
  /** Where the consignment stands, for the stage line on a bill. */
  status?: CargoStatus | null;
  description?: string | null;
  shippingMark?: string | null;
  receiptNo?: string | null;
  packages?: number | null;
  pieces?: number | null;
  cbm?: string | null;
  containerNumber?: string | null;
  departedAt?: Date | null;
  eta?: Date | null;
  /** The live bill. A draft is nobody's bill and gets no link. */
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  amount?: string | null;
  currency?: string | null;
  amountTzs?: string | null;
  /**
   * The rate FROZEN ON THE INVOICE, never today's published one. A customer
   * quoted at 2,650 who reads 2,720 next month believes the bill changed.
   */
  fxRate?: string | null;
  /** The bill's pinned rate and how it is charged, for the rate line. */
  rate?: string | number | null;
  rateBasis?: string | null;
  /** Nothing is owed on the live bills. */
  paid?: boolean;
  /** Free days on the Dar floor, and what a day costs after that. */
  freeStorageDays?: number | null;
  storagePerDay?: string | null;
  storageCurrency?: string | null;
  /** When Dar confirmed the boxes on its floor: the first day of storage. */
  storageFrom?: Date | null;
  /** The last free day on the Dar floor, once the clock has started. */
  lastFreeDay?: Date | null;
  /** The Dar pickup warehouse, from its warehouse record. */
  pickupAddress?: string | null;
  pickupNoteId?: string | null;
  pickupNoteNumber?: string | null;
  collectedAt?: Date | null;
  collectedBy?: string | null;
};

/**
 * The stage message a consignment's status calls for — what Support would
 * send today. A status with no stage of its own gets the blank letter.
 */
export function stageEvent(status: CargoStatus): ContactKind {
  switch (bluewaveStageOf(status)) {
    case "RECEIVED_IN_CHINA":
      return "CARGO_RECEIVED_CHINA";
    case "STORED_IN_CHINA":
      return "CARGO_STORED_CHINA";
    case "IN_TRANSIT":
      return status === "MISSING_AT_DAR" ? "general" : "CARGO_IN_TRANSIT";
    case "ARRIVED_IN_DAR":
      return "CARGO_ARRIVED_DAR";
    case "READY_FOR_PICKUP":
      return "CARGO_READY_FOR_PICKUP";
    case "COLLECTED":
      return "CARGO_COLLECTED";
    default:
      return "general";
  }
}

/**
 * Which letter a bill goes out in: the invoice letter while anything is owed
 * or the goods are not yet ready; the ready letter once they are.
 */
export function billLetter(status: CargoStatus, owing: boolean): ContactKind {
  if (status === "READY_FOR_RELEASE" && !owing) return "CARGO_READY_FOR_PICKUP";
  /* The first word a customer gets about money on goods in Dar is the arrival
     letter with the bill in it — never a "reminder" about a bill nobody has
     told them of. The reminder is for chasing, chosen on purpose. */
  if (owing && bluewaveStageOf(status) === "ARRIVED_IN_DAR") return "CARGO_ARRIVED_DAR";
  return "PRICE_CONFIRMED";
}

/* The rate as the customer's old letters wrote it: per CBM, per tonne, per
   piece, per bale. A per-kg rate is printed per tonne, as it is quoted. */
function rateLine(context: MessageContext): string | null {
  if (context.rate === null || context.rate === undefined || !context.rateBasis) return null;
  const rate = Number(context.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cur = context.currency === "TZS" ? "TZS" : "USD";
  switch (context.rateBasis) {
    case "PER_CBM":
      return `${cur} ${money(rate)}/CBM`;
    case "PER_KG":
      return `${cur} ${money(rate * 1000)}/tonne`;
    case "PER_PIECE":
      return `${cur} ${money(rate)}/piece`;
    case "PER_BALE":
      return `${cur} ${money(rate)}/bale`;
    default:
      return null;
  }
}

/**
 * THE LETTER THAT GOES WITH THE GOODS IN DAR.
 *
 * In the shape BlueWave's customers already know from WhatsApp: one heading,
 * the goods, the money in shillings with its dollar figure and the rate it was
 * pinned at, the free storage, and one link — the tracking page, which carries
 * the invoice and the ways to pay. No customs wording: BlueWave has no
 * clearance stage, and the storage clock starts the day Dar books the goods in.
 */
function darBillLetter(context: MessageContext, lead: string): string {
  const name = context.customerName.split(" ")[0] || context.customerName;
  const ref = context.reference ?? "";
  const owing = !context.paid;
  const stage = context.status ? bluewaveStageOf(context.status) : null;
  const rows: [string, string | null | undefined][] = [
    ["Tracking", ref],
    ["Bidhaa", context.description],
    ["Ujazo", context.cbm ? `${context.cbm} CBM` : null],
    ["Mizigo", context.packages ? String(context.packages) : null],
    ["Rate", rateLine(context)],
  ];
  const money: string[] = [];
  if (context.amountTzs) {
    money.push(`• *${owing ? "Kiasi cha kulipa" : "Kiasi"}: TZS ${context.amountTzs}*`);
    if (context.amount && context.currency !== "TZS") money.push(`• Sawa na: USD ${context.amount}`);
  } else if (context.amount) {
    money.push(`• *${owing ? "Kiasi cha kulipa" : "Kiasi"}: ${context.currency ?? "USD"} ${context.amount}*`);
  }
  if (context.fxRate) money.push(`• Exchange Rate: 1 USD = ${context.fxRate} TZS`);

  const days = context.freeStorageDays ?? 7;
  const last = lastFreeDayOf(context);
  const where = context.pickupAddress ? ` (${context.pickupAddress})` : "";
  const storage = context.storageFrom
    ? `*STORAGE:* Una siku ${days} bure za kuhifadhiwa kwenye warehouse yetu Dar es Salaam${where}` +
      (last ? `, hadi ${day(last)}.` : ".") +
      " Baada ya hapo storage charges zinaweza kutozwa."
    : stage === "ARRIVED_IN_DAR" || stage === "READY_FOR_PICKUP"
      ? `*STORAGE:* Una siku ${days} bure za kuhifadhiwa kwenye warehouse yetu Dar es Salaam${where}, kuanzia siku mzigo wako ulipofika.`
      : `*STORAGE:* Utapata siku ${days} bure za kuhifadhiwa kwenye warehouse yetu Dar es Salaam${where}, kuanzia siku mzigo wako utakapopokelewa.`;

  return [
    `*${COMPANY.name.toUpperCase()}*`,
    `Habari ${name}!`,
    lead,
    [
      "*MAELEZO YA MZIGO*",
      ...rows.filter(([, v]) => v).map(([l, v]) => `• ${l}: ${v}`),
      ...money,
      ...(stage ? [`• Status: ${BLUEWAVE_STAGE_LABEL[stage]}`] : []),
    ].join("\n"),
    storage,
    ...(ref ? [`*${context.invoiceId ? "Angalia invoice na njia za malipo" : "Fuatilia mzigo wako"}:*\n${trackLink(ref)}`] : []),
  ].join("\n\n");
}

function factsOf(context: MessageContext, lastFreeDay: Date | null): NoticeFacts {
  const stage = context.status ? bluewaveStageOf(context.status) : null;
  return {
    customerName: context.customerName,
    reference: context.reference ?? "",
    description: context.description,
    cbm: context.cbm,
    packages: context.packages,
    pieces: context.pieces,
    shippingMark: context.shippingMark,
    receiptNo: context.receiptNo,
    containerRef: context.containerNumber,
    departedAt: context.departedAt,
    eta: context.eta,
    invoiceNumber: context.invoiceNumber,
    amountTzs: context.amountTzs,
    amountUsd: context.currency === "TZS" ? null : context.amount,
    fxRate: context.fxRate,
    paid: context.paid,
    stageLabel: stage ? BLUEWAVE_STAGE_LABEL[stage] : null,
    arrivedAt: context.storageFrom,
    freeDays: context.freeStorageDays,
    freeUntil: lastFreeDay,
    storagePerDay: context.storagePerDay,
    storageCurrency: context.storageCurrency,
    pickupAddress: context.pickupAddress,
    pickupNoteNumber: context.pickupNoteNumber,
    collectedAt: context.collectedAt,
    collectedBy: context.collectedBy,
  };
}

/** The last free day from the first one, on the Dar calendar. */
function lastFreeDayOf(context: MessageContext): Date | null {
  if (context.lastFreeDay) return context.lastFreeDay;
  if (!context.storageFrom) return null;
  return storageState({
    arrivedAt: context.storageFrom,
    freeDays: context.freeStorageDays ?? 7,
    perDay: null,
    currency: context.storageCurrency ?? "USD",
    now: context.storageFrom,
  }).lastFreeDay;
}

/** The stage message, with its links, for a staff preview. */
export function composeNotice(event: CargoEvent, context: MessageContext): CargoNotice {
  const ref = context.reference ?? "";
  return buildCargoNotice(
    event,
    factsOf(context, lastFreeDayOf(context)),
    ref
      ? messageLinks({ reference: ref, invoiceId: context.invoiceId, pickupNoteId: context.pickupNoteId })
      : {}
  );
}

const day = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Dar_es_Salaam",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : null;

export function composeMessage(kind: ContactKind, context: MessageContext): string {
  if (kind === "CARGO_ARRIVED_DAR") {
    return darBillLetter(
      context,
      context.invoiceId && !context.paid
        ? "Mzigo wako umefika salama Dar es Salaam. Unaweza kulipa sasa ili mzigo wako uwe tayari kuchukuliwa."
        : context.paid
          ? "Mzigo wako umefika salama Dar es Salaam na malipo yako yamepokelewa. Tutakujulisha mara utakapokuwa tayari kuchukuliwa."
          : "Mzigo wako umefika salama Dar es Salaam. Tutakutumia invoice yako mara bei itakapothibitishwa."
    );
  }
  if (kind === "payment.reminder") {
    return darBillLetter(
      context,
      "Tunakukumbusha kukamilisha malipo ya mzigo wako ili uwe tayari kuchukuliwa. Mzigo hukabidhiwa baada ya malipo kuthibitishwa."
    );
  }
  if (isCargoEvent(kind)) return noticeWhatsApp(composeNotice(kind, context));

  const name = context.customerName.split(" ")[0] || context.customerName;
  const ref = context.reference ?? "";
  const title = (heading: string) => `*${COMPANY.name.toUpperCase()} — ${heading}*`;
  const details = (rows: [string, string | null | undefined][]) =>
    ["*Cargo details*", ...rows.filter(([, v]) => v).map(([l, v]) => `• ${l}: ${v}`)].join("\n");
  const links = messageLinks({ reference: ref || "-", invoiceId: context.invoiceId, pickupNoteId: context.pickupNoteId });

  switch (kind) {
    case "storage.expired": {
      const last = lastFreeDayOf(context);
      return [
        title("Free Storage Has Ended"),
        `Habari ${name},`,
        `Siku ${context.freeStorageDays ?? 7} za storage bure kwa mzigo wako zimekwisha` +
          (last ? ` (siku ya mwisho ilikuwa ${day(last)})` : "") +
          ". " +
          (context.storagePerDay && Number(context.storagePerDay) > 0
            ? `Storage fee ya ${context.storageCurrency ?? "USD"} ${context.storagePerDay} kwa siku inatozwa hadi mzigo utakapochukuliwa.`
            : "Gharama za storage zinaweza kuanza kutozwa."),
        details([
          ["Cargo ref", ref],
          ["Arrived", day(context.storageFrom)],
          ["Pickup location", context.pickupAddress],
        ]),
        ...(ref ? [`*View cargo:*\n${links.viewCargo}`, `*Warehouse information:*\n${links.warehouse}`] : []),
      ].join("\n\n");
    }

    default:
      return [
        title(ref ? `Kuhusu ${ref}` : "Ujumbe"),
        `Habari ${name},`,
        "Tunakuandikia kuhusu mzigo wako.",
        ...(ref ? [`*Track cargo:*\n${trackLink(ref)}`] : []),
      ].join("\n\n");
  }
}

/**
 * The wa.me address for a Tanzanian or Chinese number.
 *
 * WhatsApp wants digits only with the country code and no plus. A number saved
 * as "0688 887 784" is a local habit, not an international number, and sending
 * it as-is opens a chat with nobody.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("255")) return digits;
  if (digits.startsWith("0")) return `255${digits.slice(1)}`;
  if (digits.startsWith("86")) return digits;
  return digits;
}
