"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/*
  THE PIECES EVERY CHINA-GUIDE FORM IS BUILT FROM.

  Images are paths, never uploads inside the form: a picture is uploaded once
  on the overview (or taken from the library) and its path pasted wherever it
  is wanted, so one photo can serve a city and three markets without being
  stored three times. The preview beside the field is what makes a mistyped
  path visible before it is saved.
*/

/** The same check the server applies: a library photo or a stored upload. */
export const IMAGE_PATH = /^\/(photos|uploads)\/[\w./-]+$/;

/** The datalist every image field offers, filled from public/photos. */
export const PHOTO_LIST_ID = "explore-photo-library";

export function PhotoLibraryList({ photos }: { photos: string[] }) {
  return (
    <datalist id={PHOTO_LIST_ID}>
      {photos.map((p) => (
        <option key={p} value={p} />
      ))}
    </datalist>
  );
}

export function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="font-semibold">{t(title)}</h2>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{t(hint)}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  optional,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label htmlFor={id} className="text-xs">
        {t(label)}
        {optional ? (
          <span className="font-normal text-muted-foreground"> {t("optional")}</span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{t(hint)}</p> : null}
    </div>
  );
}

/** A labelled checkbox; the server reads a ticked box as "on". */
export function Check({
  name,
  value,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  value?: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  const t = useT();
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0"
      />
      <span>
        {t(label)}
        {hint ? <span className="block text-xs text-muted-foreground">{t(hint)}</span> : null}
      </span>
    </label>
  );
}

function Thumb({ src, className }: { src: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!IMAGE_PATH.test(src) || broken) {
    return (
      <span
        className={`grid place-items-center rounded-md border border-dashed bg-secondary/50 text-muted-foreground ${className ?? ""}`}
      >
        <ImageOff className="size-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={`rounded-md border object-cover ${className ?? ""}`}
    />
  );
}

/** One image path, with the picture it points at. */
export function ImagePathField({
  id,
  name,
  label,
  hint,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  defaultValue?: string | null;
}) {
  const t = useT();
  const [value, setValue] = useState(defaultValue ?? "");
  const path = value.trim();
  return (
    <Field
      id={id}
      label={label}
      optional
      hint={hint ?? "Pick from the photo library or paste an uploaded image path, e.g. /photos/cn-shenzhen.jpg."}
    >
      <div className="flex items-start gap-3">
        <Input
          id={id}
          name={name}
          list={PHOTO_LIST_ID}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          placeholder="/photos/…"
          autoComplete="off"
          className="flex-1"
        />
        {path ? <Thumb key={path} src={path} className="h-16 w-24 shrink-0" /> : null}
      </div>
      {path && !IMAGE_PATH.test(path) ? (
        <p className="text-xs text-destructive">{t("This is not an image path. It must start with /photos/ or /uploads/.")}</p>
      ) : null}
    </Field>
  );
}

/** Several image paths, one per line, each shown. */
export function GalleryField({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string[];
}) {
  const t = useT();
  const [value, setValue] = useState((defaultValue ?? []).join("\n"));
  const paths = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const bad = paths.filter((p) => !IMAGE_PATH.test(p));
  return (
    <Field id={id} label={label} optional hint="One image path per line.">
      <Textarea
        id={id}
        name={name}
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={"/photos/cn-wholesale-hall.jpg\n/photos/cn-market-street.jpg"}
        className="font-mono text-xs"
      />
      {paths.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {paths.map((p, i) => (
            <Thumb key={`${i}-${p}`} src={p} className="h-14 w-20" />
          ))}
        </div>
      ) : null}
      {bad.length > 0 ? (
        <p className="text-xs text-destructive">
          {t("These lines are not image paths:")} {bad.join(", ")}
        </p>
      ) : null}
    </Field>
  );
}

/** Small preview for list rows. */
export function RowThumb({ src }: { src: string | null | undefined }) {
  return <Thumb src={src ?? ""} className="h-14 w-20 shrink-0" />;
}
