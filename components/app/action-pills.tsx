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

/* A phone's shortcut, clean: a soft tinted square with the icon in its own
   colour, one word under it, and nothing drawn around either — no box, no
   glow, no shine. */
export const PHONE_CHIP: Record<string, string> = {
  brand: "bg-blue-500/10 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300",
  marine: "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  signal: "bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300",
  success: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-600 dark:bg-red-400/15 dark:text-red-300",
  violet: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
  plain: "bg-slate-500/10 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300",
};
export const PHONE_CHIP_BASE = "grid size-12 place-items-center rounded-2xl";
export const PHONE_TILE =
  "focus-ring flex min-w-0 flex-col items-center gap-1.5 rounded-2xl py-1 text-center transition-transform active:scale-95";
export const PHONE_WORD = "w-full truncate px-0.5 text-[11px] font-medium text-foreground/80";

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
      {/* PHONE: up to five tiles fill the row edge to edge, each a clean icon
          over one word; a sixth or seventh is a swipe away — thumbs hit
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
              className={cn(PHONE_TILE, "snap-start")}
            >
              <span className={cn(PHONE_CHIP_BASE, PHONE_CHIP[pill.tone ?? "plain"])}>
                {Icon ? <Icon className="size-[22px]" /> : null}
              </span>
              <span className={PHONE_WORD}>{t(pill.short ?? pill.label)}</span>
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
