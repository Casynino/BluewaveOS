import { Check, X } from "lucide-react";

import { Action, Frame, Label } from "@/components/bw/ui";
import { cn } from "@/lib/utils";

/*
  THE STATUS PAGES' PARTS.

  A visit or sourcing request opened by its private link. The page shows what
  the visitor asked for and where the request stands — never the desk's notes,
  who holds it, or the contact details they typed (the link can be forwarded).
*/

/** Dates the visitor picked are calendar days, stored at UTC midnight. */
export const vsDay = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(date);

/**
 * Where a request stands, as a row of stations. Stations passed are filled,
 * the current one is coral, the rest are outlined. A cancelled request is not
 * a station on the line: the whole line goes quiet and a coral notice says so.
 */
export function VsProgress({
  steps,
  current,
  currentLabel,
  cancelled = false,
}: {
  steps: { key: string; label: string }[];
  /** Index of the station the request is at. */
  current: number;
  /** A word for the current station when it differs from the step's own, e.g. "Waiting for you". */
  currentLabel?: string;
  cancelled?: boolean;
}) {
  return (
    <div>
      {cancelled ? (
        <p className="mb-5 flex items-center gap-3 rounded-[2px] border border-bw-coral/50 bg-bw-coral/[0.07] px-4 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-[2px] bg-bw-coral text-white">
            <X className="size-4" aria-hidden />
          </span>
          <span className="bw-display text-2xl uppercase text-bw-fg">Cancelled</span>
        </p>
      ) : null}
      <ol
        aria-label="Progress"
        className={cn("grid gap-0 sm:grid-flow-col sm:auto-cols-fr", cancelled && "opacity-45 grayscale")}
      >
        {steps.map((step, i) => {
          const done = !cancelled && i < current;
          const here = !cancelled && i === current;
          return (
            <li
              key={step.key}
              aria-current={here ? "step" : undefined}
              className="relative grid grid-cols-[2rem_1fr] gap-3 pb-5 last:pb-0 sm:grid-cols-1 sm:gap-0 sm:pb-0 sm:pr-3"
            >
              {/* The line to the next station. */}
              {i < steps.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[0.95rem] top-8 h-[calc(100%-2rem)] w-[2px] sm:left-8 sm:top-[0.95rem] sm:h-[2px] sm:w-[calc(100%-2rem)]",
                    done ? "bg-bw-harbour dark:bg-bw-cyan" : cancelled ? "bg-bw-line [background-image:repeating-linear-gradient(90deg,transparent_0_4px,rgb(var(--bw-ground))_4px_8px)]" : "bg-bw-line"
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 grid size-8 place-items-center rounded-[2px] border-2",
                  done && "border-bw-harbour bg-bw-harbour text-white dark:border-bw-cyan dark:bg-bw-cyan dark:text-bw-night",
                  here && "border-bw-coral bg-bw-coral text-white",
                  !done && !here && "border-bw-line bg-bw-panel text-bw-muted"
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                ) : (
                  <span className="bw-mono text-[0.7rem]">{String(i + 1).padStart(2, "0")}</span>
                )}
                {here ? <span aria-hidden className="absolute inset-0 animate-ping rounded-[2px] bg-bw-coral/40 motion-reduce:hidden" /> : null}
              </span>
              <div className="min-w-0 pt-1 sm:mt-3 sm:pt-0">
                <p
                  className={cn(
                    "font-bw-display text-lg font-semibold uppercase leading-tight",
                    here ? "text-bw-coral" : done ? "text-bw-fg" : "text-bw-muted"
                  )}
                >
                  {here && currentLabel ? currentLabel : step.label}
                </p>
                {here ? <p className="bw-mono mt-0.5 text-[0.68rem] uppercase tracking-[0.16em] text-bw-muted">Now</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Label / value rows. Empty values are left out, not printed as dashes. */
export function VsFacts({ items }: { items: [string, React.ReactNode][] }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== "" && !(Array.isArray(value) && value.length === 0));
  if (!shown.length) return null;
  return (
    <dl className="grid border-l border-t border-bw-line sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0 border-b border-r border-bw-line p-4">
          <dt className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">{label}</dt>
          <dd className="mt-1.5 break-words text-bw-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A list of picked names, as small square tags. */
export function VsTags({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-[2px] border border-bw-line bg-bw-ground px-2 py-1 text-sm">
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * What a wrong, partial or old link opens. The same page whether or not the
 * reference exists, so the address bar cannot be used to find out.
 */
export function VsNotFound({ kind }: { kind: "visit" | "sourcing" }) {
  const again = kind === "visit" ? { href: "/visit#visit-form", label: "Request a visit" } : { href: "/sourcing#sourcing-form", label: "Send a sourcing request" };
  return (
    <>
      <section className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-14 sm:py-20">
          <Label className="text-white/70">{kind === "visit" ? "Business visit · Status" : "Sourcing request · Status"}</Label>
          <h1 className="bw-display mt-5 max-w-4xl text-[clamp(2.6rem,6vw,5rem)] uppercase">
            We could not open <span className="text-white/55">this status page</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">
            A status page opens only with the full link you were given when you sent your request. A reference on its
            own is not enough. Check that the whole link was copied — it ends with a long code after{" "}
            <span className="bw-mono text-white">?k=</span>.
          </p>
        </Frame>
      </section>
      <section className="bg-bw-ground">
        <Frame className="grid gap-6 py-12 sm:py-16 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Label className="text-bw-muted">Lost the link?</Label>
            <p className="mt-4 max-w-xl text-bw-muted">
              Call or WhatsApp the office with your reference and the phone number you used. The team can tell you
              where your request stands.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-3 lg:col-span-5 lg:justify-end">
            <Action href="/contact" tone="ink">
              Contact the office
            </Action>
            <Action href={again.href} tone="line">
              {again.label}
            </Action>
          </div>
        </Frame>
      </section>
    </>
  );
}
