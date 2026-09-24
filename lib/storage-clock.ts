/**
 * THE STORAGE CLOCK.
 *
 * It starts the day the container lands in Dar es Salaam — the arrival stamped
 * on the consignment when the box is marked arrived — and at nothing else: not
 * receipt in China, not the departure, not the ETA, not the invoice, not the
 * price being confirmed. Dar's check-in afterwards is the warehouse's own count
 * and never moves the date; a consignment whose container was never marked
 * arrived falls back to the day Dar booked it in, so the clock always has a
 * day. Days are counted on the Dar es Salaam calendar
 * (UTC+3, no summer time), so a consignment booked in at 01:00 local time is on
 * its first day, not the previous one's.
 *
 * Day 1 is the day it arrived. With seven free days, day 7 is the last free
 * one and day 8 is the first that may be charged.
 *
 * Pure: the caller supplies the settings and the clock.
 */

const DAR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the epoch on the Dar es Salaam calendar. */
function darDay(at: Date) {
  return Math.floor((at.getTime() + DAR_OFFSET_MS) / DAY_MS);
}

/** Midday, Dar time, on a Dar calendar day — safe to format in any zone. */
function dateOfDarDay(day: number) {
  return new Date(day * DAY_MS - DAR_OFFSET_MS + 12 * 60 * 60 * 1000);
}

export type StorageState = {
  arrivedAt: Date;
  freeDays: number;
  /** Which day of storage today is, from 1. */
  dayNumber: number;
  /** Free days left, today included. Zero once the free period is over. */
  daysRemaining: number;
  lastFreeDay: Date;
  expired: boolean;
  /** Days past the free period, today included. */
  chargeableDays: number;
  /** The configured rate, or null when storage is not charged. */
  perDay: number | null;
  currency: string;
  /** chargeableDays × perDay, or null when there is no rate. */
  accrued: number | null;
};

export function storageState(input: {
  arrivedAt: Date;
  freeDays: number;
  perDay: number | string | { toString(): string } | null | undefined;
  currency: string;
  now: Date;
}): StorageState {
  const freeDays = Math.max(0, Math.floor(input.freeDays));
  const start = darDay(input.arrivedAt);
  const dayNumber = Math.max(1, darDay(input.now) - start + 1);
  const daysRemaining = Math.max(0, freeDays - dayNumber + 1);
  const chargeableDays = Math.max(0, dayNumber - freeDays);
  const rate = input.perDay == null ? 0 : Number(input.perDay.toString());
  const perDay = Number.isFinite(rate) && rate > 0 ? rate : null;

  return {
    arrivedAt: input.arrivedAt,
    freeDays,
    dayNumber,
    daysRemaining,
    lastFreeDay: dateOfDarDay(start + Math.max(freeDays, 1) - 1),
    expired: dayNumber > freeDays,
    chargeableDays,
    perDay,
    currency: input.currency,
    accrued: perDay === null ? null : Math.round(perDay * chargeableDays * 100) / 100,
  };
}

/**
 * WHEN THE CLOCK STARTED: the day the goods arrived in Dar.
 *
 * That is the day their container was marked arrived (Cargo.darArrivedAt), by
 * the owner's rule; a consignment with no such day — checked in without a
 * container arrival on record — counts from its Dar check-in. Kept as a
 * function so every screen asks the same question the same way; null while
 * the goods have not arrived.
 */
export function storageStart(
  receivedAt: Date | null | undefined,
  darArrivedAt?: Date | null
): Date | null {
  return darArrivedAt ?? receivedAt ?? null;
}
