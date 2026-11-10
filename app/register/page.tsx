import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata, Viewport } from "next";
import { ArrowLeft } from "lucide-react";

import { PortalAccess } from "@/components/site/portal-access";
import { LoginScene } from "../login/login-scene";
import "../login/login.css";

/* The register page is always the dark port scene, so the phone's bar is navy too. */
export const viewport: Viewport = { themeColor: "#06131f" };

export const metadata: Metadata = {
  title: "Open an account",
  description:
    "Register with BlueWave Cargo to get your shipping mark and our Foshan warehouse address, then follow all your cargo, invoices, pickup notes and updates from China to Dar es Salaam.",
  alternates: { canonical: "/register" },
  openGraph: {
    type: "website",
    title: "Open an account · BlueWave Cargo",
    description: "Your shipping mark, our Foshan address, and all your cargo in one account.",
    url: "/register",
  },
};

/*
  OPEN AN ACCOUNT, CLEAN (owner, 10 Nov 2026: "too much info… make this page
  clean"). The same night sea as the sign-in page and one small card: a title,
  the phone number, Continue. What comes next depends on the number (see
  PortalAccess): somebody we know is greeted by their first name. "Back to site"
  is always at the top, so nobody is stuck here.
*/
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const reset = (await searchParams).mode === "reset";
  return (
    <div data-auth-scene className="relative isolate min-h-dvh overflow-hidden bg-[#06142b]">
      <LoginScene />
      <div className="relative z-10 flex min-h-dvh flex-col items-center px-5 pb-12 pt-[calc(env(safe-area-inset-top)+4.25rem)] md:justify-center md:pt-12">
        <Link
          href="/"
          className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[calc(env(safe-area-inset-top)+1rem)] -mx-2 -my-1 inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-2.5 text-[12px] text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline md:text-[13px]"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to site
        </Link>

        <Link href="/" aria-label="BlueWave Cargo — home" className="ls-up ls-brand mb-5">
          <Image src="/brand/bluewave-logo-light.png" alt="BlueWave Cargo" width={630} height={400} priority className="h-20 w-auto md:h-24" />
        </Link>

        <div className="ls-card ls-up dark w-full max-w-[22rem] p-5 text-left text-foreground sm:p-6" style={{ "--rd": "0.15s" } as CSSProperties}>
          <PortalAccess
            mode={reset ? "reset" : "register"}
            title={reset ? "Forgot your password?" : "Create account"}
            intro={reset ? "Your phone number, then the code from our office." : "Start with your phone number."}
          />

          <p className="mt-4 text-[12.5px] text-white/60">
            Have an account?{" "}
            <Link href="/login" className="font-medium text-[#7fd8f5] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
