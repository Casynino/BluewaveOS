import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { bookHref } from "@/components/bw/departure-board";
import { RATIBA, SW_STATUS, swDate, swDaysLeft, swFull } from "@/components/bw/ratiba";
import type { Sailing } from "@/lib/sailing-schedule";

/**
 * THE NEXT SHIP, AS THE OFFICE'S POSTER.
 *
 * Small and white on the dark opening picture, so it is read straight after
 * the headline without competing with it. The same three lines and words as
 * the "Ratiba ya meli" poster the office sends (owner, 10 Nov 2026): Kupakia —
 * the date a customer actually has to meet, counted down — Kuondoka and Kufika
 * (makadirio). The sailings after it are one line. Every date is the office's
 * schedule (lib/sailing-schedule.ts), never typed here.
 */
export function SailingPanel({ sailings, now = new Date() }: { sailings: Sailing[]; now?: Date }) {
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0];
  if (!next) {
    return (
      <div className="w-full max-w-md rounded-[4px] bg-white p-5 text-bw-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] lg:ml-auto">
        <p className="bw-mono text-[0.66rem] uppercase tracking-[0.06em] text-bw-steel">Meli ijayo</p>
        <p className="mt-2">Ofisi itathibitisha meli ijayo — tupigie simu au tuandikie WhatsApp.</p>
      </div>
    );
  }
  const after = sailings.filter((s) => s.key !== next.key && s.departureDate > next.departureDate).slice(0, 2);
  const left = next.bookingOpen ? swDaysLeft(next.cargoDeadline, now) : null;

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[4px] bg-white/95 text-bw-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.75)] ring-1 ring-white/40 backdrop-blur lg:ml-auto">
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="bw-mono text-[0.66rem] uppercase tracking-[0.06em] text-bw-steel">Meli ijayo · Foshan → Dar</p>
          {left ? (
            <p className="whitespace-nowrap text-xs font-medium text-bw-coral-dark">{left}</p>
          ) : next.bookingOpen ? null : (
            <p className="whitespace-nowrap text-xs text-bw-steel">{SW_STATUS[next.status]}</p>
          )}
        </div>

        <dl className="mt-3 divide-y divide-bw-rule">
          <Row term={RATIBA.load} value={swFull(next.cargoDeadline)} act />
          <Row term={RATIBA.depart} value={swFull(next.departureDate)} />
          <Row term={RATIBA.arrive} value={`≈ ${swFull(next.estimatedArrival)}`} />
        </dl>

        {after.length > 0 ? (
          <p className="mt-2 text-xs text-bw-steel">
            Zinazofuata: {after.map((sailing) => swDate(sailing.departureDate)).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="flex border-t border-bw-rule">
        <Link
          href={next.bookingOpen ? bookHref(next) : "/book"}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 bg-bw-coral font-bw-display text-sm font-semibold uppercase tracking-[0.06em] text-white transition-colors hover:bg-bw-coral-dark"
        >
          Book now <ArrowRight className="size-3.5" />
        </Link>
        <Link
          href="/schedule"
          className="inline-flex h-11 flex-1 items-center justify-center font-bw-display text-sm font-semibold uppercase tracking-[0.06em] text-bw-ink transition-colors hover:bg-bw-concrete"
        >
          Ratiba kamili
        </Link>
      </div>
    </div>
  );
}

function Row({ term, value, act = false }: { term: string; value: string; act?: boolean }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5">
      <dt className="text-sm text-bw-steel">{term}</dt>
      <dd className={act ? "text-[15px] font-semibold tabular-nums text-bw-coral-dark" : "text-[15px] font-medium tabular-nums"}>
        {value}
      </dd>
    </div>
  );
}
