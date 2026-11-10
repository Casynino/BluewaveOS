"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { AuthSwitch } from "@/components/site/auth-switch";
import { RegisterForm } from "@/components/site/register-form";
import { TzPhoneInput } from "@/components/tz-phone-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  activateAccount,
  checkPhone,
  resetCustomerPassword,
  type ActivateState,
  type PhoneStep,
  type ResetState,
} from "@/lib/actions/customer-access";

const link = "font-medium text-[#7fd8f5] underline-offset-4 hover:underline";
const field = "space-y-1.5";
const label = "text-[13px]";

/**
 * PHONE FIRST. The number says which of four things this person is:
 * on the books with no login yet (activate), already has a login (sign in, or
 * reset), not on the books (register as new), or — in reset mode — somebody who
 * forgot their password. Kept short (owner, 10 Nov 2026): one line of words per
 * step, and somebody we know is greeted by their first name.
 */
export function PortalAccess({ mode, title, intro }: { mode: "register" | "reset"; title: string; intro: string }) {
  const [phone, check] = useActionState<PhoneStep, FormData>(checkPhone, {});

  /* One title per step: the page's own on the first, then the greeting takes its place. */
  if (!phone.step) {
    return (
      <form action={check} className="space-y-3">
        <Greeting title={title} body={intro} />
        <div className={field}>
          <Label htmlFor="phone" className={label}>Phone number</Label>
          <TzPhoneInput id="phone" name="phone" required autoFocus quiet />
        </div>
        <FormMessage error={phone.error} />
        <SubmitButton className="w-full" pendingLabel="Checking…">
          Continue
        </SubmitButton>
      </form>
    );
  }

  const hello = phone.firstName ? `Welcome back, ${phone.firstName}` : "Welcome back";

  if (mode === "reset") {
    if (phone.step === "login") return <ResetForm phone={phone.phone!} hello={hello} />;
    return (
      <Notice
        title={phone.step === "activate" ? hello : "We could not find that number"}
        body={phone.step === "activate" ? "Your account is not open yet. Open it with your email and a password." : "You can open a new account with it."}
        action={<Link href="/register" className={link}>{phone.step === "activate" ? "Open my account" : "Open an account"}</Link>}
      />
    );
  }

  if (phone.step === "login") {
    return (
      <Notice
        title={hello}
        body="You already have an account."
        action={
          <span className="flex flex-wrap gap-x-5 gap-y-1.5">
            <AuthSwitch to="signin" href="/login" className={link}>Sign in</AuthSwitch>
            <Link href="/register?mode=reset" className="text-white/60 underline-offset-4 hover:text-white hover:underline">Forgot password?</Link>
          </span>
        }
      />
    );
  }

  if (phone.step === "activate") return <ActivateForm phone={phone.phone!} hello={hello} />;

  return (
    <div className="space-y-3">
      <Greeting title="Let's create your account" />
      <RegisterForm initialPhone={phone.phone} />
    </div>
  );
}

/** The step's title and one quiet line under it. */
function Greeting({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-1">
      <h1 className="text-[17px] font-semibold tracking-tight text-white">{title}</h1>
      {body ? <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{body}</p> : null}
    </div>
  );
}

function Notice({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <Greeting title={title} body={body} />
      <div className="text-[13px]">{action}</div>
    </div>
  );
}

function ActivateForm({ phone, hello }: { phone: string; hello: string }) {
  const [state, action] = useActionState<ActivateState, FormData>(activateAccount, {});
  return (
    <form action={action} className="space-y-3">
      <Greeting title={hello} body="Add your email and a password to open your account." />
      <input type="hidden" name="phone" value={phone} />
      <div className={field}>
        <Label htmlFor="email" className={label}>Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" autoFocus />
      </div>
      <div className={field}>
        <Label htmlFor="password" className={label}>Password</Label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className={field}>
        <Label htmlFor="confirmPassword" className={label}>Confirm password</Label>
        <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Opening…">
        Open my account
      </SubmitButton>
      <p className="text-[12.5px] text-white/60">
        Not you?{" "}
        <AuthSwitch to="create" href="/register" className={link}>Start again</AuthSwitch>
      </p>
    </form>
  );
}

function ResetForm({ phone, hello }: { phone: string; hello: string }) {
  const [state, action] = useActionState<ResetState, FormData>(resetCustomerPassword, {});
  return (
    <form action={action} className="space-y-3">
      <Greeting title={hello} body="Ask our office for a 6-digit code, then choose a new password." />
      <input type="hidden" name="phone" value={phone} />
      <div className={field}>
        <Label htmlFor="code" className={label}>Code from our office</Label>
        <Input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" placeholder="6 digits" className="tracking-[0.4em]" />
      </div>
      <div className={field}>
        <Label htmlFor="password" className={label}>New password</Label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className={field}>
        <Label htmlFor="confirmPassword" className={label}>Confirm password</Label>
        <PasswordInput id="confirmPassword" name="confirmPassword" required minLength={8} autoComplete="new-password" />
      </div>
      <FormMessage error={state.error} />
      <SubmitButton className="w-full" pendingLabel="Saving…">
        Set new password
      </SubmitButton>
    </form>
  );
}
