import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

import { CountUp } from "@/components/app/count-up";
import { Ring } from "@/components/charts/ring";
import { Sparkline } from "@/components/charts/sparkline";
import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";
type Tone = "brand" | "marine" | "signal" | "success" | "warning" | "danger";

const ICON_TONES: Record<Tone, string> = {
  brand: "bg-brand/10 text-brand",
  marine: "bg-marine/10 text-marine",
  signal: "bg-signal/10 text-signal",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-destructive/10 text-destructive",
};

/**
 * A wash of the tone's own colour across the card.
 *
 * Faint on purpose — it tints the card rather than colouring it, so a row of
 * five still reads as one row and the figures keep their contrast against it.
 * Written out in full: Tailwind scans source text, so `from-${tone}/[0.12]` is
 * a class that never exists.
 */
const WASHES: Record<Tone, string> = {
  brand: "from-brand/[0.10]",
  marine: "from-marine/[0.12]",
  signal: "from-signal/[0.12]",
  success: "from-success/[0.12]",
  warning: "from-warning/[0.14]",
  danger: "from-destructive/[0.12]",
};

const VALUE_TONES: Record<Tone, string> = {
  brand: "text-brand",
  marine: "text-marine",
  signal: "text-signal",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
};

const SPARK_TONE: Record<Tone, 1 | 2 | 3 | 4 | 5 | 6> = {
  brand: 1,
  marine: 2,
  signal: 3,
  success: 4,
  warning: 3,
  danger: 3,
};

/**
 * The dashboard's headline metric card.
 *
 * Composes three optional signals around one number:
 *  - a ring, when the number is part of a known whole ("41 m³ of a 67 m³ box")
 *  - a delta chip, when there is a previous period to compare against
 *  - a sparkline, when the shape of the trend matters more than the delta
 *
 * Supply only what is true. A ring with no denominator, or a delta with nothing
 * to compare against, is decoration pretending to be information.
 *
 * A server component: the entrance is a CSS animation and the only client code
 * is the <CountUp> leaf, so a row of eight cards ships almost no JavaScript.
 */
export function KpiCard({
  label,
  value,
  numeric,
  prefix = "",
  suffix = "",
  decimals = 0,
  hint,
  icon: Icon,
  tone = "brand",
  href,
  delta,
  deltaLabel,
  /** Higher is better. Set false for things like overdue invoices. */
  deltaGood = true,
  ring,
  trend,
  className,
  index = 0,
}: {
  label: string;
  value?: string;
  numeric?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  delta?: number;
  deltaLabel?: string;
  deltaGood?: boolean;
  ring?: { value: number; total: number };
  trend?: number[];
  className?: string;
  index?: number;
}) {
  const rising = (delta ?? 0) >= 0;
  const positive = deltaGood ? rising : !rising;

  const card = (
    <div
      className={cn(
        "animate-in-up group relative h-full overflow-hidden rounded-xl border bg-card p-4 shadow-soft transition-all sm:p-5",
        href && "hover:-translate-y-0.5 hover:shadow-raised",
        className
      )}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent",
          WASHES[tone]
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-xs font-medium uppercase tracking-wide text-muted-foreground sm:line-clamp-1">
            <Tx>{label}</Tx>
          </p>

          <p
            className={cn(
              /* A figure stays on one line: "TZS" on one line and the amount on
                 the next reads as two numbers. A longer figure is set smaller
                 instead, so two cards still sit side by side on a phone. */
              "tnum mt-2.5 whitespace-nowrap font-semibold leading-none tracking-tight",
              (value ?? "").length > 14
                ? "text-[14px] sm:text-[22px] 2xl:text-[26px]"
                : (value ?? "").length > 10
                  ? "text-[15px] sm:text-[24px] 2xl:text-[28px]"
                  : (value ?? "").length > 6
                    ? "text-[20px] sm:text-[28px]"
                    : "text-[28px]",
              VALUE_TONES[tone]
            )}
          >
            {prefix}
            {/*
              THE FIGURE IS KEYED ON ITSELF.

              Taking a consignment out of a container re-rendered the table
              underneath but left this card reading the old count — the animated
              number held its last value through the update, so the page told
              two different stories about the same box until somebody reloaded.
              A changed figure is a new element, and a new element cannot be
              stale.
            */}
            {numeric !== undefined ? (
              <CountUp key={numeric} value={numeric} decimals={decimals} />
            ) : (
              value
            )}
            {suffix ? (
              <span className="ml-1 text-base font-medium text-muted-foreground">
                {suffix}
              </span>
            ) : null}
          </p>

          {hint ? (
            <p className="mt-1.5 text-xs text-muted-foreground"><Tx>{hint}</Tx></p>
          ) : null}

          {delta !== undefined ? (
            <p
              className={cn(
                "tnum mt-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-semibold",
                positive
                  ? "bg-success/10 text-success"
                  : "bg-destructive/10 text-destructive"
              )}
            >
              {rising ? (
                <ArrowUpRight className="size-3" />
              ) : (
                <ArrowDownRight className="size-3" />
              )}
              {Math.abs(delta).toFixed(0)}%
              {deltaLabel ? (
                <span className="font-normal opacity-80"><Tx>{deltaLabel}</Tx></span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* A long figure on a phone gets the whole width: beside the icon it ran
            under the tile and lost its last digits. */}
        <div className={cn("flex shrink-0 flex-col items-end gap-3", (value ?? "").length > 6 && "max-sm:hidden")}>
          {/* No ring beside the figure on a phone: at half a phone's width it
              covered the number. The icon stands in for it there. */}
          {ring && Icon ? (
            <span className={cn("grid size-9 place-items-center rounded-lg sm:hidden", ICON_TONES[tone])}>
              <Icon className="size-4" />
            </span>
          ) : null}
          {ring ? (
            <span className="hidden sm:block">
            <Ring
              value={ring.value}
              total={ring.total}
              tone={SPARK_TONE[tone]}
              size={44}
              stroke={5}
              label={label}
            />
            </span>
          ) : Icon ? (
            <span
              className={cn(
                "grid size-9 place-items-center rounded-lg",
                ICON_TONES[tone]
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}

          {/* No trend line beside the figure on a phone: at half a phone's
              width it pushed the number and its words into a column. */}
          {trend && trend.length > 1 ? (
            <span className="hidden sm:block">
              <Sparkline values={trend} tone={SPARK_TONE[tone]} label={label} />
            </span>
          ) : null}
        </div>
      </div>

      {href ? (
        <ArrowRight className="absolute bottom-4 right-4 size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {card}
    </Link>
  ) : (
    card
  );
}
