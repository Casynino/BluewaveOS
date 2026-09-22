"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { deleteCustomer, type ActionState } from "@/lib/actions/customers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/app/locale-provider";

/**
 * Delete, behind a second step and a reason. The button alone does nothing —
 * a customer removed by a stray tap is one the counter can no longer find.
 */
export function DeleteCustomer({ customerId, name }: { customerId: string; name: string }) {
  const tx = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(deleteCustomer, {});

  useEffect(() => {
    if (state.ok) router.push("/app/customers");
  }, [state.ok, router]);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="text-destructive hover:text-destructive">
        <Trash2 />
        {tx("Delete")}
      </Button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:w-96">
      <input type="hidden" name="customerId" value={customerId} />
      <p className="text-sm font-medium">
        {tx("Delete")} {name}?
      </p>
      <p className="text-xs text-muted-foreground">
        {tx("They leave the customer lists and cannot sign in. Their bills and cargo history are kept, and the owner can restore them from Deleted records.")}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">{tx("Reason")}</Label>
        <Input id="delete-reason" name="reason" required minLength={3} autoFocus placeholder={tx("e.g. duplicate of CUS-000012")} />
      </div>
      <FormMessage error={state.error} />
      <div className="flex gap-2">
        <SubmitButton variant="destructive" pendingLabel={tx("Deleting…")}>
          {tx("Delete customer")}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
