"use client";

import { useActionState } from "react";
import { BookOpenCheck } from "lucide-react";

import { loadCompanyRateBook, type ActionState } from "@/lib/actions/finance-config";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";

/** One press to publish the cargo types in the company's price list that are not live yet. */
export function LoadRateBook({ missing }: { missing: number }) {
  const [state, action] = useActionState<ActionState, FormData>(loadCompanyRateBook, {});
  return (
    <form action={action} className="flex flex-col gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">BlueWave&rsquo;s price list: {missing} cargo type{missing === 1 ? "" : "s"} not live yet</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Publishes the company&rsquo;s own rates (per CBM, and per tonne for heavy goods). Prices already on this page are left as they are.
        </p>
        <div className="mt-2"><FormMessage error={state.error} ok={state.ok} /></div>
      </div>
      <SubmitButton pendingLabel="Publishing…" className="shrink-0">
        <BookOpenCheck className="size-4" />
        Publish {missing} price{missing === 1 ? "" : "s"}
      </SubmitButton>
    </form>
  );
}
