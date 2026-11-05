import Link from "next/link";
import type { Metadata } from "next";

import { AuthPanel } from "@/components/bw/auth-panel";
import { PortalAccess } from "@/components/site/portal-access";

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

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const reset = (await searchParams).mode === "reset";
  return (
    <AuthPanel
      photo="portYard"
      label="New customer · Karibu BlueWave"
      title={
        <>
          Ship from China <span className="text-bw-coral-bright">under your own mark.</span>
        </>
      }
      points={[
        "Your shipping mark, straight away",
        "Our Foshan address for suppliers",
        "Cargo, invoices and pickup notes",
        "Updates as your goods move",
      ]}
    >
      <h1 className="bw-display text-4xl uppercase text-white">{reset ? "Forgot your password?" : "Open an account"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/70">
        {reset
          ? "Enter your phone number, then the 6-digit code our office gives you, and choose a new password."
          : "Shipped with us before? We will find your profile. New? You get your shipping mark and our Foshan address straight away."}
      </p>

      <div className="mt-7">
        <PortalAccess mode={reset ? "reset" : "register"} />
      </div>

      <p className="mt-7 border-t border-white/10 pt-5 text-sm text-white/70">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-bw-coral-bright underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthPanel>
  );
}
