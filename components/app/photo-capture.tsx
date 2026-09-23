"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PHOTOGRAPH THE BOXES.
 *
 * Built for a phone at the counter: one button opens the camera, one opens the
 * gallery (a photo already taken, or one from the supplier's WeChat). Both are
 * the phone's own pickers — the camera app is better at taking a picture than
 * any page could be — and everything chosen lands in one list with thumbnails.
 *
 * THE PHOTOS LIVE HERE, NOT IN THE FILE INPUT. A file input forgets: choosing
 * again replaces what it held, and React clears it after every submit, including
 * one the server refused, while the thumbnails stayed on screen promising photos
 * no longer on the form. Every file is kept in this list and written back into
 * the one input the form posts whenever that input loses them.
 *
 * "EXPECTED", NOT A RED ASTERISK. Nothing here blocks a save — a clerk with a
 * flat battery still has to be able to record the cargo — so the prompt asks
 * plainly instead of threatening. A label reading Required over a form that
 * saves without one teaches a floor that this app's labels are decorative.
 */
type Shot = { id: string; url: string; sizeMb: string };

export function PhotoCapture({
  name = "photos",
  required = false,
  max,
  label = "Cargo photos",
  hint,
}: {
  name?: string;
  required?: boolean;
  /** A cap where the form has one; unlimited where it does not. */
  max?: number;
  label?: string;
  hint?: string;
}) {
  const t = useT();
  const posted = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const held = useRef<{ id: string; file: File }[]>([]);
  const [shots, setShots] = useState<Shot[]>([]);

  const sync = () => {
    const input = posted.current;
    if (!input) return;
    const carrier = new DataTransfer();
    for (const { file } of held.current) carrier.items.add(file);
    input.files = carrier.files;
  };

  useEffect(() => {
    const form = posted.current?.form;
    if (!form) return;
    const restore = () => setTimeout(sync, 0);
    form.addEventListener("reset", restore);
    return () => form.removeEventListener("reset", restore);
  }, []);

  const add = (input: HTMLInputElement | null) => {
    if (!input?.files) return;
    const room = max === undefined ? Infinity : max - held.current.length;
    for (const file of Array.from(input.files).slice(0, Math.max(0, room))) {
      const id = `${Date.now()}-${held.current.length}-${file.name}`;
      held.current = [...held.current, { id, file }];
      setShots((list) => [
        ...list,
        { id, url: URL.createObjectURL(file), sizeMb: (file.size / 1024 / 1024).toFixed(1) },
      ]);
    }
    /* Emptied so the same picture can be chosen again after removing it. */
    input.value = "";
    sync();
  };

  const drop = (id: string) => {
    held.current = held.current.filter((entry) => entry.id !== id);
    sync();
    setShots((list) => list.filter((shot) => shot.id !== id));
  };

  const full = max !== undefined && shots.length >= max;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {t(label)}
          {required ? (
            <span className="ml-1.5 rounded bg-signal/10 px-1.5 py-0.5 text-[11px] font-semibold text-signal">
              {t("expected")}
            </span>
          ) : null}
        </p>
        <p className="tnum text-xs text-muted-foreground">
          {max === undefined ? shots.length : `${shots.length} / ${max}`}
        </p>
      </div>

      {hint ? <p className="text-xs text-muted-foreground">{t(hint)}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          disabled={full}
          onClick={() => camera.current?.click()}
        >
          <Camera className="mr-2 h-4 w-4" />
          {t("Take photo")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus className="mr-2 h-4 w-4" />
          {t("Choose file")}
        </Button>
      </div>

      {shots.length === 0 ? (
        <div
          className={cn(
            "rounded-lg border border-dashed p-6 text-center",
            required ? "border-signal/40 bg-signal/5" : "bg-muted/20"
          )}
        >
          <Camera className="mx-auto h-6 w-6 text-muted-foreground/60" />
          <p className="mt-2 text-sm font-medium">
            {required ? t("Please add a photo") : t("No photos yet")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Photograph the cargo as it sits, before it is packed.")}
          </p>
          {required ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("You can still save without one — but a photo now settles any argument later.")}
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {shots.map((shot, index) => (
            <li key={shot.id} className="group relative">
              {/* Object URLs are local blobs; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={shot.url}
                alt={`${t("Cargo photo")} ${index + 1}`}
                className="aspect-square w-full rounded-lg border object-cover"
              />
              <button
                type="button"
                onClick={() => drop(shot.id)}
                className="focus-ring absolute right-1.5 top-1.5 rounded-md bg-background/90 p-1.5 text-destructive opacity-0 shadow-soft transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`${t("Remove photo")} ${index + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <p className="tnum mt-1 truncate text-xs text-muted-foreground">
                {shot.sizeMb} MB
              </p>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => add(event.currentTarget)}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => add(event.currentTarget)}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />
      <input ref={posted} name={name} type="file" multiple className="hidden" aria-hidden tabIndex={-1} />
    </div>
  );
}
