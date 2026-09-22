"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";

import {
  markCargoCleared,
  markContainerCleared,
  type ClearanceState,
} from "@/lib/actions/clearance";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";

import { useT } from "@/components/app/locale-provider";
/**
 * "Customs is done" — for one consignment, or every one on a container that
 * Dar has booked in. One press, by the owner's decision: clearing is the
 * everyday outcome, not an exception that wants a note. The server still
 * decides what may be cleared, and what it did is on the timeline.
 */
export function ClearanceButton({
  cargoId,
  containerId,
  waiting,
  label,
}: {
  cargoId?: string;
  containerId?: string;
  /** How many consignments this would clear. */
  waiting: number;
  label?: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ClearanceState, FormData>(
    containerId ? markContainerCleared : markCargoCleared,
    {}
  );

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
      {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}
      <SubmitButton disabled={waiting === 0} pendingLabel={tx("Clearing…")}>
        <ShieldCheck />
        {label ?? (containerId ? `${tx("Mark cleared")} (${waiting})` : tx("Mark cleared"))}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
