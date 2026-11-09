"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, Download, EllipsisVertical, Menu, Share, SquarePlus, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
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

/* A step is one whole sentence, so it translates as one; the words to look for
   on the phone's own screen are marked **like this** and set in white. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 ? (
          <b key={i} className="font-medium text-white">
            {part}
          </b>
        ) : (
          part
        )
      )}
    </>
  );
}

function Step({ n, icon: Icon, text }: { n: number; icon?: typeof Share; text: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5 text-[13px] leading-snug text-white/65">
      <span className="w-2.5 shrink-0 text-center font-mono text-[11px] text-[#40c0e8]">{n}</span>
      <span className="min-w-0 flex-1">
        <Rich text={text} />
      </span>
      {Icon ? <Icon className="size-3.5 shrink-0 text-white/30" /> : null}
    </li>
  );
}

function stepsFor(browser: Browser, ios: boolean, t: (s: string) => string) {
  if (browser === "in-app") {
    return [
      <Step key={1} n={1} icon={EllipsisVertical} text={t("Tap the menu at the top, then **Open in browser**.")} />,
      <Step
        key={2}
        n={2}
        text={
          ios
            ? t("In **Safari**, open this page and tap **Get the full-screen app**.")
            : t("Open this page again in the browser and tap **Get the full-screen app**.")
        }
      />,
    ];
  }
  if (ios) {
    return [
      <Step
        key={1}
        n={1}
        icon={Share}
        text={browser === "safari" ? t("Tap **Share** (bottom bar, or **···**).") : t("Tap **Share** in the address bar or menu.")}
      />,
      <Step key={2} n={2} icon={SquarePlus} text={t("Tap **Add to Home Screen**.")} />,
      <Step key={3} n={3} text={t("Tap **Add**, then open **BlueWave**.")} />,
    ];
  }
  if (browser === "samsung") {
    return [
      <Step key={1} n={1} icon={Menu} text={t("Tap the menu at the **bottom right**.")} />,
      <Step key={2} n={2} text={t("Tap **Add page to**, then **Home screen**.")} />,
      <Step key={3} n={3} text={t("Open **BlueWave** from your home screen.")} />,
    ];
  }
  if (browser === "huawei") {
    return [
      <Step key={1} n={1} icon={Menu} text={t("Tap the menu at the **bottom** of the browser.")} />,
      <Step key={2} n={2} text={t("Tap **Add to home screen** (it may sit under **Add to**).")} />,
      <Step key={3} n={3} text={t("Open **BlueWave** from your home screen.")} />,
    ];
  }
  return [
    <Step
      key={1}
      n={1}
      icon={browser === "chrome" ? EllipsisVertical : Menu}
      text={browser === "chrome" ? t("Open the menu at the **top right**.") : t("Open the browser menu.")}
    />,
    <Step key={2} n={2} text={t("Tap **Install app** or **Add to Home screen**.")} />,
    <Step key={3} n={3} text={t("Open **BlueWave** from your home screen.")} />,
  ];
}

/*
  A quiet card that belongs to the page (owner, 9 Nov 2026, as on ZELab): it
  sits low, in the dark sea above the phone's toolbar, and leaves the logo, the
  Sign in button and the scene alone; the dim behind it is barely there; the
  card is see-through navy, blurring what is under it rather than covering it.
  Only a title and the steps. The X, a tap outside or Escape closes it.
  Portalled to the body: the app's glass panels would otherwise hold it inside them.
*/
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const labelId = useId();
  const { ios, browser, canPrompt, install } = useInstall();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open || typeof document === "undefined") return null;

  const oneTap = canPrompt && !ios;
  // On an iPhone in Safari a small arrow points at the real Share button.
  const hint = ios && browser === "safari";

  return createPortal(
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "fixed inset-0 z-[60] flex items-end justify-center bg-black/15 p-5",
        hint ? "pb-[calc(max(0.5rem,env(safe-area-inset-bottom))+5.75rem)]" : "pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))]"
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="w-full max-w-[17.5rem] rounded-2xl border border-white/[0.09] bg-[#06142b]/55 px-4 pb-1.5 pt-3.5 text-white shadow-[0_18px_44px_-22px_rgba(0,0,0,0.75)] backdrop-blur-2xl backdrop-saturate-150"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={labelId} className="text-[14px] font-medium tracking-tight">
            {t("Use it like an app")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Close")}
            className="-mr-1.5 grid size-7 shrink-0 place-items-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white/80"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* One tap where the browser offers it (Chrome and the browsers built on it,
            on Android). An iPhone never can — Apple lets only Safari's own Share
            sheet add an app — so it always gets the steps. */}
        {oneTap ? (
          <div className="mb-1.5 mt-3 flex flex-col items-stretch">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white/10 text-[13px] font-medium ring-1 ring-inset ring-white/15 transition hover:bg-white/15"
              onClick={async () => {
                if (await install()) onClose();
              }}
            >
              <Download className="size-3.5" />
              {t("Install the app")}
            </button>
            <button type="button" className="h-8 text-[12px] text-white/45 transition hover:text-white/75" onClick={onClose}>
              {t("Not now")}
            </button>
          </div>
        ) : (
          <ol className="mt-1.5 divide-y divide-white/[0.06]">{stepsFor(browser, ios, t)}</ol>
        )}
      </div>

      {/* An iPhone has no one-tap install, so the next best thing: a small arrow
          bounces over the toolbar where Share actually is. */}
      {hint ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+2.4rem)] z-[61] flex justify-center"
        >
          <span className="flex animate-bounce flex-col items-center gap-0.5 text-[10px] font-medium text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] motion-reduce:animate-none">
            {t("Share")}
            <ArrowDown className="size-3.5 text-[#40c0e8]" />
          </span>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

/**
 * Opens by itself a moment after a phone's browser opens BlueWave, on every
 * visit until the app is installed; closing it is remembered for that visit
 * only. Never once installed, never on a computer.
 */
export function InstallPrompt() {
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
  return <InstallSheet open={open} onClose={close} />;
}

/** A button that opens the sheet. Draws nothing on a computer or once the app is installed; `render` lets the caller style it. */
export function InstallButton({ render }: { render: (open: () => void) => React.ReactNode }) {
  const { ready, phone, installed } = useInstall();
  const [open, setOpen] = useState(false);
  if (!ready || !phone || installed) return null;
  return (
    <>
      {render(() => setOpen(true))}
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
