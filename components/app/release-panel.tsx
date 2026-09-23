"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { Tx } from "@/components/app/tx";

/**
 * The conditions, spelled out.
 *
 * A blocked release shows exactly which one failed, so the person at the
 * counter can tell the customer what is missing instead of "the system won't
 * let me". That sentence is what makes people work around a system.
 *
 * The handover form itself lives in `release-workbench.tsx`, the one screen
 * the Dar counter works from.
 */
export function ReleaseChecklist({
  conditions,
}: {
  conditions: { label: string; passed: boolean; detail?: string }[];
}) {
  return (
    <ul className="space-y-2">
      {conditions.map((c) => (
        <li key={c.label} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              c.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            )}
          >
            {c.passed ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span className={c.passed ? "" : "font-medium"}>
            <Tx>{c.label}</Tx>
            {c.detail ? (
              <span className="block text-xs font-normal text-muted-foreground">
                <Tx>{c.detail}</Tx>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
