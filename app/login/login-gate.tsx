"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Smartphone, X } from "lucide-react";

import { InstallButton, InstallPrompt } from "@/components/install-app";
import { AuthSwitch, AuthSwitchContext, type AuthView } from "@/components/site/auth-switch";
import { PortalAccess } from "@/components/site/portal-access";
import { cn } from "@/lib/utils";

/**
 * On a phone the sign-in page is the scene with TWO buttons, Sign in and Create
 * account (owner, 10 Nov 2026), and each opens its own small, plain card over
 * the sea (Escape, the X or a tap outside closes it). Create account asks for
 * the phone number first: somebody already on our books is greeted by their
 * first name and only adds an email and a password; a new number makes a full
 * account. From `md` up the sign-in card stays on the page (`md:contents` makes
 * this wrapper invisible there) and Create account goes to its own page.
 * A notice the person must read — their sign-in ended, their account was
 * closed — opens the sign-in card straight away.
 */
export function LoginGate({ children, defaultOpen = false }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [view, setView] = useState<AuthView | null>(defaultOpen ? "signin" : null);
  /* bumped on every switch, so Create account always starts again at the phone number */
  const [round, setRound] = useState(0);
  const show = useCallback((next: AuthView) => {
    setView(next);
    setRound((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!view) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setView(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const overlay = (open: boolean) =>
    open
      ? "max-md:fixed max-md:inset-0 max-md:z-50 max-md:flex max-md:items-start max-md:justify-center max-md:overflow-y-auto max-md:bg-[#030812]/35 max-md:p-5 max-md:pt-[max(12vh,calc(env(safe-area-inset-top)+1rem))] max-md:backdrop-blur-[2px]"
      : "max-md:hidden";
  const shut = (e: React.MouseEvent) => e.target === e.currentTarget && setView(null);

  const close = (
    <button
      type="button"
      onClick={() => setView(null)}
      aria-label="Close"
      className="absolute right-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-full text-white/40 transition-colors hover:bg-white/10 hover:text-white/80 md:hidden"
    >
      <X className="size-4" />
    </button>
  );

  return (
    <AuthSwitchContext.Provider value={show}>
      <div className="ls-up flex flex-wrap items-center justify-center gap-2.5 md:hidden" style={{ "--rd": "0.5s" } as React.CSSProperties}>
        <button
          type="button"
          onClick={() => show("signin")}
          className="inline-flex h-11 items-center gap-1.5 rounded-full bg-[#40c0e8] px-5 text-[14.5px] font-semibold text-[#06142b] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition hover:brightness-105 active:scale-[0.98]"
        >
          Sign in
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => show("create")}
          className="inline-flex h-11 items-center rounded-full border border-white/20 bg-white/[0.06] px-5 text-[14.5px] font-medium text-white backdrop-blur transition hover:bg-white/10 active:scale-[0.98]"
        >
          Create account
        </button>
      </div>
      {/* On a phone that has not installed BlueWave, the install card opens by itself a moment after the page does. */}
      <InstallPrompt />
      <InstallButton
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

      {/* Sign in: a pop-up on a phone, the card on the page from md up */}
      <div className={cn("md:contents", overlay(view === "signin"))} onClick={shut}>
        <div className={cn("relative w-full max-w-sm max-md:max-w-[20rem]", view === "signin" && "ls-pop md:animate-none")}>
          {children}
          {view === "signin" ? close : null}
        </div>
      </div>

      {/* Create account: phones only (a computer goes to its own page) */}
      {view === "create" ? (
        <div className={cn("md:hidden", overlay(true))} onClick={shut}>
          <div key={round} className="ls-pop relative w-full max-w-[20rem]">
            <div className="ls-card dark w-full p-5 text-left text-foreground">
              <PortalAccess mode="register" title="Create account" intro="Start with your phone number. If you have shipped with us, we will find you." />
              <p className="mt-4 text-[12.5px] text-white/50">
                Have an account?{" "}
                <AuthSwitch to="signin" href="/login" className="font-medium text-[#7fd8f5] underline-offset-4 hover:underline">
                  Sign in
                </AuthSwitch>
              </p>
            </div>
            {close}
          </div>
        </div>
      ) : null}
    </AuthSwitchContext.Provider>
  );
}
