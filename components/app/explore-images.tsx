"use client";

import { useActionState, useState } from "react";
import { Check as CheckIcon, Copy } from "lucide-react";

import { CopyField } from "@/components/app/copy-field";
import { Panel } from "@/components/app/explore-fields";
import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import { uploadContentImage, type ContentState } from "@/lib/actions/explore-content";

/**
 * Pictures for the guide: upload one, or take one already on the site.
 *
 * Either way the result is a path, copied and pasted into an image or gallery
 * field on a city, market or factory. Uploading here and nowhere else keeps
 * one picture one file, however many pages it is used on.
 */
export function ExploreImages({ photos }: { photos: string[] }) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(uploadContentImage, {});

  return (
    <Panel
      title="Images"
      hint="Every image field in the guide takes a path. Upload a picture or copy one from the library, then paste the path into an image or gallery field (one path per line in a gallery)."
    >
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
            className="max-w-sm"
            aria-label={t("Choose an image")}
          />
          <SubmitButton pendingLabel={t("Uploading…")}>{t("Upload image")}</SubmitButton>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Use real photos where you can. A photo that only shows the kind of place must be marked illustrative on the factory.")}
        </p>
        <FormMessage error={state.error} ok={state.ok} />
        {state.url ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.url} alt="" className="h-16 w-24 shrink-0 rounded-md border object-cover" />
            <div className="min-w-0 flex-1">
              <CopyField value={state.url} label={t("image path")} />
            </div>
          </div>
        ) : null}
      </form>

      <div className="mt-6 border-t pt-4">
        <p className="text-xs font-medium">{t("Photo library")}</p>
        <p className="text-xs text-muted-foreground">
          {t("Photos already on the website. Copy a path to use one.")}
        </p>
        {photos.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("No photos in the library.")}</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((path) => (
              <LibraryPhoto key={path} path={path} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function LibraryPhoto({ path }: { path: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <li className="overflow-hidden rounded-lg border bg-background">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={path} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(path);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* The path stays on screen to select by hand. */
          }
        }}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-secondary"
        aria-label={`${t("Copy")} ${path}`}
      >
        <code className="min-w-0 flex-1 truncate text-xs">{path}</code>
        {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5 text-muted-foreground" />}
      </button>
    </li>
  );
}
