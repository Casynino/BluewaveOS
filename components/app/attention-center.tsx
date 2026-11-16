"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";

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

/* The dot is the only urgency cue (owner, 16 Nov 2026, as on ZELab): red for
   what is wrong, amber for what is slipping, blue for the desk's everyday queue. */
const DOT = {
  warn: "bg-warning",
  bad: "bg-destructive",
  neutral: "bg-info",
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
 * Copied from the owner's ZELab system (owner, 16 Nov 2026: "small and well
 * designed"): one box, one line per item — a dot for urgency, the words, the
 * figure, an arrow — and nothing on top of it: no filter chips, no warning
 * icons, no second line. Why an item is there stays on the row as its tooltip.
 *
 * Three rows in view, then it scrolls, with "Scroll for N more" under it —
 * scrolling rather than paginating, because a pager on a worry list is a way
 * of hiding the fourth worry. Each row opens the filtered list of the actual
 * records.
 */
export function AttentionCenter({ items }: { items: AttentionItem[] }) {
  const t = useT();

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-card px-3.5 py-2.5 text-[13px] text-muted-foreground shadow-soft">
        <CheckCircle2 className="size-3.5 shrink-0 text-success" />
        {t("All clear. Nothing is waiting on you.")}
      </div>
    );
  }

  return (
    <section aria-label={t("Needs your attention")} className="overflow-hidden rounded-xl border bg-card shadow-soft">
      <ShowRows total={items.length}>
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} data-row>
              <Link
                href={item.href}
                title={t(item.detail)}
                className="flex min-h-10 items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-secondary/50"
              >
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[item.tone])} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{titleIn(item.title, t)}</span>
                {item.meta ? (
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums">{t(item.meta)}</span>
                ) : null}
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </ShowRows>
    </section>
  );
}
