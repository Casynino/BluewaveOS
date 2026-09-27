"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";

type Option = { value: string; label: string };

const BASE = "/app/finance/income";

/**
 * THE SEARCH, AND THE ONE NARROWING THE CHIPS ABOVE DO NOT OFFER.
 *
 * In the URL, like every other filter in the books: "what came in for full
 * containers this month" is something one person sends another, and a view
 * with no address cannot be sent. The account is narrowed by its chip on the
 * takings card, where the reader is already looking at its figure.
 */
export function IncomeFilters({ sources }: { sources: Option[] }) {
  const tx = useT();
  const router = useRouter();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const urlSource = params.get("source") ?? "";
  const [term, setTerm] = useState(urlQ);
  /* What was picked is shown at once, not after the new page arrives. */
  const [source, setSource] = useState(urlSource);
  /* Follow the address only when it really changed, so typing is never
     wiped by an unrelated navigation. */
  useEffect(() => setTerm(urlQ), [urlQ]);
  useEffect(() => setSource(urlSource), [urlSource]);

  /* Built from the address as it is now, with the box's text in it, so a
     search and a pick made one after the other both survive. */
  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(window.location.search);
    if (term.trim()) next.set("q", term.trim());
    else next.delete("q");
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.push(qs ? `${BASE}?${qs}` : BASE);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        push({ q: term.trim() });
      }}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    >
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={tx("Customer, cargo number, receipt, reference…")}
          aria-label={tx("Search income")}
          className="focus-ring h-9 w-full rounded-lg border bg-card pl-9 pr-3 text-sm"
        />
      </div>
      <button type="submit" className="focus-ring h-9 rounded-lg border bg-card px-3.5 text-sm font-medium hover:bg-accent">
        {tx("Search")}
      </button>
      <NativeSelect
        aria-label={tx("Source")}
        value={source}
        onChange={(e) => {
          setSource(e.target.value);
          push({ source: e.target.value });
        }}
        className="h-9 w-auto min-w-40"
      >
        {sources.map((o) => (
          <option key={o.value} value={o.value}>
            {tx(o.label)}
          </option>
        ))}
      </NativeSelect>
    </form>
  );
}
