"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Keyboard } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Camera QR scanner with a manual fallback.
 *
 * The fallback is not a nicety: warehouse phones lose camera permission, labels
 * get scuffed, and cheap handsets focus badly. Staff must always be able to
 * finish the job by typing the code, so the manual field is never hidden away.
 *
 * THE READER IS THE BROWSER'S OWN. Chrome on Android carries a barcode reader;
 * using it costs nothing to download and cannot go stale. Safari on iOS has
 * none, and that is not a thing to paper over with a button that opens a camera
 * and then stares at the label forever — where the browser cannot read a code
 * the card says so in one line, and every iPhone can read a QR from its own
 * Camera app and paste it into the box below.
 */
type Support = "unknown" | "yes" | "no-detector" | "no-camera";

export function QrScanner({
  onResult,
  label = "Scan the QR code",
  placeholder,
  busy = false,
}: {
  onResult: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** The caller is away resolving the last code; do not send a second one. */
  busy?: boolean;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /* Guards the window between a code being read and the caller answering: the
     detector keeps firing on frames already in flight, and without this the
     same sticker is submitted three or four times. */
  const claimed = useRef(false);

  const [support, setSupport] = useState<Support>("unknown");
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
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

  const start = useCallback(async () => {
    if (support !== "yes" || !window.BarcodeDetector) return;
    setError(null);
    claimed.current = false;

    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({
        /* The back camera on a phone, the only one on a counter's stand. */
        video: { facingMode: { ideal: "environment" } },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setError(
        name === "NotAllowedError"
          ? t("The camera is blocked for this site. Allow it in the browser, or type the code below.")
          : name === "NotFoundError"
            ? t("This device has no camera the browser can use. Type the code below.")
            : t("The camera did not start. Type the code below.")
      );
      return;
    }

    stream.current = media;
    setActive(true);
    /* setActive draws the <video>; the element does not exist until React has
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
        onResult(value);
        /* 250ms is about four looks a second — fast enough that a clerk never
           notices waiting, cheap enough that an old phone does not heat up. */
      }, 250);
    });
  }, [support, onResult, stop, t]);

  const use = () => {
    const value = manual.trim();
    if (!value || busy) return;
    setManual("");
    onResult(value);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border bg-black/90">
        <video
          ref={video}
          className="aspect-[4/3] w-full object-cover"
          muted
          playsInline
        />
        {!active ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted p-6 text-center">
            {support === "no-detector" || support === "no-camera" ? (
              <Keyboard className="h-8 w-8 text-muted-foreground/60" />
            ) : (
              <Camera className="h-8 w-8 text-muted-foreground/60" />
            )}
            <p className="px-6 text-sm text-muted-foreground">
              {support === "no-detector"
                ? t("This browser cannot read a code from its camera — on an iPhone, scan the QR with the Camera app and paste it below.")
                : support === "no-camera"
                  ? t("This device has no camera the browser can use. Type or paste the code below.")
                  : t(label)}
            </p>
            {/* Tapped for every consignment, all day, on a phone held in one
                hand — 36px was too small for the control this screen turns on. */}
            {support === "yes" ? (
              <Button type="button" className="h-11" onClick={() => void start()}>
                {t("Start camera")}
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="pointer-events-none absolute inset-x-8 inset-y-10 rounded-lg border-2 border-white/70" />
            <div className="pointer-events-none absolute inset-x-8 top-10 h-0.5 animate-scan-line bg-signal/80" />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-3 right-3"
              onClick={stop}
            >
              <CameraOff className="mr-1.5 h-4 w-4" />
              {t("Stop")}
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="manual-code"
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <Keyboard className="h-3.5 w-3.5" />
          {t("Or type / paste the code")}
        </label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={placeholder ?? t("Paste the code from the sticker")}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="font-mono text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                use();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={use}>
            {t("Use")}
          </Button>
        </div>
      </div>
    </div>
  );
}
