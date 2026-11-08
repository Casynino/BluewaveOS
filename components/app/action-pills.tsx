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
/* A phone's shortcut, as the cleanest shopping apps draw them: the icon alone
   in its own colour, thin-lined, one word under it — no square, no box, no
   glow. */
export const PHONE_ICON: Record<string, string> = {
  brand: "text-blue-600 dark:text-blue-400",
  marine: "text-cyan-600 dark:text-cyan-400",
  signal: "text-rose-600 dark:text-rose-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  violet: "text-violet-600 dark:text-violet-400",
  plain: "text-slate-500 dark:text-slate-300",
};
export const PHONE_TILE =
  "focus-ring flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-2 text-center transition-transform active:scale-95 active:bg-foreground/5";
export const PHONE_WORD = "w-full truncate text-[10.5px] font-medium tracking-tight text-foreground/80";

/* The pill on a computer: one calm style for every shortcut — a light
   surface, a fine neutral edge, plain text and the icon in its own colour. Solid
   red and blue blocks looked forced; colour lives in the icon only, so it still
   marks the place without shouting. */
export const PILL =
  "focus-ring inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-sm font-medium text-foreground/85 shadow-sm transition-colors hover:border-border hover:bg-accent hover:text-foreground";

export async function ActionPills({ pills }: { pills: ActionPill[] }) {
  const locale = await viewerLocale();
  const t = (text: string) => tr(locale, text);
  if (pills.length === 0) return null;

  const iconFor = (name: string) =>
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[name];

  return (
    <>
      {/* PHONE: up to six tiles in one row, edge to edge, each a small clean
          icon over one word; a seventh is a swipe away — thumbs hit
          tiles, not pills. */}
      <div
        className={cn(
          "lg:hidden",
          pills.length <= 6
            ? cn("grid gap-0", ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5", "grid-cols-6"][pills.length])
            : "-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[calc((100%-1.25rem)/6)] grid-flow-col gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              {Icon ? <Icon className={cn("size-6", PHONE_ICON[pill.tone ?? "plain"])} strokeWidth={1.7} /> : null}
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
            React.ComponentType<{ className?: string; strokeWidth?: number }>
          >
        )[pill.icon];
        return (
          <Link key={pill.href + pill.label} href={pill.href} className={PILL}>
            {Icon ? <Icon className={cn("size-4", PHONE_ICON[pill.tone ?? "plain"])} strokeWidth={1.75} /> : null}
            {t(pill.label)}
          </Link>
        );
      })}
    </div>
    </>
  );
}
