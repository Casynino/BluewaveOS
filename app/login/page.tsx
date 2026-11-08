import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { AlertTriangle, ArrowLeft, PackageCheck, ReceiptText, Ship } from "lucide-react";

import { LoginForm } from "@/components/login-form";
import { LoginGate } from "./login-gate";
import { LoginScene } from "./login-scene";
import "./login.css";

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to your BlueWave Cargo account to see all your cargo from China, your invoices, pickup notes and updates. BlueWave staff sign in here too.",
  alternates: { canonical: "/login" },
  openGraph: {
    type: "website",
    title: "Sign in · BlueWave Cargo",
    description: "Your cargo, invoices, pickup notes and updates in one account.",
    url: "/login",
  },
};

/* The scene is always the night sea, so the phone's top bar is navy too, in either theme. */
export const viewport: Viewport = { themeColor: "#06142b" };

const delay = (s: number) => ({ "--rd": `${s}s` }) as CSSProperties;

const FEATURES = [
  { icon: Ship, label: "Every box, Foshan to Dar" },
  { icon: ReceiptText, label: "Invoices and receipts" },
  { icon: PackageCheck, label: "Pickup in Dar" },
];

/* The scene is always dark, so it always takes the logo cut with white lettering. */
const Logo = ({ className }: { className: string }) => (
  <Image src="/brand/bluewave-logo-light.png" alt="BlueWave Cargo" width={630} height={400} priority className={className} />
);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";
  const sessionEnded = revoked && params.reason === "session-ended";

  return (
    <div className="relative isolate min-h-dvh overflow-hidden bg-[#06142b]">
      {/* the animated scene fills the whole page */}
      <LoginScene />

      <div className="relative z-10 grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
        {/* inside the grid, so the phone pop-up's backdrop covers it */}
        <Link
          href="/"
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[12px] text-white/75 backdrop-blur transition-colors hover:border-white/40 hover:text-white lg:right-8 lg:top-6"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Website
        </Link>
        {/* Words (wide screens) */}
        <section className="hidden flex-col justify-between p-12 text-white lg:flex">
          <div className="ls-up ls-brand w-fit min-[1360px]:invisible" style={delay(0.05)}>
            <Logo className="h-28 w-auto xl:h-32" />
          </div>

          <div className="mb-[clamp(190px,32vh,330px)] max-w-lg min-[1360px]:max-w-sm">
            <p className="ls-up mb-4 h-1 w-12 rounded bg-[#d63c50]" style={delay(0.15)} />
            <h2 className="ls-up text-balance text-4xl font-semibold leading-[1.1] tracking-tight" style={delay(0.25)}>
              Your cargo from China, <span className="text-[#40c0e8]">in one place.</span>
            </h2>
            <p className="ls-up mt-4 max-w-md text-[15px] leading-relaxed text-white/70" style={delay(0.4)}>
              Customers follow every box, bill and pickup note. Staff sign in here too and land on their own desk.
            </p>
            <ul className="ls-up mt-6 flex flex-wrap gap-2" style={delay(0.55)}>
              {FEATURES.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-[13px] text-white/90"
                >
                  <Icon className="size-[15px] text-[#40c0e8]" aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <span aria-hidden />
        </section>

        {/* Sign-in card, floating over the scene */}
        <section className="flex flex-col items-center px-5 py-6 max-md:pt-[calc(env(safe-area-inset-top)+9vh)] lg:justify-center lg:py-10">
          <div className="ls-up ls-brand mb-4 self-center md:mb-6 lg:hidden" style={delay(0.05)}>
            <Logo className="h-28 w-auto sm:h-32" />
          </div>
          {/* phones: the scene stays in view, with one button that opens the form */}
          <p
            className="ls-up mb-5 mt-[10vh] max-w-[16rem] text-balance text-center text-[15px] leading-snug text-white/85 md:hidden"
            style={delay(0.25)}
          >
            Your cargo from China, in one place
          </p>
          <LoginGate defaultOpen={revoked}>
            <div className="ls-card ls-up dark w-full p-7 text-foreground sm:p-8" style={delay(0.2)}>
              <h1 className="ls-title text-2xl font-semibold tracking-tight">Sign in</h1>
              <p className="mt-1.5 text-sm text-white/65">Staff and customers use the same door.</p>

              {revoked ? (
                <div
                  role="alert"
                  className="mt-5 flex gap-3 rounded-lg border border-amber-500/40 border-l-[3px] border-l-amber-500 bg-amber-500/15 p-3 text-sm text-amber-100"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <p>
                    {sessionEnded
                      ? "That sign-in has ended. Sign in again to continue."
                      : "Your account is no longer active. Speak to your manager if you think this is wrong."}
                  </p>
                </div>
              ) : null}

              <LoginForm callbackUrl={params.callbackUrl ?? ""} />

              <p className="mt-4 text-sm">
                <Link href="/register?mode=reset" className="font-medium text-[#7fd8f5] underline-offset-4 hover:underline">
                  Forgot your password?
                </Link>
              </p>

              <p className="mt-4 border-t border-white/10 pt-4 text-sm text-white/65">
                New customer, or shipped with us before?{" "}
                <Link href="/register" className="font-semibold text-[#7fd8f5] underline-offset-4 hover:underline">
                  Open an account
                </Link>
              </p>
            </div>
          </LoginGate>
          <p className="mt-5 text-xs text-white/60 max-md:fixed max-md:inset-x-0 max-md:bottom-[max(1rem,env(safe-area-inset-bottom))] max-md:z-10 max-md:text-center max-md:text-white/50">
            BlueWave Cargo · China to Tanzania by sea
          </p>
        </section>
      </div>
    </div>
  );
}
