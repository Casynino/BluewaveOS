import Link from "next/link";
import { ArrowRight, ArrowUpRight, Ship } from "lucide-react";

import { bookHref } from "@/components/bw/departure-board";
import { SAILING_STATUS_LABEL } from "@/lib/constants";
import type { Sailing } from "@/lib/sailing-schedule";

const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const WEEKDAY = utc({ weekday: "short" });
const DAY_MONTH = utc({ day: "numeric", month: "short" });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * THE NEXT SHIP, AS A BOARDING PASS.
 *
 * Small and white on the dark opening picture, so it is read straight after
 * the headline without competing with it: when the box leaves Foshan, when it
 * should reach Dar, and — the date a customer actually has to act on — when the
 * warehouse stops receiving, counted down in days. The sailings after it are
 * one line each. Every date is the office's schedule (lib/sailing-schedule.ts),
 * never typed here.
 */
export function SailingPanel({ sailings, now = new Date() }: { sailings: Sailing[]; now?: Date }) {
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0];
  if (!next) {
    return (
      <div className="w-full max-w-md rounded-[6px] bg-white p-5 text-bw-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)] lg:ml-auto">
        <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-steel">Next ship</p>
        <p className="mt-2">The office will confirm the next sailing — call or WhatsApp us.</p>
      </div>
    );
  }
  const after = sailings.filter((s) => s.key !== next.key && s.departureDate > next.departureDate).slice(0, 2);
  /* Receiving closes at the end of the deadline day. */
  const daysLeft = Math.ceil((next.cargoDeadline.getTime() + DAY_MS - now.getTime()) / DAY_MS);

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-[6px] bg-white/95 text-bw-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.75)] ring-1 ring-white/40 backdrop-blur lg:ml-auto">
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-bw-coral via-bw-coral-bright to-bw-cyan" />

      <div className="px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-steel">Next ship · Foshan → Dar</p>
          <span className="bw-mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.1em] text-emerald-700">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" aria-hidden />
            {next.bookingOpen ? "Open" : (SAILING_STATUS_LABEL[next.status] ?? "Open")}
          </span>
        </div>

        {/* Foshan to Dar, laid out like a boarding pass. */}
        <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div>
            <p className="bw-display text-[1.9rem] uppercase leading-none">{DAY_MONTH.format(next.departureDate)}</p>
            <p className="mt-1 text-xs text-bw-steel">{WEEKDAY.format(next.departureDate)} · Foshan</p>
          </div>
          <div aria-hidden className="relative h-8">
            <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-bw-rule" />
            <span className="absolute left-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-bw-coral" />
            <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-white ring-1 ring-bw-coral" />
            <span className="absolute left-1/2 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-bw-ink text-white">
              <Ship className="size-3.5" />
            </span>
            <span className="bw-mono absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-[0.62rem] text-bw-steel">
              ≈ {next.transitDays} days
            </span>
          </div>
          <div className="text-right">
            <p className="bw-display text-[1.9rem] uppercase leading-none">{DAY_MONTH.format(next.estimatedArrival)}</p>
            <p className="mt-1 text-xs text-bw-steel">{WEEKDAY.format(next.estimatedArrival)} · Dar</p>
          </div>
        </div>

        {/* The date to act on. */}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-[4px] bg-bw-coral/[0.08] px-3 py-2">
          <p className="text-xs text-bw-coral-dark">
            Cargo in by{" "}
            <span className="font-semibold">
              {WEEKDAY.format(next.cargoDeadline)} {DAY_MONTH.format(next.cargoDeadline)}
            </span>
          </p>
          {daysLeft > 0 ? (
            <p className="bw-mono shrink-0 text-[0.66rem] font-semibold uppercase tracking-[0.12em] text-bw-coral-dark">
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </p>
          ) : null}
        </div>
      </div>

      {after.length > 0 ? (
        <ul className="border-t border-dashed border-bw-rule px-5 py-2.5">
          {after.map((sailing) => (
            <li key={sailing.key} className="bw-mono flex items-center justify-between gap-3 py-1 text-xs">
              <span>
                <span className="text-bw-steel">Then </span>
                {WEEKDAY.format(sailing.departureDate)} {DAY_MONTH.format(sailing.departureDate)}
              </span>
              <span className="text-bw-steel">in by {DAY_MONTH.format(sailing.cargoDeadline)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex border-t border-bw-rule">
        <Link
          href={next.bookingOpen ? bookHref(next) : "/book"}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 bg-bw-coral font-bw-display text-sm font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-bw-coral-dark"
        >
          Book space <ArrowRight className="size-3.5" />
        </Link>
        <Link
          href="/schedule"
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 font-bw-display text-sm font-semibold uppercase tracking-[0.08em] text-bw-ink transition-colors hover:bg-bw-concrete"
        >
          Schedule <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
