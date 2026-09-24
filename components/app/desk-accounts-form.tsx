"use client";

import { useActionState } from "react";
import { Users } from "lucide-react";

import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDeskAccounts, type ActionState } from "@/lib/actions/users";

/** One press: a login for Manager, Support, China, Dar and Finance. */
export function DeskAccountsForm() {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(createDeskAccounts, {});
  return (
    <form action={action} className="space-y-3 rounded-xl border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2 font-semibold">
        <Users className="size-4" /> {tx("Department logins")}
      </div>
      <p className="text-sm text-muted-foreground">
        {tx("One login each for Manager, Support, China, Dar and Finance —")}{" "}
        <span className="font-mono text-xs">manager@</span>, <span className="font-mono text-xs">support@</span>,{" "}
        <span className="font-mono text-xs">china@</span>, <span className="font-mono text-xs">dar@</span>,{" "}
        <span className="font-mono text-xs">finance@bluewavecargo.co.tz</span>{" "}
        {tx("— all with the password below.")}
      </p>
      <div className="space-y-2">
        <Label htmlFor="desk-password">{tx("Password for all of them")}</Label>
        <Input id="desk-password" name="password" type="text" minLength={8} required autoComplete="off" />
      </div>
      <FormMessage {...state} />
      <SubmitButton className="w-full">{tx("Create department logins")}</SubmitButton>
    </form>
  );
}
