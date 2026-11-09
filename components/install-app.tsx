"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, EllipsisVertical, Menu, Share, Smartphone, SquarePlus, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Registers the service worker, which is what lets a phone offer "Install
 * app" and open BlueWave Cargo full screen from the home screen. It caches
 * nothing; see public/sw.js.
 */
export function InstallApp() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

/*
  USE IT AS AN APP.

  A website in a browser tab always keeps the browser's own bars, and no page
  can hide them; the only full-screen version is the one put on the home
  screen. So a phone that has not done that gets a small sheet saying how, in
  the words of the browser it is actually using: one tap on Android, three
  steps on an iPhone. It opens by itself on the sign-in page, the staff app and
  the customer portal, on every visit until the app is installed (closing it
  hides it for that visit only), and any time from the sign-in page and the
  person's menu. Nothing shows once it is installed, and never on a computer.
*/

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** Set by the small script in the page head (app/layout.tsx), which hears Chrome's install offer before this file has loaded. */
    __scInstall?: InstallEvent | null;
  }
}

// Chrome on Android fires this once, early; kept here so any part of the page can use it later.
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.__scInstall = null;
    listeners.forEach((f) => f());
  });
  window.addEventListener("sc-install-ready", () => {
    deferred = deferred ?? window.__scInstall ?? null;
    listeners.forEach((f) => f());
  });
  deferred = window.__scInstall ?? null;
}

/* Remembered for this visit only: closing the pop-up hides it until the phone opens BlueWave again. */
const SEEN = "bw.installSeen";

/**
 * Which phone browser this is, because the way to the home screen differs:
 * Safari's Share sheet, Chrome's ⋮ menu (Pixel and most Android phones),
 * Samsung Internet's and Huawei's ☰ menu at the bottom, and WeChat or
 * WhatsApp, whose own browser cannot add anything to the home screen at all
 * (Foshan opens links in WeChat, Dar in WhatsApp).
 */
type Browser = "safari" | "ios-other" | "chrome" | "samsung" | "huawei" | "android-other" | "in-app";

function browserOf(ua: string, ios: boolean): Browser {
  if (/MicroMessenger|WhatsApp|FBAN|FBAV|Instagram|Line\/|Telegram|musical_ly|BytedanceWebview/i.test(ua)) return "in-app";
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "safari";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/HuaweiBrowser|HBPC|HarmonyOS|OpenHarmony|ArkWeb/i.test(ua)) return "huawei";
  /* Real Chrome only: its user agent ends "Chrome/… Mobile Safari/…". Browsers
     built on it add their own token after that (Edge, Opera, Xiaomi, Oppo,
     Vivo…) and an app's built-in view says "; wv)": those get the general steps. */
  if (/Chrome\/[\d.]+ (?:Mobile )?Safari\/[\d.]+$/.test(ua) && !/; wv\)|Version\/4\.0/.test(ua)) return "chrome";
  return "android-other";
}

export function useInstall() {
  const [state, setState] = useState({
    ready: false,
    phone: false,
    installed: false,
    ios: false,
    browser: "chrome" as Browser,
    canPrompt: false,
  });
  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const phone = window.matchMedia("(max-width: 1023px)").matches && window.matchMedia("(pointer: coarse)").matches;
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState({
        ready: true,
        phone,
        installed: standalone,
        ios,
        browser: browserOf(navigator.userAgent, ios),
        canPrompt: !!deferred,
      });
    };
    check();
    listeners.add(check);
    return () => void listeners.delete(check);
  }, []);
  const install = useCallback(async () => {
    if (!deferred) return false;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      window.__scInstall = null;
      listeners.forEach((f) => f());
      return outcome === "accepted";
    } catch {
      // an offer can be used once; a second tap falls back to the steps
      return false;
    }
  }, []);
  return { ...state, install };
}

function Step({ n, icon: Icon, children }: { n: number; icon?: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 rounded-lg bg-secondary px-2.5 py-2 text-[12.5px] leading-snug">
      <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
    </li>
  );
}

/** A small card in the middle of the screen, over a dimmed page; Escape, the X or a tap outside closes it.
    Kept small on purpose: it is a hint, not a page (owner, 9 Nov 2026). */
function Sheet({ onClose, dark, labelId, children }: { onClose: () => void; dark: boolean; labelId: string; children: React.ReactNode }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);
  return createPortal(
    /* The page behind scrolls the card, so a phone held sideways can still reach its X and its last button. */
    <div
      className={cn("fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-black/60 backdrop-blur-[2px]", dark && "dark")}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="grid min-h-full place-items-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="relative w-full max-w-[19rem] rounded-2xl border bg-card p-4 text-card-foreground shadow-lg"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function InstallSheet({ open, onClose, dark = false }: { open: boolean; onClose: () => void; dark?: boolean }) {
  const t = useT();
  const labelId = useId();
  const { ios, browser, canPrompt, install } = useInstall();
  if (!open) return null;
  return (
    <Sheet onClose={onClose} dark={dark} labelId={labelId}>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("Close")}
        className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      <div className="flex items-center gap-2.5 pr-6">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#0a1a33] text-white">
          <Smartphone className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 id={labelId} className="text-[15px] font-semibold leading-tight">
            {t("Use it like an app")}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{t("Full screen, no browser bar, its own icon.")}</p>
        </div>
      </div>

      {/* One tap where the browser offers it (Chrome and the browsers built on it, on
          Android). An iPhone never can — Apple lets only Safari's own Share sheet add
          an app — so it always gets the steps. */}
      {canPrompt && !ios ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-10 text-[13px]"
            onClick={async () => {
              if (await install()) onClose();
            }}
          >
            <Download />
            {t("Install the app")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-[13px]" onClick={onClose}>
            {t("Not now")}
          </Button>
        </div>
      ) : (
        <>
          <ol className="mt-3 space-y-1.5">
            {browser === "in-app" ? (
              <>
                <Step n={1} icon={EllipsisVertical}>
                  {t("Tap ··· at the top right, then Open in browser.")}
                </Step>
                <Step n={2}>
                  {ios
                    ? t("In Safari, sign in and tap Get the full-screen app again.")
                    : t("In the browser, sign in and tap Get the full-screen app again.")}
                </Step>
              </>
            ) : ios ? (
              <>
                <Step n={1} icon={Share}>
                  {browser === "safari" ? t("Tap Share (newer iPhones: tap ··· first).") : t("Tap Share in the address bar or the menu.")}
                </Step>
                <Step n={2} icon={SquarePlus}>
                  {t("Tap Add to Home Screen.")}
                </Step>
                <Step n={3}>{t("Tap Add, then open it from your home screen.")}</Step>
              </>
            ) : browser === "samsung" ? (
              <>
                <Step n={1} icon={Menu}>
                  {t("Tap the menu at the bottom right.")}
                </Step>
                <Step n={2}>{t("Tap Add page to, then Home screen.")}</Step>
                <Step n={3}>{t("Open BlueWave Cargo from your home screen.")}</Step>
              </>
            ) : browser === "huawei" ? (
              <>
                <Step n={1} icon={Menu}>
                  {t("Tap the menu at the bottom of the browser.")}
                </Step>
                <Step n={2}>{t("Tap Add to home screen (it may be under Add to).")}</Step>
                <Step n={3}>{t("Open BlueWave Cargo from your home screen.")}</Step>
              </>
            ) : (
              <>
                <Step n={1} icon={browser === "chrome" ? EllipsisVertical : Menu}>
                  {browser === "chrome" ? t("Open the browser menu at the top right.") : t("Open the browser menu.")}
                </Step>
                <Step n={2}>{t("Tap Install app or Add to Home screen.")}</Step>
                <Step n={3}>{t("Open BlueWave Cargo from your home screen.")}</Step>
              </>
            )}
          </ol>
          {browser !== "in-app" ? (
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {ios ? t("In WhatsApp or WeChat? Open it in Safari first.") : t("In WhatsApp or WeChat? Open it in Chrome first.")}
            </p>
          ) : null}
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full text-[13px]" onClick={onClose}>
            {t("Got it")}
          </Button>
        </>
      )}
    </Sheet>
  );
}

/**
 * Opens by itself a moment after a phone's browser opens BlueWave, on every
 * visit until the app is installed; closing it is remembered for that visit
 * only. Never once installed, never on a computer.
 */
export function InstallPrompt({ dark = false }: { dark?: boolean }) {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !phone || installed) return;
    try {
      if (window.sessionStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, [ready, phone, installed]);
  const close = () => {
    setOpen(false);
    try {
      window.sessionStorage.setItem(SEEN, "1");
    } catch {
      /* a private window simply asks again next time */
    }
  };
  return <InstallSheet open={open} onClose={close} dark={dark} />;
}

/** A button that opens the sheet. Draws nothing on a computer or once the app is installed; `render` lets the caller style it. */
export function InstallButton({ render, dark = false }: { render: (open: () => void) => React.ReactNode; dark?: boolean }) {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  if (!ready || !phone || installed) return null;
  return (
    <>
      {render(() => setOpen(true))}
      <InstallSheet open={open} onClose={() => setOpen(false)} dark={dark} />
    </>
  );
}
