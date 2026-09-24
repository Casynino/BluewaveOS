"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { BellOff, CalendarClock, Ship, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";

import { undoContainerArrival, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
import { translateMessage } from "@/components/app/tx";

/**
 * "THE SHIP HAD NOT ARRIVED" — A CORRECTION, ASKED ONCE IN A DIALOG.
 *
 * The mirror of the arrival it undoes, and laid out the same way, because it
 * takes back exactly what that press gave: the box goes back to sea, the
 * arrival date comes off every consignment, and the free-storage clock is
 * cleared as though it had never started.
 *
 * The one thing it does NOT take back is the message. Customers told their
 * goods had landed are not told again — nothing is sent — so the dialog says
 * so, rather than letting a clerk assume the system made that call for them.
 *
 * The action refuses outright once anything on the box has been checked in or
 * reported missing. That is the server's rule, not this dialog's.
 */
export function UndoArrivalButton({
  containerId,
  reference,
  waiting,
  className,
}: {
  containerId: string;
  reference: string;
  /** How many consignments go back to sea with it. */
  waiting?: number;
  /** The size the row it sits in wants. A table row sets its own. */
  className?: string;
}) {
  const tx = useT();
  const tm = (message: string) => translateMessage(message, tx);
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(undoContainerArrival, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" variant="ghost" className={className} onClick={() => setOpen(true)}>
        <Undo2 />
        {tx("Undo arrived")}
      </Button>
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={tm(`Undo the arrival of ${reference}`)} onClose={close} className="max-w-lg">
          <div>
            <p className="font-medium">
              {waiting === undefined
                ? tm(`Everything on ${reference} goes back to sea.`)
                : waiting === 1
                  ? tm(`1 consignment on ${reference} goes back to sea.`)
                  : tm(`${waiting} consignments on ${reference} go back to sea.`)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tx("Only a box nobody has checked in can be put back.")}
            </p>
          </div>

          {/* THE ONE THING TO CARRY AWAY, as on the arrival: this press moves
              money. The clock does not pause — the date comes off, and the free
              days start again from nothing the day the box really lands. */}
          <div className="flex gap-3 rounded-xl border border-destructive/40 bg-destructive/[0.08] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/15">
              <TriangleAlert className="size-5 text-destructive" />
            </span>
            <div>
              <p className="font-semibold">{tx("Storage is cleared, not paused")}</p>
              <p className="mt-1 text-sm">
                {tx(
                  "The arrival date comes off every consignment on this container, and the free storage days start again from nothing the day it really lands."
                )}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tx("Press this only when the box had not in fact arrived.")}
              </p>
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            <Step
              icon={Ship}
              tone="text-warning bg-warning/15"
              title={tx("Back at sea")}
              detail={tx("Now. The container and everything on it stand in transit again.")}
            />
            <Step
              icon={CalendarClock}
              tone="text-destructive bg-destructive/12"
              title={tx("Storage cleared")}
              detail={tx("The arrival date, and every free storage day counted from it, are removed.")}
            />
            <Step
              icon={BellOff}
              tone="text-muted-foreground bg-secondary"
              title={tx("Customers keep the message")}
              detail={tx(
                "Anyone already told the goods had landed is not told again. Ring them if it matters."
              )}
            />
          </ol>

          <form action={action} className="space-y-4">
            <input type="hidden" name="containerId" value={containerId} />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Why")}{" "}
                <span className="font-normal text-muted-foreground">{tx("optional")}</span>
              </span>
              <Textarea
                name="reason"
                rows={2}
                maxLength={300}
                placeholder={tx("Pressed on the wrong container")}
                className="resize-none"
              />
            </label>
            <FormMessage error={state.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm" variant="destructive" pendingLabel={tx("Undoing…")}>
                <Undo2 />
                {tx("Undo arrived")}
              </SubmitButton>
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                {tx("Leave it")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function Step({
  icon: Icon,
  tone,
  title,
  detail,
}: {
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-muted-foreground">{detail}</span>
      </span>
    </li>
  );
}
