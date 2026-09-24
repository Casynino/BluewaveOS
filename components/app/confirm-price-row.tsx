"use client";

import { useActionState, useRef } from "react";
import { BadgeCheck } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { RowPriceEditor } from "@/components/app/row-price-editor";
import { SubmitButton } from "@/components/app/submit-button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  confirmPrices,
  setPriceListCargoType,
  type PriceListState,
} from "@/lib/actions/price-list";
import type { PriceListRow } from "@/lib/price-list";
import { useLocale, useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

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
  row,
  vatPercent,
  canConfirm,
}: {
  row: PriceListRow;
  /** From CompanySetting, so the dialog adds up to what the bill will say. */
  vatPercent: number;
  /** Reading a price is `finance.view`; confirming it is its own authority. */
  canConfirm: boolean;
}) {
  const tx = useT();
  const locale = useLocale();
  const [state, action] = useActionState<PriceListState, FormData>(confirmPrices, {});

  return (
    <div className="space-y-1.5">
      <p className="tnum text-sm font-semibold leading-tight">{row.totalLabel}</p>
      {row.totalTzsLabel ? (
        <p className="tnum text-xs leading-tight text-muted-foreground">{row.totalTzsLabel}</p>
      ) : null}
      {canConfirm ? (
        /* Both presses on one line, at the size of the row they sit in. */
        <div className="flex flex-nowrap items-center justify-end gap-1.5">
          {/* The same dialog the container lists open: the rate, what it is
              multiplied by, and what the bill will come to. */}
          <RowPriceEditor
            cargoId={row.cargoId}
            reference={row.reference}
            currency="USD"
            standardRate={row.standardRate === null ? null : Number(row.standardRate)}
            agreedRate={row.agreed && row.rate !== null ? Number(row.rate) : null}
            bookBasis={row.bookBasis}
            basis={row.basis}
            cbm={row.billableCbm === null ? null : Number(row.billableCbm)}
            weightKg={row.weightKg === null ? null : Number(row.weightKg)}
            units={row.units === null ? null : Number(row.units)}
            rateNeeded={false}
            freight={Number(row.freight)}
            extra={Number(row.extra)}
            discount={Number(row.discountOff)}
            vatPercent={vatPercent}
            locale={locale}
          />
          <form action={action}>
            <input type="hidden" name="scope" value="china" />
            <input type="hidden" name="cargoIds" value={row.cargoId} />
            <SubmitButton
              size="sm"
              className="h-7 whitespace-nowrap px-2.5 text-xs [&_svg]:size-3.5"
              pendingLabel={tx("Confirming…")}
            >
              <BadgeCheck />
              {tx("Confirm")}
            </SubmitButton>
          </form>
        </div>
      ) : null}
      <FormMessage error={state.error} ok={state.ok} />
    </div>
  );
}

/**
 * The type the rate book prices on, changed where the mistake is noticed.
 *
 * Foshan types what it sees on the carton and a blender booked as a bicycle
 * is priced as one. The select saves the moment it is changed and the row's
 * figure is worked out again from the book — the same action the container
 * lists use.
 */
export function CargoTypeOnRow({
  cargoId,
  reference,
  current,
  cargoTypes,
}: {
  cargoId: string;
  reference: string;
  current: string;
  cargoTypes: string[];
}) {
  const tx = useT();
  const [state, action] = useActionState<PriceListState, FormData>(setPriceListCargoType, {});
  const formRef = useRef<HTMLFormElement>(null);
  const options = current && !cargoTypes.includes(current) ? [current, ...cargoTypes] : cargoTypes;

  return (
    <form ref={formRef} action={action} className="space-y-1">
      <input type="hidden" name="cargoId" value={cargoId} />
      <NativeSelect
        key={current}
        name="cargoType"
        defaultValue={current}
        aria-label={`${tx("Cargo type for")} ${reference}`}
        className={cn("h-7 w-full min-w-28 max-w-40 text-xs", !current && "border-warning text-warning")}
        onChange={(event) => {
          if (event.currentTarget.value) formRef.current?.requestSubmit();
        }}
      >
        {!current ? <option value="">{tx("Choose a type…")}</option> : null}
        {options.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </NativeSelect>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

/** One press for everything the book has already priced on this floor. */
export function ConfirmAllPrices({ waiting }: { waiting: number }) {
  const tx = useT();
  const [state, action] = useActionState<PriceListState, FormData>(confirmPrices, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="scope" value="china" />
      <SubmitButton
        size="sm"
        className="h-8 whitespace-nowrap px-3 text-xs [&_svg]:size-3.5"
        pendingLabel={tx("Confirming…")}
      >
        <BadgeCheck />
        {tx("Confirm all")} {waiting} {waiting === 1 ? tx("price") : tx("prices")}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
