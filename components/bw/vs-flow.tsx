import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type FlowStep = {
  code: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /** Where the step is BlueWave's own work, marked in coral. */
  ours?: boolean;
  href?: string;
  action?: string;
};

const COLS: Record<number, string> = {
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

/**
 * A JOURNEY, DRAWN AS STATIONS ON A LINE.
 *
 * The same idiom as the corridor on the home page: square stations, a
 * hairline track between them, and coral dashes moving along it for the goods
 * (and the buyer) travelling. Across the page on a wide screen, down the left
 * edge on a phone. Stations the company does itself are coral; the ones the
 * buyer does are outlined.
 */
export function VsFlow({ steps, dark = false }: { steps: FlowStep[]; dark?: boolean }) {
  const n = steps.length;
  const inset = `calc(100% / ${2 * n})`;
  return (
    <div className="relative">
      {/* The track, across (wide screens). */}
      <svg
        aria-hidden
        className="pointer-events-none absolute top-7 hidden h-[2px] lg:block"
        style={{ left: inset, right: inset, width: `calc(100% - 2 * ${inset})` }}
        preserveAspectRatio="none"
      >
        <line x1="0" y1="1" x2="100%" y2="1" className={dark ? "stroke-white/15" : "stroke-bw-line"} strokeWidth="2" />
        <line x1="0" y1="1" x2="100%" y2="1" className="bw-flow stroke-bw-coral" strokeWidth="2" />
      </svg>
      {/* The track, down (phones). */}
      <svg aria-hidden className="pointer-events-none absolute bottom-7 left-7 top-7 w-[2px] lg:hidden" preserveAspectRatio="none">
        <line x1="1" y1="0" x2="1" y2="100%" className={dark ? "stroke-white/15" : "stroke-bw-line"} strokeWidth="2" />
        <line x1="1" y1="0" x2="1" y2="100%" className="bw-flow stroke-bw-coral" strokeWidth="2" />
      </svg>

      <ol className={cn("relative grid gap-8 lg:gap-6", COLS[n] ?? "lg:grid-cols-6")}>
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.code} className="grid grid-cols-[3.5rem_1fr] gap-5 lg:grid-cols-1 lg:gap-0 lg:text-center">
              <span
                className={cn(
                  "relative z-10 grid size-14 place-items-center rounded-[2px] lg:mx-auto",
                  step.ours
                    ? "bg-bw-coral text-white"
                    : dark
                      ? "border border-white/30 bg-bw-night text-white"
                      : "border border-bw-fg/25 bg-bw-panel text-bw-fg"
                )}
              >
                <Icon className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 lg:mt-5">
                <p className={cn("bw-mono text-[0.68rem] uppercase tracking-[0.18em]", dark ? "text-bw-cyan" : "text-bw-harbour dark:text-bw-cyan")}>
                  {step.code}
                </p>
                <p className={cn("bw-display mt-1.5 text-3xl uppercase", dark ? "text-white" : "text-bw-fg")}>{step.title}</p>
                <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/65" : "text-bw-muted")}>{step.body}</p>
                {step.href && step.action ? (
                  <Link
                    href={step.href}
                    className={cn(
                      "bw-mono group mt-3 inline-flex items-center gap-1.5 text-[0.7rem] uppercase tracking-[0.14em]",
                      dark ? "text-white/80 hover:text-bw-coral-bright" : "text-bw-fg hover:text-bw-coral"
                    )}
                  >
                    {step.action}
                    <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** "Station is ours / station is yours", under a flow. */
export function VsFlowKey({ dark = false }: { dark?: boolean }) {
  return (
    <p className={cn("bw-mono flex flex-wrap gap-x-6 gap-y-2 text-[0.68rem] uppercase tracking-[0.16em]", dark ? "text-white/55" : "text-bw-muted")}>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="size-2.5 bg-bw-coral" /> BlueWave does it
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={cn("size-2.5 border", dark ? "border-white/50" : "border-bw-fg/50")} /> You do it, with our help
      </span>
    </p>
  );
}
