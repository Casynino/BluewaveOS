"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteCargo, type ActionState } from "@/lib/actions/cargo";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/app/locale-provider";

/**
 * Delete, behind a second step and a reason.
 *
 * The button alone does nothing. A consignment removed by a stray tap is one
 * the counter can no longer find and the customer is still asking about, so
 * the press that matters is the second one, and it carries a sentence saying
 * why — which is what the owner reads in Deleted records before putting it
 * back.
 */
export function DeleteCargo({
  cargoId,
  reference,
}: {
  cargoId: string;
  reference: string;
}) {
  const tx = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteCargo, {});

  /* It has left every list, so this page is a page about nothing. */
  useEffect(() => {
    if (state.ok) router.push("/app/cargo");
  }, [state.ok, router]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 />
        {tx("Delete")}
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="w-full space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:w-96"
    >
      <input type="hidden" name="cargoId" value={cargoId} />
      <p className="text-sm font-semibold text-destructive">
        {tx("Delete")} {reference}?
      </p>
      <p className="text-xs text-muted-foreground">
        {tx("It leaves every list. Its box labels stop scanning to it, and any draft bill is cancelled with it. The owner can put it back from Deleted records.")}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="delete-cargo-reason">{tx("Why?")}</Label>
        <Input
          id="delete-cargo-reason"
          name="reason"
          required
          minLength={3}
          placeholder={tx("Scanned twice, entered against the wrong customer…")}
        />
      </div>
      <FormMessage error={state.error} ok={state.ok} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="destructive" pendingLabel={tx("Deleting…")}>
          <Trash2 />
          {tx("Delete")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
