"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { normaliseCode } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * THE TRACKING FIELD.
 *
 * One input and one button, in three sizes: tucked into the header, on the
 * dark menu, and large on the tracking console. The code is tidied the way the
 * server reads it (spaces out, capitals) before the page is opened; what
 * counts as a reference is still decided on the server, in lib/tracking.ts.
 */
export function TrackField({
  compact = false,
  dark = false,
  large = false,
  value,
  autoFocus = false,
  id: idProp,
}: {
  compact?: boolean;
  dark?: boolean;
  large?: boolean;
  value?: string;
  autoFocus?: boolean;
  /** Needed only when two fields of the same size can be on one screen. */
  id?: string;
}) {
  const router = useRouter();
  /* A fixed id per size rather than useId: the header renders in the layout
     and its generated id did not always match between server and browser. */
  const id = idProp ?? (compact ? "bw-track-header" : large ? "bw-track-main" : dark ? "bw-track-dark" : "bw-track");
  const [code, setCode] = useState(value ?? "");
  const [pending, start] = useTransition();

  return (
    <form
      role="search"
      aria-label="Track your cargo"
      onSubmit={(e) => {
        e.preventDefault();
        const clean = normaliseCode(code);
        if (!clean || pending) return;
        start(() => router.push(`/track/${encodeURIComponent(clean)}`));
      }}
      className={cn(
        "flex w-full items-stretch rounded-[2px]",
        dark ? "bg-white/[0.06] ring-1 ring-white/20 focus-within:ring-bw-coral-bright" : "bg-bw-panel ring-1 ring-bw-line focus-within:ring-bw-fg",
        large ? "h-16" : compact ? "h-11" : "h-12"
      )}
    >
      <label htmlFor={id} className="sr-only">
        Cargo reference
      </label>
      {!compact ? (
        <span
          aria-hidden
          className={cn(
            "bw-mono hidden shrink-0 items-center border-r pl-4 pr-3 text-[0.65rem] uppercase tracking-[0.18em] sm:flex",
            dark ? "border-white/15 text-white/50" : "border-bw-line text-bw-muted"
          )}
        >
          Ref
        </span>
      ) : null}
      <input
        id={id}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={compact ? "Track · BW0125" : "BW0125"}
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        required
        autoFocus={autoFocus}
        enterKeyHint="search"
        className={cn(
          "bw-mono min-w-0 flex-1 bg-transparent px-3.5 uppercase tracking-[0.08em] outline-none placeholder:normal-case placeholder:tracking-normal",
          dark ? "text-white placeholder:text-white/40" : "text-bw-fg placeholder:text-bw-muted/70",
          large ? "text-xl sm:text-2xl" : compact ? "text-sm" : "text-base"
        )}
      />
      <button
        type="submit"
        disabled={pending}
        aria-label="Track"
        className={cn(
          "inline-flex shrink-0 items-center justify-center gap-2 rounded-r-[2px] bg-bw-coral font-bw-display font-semibold uppercase tracking-[0.06em] text-white transition-colors hover:bg-bw-coral-dark disabled:opacity-70",
          large ? "px-4 text-lg sm:px-8 sm:text-xl" : compact ? "w-11" : "px-5 text-base"
        )}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : compact ? null : <span>Track</span>}
        {!pending ? <ArrowRight className="size-4" aria-hidden /> : null}
      </button>
    </form>
  );
}
