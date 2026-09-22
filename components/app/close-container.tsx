"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { closeContainer, type CloseState } from "@/lib/actions/close-container";
import { useT } from "@/components/app/locale-provider";

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
 * CLOSING A SAILING: A SMALL BUTTON, AND ONE QUESTION BEHIND IT.
 *
 * The container page is already a page of figures, so closing takes a button
 * the size of the act and nothing more. A box with nothing outstanding closes
 * from it in one press.
 *
 * A box with consignments nobody has accounted for opens a dialog: the list,
 * ticked, and ONE choice for all of them — the container they are really on,
 * or missing. That is the honest shape of it: a bale left off a box is rarely
 * left off alone, and asking the same question five times in five dropdowns is
 * the same answer typed five times. A row can be un-ticked to be left as it
 * is, and then the box does not close — which the dialog says before the press.
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
  const [open, setOpen] = useState(false);
  /* Everything ticked to start with: the common close is "all of it went on
     the next box", not a row-by-row argument. */
  const [picked, setPicked] = useState<string[]>(outstanding.map((row) => row.id));
  const [outcome, setOutcome] = useState("");

  const clean = outstanding.length === 0;
  const left = outstanding.filter((row) => !picked.includes(row.id));

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  /* Nothing outstanding: the button is the whole of it. */
  if (clean) {
    return (
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="containerId" value={containerId} />
        <SubmitButton size="sm" className="gap-2" pendingLabel={tx("Closing…")}>
          <Lock className="size-4" />
          {tx("Close the container")}
        </SubmitButton>
        <FormMessage error={state.error} ok={state.ok} />
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <Lock className="size-4" />
        {tx("Close the container")}
        <span className="rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning">
          {outstanding.length}
        </span>
      </Button>
      <FormMessage error={state.error} ok={state.ok} />

      {open ? (
        <Modal title={`${tx("Close")} ${reference}`} onClose={() => setOpen(false)}>
          <form action={action} className="space-y-4">
            <input type="hidden" name="containerId" value={containerId} />
            {/* The server reads one answer per consignment; the dialog asks once. */}
            {outstanding.map((row) => (
              <input
                key={row.id}
                type="hidden"
                name={`outcome:${row.id}`}
                value={picked.includes(row.id) ? outcome : "leave"}
              />
            ))}

            <p className="text-sm text-muted-foreground">
              {tx(
                "Still open on this container. Tick the ones to deal with and say where they go — a consignment left on a closed box is one nobody can find again."
              )}
            </p>

            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {outstanding.map((row) => (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={picked.includes(row.id)}
                      onChange={(e) =>
                        setPicked((ids) =>
                          e.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id)
                        )
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="tnum text-sm font-semibold">{row.reference}</span>
                        <span className="tnum text-xs text-muted-foreground">
                          {row.packages} {tx("pkg")} · {row.cbmLabel}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.customer}
                        {row.shippingMark ? ` · ${row.shippingMark}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="text-xs font-medium text-brand hover:underline"
                onClick={() =>
                  setPicked(picked.length === outstanding.length ? [] : outstanding.map((r) => r.id))
                }
              >
                {picked.length === outstanding.length ? tx("Tick none") : tx("Tick all")}
              </button>
              <span className="text-xs text-muted-foreground">
                {picked.length} {tx("of")} {outstanding.length}
              </span>
            </div>

            <NativeSelect
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              aria-label={tx("Where do the ticked consignments go?")}
            >
              <option value="">{tx("Where do they go?")}</option>
              {targets.length > 0 ? (
                <optgroup label={tx("Move them to")}>
                  {targets.map((t) => (
                    <option key={t.id} value={`move:${t.id}`}>
                      {`${t.reference} · ${t.where}${t.route ? ` · ${t.route}` : ""} · ${t.fill}`}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {mayReportMissing ? (
                <option value="missing">{tx("They never came off — report them missing")}</option>
              ) : null}
            </NativeSelect>

            <Input
              name="reason"
              placeholder={tx("Why the sailing is being closed now")}
              aria-label={tx("Why the sailing is being closed now")}
            />

            {left.length > 0 ? (
              <p className="text-xs text-warning">
                {left.length} {tx("left un-ticked stay on this container, so it will not close.")}
              </p>
            ) : outcome.startsWith("move:") ? (
              <p className="text-xs text-muted-foreground">
                {tx(
                  "They move exactly as they are — same reference, code, measurements, photographs and history. Their storage clock follows the box they go on."
                )}
              </p>
            ) : outcome === "missing" ? (
              <p className="text-xs text-muted-foreground">
                {tx(
                  "A case opens on each. They keep their row here, their code and their history, and can never be released."
                )}
              </p>
            ) : null}

            <FormMessage error={state.error} />

            <div className="flex flex-wrap gap-2">
              <SubmitButton
                className="gap-2"
                disabled={!outcome || left.length > 0}
                pendingLabel={tx("Closing…")}
              >
                <Lock className="size-4" />
                {tx("Close the container")}
              </SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {tx("Cancel")}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
