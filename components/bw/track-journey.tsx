import { Anchor, Check, PackageCheck, Ship, Warehouse } from "lucide-react";

import type { PublicTracking } from "@/lib/tracking";
import { bluewaveStageOfCode, type BlueWaveStage, type StageCode, type StageKey } from "@/lib/tracking-stage";
import { cn } from "@/lib/utils";

/*
  THE JOURNEY, THE WAY A PASSENGER READS A TRIP.

  The six BlueWave stages — received in China, stored in China, in transit,
  arrived in Dar es Salaam, ready for pickup, collected — drawn over three
  places: our China warehouse, the sea, Dar es Salaam. Everything here is read
  off the stage lib/tracking-stage already worked out from recorded facts.
  There is no live vessel feed, so the route shows the STAGE the cargo has
  reached, never a position on the water. There is no clearance stage.
*/

export type Phase = "CHINA" | "SEA" | "DAR" | "READY" | "DONE" | "CANCELLED";

export function phaseOf(stage: StageCode): Phase {
  if (stage === "CANCELLED") return "CANCELLED";
  switch (bluewaveStageOfCode(stage)) {
    case "IN_TRANSIT":
      return "SEA";
    case "ARRIVED_IN_DAR":
      return "DAR";
    case "READY_FOR_PICKUP":
      return "READY";
    case "COLLECTED":
      return "DONE";
    default:
      return "CHINA";
  }
}

type Copy = { title: string; line: string; sw: string };

const STAGE_COPY: Record<BlueWaveStage | "AWAITING" | "CANCELLED", Copy> = {
  AWAITING: {
    title: "Waiting in Foshan",
    line: "Nothing has reached our Foshan warehouse under this reference yet.",
    sw: "Bado hatujapokea mzigo huu katika warehouse yetu Foshan.",
  },
  RECEIVED_IN_CHINA: {
    title: "Received in China",
    line: "Your cargo has been received at our Foshan warehouse and is in the BlueWave system.",
    sw: "Mzigo wako umepokelewa katika warehouse yetu Foshan na umeingia kwenye mfumo wa BlueWave.",
  },
  STORED_IN_CHINA: {
    title: "Stored in China",
    line: "Your cargo is stored at our Foshan warehouse and assigned to a container.",
    sw: "Mzigo wako umehifadhiwa Foshan na umepangiwa kontena.",
  },
  IN_TRANSIT: {
    title: "In transit",
    line: "Your cargo is on its way from China to Dar es Salaam.",
    sw: "Mzigo wako uko safarini kutoka China kuelekea Dar es Salaam.",
  },
  ARRIVED_IN_DAR: {
    title: "Arrived in Dar es Salaam",
    line: "Your cargo is at our Dar es Salaam warehouse. Free storage started the day it arrived.",
    sw: "Mzigo wako umefika katika warehouse yetu Dar es Salaam. Storage ya bure imeanza siku ulipofika.",
  },
  READY_FOR_PICKUP: {
    title: "Ready for pickup",
    line: "Payment is confirmed and your pickup note is issued. Bring your ID to our Dar es Salaam warehouse.",
    sw: "Mzigo wako uko tayari kuchukuliwa. Njoo na kitambulisho chako.",
  },
  COLLECTED: {
    title: "Collected",
    line: "Your cargo has been handed over. Thank you for shipping with BlueWave.",
    sw: "Mzigo wako umekabidhiwa. Asante kwa kusafirisha na BlueWave.",
  },
  CANCELLED: {
    title: "Cancelled",
    line: "This consignment was cancelled. Contact the office if this is unexpected.",
    sw: "Mzigo huu umesitishwa. Wasiliana na ofisi.",
  },
};

/** The big words at the top of the page, for the stage the cargo is at. */
export function stageCopy(stage: StageCode): Copy {
  if (stage === "CANCELLED") return STAGE_COPY.CANCELLED;
  return STAGE_COPY[bluewaveStageOfCode(stage) ?? "AWAITING"];
}

const GROUP_OF: Record<StageKey, "CHINA" | "SEA" | "DAR"> = {
  RECEIVED_IN_CHINA: "CHINA",
  STORED_IN_CHINA: "CHINA",
  IN_TRANSIT: "SEA",
  ARRIVED_IN_DAR: "DAR",
  READY_FOR_PICKUP: "DAR",
  COLLECTED: "DAR",
};

type Step = PublicTracking["journey"]["steps"][number];

const utcDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Dar_es_Salaam", day: "numeric", month: "short" });
const when = (value: string | null) => (value ? utcDay.format(new Date(value)) : null);

/* ------------------------------------------------------------ the route */

/**
 * Foshan on the left, Dar on the right, the sea between — and a marker at the
 * stage the cargo has reached. A stage, not a GPS fix: the caption says so.
 */
export function RouteStage({ phase, eta, vessel }: { phase: Phase; eta: string | null; vessel: string | null }) {
  const at = phase === "CHINA" ? 0 : phase === "SEA" ? 50 : 100;
  const reached = (point: number) => phase !== "CANCELLED" && at >= point;
  return (
    <div className="relative">
      <div className="flex items-start justify-between gap-4">
        <RoutePoint label="Foshan" sub="China warehouse" active={phase === "CHINA"} reached={reached(0)} align="left" />
        <RoutePoint label="Indian Ocean" sub={vessel ?? "By sea"} active={phase === "SEA"} reached={reached(50)} align="center" />
        <RoutePoint
          label="Dar es Salaam"
          sub="Our warehouse"
          active={phase === "DAR" || phase === "READY" || phase === "DONE"}
          reached={reached(100)}
          align="right"
        />
      </div>
      <div className="relative mx-3 mt-5 h-10">
        {/* The water. */}
        <div aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/15" />
        <svg aria-hidden className="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2 overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 4">
          <path d="M0 2 Q 6 0 12 2 T 24 2 T 36 2 T 48 2 T 60 2 T 72 2 T 84 2 T 96 2 T 108 2" fill="none" stroke="rgb(64 192 232 / 0.35)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <div
          aria-hidden
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 bg-bw-coral transition-[width] duration-700"
          style={{ width: `${phase === "CANCELLED" ? 0 : at}%` }}
        />
        {phase !== "CANCELLED" ? (
          <div
            className="absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[3px] bg-bw-coral text-white shadow-[0_0_0_6px_rgb(214_60_80/0.25)]"
            style={{ left: `${at}%` }}
          >
            {phase === "SEA" ? <Ship className="size-5" /> : phase === "CHINA" ? <Warehouse className="size-5" /> : <Anchor className="size-5" />}
          </div>
        ) : null}
      </div>
      <p className="bw-mono mt-4 text-[0.72rem] text-white/55">
        {phase === "SEA" && eta ? `Expected in Dar around ${when(eta)} · ` : ""}
        We show the stage your cargo has reached, not a live ship position.
      </p>
    </div>
  );
}

function RoutePoint({
  label,
  sub,
  active,
  reached,
  align,
}: {
  label: string;
  sub: string;
  active: boolean;
  reached: boolean;
  align: "left" | "center" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "center" && "text-center", align === "right" && "text-right")}>
      <p className={cn("font-bw-display text-lg font-semibold uppercase leading-tight sm:text-2xl", active ? "text-white" : reached ? "text-white/80" : "text-white/40")}>
        {label}
      </p>
      <p className={cn("text-xs sm:text-sm", active ? "text-bw-cyan" : "text-white/45")}>{sub}</p>
    </div>
  );
}

/* ------------------------------------------------------------ the timeline */

const GROUPS: { key: "CHINA" | "SEA" | "DAR"; title: string; icon: typeof Warehouse }[] = [
  { key: "CHINA", title: "China", icon: Warehouse },
  { key: "SEA", title: "In transit", icon: Ship },
  { key: "DAR", title: "Dar es Salaam", icon: Anchor },
];

/** The steps, gathered under the three places they happen. */
export function JourneyGroups({ steps, eta, etaPassed }: { steps: Step[]; eta: string | null; etaPassed: boolean }) {
  return (
    <ol className="grid gap-4 lg:grid-cols-3">
      {GROUPS.map((group) => {
        const mine = steps.filter((s) => GROUP_OF[s.key] === group.key);
        if (mine.length === 0) return null;
        const state = mine.some((s) => s.state === "current")
          ? "current"
          : mine.every((s) => s.state === "done")
            ? "done"
            : "upcoming";
        const Icon = group.icon;
        return (
          <li
            key={group.key}
            className={cn(
              "rounded-[3px] border p-5 sm:p-6",
              state === "current" ? "border-bw-coral bg-bw-panel shadow-[inset_0_3px_0_0_rgb(214_60_80)]" : "border-bw-line bg-bw-panel"
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2.5 font-bw-display text-xl font-semibold uppercase text-bw-fg">
                <Icon className={cn("size-5", state === "upcoming" ? "text-bw-muted" : "text-bw-coral")} />
                {group.title}
              </p>
              <span
                className={cn(
                  "bw-mono text-[0.68rem] uppercase tracking-[0.14em]",
                  state === "current" ? "text-bw-coral" : state === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-bw-muted"
                )}
              >
                {state === "current" ? "Now" : state === "done" ? "Done" : "Ahead"}
              </span>
            </div>
            <ul className="mt-4 space-y-3">
              {mine.map((step) => (
                <li key={step.key} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center border-2",
                      step.state === "done" && "border-bw-coral bg-bw-coral text-white",
                      step.state === "current" && "border-bw-coral bg-bw-panel",
                      step.state === "upcoming" && "border-bw-line bg-bw-panel"
                    )}
                    aria-hidden
                  >
                    {step.state === "done" ? <Check className="size-3" strokeWidth={3} /> : step.state === "current" ? <span className="size-2 bg-bw-coral" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("font-medium leading-snug", step.state === "upcoming" ? "text-bw-muted" : "text-bw-fg")}>
                      {step.label}
                      <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "current" ? " (now)" : " (not yet)"}</span>
                    </p>
                    {step.at ? (
                      <p className="bw-mono text-xs text-bw-muted">
                        {step.atLabel} {when(step.at)}
                      </p>
                    ) : step.key === "IN_TRANSIT" && step.state === "current" && eta && !etaPassed ? (
                      <p className="bw-mono text-xs text-bw-muted">Expected {when(eta)}</p>
                    ) : null}
                    {step.detail ? <p className="text-xs font-medium text-bw-coral">{step.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ what next */

const NEXT_LABELS = ["Now", "Next", "After that", "Then"];

/**
 * The question behind most calls to the office: what happens next. The step
 * the cargo is on, and the ones after it, in order.
 */
export function WhatNext({ steps, done }: { steps: Step[]; done: boolean }) {
  const current = steps.find((s) => s.state === "current");
  const ahead = steps.filter((s) => s.state === "upcoming").slice(0, 3);
  const sequence = [current, ...ahead].filter(Boolean) as Step[];
  if (done || sequence.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[3px] border border-bw-line bg-bw-panel p-5 text-bw-fg">
        <PackageCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
        Nothing more to do — this journey is complete.
      </div>
    );
  }
  return (
    <ol
      className={cn(
        "grid gap-px overflow-hidden rounded-[3px] bg-bw-line",
        sequence.length === 1 ? "" : sequence.length === 2 ? "sm:grid-cols-2" : sequence.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"
      )}
    >
      {sequence.map((step, i) => (
        <li key={step.key} className={cn("p-5", i === 0 ? "bg-bw-ink text-white" : "bg-bw-panel")}>
          <p className={cn("bw-mono text-[0.68rem] uppercase tracking-[0.16em]", i === 0 ? "text-bw-coral-bright" : "text-bw-muted")}>
            {NEXT_LABELS[i]}
          </p>
          <p className={cn("mt-2 font-bw-display text-xl font-semibold uppercase leading-tight", i === 0 ? "text-white" : "text-bw-fg")}>
            {step.label}
          </p>
        </li>
      ))}
    </ol>
  );
}
