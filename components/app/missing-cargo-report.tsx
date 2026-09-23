"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Lock, SearchX } from "lucide-react";

import type { ActionState } from "@/lib/actions/exceptions";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Saying the box is not there.
 *
 * Kept behind a second click on purpose. This is the counter's alternative to
 * handing cargo over, and the case it opens stops the release check dead for
 * everybody until somebody closes it — not something to fire by brushing a
 * button while reaching for "Release cargo". The textarea is required and short
 * answers are refused server-side, because "where did you look" is the only
 * thing the person searching tomorrow has to go on.
 *
 * It locks nothing by itself. `lib/release.ts` refuses a consignment with an
 * open case, and does so again inside the release transaction; what this writes
 * is the case.
 *
 * The action state is the caller's, not this component's: opening the case is
 * what takes the handover off the screen, so a state held here would be thrown
 * away in the same commit that answered it, and the clerk would never be told
 * the cargo is locked.
 */
export function UnableToLocateForm({
  cargoId,
  reference,
  state,
  action,
}: {
  cargoId: string;
  reference: string;
  state: ActionState;
  action: (formData: FormData) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (state.ok && state.id) {
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-warning">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="tnum">{reference}</span> {t("is locked")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("The case is open. The cargo cannot be released until it is closed, the manager and the Dar floor have been told, and the customer has been told we are tracing their cargo.")}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-lg">
            <Link href={`/app/exceptions/${state.id}`}>{t("Open the case")}</Link>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href="/app/scan">{t("Next customer")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <SearchX className="mr-1.5 h-3.5 w-3.5" />
        {t("Unable to locate cargo")}
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4"
    >
      <input type="hidden" name="cargoId" value={cargoId} />
      <input type="hidden" name="type" value="MISSING_CARGO" />
      <input type="hidden" name="priority" value="URGENT" />
      <input type="hidden" name="department" value="DAR_WAREHOUSE" />
      {/* A case's title is a record, not a screen: it is read in the case list
          and in the notification, in whatever language the desk reading it has
          chosen, so it carries the reference rather than a translated phrase. */}
      <input
        type="hidden"
        name="title"
        value={`Not found at the Dar counter — ${reference}`}
      />

      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t("Stop this pickup")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("Do not mark this handed over. Reporting it opens a case, stops any further pickup attempt, and tells the manager and the Dar floor straight away.")}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`loss-note-${cargoId}`} className="text-xs">
          {t("Where did you look?")}
        </Label>
        <Textarea
          id={`loss-note-${cargoId}`}
          name="description"
          rows={3}
          required
          minLength={5}
          placeholder={t("e.g. Not in bay C where the check-in put it, not on the overflow rack, not in the Dar office van.")}
        />
      </div>

      <FormMessage error={state.error} />

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          variant="destructive"
          size="sm"
          className="rounded-lg"
          pendingLabel={t("Opening the case…")}
        >
          {t("Stop the pickup and open a case")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("Cancel")}
        </Button>
      </div>
    </form>
  );
}
