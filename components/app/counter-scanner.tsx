"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard, Loader2, ScanLine } from "lucide-react";

import { openScan, type OpenScanState } from "@/lib/actions/scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tm } from "@/components/app/tx";

/**
 * THE CAMERA, WHERE THERE IS ONE, AND THE KEYBOARD ALWAYS.
 *
 * The phones on the Dar counter run Chrome on Android, which carries a barcode
 * reader in the browser itself. Using it costs nothing to download and cannot
 * go stale; the alternative is half a megabyte of decoder shipped to every
 * screen in the system for one card on one page.
 *
 * SAFARI ON IOS HAS NO SUCH READER. That is not a thing to paper over with a
 * button that opens a camera and then stares at the label forever — a clerk
 * pointing a phone at a sticker while a customer waits has no way of telling a
 * broken decoder from a bad angle. Where the browser cannot read a code, the
 * card says so in one line and the typed box, which is always there, is the way
 * through. Every iPhone can read a QR from its own Camera app and paste it in.
 *
 * The camera is asked for only when somebody presses the button, and let go of
 * the moment a code is read or the screen is left. A permission that is refused
 * is a sentence, not a dead button.
 */
type Support = "unknown" | "yes" | "no-detector" | "no-camera";

export function CounterScanner({ autoFocus = true }: { autoFocus?: boolean }) {
  const tx = useT();
  const router = useRouter();

  const [support, setSupport] = useState<Support>("unknown");
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);

  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Guards the window between a code being read and the route changing: the
     detector keeps firing on frames already in flight, and without this the
     same sticker is submitted three or four times. */
  const claimed = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setLive(false);
  }, []);

  /* Whatever happens — a code read, a back button, a tab closed — the camera
     light goes out. A stream left running is a phone that stays warm in
     somebody's pocket and a red dot the customer can see. */
  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.BarcodeDetector) return setSupport("no-detector");
    if (!navigator.mediaDevices?.getUserMedia) return setSupport("no-camera");
    setSupport("yes");
  }, []);

  const send = useCallback(
    async (value: string) => {
      setBusy(true);
      setMessage(null);
      const form = new FormData();
      form.set("code", value);
      let state: OpenScanState;
      try {
        state = await openScan({}, form);
      } catch {
        setBusy(false);
        claimed.current = false;
        setMessage("That did not reach the server. Try again.");
        return;
      }
      if (state.href) {
        setReading(state.read ?? value);
        router.push(state.href);
        return;
      }
      setBusy(false);
      claimed.current = false;
      setMessage(state.error ?? "That code found nothing.");
    },
    [router]
  );

  const start = useCallback(async () => {
    if (support !== "yes" || !window.BarcodeDetector) return;
    setMessage(null);
    claimed.current = false;

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        /* The back camera on a phone, the only one on a counter's stand. */
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setMessage(
        name === "NotAllowedError"
          ? "The camera is blocked for this site. Allow it in the browser, or type the code below."
          : name === "NotFoundError"
            ? "This device has no camera the browser can use. Type the code below."
            : "The camera did not start. Type the code below."
      );
      return;
    }

    stream.current = media;
    setLive(true);
    /* setLive draws the <video>; the element does not exist until React has
       flushed, so the stream is attached on the next frame rather than onto a
       ref that is still null. */
    requestAnimationFrame(async () => {
      const el = video.current;
      if (!el) return stop();
      el.srcObject = media;
      try {
        await el.play();
      } catch {
        /* Autoplay refused on a muted inline stream is rare and recoverable;
           the frames still arrive, so this is not worth stopping for. */
      }

      const detector = new window.BarcodeDetector!({ formats: ["qr_code"] });
      timer.current = setInterval(async () => {
        if (claimed.current || !video.current || video.current.readyState < 2) return;
        let found: { rawValue: string }[];
        try {
          found = await detector.detect(video.current);
        } catch {
          return;
        }
        const value = found[0]?.rawValue?.trim();
        if (!value) return;
        claimed.current = true;
        if ("vibrate" in navigator) navigator.vibrate?.(60);
        stop();
        void send(value);
        /* 250ms is about four looks a second — fast enough that a clerk never
           notices waiting, cheap enough that an old phone does not heat up. */
      }, 250);
    });
  }, [support, send, stop]);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed bg-secondary/40",
          live && "border-solid border-brand bg-black"
        )}
      >
        {live ? (
          <>
            <video
              ref={video}
              muted
              playsInline
              className="absolute inset-0 size-full object-cover"
            />
            {/* Where to hold the sticker. A box drawn on the picture is the
                only instruction anybody reads at a counter. */}
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="size-48 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
          </>
        ) : (
          <div className="px-6 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
              {support === "no-detector" || support === "no-camera" ? (
                <Keyboard className="size-7" />
              ) : (
                <Camera className="size-7" />
              )}
            </span>
            <p className="mt-4 text-sm text-muted-foreground">
              {support === "no-detector"
                ? tx("This browser cannot read a code from its camera — on an iPhone, scan the QR with the Camera app and paste it below.")
                : support === "no-camera"
                  ? tx("This device has no camera the browser can use. Type or paste the code below.")
                  : tx("Point the back camera at the QR on the box or on the pickup note.")}
            </p>
          </div>
        )}
      </div>

      {support === "yes" ? (
        <Button
          type="button"
          size="lg"
          variant={live ? "outline" : "default"}
          className="h-14 w-full text-base"
          onClick={() => (live ? stop() : void start())}
          disabled={busy}
        >
          {live ? <CameraOff /> : <Camera />}
          {live ? tx("Stop camera") : tx("Start camera")}
        </Button>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = code.trim();
          if (!value || busy) return;
          claimed.current = true;
          void send(value);
        }}
        className="space-y-2"
      >
        <label htmlFor="counter-code" className="block text-sm font-medium">
          {tx("Or type / paste the code")}
        </label>
        <div className="flex gap-2">
          <Input
            id="counter-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus={autoFocus && support !== "yes"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={tx("Code, tracking number, mark, name or phone")}
            className="h-14 text-base"
          />
          <Button type="submit" size="lg" className="h-14 px-6 text-base" disabled={busy || !code.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <ScanLine />}
            {tx("Use")}
          </Button>
        </div>
      </form>

      {reading ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-800 dark:text-emerald-200">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          {tx("Opening")} <span className="tnum">{reading}</span>
        </p>
      ) : null}

      {message ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-medium text-amber-900 dark:text-amber-200">
          <Tm>{message}</Tm>
        </p>
      ) : null}
    </div>
  );
}
