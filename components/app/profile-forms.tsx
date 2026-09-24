"use client";

import { useActionState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  changeMyPassword,
  updateMyProfile,
  type ProfileState,
} from "@/lib/actions/profile";
import { LOCALES, LOCALE_LABELS, localeOf } from "@/lib/locale";

import { useT } from "@/components/app/locale-provider";
export function PersonalDetailsForm({
  name,
  phone,
  locale,
}: {
  name: string;
  phone: string | null;
  locale: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ProfileState, FormData>(
    updateMyProfile,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{tx("Your name")}</Label>
          <Input id="name" name="name" defaultValue={name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">{tx("Phone")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            defaultValue={phone ?? ""}
            placeholder="+255 7…"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="locale">{tx("Language")}</Label>
        {/* The languages the screens are actually written in, each named in its
            own — the list is read by somebody who cannot currently read the
            interface. A third option would save a choice the next screen
            quietly ignores, and the sidebar switch would refuse it anyway. */}
        <NativeSelect id="locale" name="locale" defaultValue={localeOf(locale)}>
          {LOCALES.map((option) => (
            <option key={option} value={option}>
              {LOCALE_LABELS[option]}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs text-muted-foreground">
          {tx("It changes what every screen says, and nothing about what you may do.")}
        </p>
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>{tx("Save changes")}</SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const tx = useT();
  const [state, action] = useActionState<ProfileState, FormData>(
    changeMyPassword,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="current">{tx("Current password")}</Label>
        <PasswordInput
          id="current"
          name="current"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="next">{tx("New password")}</Label>
          <PasswordInput
            id="next"
            name="next"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">{tx("New password again")}</Label>
          <PasswordInput
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {tx("At least ten characters. Nobody in the office can read your password — if you forget it, an administrator sets a new one.")}
      </p>
      <FormMessage error={state.error} ok={state.ok} />
      <SubmitButton>{tx("Change password")}</SubmitButton>
    </form>
  );
}
