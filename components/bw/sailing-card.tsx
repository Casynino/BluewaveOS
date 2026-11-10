import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { bookHref } from "@/components/bw/departure-board";
import { RATIBA, SW_STATUS, sailingTitle, swAtSea, swDate, swDay, swYear } from "@/components/bw/ratiba";
import type { Sailing } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "text-emerald-700 dark:text-emerald-300",
  CUTOFF_APPROACHING: "text-emerald-700 dark:text-emerald-300",
  CLOSED: "text-bw-muted",
  DEPARTED: "text-bw-harbour dark:text-bw-cyan",
  IN_TRANSIT: "text-bw-harbour dark:text-bw-cyan",
  ARRIVED: "text-bw-muted",
  DELAYED: "text-amber-700 dark:text-amber-300",
  CANCELLED: "text-bw-coral",
};

/**
 * ONE SAILING, AS THE SCHEDULE CARD.
 *
 * Copied from the owner's other sea-cargo system (owner, 10 Nov 2026): the
 * ship by the day it leaves, the route, "Nafasi zipo", then the three dates
 * down a thin line — the deadline first and in colour, because it is the one
 * the customer has to meet — and one button across the foot.
 */
export function SailingCard({ sailing }: { sailing: Sailing }) {
  const steps = [
    { term: RATIBA.load, date: sailing.cargoDeadline, first: true, note: null },
    { term: RATIBA.depart, date: sailing.departureDate, first: false, note: null },
    { term: RATIBA.arrive, date: sailing.estimatedArrival, first: false, note: swAtSea(sailing.transitDays) },
  ];

  return (
    <article className="flex h-full flex-col rounded-xl border border-bw-line bg-bw-panel p-5 text-bw-fg sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight">{sailingTitle(sailing)}</p>
          <p className="mt-0.5 text-xs text-bw-muted">
            {sailing.origin} → {sailing.destination}
            {sailing.reference ? ` · ${sailing.reference}` : ""}
          </p>
        </div>
        <span className={cn("shrink-0 pt-1 text-xs font-medium", STATUS_TONE[sailing.status])}>
          {SW_STATUS[sailing.status]}
        </span>
      </div>

      <ol className="mt-6 space-y-5 border-l border-bw-line pl-5">
        {steps.map((step) => (
          <li key={step.term} className="relative">
            <span
              aria-hidden
              className={cn(
                "absolute -left-[1.6rem] top-2 size-2.5 rounded-full",
                step.first ? "bg-bw-coral" : "bg-bw-line"
              )}
            />
            <p className="text-xs text-bw-muted">{step.term}</p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 tabular-nums">
              <span className={cn("text-2xl font-semibold tracking-tight", step.first && "text-bw-coral dark:text-bw-coral-bright")}>
                {swDate(step.date)}
              </span>
              <span className="text-sm text-bw-muted">
                {swDay(step.date)} · {swYear(step.date)}
              </span>
            </p>
            {step.note ? <p className="mt-0.5 text-xs text-bw-muted">{step.note}</p> : null}
          </li>
        ))}
      </ol>

      {sailing.notes ? <p className="mt-5 rounded-lg bg-bw-ground px-3 py-2 text-xs text-bw-muted">{sailing.notes}</p> : null}

      <div className="mt-auto pt-6">
        {sailing.bookingOpen ? (
          <Link
            href={bookHref(sailing)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-bw-coral px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-bw-coral-dark"
          >
            Book now
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <p className="rounded-lg border border-bw-line px-5 py-3 text-center text-sm text-bw-muted">
            {SW_STATUS[sailing.status]}
          </p>
        )}
      </div>
    </article>
  );
}
