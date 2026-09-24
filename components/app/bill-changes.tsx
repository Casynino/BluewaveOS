"use client";

import { useState, useTransition } from "react";
import { ArrowLeftRight, BadgePercent, Ban, Scale, Undo2, Warehouse } from "lucide-react";

import { undoDiscount, undoInvoiceRate, undoReprice } from "@/lib/actions/invoices";
import { FormMessage } from "@/components/app/form-message";
import { Input } from "@/components/ui/input";

import { useT } from "@/components/app/locale-provider";

/**
 * ONE THING A DESK DID TO A BILL.
 *
 * Derived in lib/bill-changes.ts, worded here: the figures come ready-formatted
 * because money and rates are never translated, and the words around them are
 * put on in the reader's own language. The same change shows on the verify row,
 * inside the correction dialog and beside every bill of a merge — worded three
 * times it would say three different things by the end of the month.
 */
export type BillChange = {
  invoiceId: string;
  /** Always carried: a merged payment covers several bills, and every change
      belongs to exactly one of them. */
  invoiceNumber: string;
  kind: "discount" | "reprice" | "fx" | "storage" | "storageWaived";
  /** What the bill says now: "USD 50.00", "USD 380.00/CBM", "1 USD = 2,650 TZS". */
  figure: string;
  /** What the rate book said, on a re-price. */
  book: string | null;
  /** The volume that rate multiplies, on a re-price. */
  volume: string | null;
  by: string | null;
  at: string | null;
  /**
   * What putting it back would restore. Null when nothing can be: an older
   * bill whose original rate left no trail, or a book with no figure for
   * these goods.
   */
  undo: {
    to: string;
    /** False when the figure is today's published rate rather than the one
        this bill was pinned at — the trail could not give that back. */
    recovered: boolean;
  } | null;
};

/** Whether this desk may put a given change back. */
export function mayUndo(
  change: BillChange,
  tools: { canChangeBill: boolean; canChangeRate: boolean }
) {
  if (!change.undo) return false;
  /* Storage is a fact about the money, not a change to undo from here: it is
     taken off on the bill, with a reason. */
  if (change.kind === "storage" || change.kind === "storageWaived") return false;
  /* Putting a change back takes the authority that made it: the bill's own
     desk for the exchange rate, the counter's for a price. */
  return change.kind === "fx" ? tools.canChangeRate : tools.canChangeBill;
}

const ICON = {
  discount: BadgePercent,
  reprice: Scale,
  fx: ArrowLeftRight,
  storage: Warehouse,
  storageWaived: Ban,
} as const;

/**
 * WHAT WAS DONE TO THIS BILL, BEFORE FINANCE AGREES MONEY AGAINST IT.
 *
 * A bill somebody moved looks, on the verify row, exactly like a bill that was
 * always that size. Each change is named here — amber, compact, inline — with
 * the desk that made it and the day. `withBill` puts the invoice number on
 * each one, for a payment that covers several.
 */
export function BillChangeBadges({
  changes,
  withBill = false,
}: {
  changes: BillChange[];
  withBill?: boolean;
}) {
  const tx = useT();
  if (changes.length === 0) return null;
  return (
    <>
      {changes.map((change) => {
        const Icon = ICON[change.kind];
        const said =
          change.kind === "discount"
            ? `${tx("Discounted")} ${change.figure}`
            : change.kind === "fx"
              ? `${tx("Rate changed to")} ${change.figure}`
              : /* Storage as it stood when this money came in — not as the
                   bill reads today. A payment made inside the free days
                   carries neither tag. */
                change.kind === "storage"
                ? `${tx("Includes storage")} ${change.figure}${change.volume ? ` · ${change.volume}` : ""}`
                : change.kind === "storageWaived"
                  ? `${tx("Storage removed")}${change.figure ? ` ${change.figure}` : ""}${change.book ? ` · ${change.book}` : ""}`
                  : [
                  `${tx("Re-priced")} ${change.figure}`,
                  change.volume,
                  `${tx("book")} ${change.book ?? tx("not recorded")}`,
                ]
                  .filter(Boolean)
                  .join(" · ");
        return (
          <span
            key={`${change.invoiceId}-${change.kind}`}
            className="inline-flex max-w-full items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning"
          >
            <Icon className="size-3 shrink-0" />
            <span className="min-w-0 break-words">
              {withBill ? `${change.invoiceNumber} · ` : ""}
              {said}
              {change.by ? ` · ${tx("by")} ${change.by}` : ""}
              {change.at ? ` · ${change.at}` : ""}
            </span>
          </span>
        );
      })}
    </>
  );
}

/**
 * PUT IT BACK.
 *
 * The same act as making the change, in reverse and by the same authority. One
 * small control per change, each naming the figure it restores, so nobody has
 * to work out what the rate book said before pressing. A rate no trail can give
 * back offers today's published one instead, and says that is what it is.
 */
export function BillChangeUndo({
  changes,
  tools,
  onDone,
  withBill = false,
}: {
  changes: BillChange[];
  tools: { canChangeBill: boolean; canChangeRate: boolean };
  onDone?: () => void;
  withBill?: boolean;
}) {
  const shown = changes.filter((c) => mayUndo(c, tools));
  if (shown.length === 0) return null;
  return (
    <div className="flex flex-col items-start gap-1.5">
      {shown.map((change) => (
        <UndoOne
          key={`${change.invoiceId}-${change.kind}`}
          change={change}
          withBill={withBill}
          onDone={onDone}
        />
      ))}
    </div>
  );
}

const ACTION = {
  discount: undoDiscount,
  reprice: undoReprice,
  fx: undoInvoiceRate,
} as const;

/**
 * ONE CONTROL, WITH NO FORM OF ITS OWN.
 *
 * It sits inside the correction dialog's form and inside the merge form. A
 * form nested in a form is dropped by the browser, which hands its fields to
 * the outer submit — so the action is called straight, the way the storage
 * button beside it is. A refusal thrown before its words reach the browser is
 * answered rather than swallowed.
 */
function UndoOne({
  change,
  withBill,
  onDone,
}: {
  change: BillChange;
  withBill: boolean;
  onDone?: () => void;
}) {
  const tx = useT();
  const [reason, setReason] = useState("");
  const [said, setSaid] = useState<{ error?: string; ok?: string } | null>(null);
  const [busy, start] = useTransition();
  const word =
    change.kind === "discount"
      ? tx("Put the price back")
      : change.kind === "reprice"
        ? tx("Put the book price back")
        : change.undo?.recovered
          ? tx("Put the rate back")
          : tx("Use today's rate");

  const putItBack = () =>
    start(async () => {
      setSaid(null);
      const data = new FormData();
      data.set("invoiceId", change.invoiceId);
      data.set("reason", reason);
      /* Finance agreeing to today's rate for a bill whose own rate is gone is
         a decision, not a default: the action refuses without this. */
      if (change.kind === "fx" && !change.undo?.recovered) data.set("useToday", "1");
      /* Only the three that can be put back reach here — `canUndo` refuses the
         storage tags, which are facts about the money rather than changes with
         an undo. */
      const undoable = ACTION[change.kind as keyof typeof ACTION];
      if (!undoable) return;
      const answer = await undoable({}, data).catch(
        (): { error?: string; ok?: string } => ({ error: "That did not work." })
      );
      setSaid(answer);
      /* The list behind the control is now wrong — the bill it named has
         moved. A refusal leaves it standing, with the words explaining why. */
      if (answer.ok) onDone?.();
    });

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="h-7 w-44 text-xs"
        placeholder={tx("Why it is not agreed")}
        aria-label={tx("Why the change is not agreed")}
      />
      <button
        type="button"
        disabled={busy}
        onClick={putItBack}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-warning hover:bg-warning/10 disabled:opacity-50"
      >
        <Undo2 className="size-3.5" />
        {busy ? tx("Putting it back…") : `${word} (${change.undo!.to})`}
        {withBill ? ` · ${change.invoiceNumber}` : ""}
      </button>
      {said?.error || said?.ok ? (
        <span className="w-full">
          <FormMessage error={said.error} ok={said.ok} />
        </span>
      ) : null}
    </div>
  );
}
