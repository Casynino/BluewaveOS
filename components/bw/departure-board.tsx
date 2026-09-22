import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SAILING_STATUS_LABEL } from "@/lib/constants";
import { ARRIVAL_CAVEAT, type Sailing } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

const utc = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" });
const DAY = utc({ weekday: "short" });
const DATE = utc({ day: "2-digit", month: "short" });
const YEAR = utc({ year: "numeric" });

const STATUS_TONE: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "text-emerald-300",
  CUTOFF_APPROACHING: "text-amber-300",
  CLOSED: "text-white/45",
  DEPARTED: "text-bw-cyan",
  IN_TRANSIT: "text-bw-cyan",
  ARRIVED: "text-white/45",
  DELAYED: "text-amber-300",
  CANCELLED: "text-bw-coral-bright",
};

export function bookHref(sailing: Sailing) {
  return `/book?sailing=${sailing.departureDate.toISOString().slice(0, 10)}`;
}

/**
 * THE DEPARTURES BOARD.
 *
 * A port's timetable, not a set of cards: one row per sailing, the columns a
 * shipper plans by — the day the warehouse stops receiving, the day the box
 * leaves, the day it should reach Dar — and whether there is still room.
 * Read straight from lib/sailing-schedule.ts, the schedule the office keeps.
 */
export function DepartureBoard({ sailings, compact = false }: { sailings: Sailing[]; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-[3px] bg-bw-night text-white ring-1 ring-white/10">
      <div className="bw-mono hidden grid-cols-12 gap-4 border-b border-white/10 px-6 py-3 text-[0.66rem] uppercase tracking-[0.18em] text-white/45 md:grid">
        <span className="col-span-3">Sailing</span>
        <span className="col-span-2">Receiving closes</span>
        <span className="col-span-2">Departs</span>
        <span className="col-span-2">ETA Dar es Salaam</span>
        <span className="col-span-3">Status</span>
      </div>
      <ol>
        {sailings.map((sailing) => (
          <li
            key={sailing.key}
            className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-white/10 px-5 py-5 last:border-b-0 md:grid-cols-12 md:items-center md:px-6"
          >
            <div className="col-span-2 md:col-span-3">
              <p className="font-bw-display text-2xl font-semibold uppercase leading-none">
                {sailing.vessel ?? `Week of ${DATE.format(sailing.departureDate)}`}
              </p>
              <p className="bw-mono mt-1.5 text-[0.7rem] uppercase tracking-[0.14em] text-white/50">
                {sailing.reference ?? `${sailing.origin} → ${sailing.destination}`}
              </p>
            </div>
            <BoardDate label="Receiving closes" date={sailing.cargoDeadline} accent />
            <BoardDate label="Departs" date={sailing.departureDate} />
            <BoardDate label="ETA Dar" date={sailing.estimatedArrival} approx />
            <div className="col-span-2 flex items-center justify-between gap-3 md:col-span-3">
              <span
                className={cn(
                  "bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em]",
                  STATUS_TONE[sailing.status]
                )}
              >
                <span className="size-2 bg-current" aria-hidden />
                {SAILING_STATUS_LABEL[sailing.status] ?? sailing.status}
              </span>
              {sailing.bookingOpen ? (
                <Link
                  href={bookHref(sailing)}
                  className="inline-flex h-10 items-center gap-2 rounded-[2px] bg-bw-coral px-4 font-bw-display text-sm font-semibold uppercase tracking-[0.08em] hover:bg-bw-coral-dark"
                >
                  Book <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {!compact ? (
        <p className="border-t border-white/10 px-6 py-3 text-xs text-white/50">{ARRIVAL_CAVEAT}</p>
      ) : null}
    </div>
  );
}

function BoardDate({ label, date, accent = false, approx = false }: { label: string; date: Date; accent?: boolean; approx?: boolean }) {
  return (
    <div className="md:col-span-2">
      <p className="bw-mono text-[0.68rem] uppercase tracking-[0.12em] text-white/50 md:hidden">{label}</p>
      <p className="bw-mono mt-1 whitespace-nowrap text-base md:mt-0 md:text-lg">
        <span className={cn("mr-1.5 text-xs uppercase tracking-[0.1em] md:mr-2", accent ? "text-bw-coral-bright" : "text-white/50")}>
          {DAY.format(date)}
        </span>
        {approx ? "≈ " : ""}
        {DATE.format(date).toUpperCase()}
        {/* The year earns its room on a wide board; on a phone it only wraps. */}
        <span className="ml-1.5 hidden text-xs text-white/40 xl:inline">{YEAR.format(date)}</span>
      </p>
    </div>
  );
}
