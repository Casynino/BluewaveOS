import { cn } from "@/lib/utils";

export type RailStep = {
  key: string;
  label: string;
  place?: string | null;
  when?: string | null;
  detail?: string | null;
  state: "done" | "current" | "upcoming";
};

/**
 * THE SHIPMENT'S PROGRESS, AS A TRACK.
 *
 * Square stations on one line: filled where the cargo has been, a coral block
 * with a live pulse where it is now, hollow ahead. Across the page on a wide
 * screen — the way a route is read — and down it on a phone.
 *
 * It draws what it is given. Which stages exist, which are done and every date
 * come from lib/tracking-stage.ts; nothing is inferred here.
 */
export function JourneyRail({ steps, dark = false }: { steps: RailStep[]; dark?: boolean }) {
  const doneCount = steps.filter((s) => s.state !== "upcoming").length;
  const progress = steps.length > 1 ? Math.max(0, (doneCount - 1) / (steps.length - 1)) : 0;

  return (
    <div>
      {/* Wide: across. */}
      <div className="relative hidden lg:block">
        <div aria-hidden className={cn("absolute left-0 right-0 top-[11px] h-[3px]", dark ? "bg-white/15" : "bg-bw-line")} />
        <div
          aria-hidden
          className="absolute left-0 top-[11px] h-[3px] bg-bw-coral"
          style={{ width: `${progress * 100}%` }}
        />
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
          {steps.map((step, i) => (
            <li
              key={step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn("min-w-0 pr-3", i === steps.length - 1 && "pr-0")}
            >
              <Marker state={step.state} dark={dark} />
              <p
                className={cn(
                  "mt-4 font-bw-display text-lg font-semibold uppercase leading-tight",
                  step.state === "upcoming" ? (dark ? "text-white/40" : "text-bw-muted/70") : dark ? "text-white" : "text-bw-fg"
                )}
              >
                {step.label}
              </p>
              {step.place ? (
                <p className={cn("mt-1 text-xs", dark ? "text-white/50" : "text-bw-muted")}>{step.place}</p>
              ) : null}
              {step.when ? (
                <p className={cn("bw-mono mt-1.5 text-[0.7rem]", dark ? "text-white/70" : "text-bw-fg/80")}>{step.when}</p>
              ) : null}
              {step.detail ? <p className="mt-1 text-xs font-medium text-bw-coral">{step.detail}</p> : null}
            </li>
          ))}
        </ol>
      </div>

      {/* Narrow: down. */}
      <ol className="relative lg:hidden">
        {steps.map((step, i) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="relative flex gap-4 pb-6 last:pb-0"
          >
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-0 left-[10px] top-6 w-[3px]",
                  step.state === "done" ? "bg-bw-coral" : dark ? "bg-white/15" : "bg-bw-line"
                )}
              />
            ) : null}
            <Marker state={step.state} dark={dark} />
            <div className="min-w-0 -mt-0.5">
              <p
                className={cn(
                  "font-bw-display text-xl font-semibold uppercase leading-tight",
                  step.state === "upcoming" ? (dark ? "text-white/40" : "text-bw-muted/70") : dark ? "text-white" : "text-bw-fg"
                )}
              >
                {step.label}
              </p>
              {step.place ? <p className={cn("text-sm", dark ? "text-white/55" : "text-bw-muted")}>{step.place}</p> : null}
              {step.when ? (
                <p className={cn("bw-mono mt-0.5 text-xs", dark ? "text-white/70" : "text-bw-fg/80")}>{step.when}</p>
              ) : null}
              {step.detail ? <p className="mt-0.5 text-sm font-medium text-bw-coral">{step.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Marker({ state, dark }: { state: RailStep["state"]; dark: boolean }) {
  return (
    <span className="relative grid size-6 shrink-0 place-items-center">
      {state === "current" ? (
        <span aria-hidden className="absolute inset-0 animate-ping bg-bw-coral/50 motion-reduce:animate-none" />
      ) : null}
      <span
        className={cn(
          "relative block size-6 border-[3px]",
          state === "done" && "border-bw-coral bg-bw-coral",
          state === "current" && "border-bw-coral bg-bw-panel",
          state === "upcoming" && (dark ? "border-white/25 bg-bw-night" : "border-bw-line bg-bw-panel")
        )}
      >
        {state === "current" ? <span className="absolute inset-[3px] bg-bw-coral" /> : null}
      </span>
      <span className="sr-only">{state === "done" ? "Done" : state === "current" ? "Now" : "Not yet"}</span>
    </span>
  );
}
