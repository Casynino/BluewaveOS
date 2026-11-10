import type { Sailing } from "@/lib/sailing-schedule";

/**
 * RATIBA YA MELI — THE SCHEDULE'S WORDS, IN ONE PLACE.
 *
 * By the owner's decision (10 Nov 2026) the schedule is copied word for word
 * from the live schedule of his other sea-cargo system: "Meli ya Novemba 16",
 * "Mwisho kupokea mzigo", "Meli inaondoka", "Meli kufika (makadirio)", dates
 * written "Novemba 13" with "Ijumaa · 2026" beside them, "Siku 30 baharini",
 * "Nafasi zipo". Every schedule on the site takes its words from here, so they
 * never drift apart. The booking button says "Book now" (owner, same day).
 *
 * Dates are stored at UTC midnight, so they are read in UTC like every other
 * schedule date (lib/sailing-schedule.ts).
 */

export const RATIBA = {
  /** The last day the Foshan warehouse takes cargo for this sailing. */
  load: "Mwisho kupokea mzigo",
  /** The day the container leaves China. */
  depart: "Meli inaondoka",
  /** The estimated day it reaches Dar es Salaam. */
  arrive: "Meli kufika (makadirio)",
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

/** "Novemba 13" */
export const swDate = (date: Date) => `${MIEZI[date.getUTCMonth()]} ${date.getUTCDate()}`;
/** "Ijumaa" */
export const swDay = (date: Date) => SIKU[date.getUTCDay()];
/** "Ijumaa, Novemba 13" — for a date on one line. */
export const swFull = (date: Date) => `${swDay(date)}, ${swDate(date)}`;
/** 2026 */
export const swYear = (date: Date) => date.getUTCFullYear();

/** "Meli ya Novemba 16" — or the ship's name once the line has given it. */
export const sailingTitle = (sailing: Sailing) => sailing.vessel ?? `Meli ya ${swDate(sailing.departureDate)}`;

/** "Siku 30 baharini" */
export const swAtSea = (days: number) => `Siku ${days} baharini`;

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

/** What a sailing's state says to a customer. Room on it reads "Nafasi zipo". */
export const SW_STATUS: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "Nafasi zipo",
  CUTOFF_APPROACHING: "Nafasi zipo",
  CLOSED: "Mzigo haupokelewi tena",
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
  "Tarehe ya kufika ni makadirio — inategemea hali ya usafirishaji, bandari, forodha na ukaguzi.";

/** The second line under the schedule. */
export const SW_DELAY_NOTE =
  "Meli huchelewa kwa sababu ya hali ya hewa, msongamano bandarini na forodha, na tutakujulisha inapotokea.";
