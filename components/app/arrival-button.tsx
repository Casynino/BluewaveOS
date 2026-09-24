"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import {
  Anchor,
  CalendarClock,
  CircleCheck,
  PackageCheck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { advanceContainer, type ActionState } from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
import { translateMessage } from "@/components/app/tx";

/** The company's own storage terms, from CompanySetting — never typed here. */
export type StorageTerms = {
  freeDays: number;
  /** Per day after the free days; null or zero when storage is not charged. */
  perDay: string | null;
  currency: string;
};

/**
 * "THE CONTAINER IS IN" — ASKED ONCE, IN A DIALOG.
 *
 * Pressing this is not a status change somebody can undo quietly: every
 * consignment on the box counts as arrived that day, every customer is told,
 * and the free-storage clock starts on all of them. So the press says what it
 * is about to do, in the company's own storage terms, before it does it.
 *
 * IT DOES NOT BOOK THE GOODS IN. Dar's check-in afterwards is the warehouse's
 * own count — internal, never shown to a customer — and it never moves the
 * dates this press sets. That sentence is on the dialog because the floor kept
 * asking whether they had to check a box in before the clock could start.
 */
export function ArrivalButton({
  containerId,
  reference,
  waiting,
  terms,
  className,
}: {
  containerId: string;
  /** The box being landed, so the dialog names what is being pressed. */
  reference?: string | null;
  /** How many consignments come in with it. */
  waiting: number;
  terms: StorageTerms;
  /** The size the row it sits in wants. A table row sets its own. */
  className?: string;
}) {
  const tx = useT();
  const tm = (message: string) => translateMessage(message, tx);
  const perDay = terms.perDay !== null && Number(terms.perDay) > 0 ? Number(terms.perDay) : null;
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(advanceContainer, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" className={className} onClick={() => setOpen(true)}>
        <Anchor />
        {tx("Mark as arrived")}
      </Button>
      {state.ok ? <FormMessage ok={state.ok} /> : null}
      {open ? (
        <Modal title={tx("Arrived in Dar es Salaam")} onClose={close} className="max-w-lg">
          <div>
            <p className="font-medium">
              {waiting === 1
                ? tm(`1 consignment on ${reference ?? "this container"} will be marked arrived.`)
                : tm(`${waiting} consignments on ${reference ?? "this container"} will be marked arrived.`)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {tx("Anything reported missing is left out.")}
            </p>
          </div>

          {/* THE ONE THING TO CARRY AWAY. Pressing this starts the customer's
              free storage days — by the owner's decision the goods enter the
              Dar warehouse's flow the day the box lands. The warehouse's
              check-in afterwards is verification and never moves that date. */}
          <div className="flex gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] p-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-warning/15">
              <CalendarClock className="size-5 text-warning" />
            </span>
            <div>
              <p className="font-semibold">{tx("Storage starts now")}</p>
              <p className="mt-1 text-sm">
                {tm(
                  `The customer gets ${terms.freeDays} free storage days, starting the moment you mark it arrived.`
                )}
                {perDay !== null
                  ? ` ${tm(
                      `From day ${terms.freeDays + 1}, storage is charged at ${terms.currency} ${perDay} a day until the goods are collected.`
                    )}`
                  : null}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {tx(
                  "The Dar warehouse will be asked to verify and check in the goods. Check-in does not change these dates."
                )}
              </p>
            </div>
          </div>

          <ol className="space-y-3 text-sm">
            <Step
              icon={CircleCheck}
              tone="text-success bg-success/12"
              title={tx("Arrived")}
              detail={tm(
                `Now. The ${terms.freeDays} free storage days start, and customers are told their goods have landed.`
              )}
            />
            <Step
              icon={Warehouse}
              tone="text-warning bg-warning/15"
              title={tx("Dar warehouse verifies and checks in")}
              detail={tx("Internal check of count, damage and missing cargo. Customers do not see it.")}
            />
            <Step
              icon={PackageCheck}
              tone="text-muted-foreground bg-secondary"
              title={tx("Ready for pickup")}
              detail={tx("Once the customer has paid and the goods are verified.")}
            />
          </ol>

          <form action={action} className="space-y-4">
            <input type="hidden" name="containerId" value={containerId} />
            <input type="hidden" name="to" value="ARRIVED" />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">
                {tx("Note")}{" "}
                <span className="font-normal text-muted-foreground">{tx("optional")}</span>
              </span>
              <Textarea
                name="note"
                rows={2}
                maxLength={300}
                placeholder={tx("Berth, agent, discharge reference…")}
                className="resize-none"
              />
            </label>
            <FormMessage error={state.error} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton size="sm" pendingLabel={tx("Recording…")}>
                {tx("Mark as arrived")}
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
