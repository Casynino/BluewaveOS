import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { bwFontVars } from "@/components/bw/fonts";
import { Lockup } from "@/components/bw/lockup";
import { Label } from "@/components/bw/ui";
import { PHOTOS, type PhotoName } from "@/components/site/photos";

/**
 * THE DOOR INTO AN ACCOUNT.
 *
 * Sign-in and registration sit outside the public layout, so they set the
 * `.bw` scope and its type themselves. Split in two: a night panel with a
 * photograph and what the account is for, and the form on concrete. On a phone
 * the panel folds into a short band over the form — the form is what somebody
 * came for.
 */
export function AuthPanel({
  photo,
  label,
  title,
  points,
  note,
  children,
}: {
  photo: PhotoName;
  label: string;
  title: React.ReactNode;
  points: string[];
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  const picture = PHOTOS[photo];
  return (
    <div className={`bw ${bwFontVars} flex min-h-dvh flex-col lg:grid lg:grid-cols-12`}>
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-bw-panel focus:px-4 focus:py-2 focus:text-bw-fg"
      >
        Skip to the form
      </a>

      <header className="relative isolate overflow-hidden bg-bw-night text-white lg:col-span-5 lg:min-h-dvh xl:col-span-6">
        <Image
          src={picture.src}
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 50vw, 100vw"
          className="bw-photo -z-30 object-cover opacity-40 lg:opacity-55"
        />
        <div aria-hidden className="absolute inset-0 -z-20 bg-bw-night/70" />
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />

        <div className="flex h-full flex-col px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8 lg:px-12 lg:pb-12 lg:pt-10">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" aria-label="BlueWave Cargo — home" className="shrink-0">
              <Lockup dark />
            </Link>
            <Link
              href="/"
              className="bw-mono inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.14em] text-white/70 hover:text-white"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              <span>
                Back<span className="hidden sm:inline"> to the website</span>
              </span>
            </Link>
          </div>

          <div className="mt-6 lg:mt-auto">
            <Label className="text-white/70">{label}</Label>
            <p className="bw-display mt-3 text-[clamp(1.9rem,4.4vw,4.4rem)] uppercase lg:mt-5">{title}</p>
            <ul className="mt-8 hidden border-t border-white/15 lg:block">
              {points.map((point, i) => (
                <li key={point} className="flex items-baseline gap-4 border-b border-white/15 py-3">
                  <span className="bw-mono text-xs text-bw-cyan">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-lg text-white/85">{point}</span>
                </li>
              ))}
            </ul>
            {note ? <p className="mt-4 text-sm text-white/70 lg:mt-6">{note}</p> : null}
          </div>
        </div>
      </header>

      <main
        id="auth-form"
        className="flex flex-1 items-start justify-center bg-bw-ground px-4 py-10 sm:px-8 sm:py-14 lg:col-span-7 lg:items-center lg:px-12 xl:col-span-6"
      >
        <div className="w-full max-w-md">
          <div className="rounded-[2px] border border-bw-line bg-bw-panel p-5 sm:p-8 [&_button]:rounded-[2px] [&_input]:rounded-[2px]">
            {children}
          </div>
          <p className="bw-mono mt-5 text-center text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">
            China → Tanzania · Sea cargo
          </p>
        </div>
      </main>
    </div>
  );
}
