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
/* The colour of a shortcut's icon; the pill itself stays plain. */
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


  return (
    <>
      {/* PHONE: no shortcut icons (owner, 16 Nov 2026, as on ZELab: "the icons
          are all done") — the bottom bar and the menu are the same doors. A
          computer keeps one quiet row of pills. */}
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
