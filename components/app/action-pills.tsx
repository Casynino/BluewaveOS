import { t as tr } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer-locale";
import Link from "next/link";
import * as Icons from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionPill = {
  label: string;
  /** A shorter name for the phone tile, where a long word does not fit. */
  short?: string;
  href: string;
  icon: string;
  tone?: "brand" | "marine" | "signal" | "success" | "warning" | "danger" | "plain";
};

/**
 * The row of things this desk does most.
 *
 * Colour is used to separate kinds of work, not to rank them: taking money is
 * green wherever it appears, a cost is red, an investigation is amber. A clerk
 * who does the same job forty times a day finds the button by its colour long
 * before they read it.
 */
const TONES: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-brand text-brand-foreground hover:bg-brand/90",
  marine: "bg-marine text-marine-foreground hover:bg-marine/90",
  signal: "bg-signal text-signal-foreground hover:bg-signal/90",
  success: "bg-success text-success-foreground hover:bg-success/90",
  warning: "bg-warning text-warning-foreground hover:bg-warning/90",
  danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  plain: "border bg-card text-foreground hover:bg-secondary",
};

/* The same kinds of work, as the jewel on a phone's tile: a gradient square
   with a soft light on its top edge and a glow of its own colour under it. */
export const PREMIUM_CHIP: Record<string, string> = {
  brand: "bg-gradient-to-br from-[#60a5fa] to-[#1d4ed8] shadow-[0_8px_18px_-8px_rgba(37,99,235,0.85)]",
  marine: "bg-gradient-to-br from-[#22d3ee] to-[#0e7490] shadow-[0_8px_18px_-8px_rgba(8,145,178,0.85)]",
  signal: "bg-gradient-to-br from-[#fb7185] to-[#e11d48] shadow-[0_8px_18px_-8px_rgba(225,29,72,0.85)]",
  success: "bg-gradient-to-br from-[#34d399] to-[#059669] shadow-[0_8px_18px_-8px_rgba(5,150,105,0.85)]",
  warning: "bg-gradient-to-br from-[#fcd34d] to-[#d97706] shadow-[0_8px_18px_-8px_rgba(217,119,6,0.85)]",
  danger: "bg-gradient-to-br from-[#f87171] to-[#dc2626] shadow-[0_8px_18px_-8px_rgba(220,38,38,0.85)]",
  violet: "bg-gradient-to-br from-[#c4b5fd] to-[#7c3aed] shadow-[0_8px_18px_-8px_rgba(124,58,237,0.85)]",
  plain: "bg-gradient-to-br from-[#94a3b8] to-[#475569] shadow-[0_8px_18px_-8px_rgba(71,85,105,0.85)]",
};
export const PREMIUM_CHIP_BASE =
  "relative grid size-10 place-items-center rounded-[14px] text-white ring-1 ring-inset ring-white/25 before:pointer-events-none before:absolute before:inset-x-1 before:top-0.5 before:h-1/2 before:rounded-t-[12px] before:bg-gradient-to-b before:from-white/35 before:to-transparent";
export const PREMIUM_TILE =
  "focus-ring flex min-w-0 flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card/80 px-1 pb-2.5 pt-3 text-center shadow-soft backdrop-blur transition-transform active:scale-95";

/* The same kinds of work, as the small coloured square on a phone's tile. */
const CHIP: Record<NonNullable<ActionPill["tone"]>, string> = {
  brand: "bg-brand/15 text-brand",
  marine: "bg-marine/15 text-marine",
  signal: "bg-signal/15 text-signal",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  plain: "bg-secondary text-foreground/70",
};

export async function ActionPills({ pills }: { pills: ActionPill[] }) {
  const locale = await viewerLocale();
  const t = (text: string) => tr(locale, text);
  if (pills.length === 0) return null;

  const iconFor = (name: string) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];

  return (
    <>
      {/* PHONE: up to five tiles fill the row edge to edge, each a jewel icon
          over a short name; a sixth or seventh is a swipe away — thumbs hit
          tiles, not pills. */}
      <div
        className={cn(
          "lg:hidden",
          pills.length <= 5
            ? cn("grid gap-2", ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5"][pills.length])
            : "-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[calc((100%-2rem)/5)] grid-flow-col gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {pills.map((pill) => {
          const Icon = iconFor(pill.icon);
          return (
            <Link
              key={`m-${pill.href}${pill.label}`}
              href={pill.href}
              className={cn(PREMIUM_TILE, "snap-start")}
            >
              <span className={cn(PREMIUM_CHIP_BASE, PREMIUM_CHIP[pill.tone ?? "plain"])}>
                {Icon ? <Icon className="relative size-[19px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]" /> : null}
              </span>
              <span className="line-clamp-2 min-h-[2.1em] [overflow-wrap:anywhere] text-[11px] font-medium leading-tight text-foreground/85">{t(pill.short ?? pill.label)}</span>
            </Link>
          );
        })}
      </div>
    <div className="-mx-1 hidden flex-wrap gap-2 px-1 lg:flex">
      {pills.map((pill) => {
        const Icon = (
          Icons as unknown as Record<
            string,
            React.ComponentType<{ className?: string }>
          >
        )[pill.icon];
        return (
          <Link
            key={pill.href + pill.label}
            href={pill.href}
            className={cn(
              "focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-soft transition-all hover:-translate-y-0.5 sm:text-sm",
              TONES[pill.tone ?? "plain"]
            )}
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {t(pill.label)}
          </Link>
        );
      })}
    </div>
    </>
  );
}
