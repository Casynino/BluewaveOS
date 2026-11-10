import Link from "next/link";

import { RATIBA, SW_ARRIVAL_CAVEAT, SW_STATUS, swDaysLeft, swFull } from "@/components/bw/ratiba";
import type { Sailing } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

/* Only a state worth noticing gets a colour; the rest read as quiet text. */
const STATUS_TONE: Partial<Record<Sailing["status"], string>> = {
  DELAYED: "text-amber-300",
  CANCELLED: "text-bw-coral-bright",
  DEPARTED: "text-bw-cyan",
  IN_TRANSIT: "text-bw-cyan",
};

export function bookHref(sailing: Sailing) {
  return `/book?sailing=${sailing.departureDate.toISOString().slice(0, 10)}`;
}

/**
 * THE TIMETABLE, IN THE POSTER'S WORDS.
 *
 * One row per sailing with the three dates the office's "Ratiba ya meli"
 * poster gives — Kupakia, Kuondoka, Kufika (makadirio) — and one way on:
 * "Book now" while there is room, otherwise a few words saying why not. The
 * next sailing's button is the solid one; the rest are outlined, so twelve
 * rows do not shout twelve times. On a phone each row reads like the poster:
 * the word on the left, the date on the right. Read straight from
 * lib/sailing-schedule.ts, the schedule the office keeps.
 */
export function DepartureBoard({
  sailings,
  compact = false,
  now = new Date(),
}: {
  sailings: Sailing[];
  compact?: boolean;
  now?: Date;
}) {
  const firstOpen = sailings.find((s) => s.bookingOpen)?.key;

  return (
    <div className="overflow-hidden rounded-[3px] bg-bw-night text-white ring-1 ring-white/10">
      <div aria-hidden className="hidden grid-cols-12 gap-4 border-b border-white/10 px-6 py-3 text-sm text-white/55 md:grid">
        <span className="col-span-3">{RATIBA.load}</span>
        <span className="col-span-3">{RATIBA.depart}</span>
        <span className="col-span-3">{RATIBA.arrive}</span>
      </div>
      <ol>
        {sailings.map((sailing) => {
          const hurry = sailing.status === "CUTOFF_APPROACHING" ? swDaysLeft(sailing.cargoDeadline, now) : null;
          return (
            <li
              key={sailing.key}
              className="border-b border-white/10 px-5 py-4 last:border-b-0 md:grid md:grid-cols-12 md:items-center md:gap-4 md:px-6"
            >
              {sailing.vessel ? (
                <p className="mb-2 text-sm font-medium text-white md:col-span-12 md:mb-0">
                  {sailing.vessel}
                  {sailing.reference ? <span className="font-normal text-white/50"> · {sailing.reference}</span> : null}
                </p>
              ) : null}
              <dl className="grid gap-2 md:col-span-9 md:grid-cols-3 md:gap-4">
                <Cell term={RATIBA.load} value={swFull(sailing.cargoDeadline)} note={hurry} />
                <Cell term={RATIBA.depart} value={swFull(sailing.departureDate)} />
                <Cell term={RATIBA.arrive} value={`≈ ${swFull(sailing.estimatedArrival)}`} quiet />
              </dl>
              <div className="mt-4 flex justify-end md:col-span-3 md:mt-0">
                {sailing.bookingOpen ? (
                  <Link
                    href={bookHref(sailing)}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center rounded-[2px] px-4 font-bw-display text-sm font-semibold uppercase tracking-[0.06em] transition-colors",
                      sailing.key === firstOpen
                        ? "bg-bw-coral text-white hover:bg-bw-coral-dark"
                        : "border border-white/25 text-white hover:border-white/60"
                    )}
                  >
                    Book now
                  </Link>
                ) : (
                  <span className={cn("text-sm", STATUS_TONE[sailing.status] ?? "text-white/55")}>
                    {SW_STATUS[sailing.status]}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!compact ? (
        <p className="border-t border-white/10 px-5 py-3 text-xs text-white/50 md:px-6">{SW_ARRIVAL_CAVEAT}</p>
      ) : null}
    </div>
  );
}

function Cell({ term, value, note, quiet = false }: { term: string; value: string; note?: string | null; quiet?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 md:block">
      <dt className="text-sm text-white/55 md:sr-only">{term}</dt>
      <dd className="text-right md:text-left">
        <span className={cn("text-[15px] tabular-nums", quiet ? "text-white/75" : "text-white")}>{value}</span>
        {note ? <span className="block text-xs text-bw-coral-bright">{note}</span> : null}
      </dd>
    </div>
  );
}
