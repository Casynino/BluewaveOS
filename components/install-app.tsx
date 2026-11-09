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
  steps on an iPhone. It opens by itself once after sign-in, and any time from
  the sign-in page and the person's menu. Nothing shows once it is installed.
*/

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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
    listeners.forEach((f) => f());
  });
}

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
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    listeners.forEach((f) => f());
    return outcome === "accepted";
  }, []);
  return { ...state, install };
}

function Step({ n, icon: Icon, children }: { n: number; icon?: typeof Share; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 text-[13px] leading-snug">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
    </li>
  );
}

/** A small card in the middle of the screen, over a dimmed page; Escape, the X or a tap outside closes it. */
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
          className="relative w-full max-w-sm rounded-2xl border bg-card p-5 text-card-foreground shadow-lg"
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
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0a1a33] text-white">
          <Smartphone className="size-5" />
        </span>
        <div>
          <h2 id={labelId} className="text-base font-semibold">
            {t("Use it like an app")}
          </h2>
          <p className="text-[13px] text-muted-foreground">{t("Full screen, no browser bar, its own icon.")}</p>
        </div>
      </div>

      {canPrompt ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button
            type="button"
            onClick={async () => {
              if (await install()) onClose();
            }}
          >
            <Download />
            {t("Install the app")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Not now")}
          </Button>
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-2">
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
                  {browser === "safari"
                    ? t("Tap Share in Safari (on a newer iPhone, tap ··· first).")
                    : t("Tap Share in the address bar or the menu.")}
                </Step>
                <Step n={2} icon={SquarePlus}>
                  {t("Tap Add to Home Screen (scroll down or tap View More if you do not see it).")}
                </Step>
                <Step n={3}>{t("Tap Add, then open BlueWave Cargo from your home screen.")}</Step>
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
            <p className="mt-3 text-[12px] text-muted-foreground">
              {ios
                ? t("If this page opened inside WeChat or WhatsApp, open it in Safari first.")
                : t("If this page opened inside WeChat or WhatsApp, open it in Chrome first.")}
            </p>
          ) : null}
          <Button type="button" variant="outline" className="mt-4 w-full" onClick={onClose}>
            {t("Got it")}
          </Button>
        </>
      )}
    </Sheet>
  );
}

/** Opens by itself once, a moment after a phone's browser opens the app (never when it is installed); closing it is remembered. */
export function InstallPrompt() {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!ready || !phone || installed) return;
    try {
      if (window.localStorage.getItem(SEEN)) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 2500);
    return () => window.clearTimeout(timer);
  }, [ready, phone, installed]);
  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(SEEN, "1");
    } catch {
      /* a private window simply asks again next time */
    }
  };
  return <InstallSheet open={open} onClose={close} />;
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
