"use client";

import { useActionState, useState } from "react";
import { Lock, PackageX, TriangleAlert } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { closeContainer, type CloseState } from "@/lib/actions/close-container";
import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";

/** A consignment on the box that nobody has counted and nobody has reported. */
export type OpenConsignment = {
  id: string;
  reference: string;
  customer: string;
  shippingMark: string | null;
  goods: string;
  /** What Foshan measured, or what was declared. Never a price. */
  packages: number;
  cbmLabel: string;
};

/** A live container this consignment could really be on instead. */
export type MoveTarget = {
  id: string;
  reference: string;
  /** Where that box is, in the words the desk uses. */
  where: string;
  route: string | null;
  /** "12.4 of 67 CBM", or the volume alone where no capacity is set. */
  fill: string;
};

/**
 * CLOSING A SAILING, WITH THE QUESTION ON THE SAME SCREEN AS THE DECISION.
 *
 * A box with nothing outstanding closes in one press: there is nothing to ask,
 * and a list of no rows in front of somebody is a screen pretending to be work.
 *
 * A box with consignments nobody has accounted for asks about each of them,
 * here, because the alternative — a refusal naming four references — sent the
 * closer to another screen to answer a question they were already standing in
 * front of. Each row gets the customer, the mark and the figures, so the choice
 * is made against the cargo rather than against a reference number, and the
 * choices are the three that are actually true: it is on another sailing, it
 * never came off, or this is not the moment to close the box.
 *
 * Leaving a row unanswered closes nothing. That is the way out, and it does not
 * need a button of its own.
 */
export function ClosePanel({
  containerId,
  reference,
  outstanding,
  targets,
  mayReportMissing,
}: {
  containerId: string;
  reference: string;
  outstanding: OpenConsignment[];
  targets: MoveTarget[];
  /** Reporting one missing is the Dar floor's — `receiving.dar`. */
  mayReportMissing: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<CloseState, FormData>(closeContainer, {});
  /* Held here only so the row can explain itself as it is answered. The server
     reads the form, never this. */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const clean = outstanding.length === 0;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="containerId" value={containerId} />

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight">
              {tx("Close")} {reference}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {tx(
                "Nothing more can happen to a closed container: nothing goes on it, nothing comes off it, and it leaves the receiving dock."
              )}
            </p>
          </div>
          <Badge tone={clean ? "good" : "warn"}>
            {clean
              ? tx("Everything accounted for")
              : `${outstanding.length} ${tx("still open")}`}
          </Badge>
        </div>

        {clean ? null : (
          <>
            <p className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                {tx(
                  "These consignments have not been checked in and have not been reported missing. Say what happened to each one — a consignment left on a closed box is one nobody can find again."
                )}
              </span>
            </p>

            <ul className="mt-4 space-y-3">
              {outstanding.map((row) => {
                const answer = answers[row.id] ?? "";
                return (
                  <li
                    key={row.id}
                    className="rounded-lg border bg-background p-3 sm:p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="tnum text-sm font-semibold">
                        {row.reference}
                      </span>
                      <span className="tnum text-xs text-muted-foreground">
                        {row.packages} {tx("pkg")} · {row.cbmLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-sm">
                      {row.customer}
                      {row.shippingMark ? (
                        <span className="tnum text-muted-foreground">
                          {" · "}
                          {row.shippingMark}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      <Tx>{row.goods}</Tx>
                    </p>

                    <NativeSelect
                      name={`outcome:${row.id}`}
                      value={answer}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [row.id]: e.target.value }))
                      }
                      aria-label={`${tx("What happened to")} ${row.reference}`}
                      className="mt-3 w-full"
                    >
                      <option value="">{tx("What happened to it?")}</option>
                      {mayReportMissing ? (
                        <option value="missing">
                          {tx("It never came off — report it missing")}
                        </option>
                      ) : null}
                      {targets.length > 0 ? (
                        <optgroup label={tx("It is on another container")}>
                          {targets.map((t) => (
                            <option key={t.id} value={`move:${t.id}`}>
                              {`${t.reference} · ${t.where}${
                                t.route ? ` · ${t.route}` : ""
                              } · ${t.fill}`}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <option value="leave">
                        {tx("Leave it — do not close the container")}
                      </option>
                    </NativeSelect>

                    {answer === "missing" ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <PackageX className="mt-0.5 size-3.5 shrink-0" />
                        {tx(
                          "A case opens on it. It keeps its row here, its code and its history, and it can never be released."
                        )}
                      </p>
                    ) : answer.startsWith("move:") ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {tx(
                          "It moves exactly as it is — same reference, code, measurements, photographs and history. Its storage clock follows the box it goes on."
                        )}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {!mayReportMissing || targets.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {!mayReportMissing
                  ? tx(
                      "Reporting a consignment missing is the Dar floor's to do; ask them, or a manager."
                    )
                  : tx("There is no other live container to move one onto.")}
              </p>
            ) : null}

            <div className="mt-4 space-y-2">
              <Input
                name="reason"
                placeholder={tx("Why the sailing is being closed now")}
                aria-label={tx("Why the sailing is being closed now")}
              />
              <p className="text-xs text-muted-foreground">
                {tx(
                  "It goes on the container's history, on every consignment that moves, and on the case for anything reported missing."
                )}
              </p>
            </div>
          </>
        )}

        <FormMessage error={state.error} ok={state.ok} />

        <SubmitButton
          size="lg"
          className="mt-4 h-12 w-full gap-2 text-base sm:w-auto sm:px-6"
          pendingLabel={tx("Closing…")}
        >
          <Lock />
          {tx("Close the container")}
        </SubmitButton>
        <p className="mt-2 text-xs text-muted-foreground">
          {tx("Today's date and time are recorded with your name.")}
        </p>
      </div>
    </form>
  );
}
