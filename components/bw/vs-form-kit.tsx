"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight, Check, CheckCircle2, Copy, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  THE VISIT AND SOURCING FORMS' KIT.

  The public site's voice on a form: mono capitals for the section lines,
  square hairline controls, checkboxes as chips a thumb can hit. The text
  controls are the shared ones (components/ui) so the two forms type the same
  as the pickup and quote forms beside them; only the chips and the frame are
  drawn here.
*/

export type PublicRequestState = { error?: string; ok?: string; reference?: string; statusHref?: string };

/**
 * Submits by hand rather than through `<form action>`: React clears an action
 * form once the action returns, and a visitor told "enter a phone number we
 * can call" should not find the twenty other answers wiped with it. The same
 * reasoning as the shared request forms (components/site/request-forms.tsx).
 * A double tap before React re-renders is still one submission.
 */
export function usePublicSubmit(
  action: (state: PublicRequestState, formData: FormData) => Promise<PublicRequestState>
) {
  const [state, dispatch, pending] = useActionState<PublicRequestState, FormData>(action, {});
  const [, startTransition] = useTransition();
  const busy = useRef(false);
  useEffect(() => {
    busy.current = false;
  }, [state]);

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || busy.current) return;
    busy.current = true;
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  };

  return { state, pending, onSubmit };
}

/** The field only a script fills in. A person never sees it. */
export function VsTrap() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

/** The sections of a form, hairlines between them. */
export function VsSections({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-bw-line [&>*+*]:pt-8 [&>*]:pb-8 [&>*:last-child]:pb-0">{children}</div>;
}

/** A run of questions under a numbered manifest line. */
export function VsSection({
  index,
  title,
  lead,
  children,
}: {
  index: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="bw-label text-bw-muted">
        <span className="text-bw-harbour dark:text-bw-cyan">{index}</span>
        <span aria-hidden>/</span>
        {title}
      </legend>
      {lead ? <p className="mt-2 max-w-2xl text-sm text-bw-muted">{lead}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </fieldset>
  );
}

export function VsField({
  id,
  label,
  optional = false,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-bw-fg">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-bw-muted">(optional)</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-bw-muted">{hint}</p> : null}
    </div>
  );
}

/** A heading over a run of chips, when a group needs one. */
export function VsGroupTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <p className="bw-mono flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.16em] text-bw-muted">
      {children}
      {count !== undefined ? <span className="text-bw-muted/70">· {count}</span> : null}
    </p>
  );
}

export type VsOption = { value: string; label: string; sub?: string | null };

/** Checkboxes as square chips — big enough for a thumb, clear when ticked. */
export function VsChecks({
  name,
  options,
  selected = [],
  className,
}: {
  name: string;
  options: VsOption[];
  selected?: string[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {options.map((option) => (
        <VsCheck
          key={option.value}
          name={name}
          value={option.value}
          label={option.label}
          sub={option.sub}
          defaultChecked={selected.includes(option.value)}
        />
      ))}
    </div>
  );
}

export function VsCheck({
  name,
  value,
  label,
  sub,
  defaultChecked,
  className,
}: {
  name: string;
  value?: string;
  label: React.ReactNode;
  sub?: React.ReactNode;
  defaultChecked?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group relative flex min-h-12 cursor-pointer items-start gap-3 rounded-[2px] border border-bw-line bg-bw-panel px-3 py-2.5 text-sm text-bw-fg transition-colors",
        "hover:border-bw-fg/40 has-[:checked]:border-bw-coral has-[:checked]:bg-bw-coral/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bw-coral",
        className
      )}
    >
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[1px] border border-bw-fg/40 text-white peer-checked:border-bw-coral peer-checked:bg-bw-coral [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className="block font-medium leading-snug">{label}</span>
        {sub ? <span className="mt-0.5 block text-xs text-bw-muted">{sub}</span> : null}
      </span>
    </label>
  );
}

export function VsError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-[2px] border border-bw-coral/40 bg-bw-coral/[0.07] px-4 py-3 text-sm text-bw-fg">
      <span className="bw-mono mr-2 text-[0.68rem] uppercase tracking-[0.16em] text-bw-coral">Check</span>
      {message}
    </p>
  );
}

export function VsSubmit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="group inline-flex h-14 w-full items-center justify-between gap-6 rounded-[2px] bg-bw-coral px-6 font-bw-display text-lg font-semibold uppercase tracking-[0.06em] text-white transition-colors hover:bg-bw-coral-dark disabled:cursor-wait disabled:opacity-70 sm:w-auto"
    >
      <span>{pending ? "Sending…" : children}</span>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
      )}
    </button>
  );
}

/**
 * What a visitor sees once the request is in: their reference, what it is
 * (a request, never a booking) and the one link that opens its status.
 */
export function VsSent({
  state,
  kind,
  children,
}: {
  state: PublicRequestState;
  kind: "visit" | "sourcing";
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const href = state.statusHref;

  const copy = async () => {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* No clipboard (an old browser, an insecure origin): the link is on screen to press and keep. */
    }
  };

  return (
    <div role="status" className="rounded-[2px] border border-bw-line bg-bw-panel p-6 sm:p-8">
      <p className="bw-label text-bw-muted">{kind === "visit" ? "Visit request received" : "Sourcing request received"}</p>
      <div className="mt-5 flex items-start gap-4">
        <CheckCircle2 className="mt-1 size-7 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <div className="min-w-0">
          {state.reference ? (
            <>
              <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-bw-muted">Your reference</p>
              <p className="bw-display mt-1 break-all text-5xl uppercase text-bw-fg sm:text-6xl">{state.reference}</p>
            </>
          ) : (
            <p className="text-lg font-medium text-bw-fg">{state.ok}</p>
          )}
        </div>
      </div>

      <div className="mt-6 border-l-2 border-bw-coral pl-4">
        <p className="font-semibold text-bw-fg">
          {kind === "visit" ? "This is a request, not a booking." : "This is a request, not an order or a price."}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-bw-muted">
          {kind === "visit"
            ? "Somebody from the team will call or WhatsApp you to talk it through. Nothing is arranged until the status page says Confirmed, with the plan written under it."
            : "The sourcing team will call or WhatsApp you. Any supplier, price or sample is agreed with you first — nothing is bought on your behalf from this form."}
        </p>
      </div>

      {href ? (
        <div className="mt-6 rounded-[2px] bg-bw-ground p-4 sm:p-5">
          <p className="text-sm font-semibold text-bw-fg">Keep this link — it is the only way to open your status page.</p>
          <p className="mt-1 text-xs text-bw-muted">
            Your reference alone does not open it. Save the link, bookmark the page or send it to yourself on WhatsApp.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={href}
              className="group inline-flex h-12 items-center gap-4 rounded-[2px] bg-bw-ink px-5 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-white hover:bg-bw-deep dark:bg-white dark:text-bw-ink dark:hover:bg-bw-concrete"
            >
              Open my status page
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={copy}
              className="inline-flex h-12 items-center gap-2 rounded-[2px] border border-bw-fg/25 px-5 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-bw-fg hover:border-bw-fg hover:bg-bw-panel"
            >
              {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Link copied" : "Copy the link"}
            </button>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
