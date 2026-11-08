"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Info, TriangleAlert } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

export type AttentionItem = {
  id: string;
  group: string;
  count: number;
  title: string;
  detail: string;
  href: string;
  tone: "warn" | "bad" | "neutral";
  /** A figure or state on the right — what it is worth, how long it has sat. */
  meta?: string;
  metaSub?: string;
};

/* A title is a count and a phrase — "23 waiting more than 3 days". The
   phrase is what the dictionary knows; the number stays a number. */
function titleIn(title: string, t: (text: string) => string) {
  const m = title.match(/^(\d[\d,]*)\s+(.+)$/);
  return m ? `${m[1]} ${t(m[2])}` : t(title);
}

/* As on the air side: red for what is wrong, amber for what is slipping,
   blue for the desk's everyday queue. */
const BAR = {
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-info",
} as const;

const ICON = {
  warn: "text-warning",
  bad: "text-destructive",
  neutral: "text-info",
} as const;

/** Until the rows are measured (first paint) only the first three show, so nothing jumps. */
const HIDE_AFTER_3 = "[&_[data-row]:nth-child(n+4)]:hidden";
const VISIBLE = 3;

/**
 * THREE ROWS IN VIEW, MEASURED FROM THE REAL ROWS.
 *
 * The height is taken from the rows themselves, so exactly three fit on every
 * screen even when a title wraps to two lines on a phone. The bar underneath
 * says how many more there are and brings the next ones up when pressed; at
 * the end it says "Back to the top". A soft edge says the list goes on.
 */
function ShowRows({ total, children }: { total: number; children: ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState<number | null>(null);
  const [below, setBelow] = useState(total - VISIBLE);
  const extra = total - VISIBLE;

  const parts = useCallback(() => {
    const el = box.current!;
    const rect = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll<HTMLElement>("[data-row]")];
    const visibleBottom = rect.top + el.clientHeight;
    return { el, rect, rows, hidden: rows.filter((r) => r.getBoundingClientRect().bottom > visibleBottom + 1) };
  }, []);

  useLayoutEffect(() => {
    if (!box.current || extra <= 0) return;
    const measure = () => {
      const { el, rect, rows } = parts();
      const last = rows[VISIBLE - 1];
      if (!last) return;
      setMax(Math.ceil(last.getBoundingClientRect().bottom - (rect.top - el.scrollTop)));
      requestAnimationFrame(() => box.current && setBelow(parts().hidden.length));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [extra, parts]);

  if (extra <= 0) return <div>{children}</div>;
  const step = () => {
    const { el, rect, hidden } = parts();
    if (!hidden.length) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollTo({ top: el.scrollTop + hidden[0].getBoundingClientRect().top - rect.top, behavior: "smooth" });
  };
  return (
    <div>
      <div className="relative">
        <div
          ref={box}
          className={cn("relative overflow-auto overscroll-contain [scrollbar-width:thin]", max === null && HIDE_AFTER_3)}
          style={max === null ? undefined : { maxHeight: max }}
          onScroll={() => setBelow(parts().hidden.length)}
        >
          {children}
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/25 to-transparent transition-opacity dark:from-black/50",
            !below && "opacity-0"
          )}
        />
      </div>
      <button
        type="button"
        onClick={step}
        className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
      >
        {below ? (
          <>
            <ChevronDown className="size-3" />
            {t("Scroll for")} {below} {t("more")}
          </>
        ) : (
          <>
            <ChevronUp className="size-3" />
            {t("Back to the top")}
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Everything that is going wrong, one line per kind.
 *
 * Grouped by the desk that can fix it rather than by the screen it lives on,
 * because the question at the start of a shift is "what needs me", not "which
 * module has an alert". The tabs let somebody who only handles money ignore the
 * warehouse's problems without losing the count of them.
 *
 * Each row says how many and why it matters, and opens the filtered list of the
 * actual records. The sentence is not truncated — a warning nobody can finish
 * reading is a warning nobody acts on.
 *
 * Three rows, then it scrolls — one slim panel on every home: chips
 * on top, one row per item (coloured bar, icon, what and why, a tap through).
 * Deep enough to see there is more than one
 * problem, short enough that the list does not push the rest of the morning off
 * the screen. Scrolling rather than paginating, because a pager on a worry list
 * is a way of hiding the fourth worry.
 */
export function AttentionCenter({ items }: { items: AttentionItem[] }) {
  const t = useT();
  const groups = [...new Set(items.map((i) => i.group))];
  const [active, setActive] = useState<string>("All");

  const shown = active === "All" ? items : items.filter((i) => i.group === active);

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border bg-card px-4 py-3 shadow-soft">
        <span aria-hidden className="h-7 w-0.5 shrink-0 rounded-full bg-success" />
        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
        <p className="min-w-0 text-[13px] leading-tight">
          <span className="font-semibold">{t("Nothing needs you")}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("No missing cargo, no overdue bills, nothing held.")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* The groups sit above the list, small, the chosen one filled. */}
      {groups.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label={t("Filter")}>
          {["All", ...groups].map((group) => {
            const count =
              group === "All"
                ? items.length
                : items.filter((i) => i.group === group).length;
            return (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={active === group}
                onClick={() => setActive(group)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  active === group
                    ? "bg-sky-500 text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {t(group)} <span className="tnum opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <ShowRows key={active} total={shown.length}>
          <ul className="divide-y">
            {shown.map((item) => (
              <li key={item.id} data-row>
                <Link
                  href={item.href}
                  className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-secondary/50"
                >
                  <span aria-hidden className={cn("h-7 w-[3px] shrink-0 rounded-full", BAR[item.tone])} />
                  {item.tone === "neutral" ? (
                    <Info className={cn("size-4 shrink-0", ICON[item.tone])} />
                  ) : (
                    <TriangleAlert className={cn("size-4 shrink-0", ICON[item.tone])} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-semibold leading-tight sm:line-clamp-1">
                      {titleIn(item.title, t)}
                    </span>
                    {/* On a phone the figure leads the detail line instead of
                        taking a column, so the row stays slim. */}
                    <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                      {item.meta ? <span className="font-medium text-foreground/80 sm:hidden">{t(item.meta)} · </span> : null}
                      {t(item.detail)}
                    </span>
                  </span>
                  {item.meta || item.metaSub ? (
                    <span className="hidden shrink-0 text-right leading-tight sm:block">
                      {item.meta ? <span className="block text-[13px] font-bold tabular-nums">{t(item.meta)}</span> : null}
                      {item.metaSub ? (
                        <span className="block text-[11px] tabular-nums text-muted-foreground">{t(item.metaSub)}</span>
                      ) : null}
                    </span>
                  ) : null}
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </ShowRows>
      </div>
    </div>
  );
}
