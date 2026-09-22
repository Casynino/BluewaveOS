"use client";

import { useT } from "@/components/app/locale-provider";
import { RATE_ENTRIES, RATE_ENTRY_LABEL } from "@/lib/rate-basis";

/**
 * The "Charged by" choices, in the order the company names them. Tonne posts
 * PER_TONNE and the server stores it per kilogram (lib/rate-basis.ts).
 */
export function RateBasisOptions() {
  const tx = useT();
  return (
    <>
      {RATE_ENTRIES.map((entry) => (
        <option key={entry} value={entry}>
          {tx(RATE_ENTRY_LABEL[entry])}
        </option>
      ))}
    </>
  );
}
