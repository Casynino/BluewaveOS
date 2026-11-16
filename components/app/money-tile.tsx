import Link from "next/link";
import * as Icons from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "brand" | "marine" | "signal" | "success" | "warning" | "danger";

/* The figure in the text colour, red only when it is bad news; the colour of
   the kind of money lives on the small round icon (owner, 16 Nov 2026, as on
   ZELab's cards). */
const VALUE: Record<Tone, string> = {
  brand: "text-foreground",
  marine: "text-foreground",
  signal: "text-foreground",
  success: "text-foreground",
  warning: "text-foreground",
  danger: "text-destructive",
};

const ICON: Record<Tone, string> = {
  brand: "bg-brand/15 text-brand ring-brand/30",
  marine: "bg-marine/15 text-marine ring-marine/30",
  signal: "bg-signal/15 text-signal ring-signal/30",
  success: "bg-success/15 text-success ring-success/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  danger: "bg-destructive/15 text-destructive ring-destructive/30",
};

/**
 * A money figure, with what it means underneath it.
 *
 * Bigger than a KPI card and deliberately wordier. Every figure on a finance
 * screen is ambiguous until somebody says which one it is — "owed" could mean
 * billed, or billed and overdue, or billed including the cargo nobody has
 * priced yet — and an explanation under the number is cheaper than the phone
 * call that follows a wrong assumption.
 */
export function MoneyTile({
  label,
  value,
  secondary,
  secondaryLabel,
  caption,
  explanation,
  icon,
  tone = "brand",
  href,
  index = 0,
}: {
  label: string;
  value: string;
  /** The same figure in the other currency, shown in a pill. */
  secondary?: string;
  secondaryLabel?: string;
  caption?: string;
  explanation?: string;
  icon?: string;
  tone?: Tone;
  href?: string;
  index?: number;
}) {
  void index;
  const Icon = icon
    ? (
        Icons as unknown as Record<
          string,
          React.ComponentType<{ className?: string }>
        >
      )[icon]
    : null;

  const body = (
    <div
      className={cn(
        /* Short and plain (owner, 16 Nov 2026): no wash, no lift, no rise. */
        "relative h-full overflow-hidden rounded-xl border bg-card p-3.5 shadow-soft transition-colors sm:p-4",
        href && "hover:bg-secondary/40"
      )}
    >

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {Icon ? (
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full ring-1 ring-inset", ICON[tone])}>
              <Icon className="size-3.5" />
            </span>
          ) : null}
        </div>

        <p className={cn("tnum mt-1.5 text-xl font-bold leading-tight tracking-tight sm:text-2xl", VALUE[tone])}>
          {value}
        </p>

        {secondary ? (
          <p className="tnum mt-2 inline-flex items-center gap-2 rounded-md bg-foreground/[0.05] px-2 py-1 text-[11px]">
            {secondaryLabel ? (
              <span className="text-muted-foreground">{secondaryLabel}</span>
            ) : null}
            <span className="font-semibold">{secondary}</span>
          </p>
        ) : null}

        {caption ? (
          <p className="mt-2 text-[13px] font-medium">{caption}</p>
        ) : null}

        {explanation ? (
          <p title={explanation} className="mt-1 text-[11px] leading-snug text-muted-foreground max-sm:line-clamp-2">
            {explanation}
          </p>
        ) : null}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
