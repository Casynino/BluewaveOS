import Link from "next/link";
import { ArrowRight, Ship } from "lucide-react";

import { bookHref } from "@/components/bw/departure-board";
import { SAILING_STATUS_LABEL } from "@/lib/constants";
import type { Sailing } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const WEEKDAY = utc({ weekday: "short" });
const DAY_MONTH = utc({ day: "numeric", month: "short" });

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * THE NEXT SHIP, AS A BOARDING CARD.
 *
 * White on the dark opening picture, so it is the first thing read after the
 * headline: when the box leaves Foshan, when it should reach Dar, and — the
 * date a customer actually has to act on — when the warehouse stops receiving,
 * counted down in days. The two sailings after it sit underneath. Every date is
 * the office's schedule (lib/sailing-schedule.ts), never typed here.
 */
export function SailingPanel({ sailings, now = new Date() }: { sailings: Sailing[]; now?: Date }) {
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0];
  if (!next) {
    return (
      <div className="rounded-[4px] bg-white p-6 text-bw-ink shadow-[0_30px_60px_-30px_rgb(0_0_0/0.6)]">
        <p className="bw-label text-bw-steel">Next sailing</p>
        <p className="mt-3 text-lg">The office will confirm the next sailing — call or WhatsApp us.</p>
      </div>
    );
  }
  const after = sailings.filter((s) => s.key !== next.key && s.departureDate > next.departureDate).slice(0, 2);
  /* Receiving closes at the end of the deadline day, China time. */
  const closesAt = next.cargoDeadline.getTime() + DAY_MS;
  const daysLeft = Math.ceil((closesAt - now.getTime()) / DAY_MS);

  return (
    <div className="overflow-hidden rounded-[4px] bg-white text-bw-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.7)]">
      <div className="flex items-center justify-between gap-3 border-b border-bw-rule px-5 py-3.5 sm:px-6">
        <p className="bw-label min-w-0 text-bw-steel">Next ship<span className="hidden sm:inline"> · Foshan → Dar</span></p>
        <span className="bw-mono inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[0.68rem] uppercase tracking-[0.12em] text-emerald-700">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" aria-hidden />
          {SAILING_STATUS_LABEL[next.status] ?? "Open"}
        </span>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-6">
        {next.vessel ? <p className="font-bw-display text-lg font-semibold uppercase text-bw-harbour">{next.vessel}</p> : null}
        <div className="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-3 sm:gap-4">
          <div>
            <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-steel">Departs</p>
            <p className="bw-display mt-1 text-4xl uppercase leading-none sm:text-5xl">{DAY_MONTH.format(next.departureDate)}</p>
            <p className="mt-1 text-sm text-bw-steel">{WEEKDAY.format(next.departureDate)} · Foshan</p>
          </div>
          <div aria-hidden className="relative mb-7 h-6">
            <span className="absolute inset-x-0 top-1/2 border-t-2 border-dashed border-bw-rule" />
            <span className="absolute left-0 top-1/2 size-2 -translate-y-1/2 bg-bw-coral" />
            <span className="absolute right-0 top-1/2 size-2 -translate-y-1/2 border-2 border-bw-coral bg-white" />
            <span className="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-bw-ink text-white">
              <Ship className="size-4" />
            </span>
            <span className="bw-mono absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[0.68rem] text-bw-steel">
              ≈ {next.transitDays} days
            </span>
          </div>
          <div className="text-right">
            <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-steel">Arrives about</p>
            <p className="bw-display mt-1 text-4xl uppercase leading-none sm:text-5xl">{DAY_MONTH.format(next.estimatedArrival)}</p>
            <p className="mt-1 text-sm text-bw-steel">{WEEKDAY.format(next.estimatedArrival)} · Dar es Salaam</p>
          </div>
        </div>

        {/* The date to act on. */}
        <div
          className={cn(
            "mt-5 flex items-center justify-between gap-3 rounded-[3px] px-4 py-3",
            daysLeft > 0 ? "bg-bw-coral/10 text-bw-coral-dark" : "bg-bw-concrete text-bw-steel"
          )}
        >
          <p className="text-sm">
            Last day to receive cargo:{" "}
            <span className="font-semibold">
              {WEEKDAY.format(next.cargoDeadline)} {DAY_MONTH.format(next.cargoDeadline)}
            </span>
          </p>
          {daysLeft > 0 ? (
            <p className="bw-display shrink-0 text-2xl uppercase leading-none">
              {daysLeft} {daysLeft === 1 ? "day" : "days"} left
            </p>
          ) : null}
        </div>
      </div>

      {after.length > 0 ? (
        <ul className="border-t border-bw-rule">
          {after.map((sailing) => (
            <li key={sailing.key} className="flex items-center justify-between gap-3 border-b border-bw-rule px-5 py-3 last:border-b-0 sm:px-6">
              <span className="bw-mono min-w-0 truncate text-sm">
                <span className="text-bw-steel">Then</span> {WEEKDAY.format(sailing.departureDate)} {DAY_MONTH.format(sailing.departureDate)}
                <span className="hidden text-bw-steel sm:inline"> → ≈ {DAY_MONTH.format(sailing.estimatedArrival)}</span>
              </span>
              <span className="bw-mono shrink-0 text-[0.68rem] uppercase tracking-[0.12em] text-bw-steel">
                Closes {DAY_MONTH.format(sailing.cargoDeadline)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 border-t border-bw-rule">
        <Link
          href={next.bookingOpen ? bookHref(next) : "/book"}
          className="inline-flex h-12 items-center justify-center gap-2 bg-bw-coral font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-white transition-colors hover:bg-bw-coral-dark"
        >
          Book space <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/schedule"
          className="inline-flex h-12 items-center justify-center gap-2 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-bw-ink transition-colors hover:bg-bw-concrete"
        >
          Full schedule
        </Link>
      </div>
    </div>
  );
}
