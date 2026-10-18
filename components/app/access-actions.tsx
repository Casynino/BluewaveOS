"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { Trash2, UserRoundX, UserRoundCheck } from "lucide-react";

import { deleteAccount, reactivateAccount, suspendAccount, type AccessState } from "@/lib/actions/developer";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";

/**
 * SUSPEND AND DELETE: ONE PRESS, ONE PLAIN QUESTION, CONFIRM OR CANCEL.
 *
 * By the owner's decision nothing is typed — the pop-up says what will happen
 * and the confirm button does it. The rules that matter (never yourself, never
 * the last owner) are the server's, and its answer shows here.
 */
function ConfirmAccount({
  trigger,
  title,
  body,
  confirmLabel,
  pendingLabel,
  userId,
  run,
}: {
  trigger: React.ReactNode;
  title: string;
  body: string;
  confirmLabel: string;
  pendingLabel: string;
  userId: string;
  run: (prev: AccessState, data: FormData) => Promise<AccessState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<AccessState, FormData>(run, {});
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="contents">
        {trigger}
      </button>
      {state.ok ? <span className="text-xs text-success">{state.ok}</span> : null}
      {open ? (
        <Modal title={title} onClose={close} className="max-w-md">
          <p className="text-sm text-muted-foreground">{body}</p>
          <form action={action} className="space-y-3">
            <input type="hidden" name="userId" value={userId} />
            <FormMessage error={state.error} />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={close}>
                Cancel
              </Button>
              <SubmitButton size="sm" variant="destructive" pendingLabel={pendingLabel}>
                {confirmLabel}
              </SubmitButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

export function SuspendForm({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmAccount
      userId={userId}
      run={suspendAccount}
      title={`Suspend ${name}?`}
      body="They are signed out and cannot sign in until the account is re-activated."
      confirmLabel="Confirm"
      pendingLabel="Suspending…"
      trigger={
        <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">
          <UserRoundX className="size-4" />
          Suspend
        </span>
      }
    />
  );
}

export function ReactivateForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(reactivateAccount, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      {state.error ? <span className="text-xs text-destructive">{state.error}</span> : null}
      <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-secondary disabled:opacity-50">
        <UserRoundCheck className="size-4" />
        Re-activate
      </button>
    </form>
  );
}

export function DeleteForm({ userId, name }: { userId: string; name: string }) {
  return (
    <ConfirmAccount
      userId={userId}
      run={deleteAccount}
      title={`Delete ${name}'s account?`}
      body="They can no longer sign in, and the account is removed. Everything they recorded stays, with their name on it."
      confirmLabel="Confirm"
      pendingLabel="Deleting…"
      trigger={
        <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
          <Trash2 className="size-4" />
          Delete
        </span>
      }
    />
  );
}
