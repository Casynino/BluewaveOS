import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";

import { bwFontVars } from "@/components/bw/fonts";
import { Lockup } from "@/components/bw/lockup";
import { BwSky } from "@/components/bw/sky";
import { PHOTOS, type PhotoName } from "@/components/site/photos";

/**
 * THE DOOR INTO AN ACCOUNT.
 *
 * Sign-in and registration open on one scene, like the front page: the port at
 * night, the website's sky of trade lanes drawn over it, and the form on a
 * glass card in front — somebody signing in should feel they have arrived
 * somewhere, not been handed a form. The headline and what the account is for
 * sit beside it on a wide screen; on a phone the form comes first, because
 * that is what somebody came for.
 *
 * The card is always drawn dark, whatever theme the reader has chosen,
 * because it always sits on the dark photograph. These pages live outside the
 * public layout, so they set the `.bw` scope and its type themselves.
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
    <div className={`bw dark ${bwFontVars} relative isolate min-h-dvh overflow-hidden bg-bw-night text-white`}>
      <a
        href="#auth-form"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-bw-panel focus:px-4 focus:py-2 focus:text-bw-fg"
      >
        Skip to the form
      </a>

      <div aria-hidden className="absolute inset-0 -z-20">
        <Image src={picture.src} alt="" fill priority sizes="100vw" className="bw-photo object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(100deg,rgba(6,19,31,0.95)_0%,rgba(6,19,31,0.82)_45%,rgba(6,19,31,0.6)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_20%,rgba(64,192,232,0.18),transparent_55%),radial-gradient(ellipse_at_10%_100%,rgba(214,60,80,0.16),transparent_50%)]" />
      </div>
      <BwSky />

      <div className="mx-auto flex min-h-dvh max-w-[1320px] flex-col px-4 pb-10 pt-[calc(env(safe-area-inset-top)+1.25rem)] sm:px-8 lg:px-12 lg:pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="BlueWave Cargo — home" className="shrink-0">
            <Lockup dark />
          </Link>
          <Link
            href="/"
            className="bw-mono inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-[0.68rem] uppercase tracking-[0.14em] text-white/75 backdrop-blur hover:border-white/40 hover:text-white"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            <span>
              Back<span className="hidden sm:inline"> to the website</span>
            </span>
          </Link>
        </div>

        <div className="grid flex-1 items-center gap-12 py-8 lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-20 lg:py-12">
          <main id="auth-form" className="bw-rise w-full max-w-md justify-self-center lg:justify-self-start">
            <div className="bw-auth-card relative overflow-hidden rounded-[10px] border border-white/15 bg-[rgba(8,22,36,0.82)] p-6 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
              <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-bw-coral via-bw-coral-bright to-bw-cyan" />
              {children}
            </div>
            <p className="bw-mono mt-5 text-center text-[0.66rem] uppercase tracking-[0.16em] text-white/45 lg:text-left">
              China → Tanzania · Sea cargo
            </p>
          </main>

          <section className="bw-rise relative hidden [animation-delay:160ms] lg:block">
            {/* A pool of shadow under the words, so the photograph never competes with them. */}
            <div
              aria-hidden
              className="absolute -inset-x-16 -inset-y-20 -z-10 bg-[radial-gradient(ellipse_at_40%_50%,rgba(6,19,31,0.85)_0%,rgba(6,19,31,0.55)_45%,transparent_75%)]"
            />
            <p className="bw-mono flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-bw-coral-bright">
              <span aria-hidden className="h-px w-8 bg-bw-coral-bright" />
              {label}
            </p>
            <h2 className="bw-display mt-5 max-w-xl text-[clamp(2.8rem,4.6vw,4.6rem)] uppercase leading-[0.95] [text-shadow:0_4px_30px_rgba(0,0,0,0.6)]">
              {title}
            </h2>
            <ul className="mt-9 grid max-w-xl gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-[8px] border border-white/10 bg-[rgba(8,22,36,0.7)] p-4 text-[0.95rem] text-white/90 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)] backdrop-blur-md"
                >
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-bw-coral/20 text-bw-coral-bright">
                    <Check className="size-3" strokeWidth={3} aria-hidden />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            {note ? <p className="mt-6 max-w-xl text-sm text-white/60">{note}</p> : null}
          </section>
        </div>
      </div>
    </div>
  );
}
