import type { Sailing } from "@/lib/sailing-schedule";

/**
 * RATIBA YA MELI — THE SCHEDULE IN THE COMPANY'S OWN WORDS.
 *
 * The office sends customers a "Ratiba ya meli" poster every week with three
 * lines: Kupakia, Kuondoka, Kufika (makadirio). By the owner's decision
 * (10 Nov 2026) every schedule on the website speaks the same Swahili, so a
 * customer reads the same words on the poster and on the page. The month
 * names follow the poster ("Disemba").
 *
 * Dates are stored at UTC midnight, so they are read in UTC like every other
 * schedule date (lib/sailing-schedule.ts).
 */

export const RATIBA = {
  /** The last day the Foshan warehouse takes cargo for this sailing. */
  load: "Kupakia",
  /** The day the container leaves China. */
  depart: "Kuondoka",
  /** The estimated day it reaches Dar es Salaam. */
  arrive: "Kufika (makadirio)",
} as const;

const SIKU = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
const MIEZI = [
  "Januari",
  "Februari",
  "Machi",
  "Aprili",
  "Mei",
  "Juni",
  "Julai",
  "Agosti",
  "Septemba",
  "Oktoba",
  "Novemba",
  "Disemba",
];

/** "13 Novemba" */
export const swDate = (date: Date) => `${date.getUTCDate()} ${MIEZI[date.getUTCMonth()]}`;
/** "Ijumaa" */
export const swDay = (date: Date) => SIKU[date.getUTCDay()];
/** "Ijumaa, 13 Novemba" — the poster's order, without the year. */
export const swFull = (date: Date) => `${swDay(date)}, ${swDate(date)}`;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How long is left to get cargo to Foshan, counting today, as the home panel
 * always has: receiving closes at the end of the deadline day. Null once it has
 * closed.
 */
export function swDaysLeft(deadline: Date, now: Date): string | null {
  const left = Math.ceil((deadline.getTime() + DAY_MS - now.getTime()) / DAY_MS);
  if (left <= 0) return null;
  if (left === 1) return "Leo ni siku ya mwisho";
  return `Zimebaki siku ${left}`;
}

/** A sailing that can no longer be booked says why, in a few words. */
export const SW_STATUS: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "Nafasi ipo",
  CUTOFF_APPROACHING: "Inakaribia kufungwa",
  CLOSED: "Kupakia kumefungwa",
  DEPARTED: "Imeondoka",
  IN_TRANSIT: "Iko baharini",
  ARRIVED: "Imefika Dar",
  DELAYED: "Imechelewa",
  CANCELLED: "Imeghairiwa",
};

/**
 * The Swahili of ARRIVAL_CAVEAT (lib/sailing-schedule.ts), which must sit under
 * every arrival date on a public screen.
 */
export const SW_ARRIVAL_CAVEAT =
  "Tarehe ya kufika ni makadirio — inaweza kubadilika kutokana na hali ya usafiri na bandari.";
