import { COMPANY, ROUTE } from "@/lib/constants";

/**
 * ONE MESSAGE PER STAGE, AND EACH ONE KNOWS ITS EVENT.
 *
 * The customer hears about seven moments in the BlueWave journey, and each has
 * its own template here: a China receipt can never borrow in-transit wording,
 * and nothing about arriving in Dar mentions customs, because BlueWave has no
 * clearance stage. The same template feeds the portal notification and the
 * WhatsApp text Support sends, so the two never tell the customer different
 * things.
 *
 * Pure: the facts and the links are handed in. What a fact does not know is
 * left out — an unknown ETA is not printed as "soon", and a link that has no
 * page to open is not drawn.
 *
 * Swahili leads, because it is what the traders in Dar read; the labels on the
 * details are the English words printed on their delivery note and invoice.
 */

export const CARGO_EVENTS = [
  "CARGO_RECEIVED_CHINA",
  "CARGO_STORED_CHINA",
  "CARGO_IN_TRANSIT",
  "PRICE_CONFIRMED",
  "CARGO_ARRIVED_DAR",
  "CARGO_READY_FOR_PICKUP",
  "CARGO_COLLECTED",
] as const;

export type CargoEvent = (typeof CARGO_EVENTS)[number];

export function isCargoEvent(value: string): value is CargoEvent {
  return (CARGO_EVENTS as readonly string[]).includes(value);
}

/** What the event is, for a list of messages sent. */
export const CARGO_EVENT_LABEL: Record<CargoEvent, string> = {
  CARGO_RECEIVED_CHINA: "Cargo received in China",
  CARGO_STORED_CHINA: "Cargo stored in China",
  CARGO_IN_TRANSIT: "Cargo in transit",
  PRICE_CONFIRMED: "Invoice ready — price confirmed",
  CARGO_ARRIVED_DAR: "Arrived in Dar es Salaam",
  CARGO_READY_FOR_PICKUP: "Ready for pickup",
  CARGO_COLLECTED: "Cargo collected",
};

/** What the staff button says for each event. */
export const CARGO_EVENT_ACTION: Record<CargoEvent, string> = {
  CARGO_RECEIVED_CHINA: "Notify customer — Cargo received in China",
  CARGO_STORED_CHINA: "Notify customer — Cargo stored in China",
  CARGO_IN_TRANSIT: "Notify customer — Cargo in transit",
  PRICE_CONFIRMED: "Send invoice notification",
  CARGO_ARRIVED_DAR: "Notify customer — Arrived in Dar",
  CARGO_READY_FOR_PICKUP: "Notify customer — Ready for pickup",
  CARGO_COLLECTED: "Notify customer — Cargo collected",
};

export type NoticeFacts = {
  customerName: string;
  reference: string;
  description?: string | null;
  cbm?: string | null;
  packages?: number | null;
  pieces?: number | null;
  shippingMark?: string | null;
  /** The paper receipt number the Foshan counter wrote on the delivery. */
  receiptNo?: string | null;
  containerRef?: string | null;
  departedAt?: Date | null;
  /** Only when somebody recorded one. Never estimated here. */
  eta?: Date | null;
  invoiceNumber?: string | null;
  /** Already formatted: "1,250,000". Shillings are what they hand over. */
  amountTzs?: string | null;
  /** Already formatted: "462.96". */
  amountUsd?: string | null;
  fxRate?: string | null;
  /** Nothing is owed on the live bills. */
  paid?: boolean;
  /** The six-stage label the consignment stands at, for the invoice letter. */
  stageLabel?: string | null;
  /** When Dar confirmed the boxes on its floor. */
  arrivedAt?: Date | null;
  freeDays?: number | null;
  freeUntil?: Date | null;
  storagePerDay?: string | null;
  storageCurrency?: string | null;
  /** The Dar pickup warehouse, read from the warehouse record. */
  pickupAddress?: string | null;
  pickupNoteNumber?: string | null;
  collectedAt?: Date | null;
  collectedBy?: string | null;
  releaseNumber?: string | null;
  /** Dar found something on the boxes and is checking it. */
  issue?: boolean;
};

export type NoticeLinkKey = "track" | "viewCargo" | "invoice" | "payNow" | "pickup" | "warehouse";

/** Absolute addresses for WhatsApp; site paths for the portal. */
export type NoticeLinks = Partial<Record<NoticeLinkKey, string | null>>;

export type NoticeLink = { key: NoticeLinkKey; label: string; href: string };

export type NoticeSection = { title: string; rows: { label: string; value: string }[] };

export type CargoNotice = {
  event: CargoEvent;
  /** "BLUEWAVE CARGO — Cargo Received in China" */
  title: string;
  /** "Cargo Received in China" */
  heading: string;
  greeting: string;
  intro: string;
  details: { label: string; value: string }[];
  /** Further blocks under the details: pickup location, storage. */
  sections: NoticeSection[];
  status: string;
  explanation: string;
  closing: string | null;
  links: NoticeLink[];
};

const LINK_LABEL: Record<NoticeLinkKey, string> = {
  track: "Track cargo",
  viewCargo: "View cargo",
  invoice: "Download invoice",
  payNow: "Pay now",
  pickup: "View pickup details",
  warehouse: "Warehouse information",
};

const HEADING: Record<CargoEvent, string> = {
  CARGO_RECEIVED_CHINA: "Cargo Received in China",
  CARGO_STORED_CHINA: "Cargo Stored in China",
  CARGO_IN_TRANSIT: "Your Cargo Is Now In Transit",
  PRICE_CONFIRMED: "Your Invoice Is Ready",
  CARGO_ARRIVED_DAR: "Your Cargo Has Arrived in Dar es Salaam",
  CARGO_READY_FOR_PICKUP: "Your Cargo Is Ready for Pickup",
  CARGO_COLLECTED: "Your Cargo Has Been Collected",
};

const STATUS: Record<CargoEvent, string> = {
  CARGO_RECEIVED_CHINA: "Received in China",
  CARGO_STORED_CHINA: "Stored in China",
  CARGO_IN_TRANSIT: "In transit",
  PRICE_CONFIRMED: "Price confirmed — invoice issued",
  CARGO_ARRIVED_DAR: "Arrived in Dar es Salaam",
  CARGO_READY_FOR_PICKUP: "Ready for pickup",
  CARGO_COLLECTED: "Collected",
};

/** Which links each event carries, in the order they are shown. */
const LINKS: Record<CargoEvent, NoticeLinkKey[]> = {
  CARGO_RECEIVED_CHINA: ["track"],
  CARGO_STORED_CHINA: ["track"],
  CARGO_IN_TRANSIT: ["track"],
  PRICE_CONFIRMED: ["invoice", "viewCargo", "payNow"],
  CARGO_ARRIVED_DAR: ["viewCargo", "payNow", "warehouse"],
  CARGO_READY_FOR_PICKUP: ["pickup", "warehouse"],
  CARGO_COLLECTED: ["viewCargo"],
};

const day = (date: Date | null | undefined) =>
  date
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Dar_es_Salaam",
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date)
    : null;

const sameDarDay = (a: Date, b: Date) => day(a) === day(b);

function firstName(name: string) {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] || trimmed || "mteja";
}

/** The rows every letter shares, skipping what is not known. */
function cargoRows(facts: NoticeFacts, extra: { receipt?: boolean; pieces?: boolean } = {}) {
  const rows: { label: string; value: string }[] = [{ label: "Cargo ref", value: facts.reference }];
  if (facts.description) rows.push({ label: "Product", value: facts.description });
  if (facts.cbm) rows.push({ label: "CBM", value: facts.cbm });
  if (facts.packages != null) rows.push({ label: "Packages", value: String(facts.packages) });
  if (extra.pieces !== false && facts.pieces != null && facts.pieces > 0) {
    rows.push({ label: "Pieces", value: String(facts.pieces) });
  }
  if (extra.receipt) {
    if (facts.shippingMark) rows.push({ label: "Shipping mark", value: facts.shippingMark });
    if (facts.receiptNo) rows.push({ label: "Receipt no.", value: facts.receiptNo });
  }
  return rows;
}

function pickupSection(facts: NoticeFacts): NoticeSection[] {
  if (!facts.pickupAddress) return [];
  return [{ title: "Pickup location", rows: [{ label: "Warehouse", value: facts.pickupAddress }] }];
}

function storageSection(facts: NoticeFacts, now: Date): NoticeSection[] {
  if (!facts.freeDays || !facts.arrivedAt) return [];
  const rows = [
    { label: "Free storage period", value: `${facts.freeDays} ${facts.freeDays === 1 ? "day" : "days"}` },
    {
      label: "Countdown starts",
      value: sameDarDay(facts.arrivedAt, now) ? `today (${day(facts.arrivedAt)})` : day(facts.arrivedAt)!,
    },
  ];
  if (facts.freeUntil) rows.push({ label: "Free storage until", value: day(facts.freeUntil)! });
  if (facts.storagePerDay && Number(facts.storagePerDay) > 0) {
    rows.push({
      label: "After that",
      value: `${facts.storageCurrency ?? "USD"} ${facts.storagePerDay} per day until collected`,
    });
  }
  return [{ title: "Storage", rows }];
}

/**
 * THE TEMPLATE FOR ONE EVENT.
 *
 * `now` only decides whether the storage countdown reads "today"; everything
 * else is the facts as given.
 */
export function buildCargoNotice(
  event: CargoEvent,
  facts: NoticeFacts,
  links: NoticeLinks = {},
  now: Date = new Date()
): CargoNotice {
  const heading = HEADING[event];
  let intro: string;
  let details: { label: string; value: string }[];
  let sections: NoticeSection[] = [];
  let explanation: string;
  let closing: string | null = null;

  switch (event) {
    case "CARGO_RECEIVED_CHINA":
      intro = "Mzigo wako umepokelewa salama katika warehouse yetu nchini China.";
      details = cargoRows(facts, { receipt: true });
      explanation =
        "Mzigo wako sasa umepokelewa na umeingia kwenye mfumo wa BlueWave Cargo. " +
        "Tutakujulisha mara utakapowekwa kwenye safari kuelekea Tanzania.";
      break;

    case "CARGO_STORED_CHINA":
      intro = "Mzigo wako umehifadhiwa katika warehouse yetu nchini China na umepangiwa kontena.";
      details = cargoRows(facts);
      if (facts.containerRef) details.push({ label: "Container", value: facts.containerRef });
      explanation =
        "Mzigo wako uko tayari kwa safari. Tutakujulisha mara kontena litakapoondoka China kuelekea Tanzania.";
      break;

    case "CARGO_IN_TRANSIT":
      intro = "Mzigo wako umeanza safari kutoka China kuelekea Tanzania.";
      details = cargoRows(facts);
      if (facts.containerRef) details.push({ label: "Container", value: facts.containerRef });
      details.push({
        label: "Departure",
        value: facts.departedAt ? `${ROUTE.originCountry} — ${day(facts.departedAt)}` : ROUTE.originCountry,
      });
      details.push({ label: "Destination", value: `${ROUTE.destinationCity}, ${ROUTE.destinationCountry}` });
      if (facts.eta) details.push({ label: "Estimated arrival", value: day(facts.eta)! });
      explanation =
        "Safari ya mzigo wako imeanza. Unaweza kufuatilia hatua ya safari kupitia link hapa chini.";
      closing = `Tutakujulisha mara mzigo wako utakapowasili ${ROUTE.destinationCity}.`;
      break;

    case "PRICE_CONFIRMED":
      intro = "Bei ya usafirishaji wa mzigo wako imethibitishwa na invoice yako sasa iko tayari.";
      details = cargoRows(facts, { pieces: false });
      if (facts.invoiceNumber) details.push({ label: "Invoice", value: facts.invoiceNumber });
      if (facts.amountTzs) details.push({ label: facts.paid ? "Amount" : "Amount due", value: `TZS ${facts.amountTzs}` });
      if (facts.amountUsd) {
        details.push({
          label: facts.amountTzs ? "USD equivalent" : facts.paid ? "Amount" : "Amount due",
          value: `USD ${facts.amountUsd}`,
        });
      }
      if (facts.fxRate) details.push({ label: "Exchange rate", value: `1 USD = ${facts.fxRate} TZS` });
      if (facts.stageLabel) details.push({ label: "Cargo stage", value: facts.stageLabel });
      explanation =
        "Unaweza kuangalia maelezo yote ya invoice na kuipakua kupitia link hapa chini." +
        (facts.paid ? " Invoice hii imeshalipwa, asante." : "");
      break;

    case "CARGO_ARRIVED_DAR":
      intro = `Tunayo furaha kukujulisha kuwa mzigo wako umefika salama ${ROUTE.destinationCity}.`;
      details = cargoRows(facts);
      if (facts.arrivedAt) details.push({ label: "Arrived", value: day(facts.arrivedAt)! });
      sections = [...pickupSection(facts), ...storageSection(facts, now)];
      explanation =
        (facts.issue
          ? "Tunakagua jambo moja kuhusu mzigo wako na tutawasiliana nawe. "
          : "") +
        (facts.paid
          ? "Tafadhali fanya maandalizi ya kuchukua mzigo wako kwa wakati ili kuepuka storage charges baada ya kipindi cha bure."
          : "Tafadhali kamilisha malipo na maandalizi ya kuchukua mzigo wako kwa wakati ili kuepuka storage charges baada ya kipindi cha bure.");
      closing = "Tutakujulisha mara mzigo wako utakapokuwa tayari kuchukuliwa.";
      break;

    case "CARGO_READY_FOR_PICKUP":
      intro = `Mzigo wako sasa uko tayari kuchukuliwa katika warehouse yetu ${ROUTE.destinationCity}.`;
      details = cargoRows(facts);
      if (facts.pickupNoteNumber) details.push({ label: "Pickup note", value: facts.pickupNoteNumber });
      sections = pickupSection(facts);
      explanation =
        "Tafadhali njoo na kitambulisho chako (ID) pamoja na pickup note yako. " +
        "Mzigo hukabidhiwa kwa mpokeaji aliyeandikwa kwenye invoice tu." +
        (facts.freeUntil ? ` Storage ni bure hadi ${day(facts.freeUntil)}.` : "");
      break;

    case "CARGO_COLLECTED":
      intro = `Mzigo wako umekabidhiwa kutoka warehouse yetu ${ROUTE.destinationCity}.`;
      details = cargoRows(facts, { pieces: false });
      if (facts.collectedBy) details.push({ label: "Collected by", value: facts.collectedBy });
      if (facts.collectedAt) details.push({ label: "Collected on", value: day(facts.collectedAt)! });
      if (facts.releaseNumber) details.push({ label: "Release note", value: facts.releaseNumber });
      explanation = `Asante kwa kusafirisha na ${COMPANY.name}. Karibu tena.`;
      break;
  }

  const shown = LINKS[event]
    .filter((key) => {
      /* Nothing to pay on a settled bill. */
      if (key === "payNow" && facts.paid) return false;
      return Boolean(links[key]);
    })
    .map((key) => ({
      key,
      label: key === "track" && event === "CARGO_IN_TRANSIT" ? "Track your cargo" : LINK_LABEL[key],
      href: links[key]!,
    }));

  return {
    event,
    title: `${COMPANY.name.toUpperCase()} — ${heading}`,
    heading,
    greeting: `Habari ${firstName(facts.customerName)},`,
    intro,
    details,
    sections,
    status: STATUS[event],
    explanation,
    closing,
    links: shown,
  };
}

/**
 * The WhatsApp text.
 *
 * WhatsApp draws *asterisks* as bold and • as a bullet, so they are written
 * literally — the message has to look right in the app, not in a terminal.
 */
export function noticeWhatsApp(notice: CargoNotice): string {
  const blocks: string[] = [
    `*${notice.title}*`,
    notice.greeting,
    notice.intro,
    [
      "*Cargo details*",
      ...notice.details.map((row) => `• ${row.label}: ${row.value}`),
      `• Status: ${notice.status}`,
    ].join("\n"),
    ...notice.sections.map((section) =>
      [`*${section.title}*`, ...section.rows.map((row) => `• ${row.label}: ${row.value}`)].join("\n")
    ),
    notice.explanation,
    ...notice.links.map((link) => `*${link.label}:*\n${link.href}`),
  ];
  if (notice.closing) blocks.push(notice.closing);
  return blocks.join("\n\n");
}

/**
 * The portal notification: the title as the heading of the row, and a body
 * short enough to read in a list. The row opens the first link.
 */
export function noticePortal(notice: CargoNotice): { title: string; body: string } {
  const glance = notice.details
    .filter((row) => ["Cargo ref", "Packages", "CBM", "Container", "Estimated arrival", "Invoice", "Amount due", "Free storage until", "Pickup note"].includes(row.label))
    .map((row) => `${row.label}: ${row.value}`);
  const storage = notice.sections
    .flatMap((section) => section.rows)
    .filter((row) => row.label === "Free storage until" || row.label === "Warehouse")
    .map((row) => `${row.label === "Warehouse" ? "Pickup" : row.label}: ${row.value}`);
  return {
    title: notice.title,
    body: [notice.intro, [...glance, ...storage, `Status: ${notice.status}`].join(" · "), notice.explanation]
      .filter(Boolean)
      .join("\n"),
  };
}
