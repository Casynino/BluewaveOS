"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Smartphone, X } from "lucide-react";

import { InstallButton, InstallPrompt } from "@/components/install-app";
import { cn } from "@/lib/utils";

/**
 * On a phone the sign-in form does not cover the scene: the page shows the
 * logo, the sea and ONE "Sign in" button, and pressing it opens the form as a
 * small pop-up (Escape, the X or a tap outside closes it). From `md` up the
 * card simply stays on the page (`md:contents` makes this wrapper invisible
 * there). A notice the person must read — their sign-in ended, their account
 * was closed — opens the pop-up straight away.
 */
export function LoginGate({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ls-up inline-flex h-11 items-center gap-2 rounded-full bg-[#40c0e8] px-8 text-[15px] font-semibold text-[#06142b] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition hover:brightness-105 active:scale-[0.98] md:hidden"
        style={{ "--rd": "0.5s" } as React.CSSProperties}
      >
        Sign in
        <ArrowRight className="size-4" />
      </button>
      {/* A browser tab always keeps its address bar; the installed app is full screen. Only phones that have not installed it see this. */}
      {/* On a phone that has not installed BlueWave, the pop-up opens by itself a moment after the page does. */}
      <InstallPrompt dark />
      <InstallButton
        dark
        render={(openSheet) => (
          <button
            type="button"
            onClick={openSheet}
            className="ls-up mt-4 inline-flex items-center gap-1.5 text-[13px] text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline md:hidden"
            style={{ "--rd": "0.7s" } as React.CSSProperties}
          >
            <Smartphone className="size-3.5" />
            Get the full-screen app
          </button>
        )}
      />

      <div
        className={cn(
          "md:contents",
          open
            ? "max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:items-start max-md:justify-center max-md:overflow-y-auto max-md:bg-[#030812]/65 max-md:p-5 max-md:pt-[max(14vh,calc(env(safe-area-inset-top)+1rem))] max-md:backdrop-blur-[3px]"
            : "max-md:hidden"
        )}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      >
        <div className={cn("relative w-full max-w-sm", open && "ls-pop md:animate-none")}>
          {children}
          {open ? (
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white md:hidden"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
