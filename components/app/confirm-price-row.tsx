"use client";

import { useActionState } from "react";
import { BadgeCheck } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { confirmPrices, type PriceListState } from "@/lib/actions/price-list";
import { useT } from "@/components/app/locale-provider";

/**
 * THE PRICE, AND THE PRESS THAT CONFIRMS IT, ON THE CONSIGNMENT'S OWN ROW.
 *
 * Finance reads this floor a row at a time — this customer's goods, that
 * customer's — so the figure the rate book raised and the one press that turns
 * it into a bill belong beside the boxes they are about, not in a panel above
 * the list asking which of the rows below it means.
 *
 * The press is the same action the container lists use, narrowed to this one
 * consignment. The server prices it again from the record: the figure shown
 * here is what the book says today, never what the bill is struck at.
 */
export function ConfirmPriceRow({
  cargoId,
  amount,
  tzs,
  canConfirm,
}: {
  cargoId: string;
  /** What the book makes it, already worked out on the server. */
  amount: string;
  tzs: string | null;
  /** Reading a price is `finance.view`; confirming it is its own authority. */
  canConfirm: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<PriceListState, FormData>(confirmPrices, {});

  return (
    <div className="space-y-1">
      <p className="tnum text-sm font-semibold">{amount}</p>
      {tzs ? <p className="tnum text-xs text-muted-foreground">{tzs}</p> : null}
      {canConfirm ? (
        <form action={action}>
          <input type="hidden" name="scope" value="china" />
          <input type="hidden" name="cargoIds" value={cargoId} />
          <SubmitButton size="sm" variant="outline" pendingLabel={tx("Confirming…")}>
            <BadgeCheck />
            {tx("Confirm price")}
          </SubmitButton>
        </form>
      ) : null}
      <FormMessage error={state.error} ok={state.ok} />
    </div>
  );
}
