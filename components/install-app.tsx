"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, EllipsisVertical, Share, Smartphone, SquarePlus } from "lucide-react";

import { Modal } from "@/components/app/modal";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";

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

  A website open in a browser tab always keeps the browser's address bar, and
  no page can hide it; the only way to a full-screen app is putting the site on
  the home screen. So a phone that has not done that yet gets a small sheet
  showing how: one tap on Android, three steps on an iPhone. It opens by itself
  once after sign-in, and any time from the sign-in page and the person's menu.
  Nothing shows once the app is installed.
*/

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Android Chrome fires this once, early; it is kept so any part of the page can use it later.
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

export function useInstall() {
  const [state, setState] = useState({ ready: false, phone: false, installed: false, ios: false, canPrompt: false });
  useEffect(() => {
    const check = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const phone = window.matchMedia("(max-width: 1023px)").matches && window.matchMedia("(pointer: coarse)").matches;
      const ios =
        /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setState({ ready: true, phone, installed: standalone, ios, canPrompt: !!deferred });
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

const STEP = "flex items-start gap-3 rounded-xl bg-secondary px-3 py-2.5 text-[13px] leading-snug";
const NUM = "grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-brand-foreground";
const INLINE = "mx-0.5 inline size-3.5 -translate-y-px";

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { ios, canPrompt, install } = useInstall();
  if (!open) return null;
  return (
    <Modal title={t("Use it like an app")} onClose={onClose}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0a1a33] text-[#40c0e8]">
          <Smartphone className="size-5" />
        </span>
        <p className="text-[13px] text-muted-foreground">{t("Full screen, no browser bar, its own icon.")}</p>
      </div>

      {canPrompt ? (
        <div className="flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button
            type="button"
            onClick={async () => {
              if (await install()) onClose();
            }}
          >
            <Download /> {t("Install the app")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("Not now")}
          </Button>
        </div>
      ) : (
        <div className="pb-[env(safe-area-inset-bottom)]">
          <ol className="space-y-2">
            {ios ? (
              <>
                <li className={STEP}>
                  <span className={NUM}>1</span>
                  <span>
                    {t("Tap the")} <Share className={INLINE} /> <b>{t("Share")}</b> {t("button in Safari.")}
                  </span>
                </li>
                <li className={STEP}>
                  <span className={NUM}>2</span>
                  <span>
                    {t("Scroll down and tap")} <SquarePlus className={INLINE} /> <b>{t("Add to Home Screen")}</b>.
                  </span>
                </li>
              </>
            ) : (
              <>
                <li className={STEP}>
                  <span className={NUM}>1</span>
                  <span>
                    {t("Open the browser menu")} <EllipsisVertical className={INLINE} /> {t("at the top right.")}
                  </span>
                </li>
                <li className={STEP}>
                  <span className={NUM}>2</span>
                  <span>
                    {t("Tap")} <b>{t("Install app")}</b> {t("or")} <b>{t("Add to Home screen")}</b>.
                  </span>
                </li>
              </>
            )}
            <li className={STEP}>
              <span className={NUM}>3</span>
              <span>
                {t("Open")} <b>BlueWave Cargo</b> {t("from your home screen.")}
              </span>
            </li>
          </ol>
          {ios ? (
            <p className="mt-3 text-[12px] text-muted-foreground">
              {t("If this page opened inside WhatsApp or another app, open it in Safari first.")}
            </p>
          ) : null}
          <Button type="button" variant="outline" className="mt-4 w-full" onClick={onClose}>
            {t("Got it")}
          </Button>
        </div>
      )}
    </Modal>
  );
}

/** Opens by itself once, a moment after a phone's browser opens the app (never when it is already installed); closing it is remembered. */
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
