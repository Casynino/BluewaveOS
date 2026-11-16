import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/* The icon's colour says what kind of figure it is; the card itself stays plain. */
const TONES = {
  sky: "bg-sky-500/15 text-sky-600 ring-sky-500/30 dark:text-sky-300",
  emerald: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300",
  amber: "bg-amber-500/15 text-amber-600 ring-amber-500/30 dark:text-amber-300",
  rose: "bg-rose-500/15 text-rose-600 ring-rose-500/30 dark:text-rose-300",
  violet: "bg-violet-500/15 text-violet-600 ring-violet-500/30 dark:text-violet-300",
} as const;

/**
 * A SHORT CARD: ONE FIGURE.
 *
 * Copied from the owner's ZELab system (owner, 16 Nov 2026: "short cards"):
 * the label small at the top, a small round icon at the right, the figure
 * under it, and at most one quiet line. A plain card — no tinted background,
 * no ring of colour round it — so a row of them reads as one calm strip.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  hint,
  href,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full ring-1 ring-inset", TONES[tone])}>
          <Icon className="size-3.5" />
        </span>
      </div>
      <div className="tnum mt-1.5 min-w-0 break-words text-base font-bold leading-snug tracking-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div> : null}
    </>
  );
  const card = "block min-w-0 rounded-xl border bg-card p-3 shadow-soft";
  return href ? (
    <Link href={href} className={cn(card, "transition-colors hover:bg-secondary/40")}>
      {body}
    </Link>
  ) : (
    <div className={card}>{body}</div>
  );
}
