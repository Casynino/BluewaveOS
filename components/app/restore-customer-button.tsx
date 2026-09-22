"use client";

import { useActionState } from "react";
import { RotateCcw } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { restoreCustomer, type RestoreState } from "@/lib/actions/deleted-records";

/** Puts a deleted customer back, from the deleted-records screen. */
export function RestoreCustomerButton({ customerId, name }: { customerId: string; name: string }) {
  const [state, action] = useActionState<RestoreState, FormData>(restoreCustomer, {});
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="customerId" value={customerId} />
      <SubmitButton variant="outline" size="sm" pendingLabel="Restoring…">
        <RotateCcw />
        Restore {name}
      </SubmitButton>
      <FormMessage error={state.error} ok={state.ok} />
    </form>
  );
}
