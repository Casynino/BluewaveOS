"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, TriangleAlert } from "lucide-react";

import { startWorkAs } from "@/lib/actions/developer";
import { cn } from "@/lib/utils";

/**
 * THE PROBLEMS INSIDE "NEEDS YOUR ATTENTION", AS A COMPACT LIST.
 *
 * Copied from the Vegas console by the owner's decision — no bigger boxes than
 * the problem needs: one line per problem, a coloured bar at the left edge, an
 * icon, the title, one muted line and a chevron. A tap opens what it means,
 * what to do, who fixes it, and Work as that person. About three show; the
 * rest scroll, with "scroll for n more" under them, and when several desks are
 * involved small chips above the list narrow it to one. Everything arrives
 * already written by the server, so nothing but plain text crosses over.
 */
export interface AttentionRow {
  id: string;
  severity: "fix" | "look";
  title: string;
  summary: string;
  todo: string | null;
  examples: string[];
  link: { href: string; label: string } | null;
  /** The desk that fixes it — the chip a row sits under. */
  group: string;
  workAs: { id: string; label: string } | null;
  items: { title: string; detail: string; whoId: string; who: string; href: string | null }[];
}
export interface AttentionLabels {
  all: string;
  whatItMeans: string;
  whatToDo: string;
  whereToLook: string;
  scrollMore: string;
  workAs: string;
  open: string;
}

const VISIBLE_ROWS = 3;

export function AttentionList({ rows, labels }: { rows: AttentionRow[]; labels: AttentionLabels }) {
  const [group, setGroup] = useState("");
  const [atEnd, setAtEnd] = useState(false);
  const groups = [...new Set(rows.map((r) => r.group))];
  const shown = group ? rows.filter((r) => r.group === group) : rows;
  const showChips = rows.length > VISIBLE_ROWS && groups.length > 1;
  const more = Math.max(0, shown.length - VISIBLE_ROWS);

  return (
    <div className="border-t border-border/60">
      {showChips ? (
        <div className="flex flex-wrap gap-2 px-5 py-3 sm:px-6" role="group" aria-label={labels.all}>
          {[["", labels.all, rows.length] as const, ...groups.map((g) => [g, g, rows.filter((r) => r.group === g).length] as const)].map(([key, text, n]) => (
            <button
              key={key || "all"}
              type="button"
              onClick={() => {
                setGroup(key);
                setAtEnd(false);
              }}
              aria-pressed={group === key}
              className={cn(
                "focus-ring rounded-full border px-3 py-1 text-sm transition-colors",
                group === key ? "border-transparent bg-brand text-brand-foreground" : "border-border text-foreground/80 hover:bg-muted"
              )}
            >
              {text} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ul
        tabIndex={more > 0 ? 0 : undefined}
        aria-label={labels.all}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
        }}
        className={cn(
          "divide-y divide-border/60 border-border/60",
          showChips && "border-t",
          more > 0 && "focus-ring max-h-[13.5rem] overflow-y-auto overscroll-contain"
        )}
      >
        {shown.map((r) => {
          const Icon = r.severity === "fix" ? CircleAlert : TriangleAlert;
          return (
            <li key={r.id}>
              <details className="group">
                <summary className="focus-ring relative flex cursor-pointer list-none items-center gap-3 px-5 py-3 marker:content-none hover:bg-muted/30 sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", r.severity === "fix" ? "bg-destructive" : "bg-warning")} />
                  <Icon className={cn("size-5 shrink-0", r.severity === "fix" ? "text-destructive" : "text-warning")} aria-hidden />
                  <span className="min-w-0 flex-1 leading-snug">
                    <span className="block text-[15px] font-semibold text-foreground">{r.title}</span>
                    <span className="block truncate text-sm text-muted-foreground">{r.summary}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="space-y-3 px-5 pb-4 pt-1 text-sm sm:pl-14 sm:pr-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{labels.whatItMeans}</p>
                    <p className="mt-1 leading-relaxed text-foreground/90">{r.summary}</p>
                  </div>
                  {r.todo ? (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{labels.whatToDo}</p>
                      <p className="mt-1 leading-relaxed text-foreground/90">{r.todo}</p>
                    </div>
                  ) : null}
                  {r.examples.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {labels.whereToLook}: <span className="break-words font-mono">{r.examples.join(" · ")}</span>
                    </p>
                  ) : null}
                  {r.items.length > 0 ? (
                    <ul className="space-y-2">
                      {r.items.map((it, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/60 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{it.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{it.detail}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {it.href ? (
                              <Link href={it.href} className="rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-secondary">
                                {labels.open}
                              </Link>
                            ) : null}
                            <form action={startWorkAs}>
                              <input type="hidden" name="userId" value={it.whoId} />
                              {it.href ? <input type="hidden" name="next" value={it.href} /> : null}
                              <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90">
                                {labels.workAs} {it.who}
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {r.link || r.workAs ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {r.workAs ? (
                        <form action={startWorkAs}>
                          <input type="hidden" name="userId" value={r.workAs.id} />
                          {r.link ? <input type="hidden" name="next" value={r.link.href} /> : null}
                          <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:opacity-90">
                            {labels.workAs} {r.workAs.label}
                          </button>
                        </form>
                      ) : null}
                      {r.link ? (
                        <Link href={r.link.href} className="inline-flex items-center gap-1 text-sm font-medium text-brand underline-offset-4 hover:underline">
                          {r.link.label}
                          <ChevronRight className="size-3.5" aria-hidden />
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {more > 0 && !atEnd ? (
        <p className="border-t border-border/60 py-2 text-center text-sm text-muted-foreground">{labels.scrollMore.replace("{n}", String(more))}</p>
      ) : null}
    </div>
  );
}
