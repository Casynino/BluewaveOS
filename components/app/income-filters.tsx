"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { NativeSelect } from "@/components/ui/native-select";

import { useT } from "@/components/app/locale-provider";

type Option = { value: string; label: string };

const BASE = "/app/finance/income";

/**
 * THE SEARCH AND THE TWO NARROWINGS OVER THE INCOME LIST.
 *
 * In the URL, like every other filter in the books: "what came in through the
 * CRDB account this month" is something one person sends another, and a view
 * with no address cannot be sent. The period is kept as it is; changing what
 * is shown never changes when.
 */
export function IncomeFilters({
  sources,
  accounts,
}: {
  sources: Option[];
  accounts: Option[];
}) {
  const tx = useT();
  const router = useRouter();
  const params = useSearchParams();
  const urlQ = params.get("q") ?? "";
  const urlSource = params.get("source") ?? "";
  const urlAccount = params.get("account") ?? "";
  const [term, setTerm] = useState(urlQ);
  /* What was picked is shown at once, not after the new page arrives. */
  const [picked, setPicked] = useState({ source: urlSource, account: urlAccount });
  /* Follow the address only when it really changed, so typing is never
     wiped by an unrelated navigation. */
  useEffect(() => setTerm(urlQ), [urlQ]);
  useEffect(() => setPicked({ source: urlSource, account: urlAccount }), [urlSource, urlAccount]);

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
      className="flex flex-wrap gap-2 rounded-2xl border bg-card p-3"
    >
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onBlur={() => term.trim() !== urlQ && push({ q: term.trim() })}
          placeholder={tx("Customer, cargo, bill, receipt, reference…")}
          className="focus-ring h-10 w-full rounded-xl border bg-background pl-10 pr-3 text-sm"
        />
      </div>
      <NativeSelect
        aria-label={tx("Source")}
        value={picked.source}
        onChange={(e) => {
          setPicked((v) => ({ ...v, source: e.target.value }));
          push({ source: e.target.value });
        }}
        className="h-10 w-auto min-w-44"
      >
        {sources.map((o) => (
          <option key={o.value} value={o.value}>
            {tx(o.label)}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={tx("Received through")}
        value={picked.account}
        onChange={(e) => {
          setPicked((v) => ({ ...v, account: e.target.value }));
          push({ account: e.target.value });
        }}
        className="h-10 w-auto min-w-44"
      >
        {accounts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value ? o.label : tx(o.label)}
          </option>
        ))}
      </NativeSelect>
    </form>
  );
}
