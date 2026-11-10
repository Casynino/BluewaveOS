import Link from "next/link";

import { cn } from "@/lib/utils";

export type FlowStep = {
  code: string;
  title: string;
  body: string;
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
 * The same idiom as the corridor on the home page: small square stations, a
 * hairline track between them, and coral dashes moving along it for the goods
 * (and the buyer) travelling. Across the page on a wide screen, down the left
 * edge on a phone. Stations the company does itself are coral; the ones the
 * buyer does are outlined.
 */
export function VsFlow({ steps, dark = false }: { steps: FlowStep[]; dark?: boolean }) {
  const n = steps.length;
  const inset = `calc(100% / ${2 * n})`;
  const base = dark ? "stroke-white/15" : "stroke-bw-line";
  return (
    <div className="relative">
      {/* The track, across (wide screens), through the middle of the stations. */}
      <svg
        aria-hidden
        className="pointer-events-none absolute top-0 hidden h-4 lg:block"
        style={{ left: inset, right: inset, width: `calc(100% - 2 * ${inset})` }}
        preserveAspectRatio="none"
      >
        <line x1="0" y1="8" x2="100%" y2="8" className={base} strokeWidth="2" />
        <line x1="0" y1="8" x2="100%" y2="8" className="bw-flow stroke-bw-coral" strokeWidth="2" />
      </svg>

      <ol className={cn("relative grid gap-8 lg:gap-6", COLS[n] ?? "lg:grid-cols-6")}>
        {steps.map((step, i) => (
          <li key={step.code} className="relative grid grid-cols-[1rem_1fr] gap-4 lg:grid-cols-1 lg:gap-0 lg:text-center">
            {/* The track, down (phones): from this station to the next. */}
            {i < n - 1 ? (
              <span aria-hidden className="pointer-events-none absolute -bottom-8 left-[7px] top-4 w-[2px] lg:hidden">
                <svg className="block h-full w-full" preserveAspectRatio="none">
                  <line x1="1" y1="0" x2="1" y2="100%" className={base} strokeWidth="2" />
                  <line x1="1" y1="0" x2="1" y2="100%" className="bw-flow stroke-bw-coral" strokeWidth="2" />
                </svg>
              </span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 size-4 rounded-[2px] lg:mx-auto",
                step.ours
                  ? "bg-bw-coral"
                  : dark
                    ? "border-2 border-white/50 bg-bw-night"
                    : "border-2 border-bw-fg/40 bg-bw-panel"
              )}
            />
            <div className="min-w-0 lg:mt-5">
              <p className={cn("bw-mono text-[0.68rem] uppercase tracking-[0.06em]", dark ? "text-bw-cyan" : "text-bw-harbour dark:text-bw-cyan")}>
                {step.code}
              </p>
              <p className={cn("bw-display mt-1.5 text-3xl uppercase", dark ? "text-white" : "text-bw-fg")}>{step.title}</p>
              <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/65" : "text-bw-muted")}>{step.body}</p>
              {step.href && step.action ? (
                <Link
                  href={step.href}
                  className={cn(
                    "bw-mono mt-3 inline-flex text-[0.7rem] uppercase tracking-[0.06em] underline-offset-4 transition-colors hover:underline",
                    dark ? "text-white/80 hover:text-bw-coral-bright" : "text-bw-fg hover:text-bw-coral"
                  )}
                >
                  {step.action}
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "Station is ours / station is yours", under a flow. */
export function VsFlowKey({ dark = false }: { dark?: boolean }) {
  return (
    <p className={cn("bw-mono flex flex-wrap gap-x-6 gap-y-2 text-[0.68rem] uppercase tracking-[0.06em]", dark ? "text-white/55" : "text-bw-muted")}>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="size-3 rounded-[2px] bg-bw-coral" /> BlueWave does it
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className={cn("size-3 rounded-[2px] border-2", dark ? "border-white/50" : "border-bw-fg/40")} /> You do it, with our help
      </span>
    </p>
  );
}
