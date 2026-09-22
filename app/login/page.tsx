import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";

import { AuthPanel } from "@/components/bw/auth-panel";
import { LoginForm } from "@/components/login-form";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; revoked?: string }>;
}) {
  const params = await searchParams;
  const revoked = params.revoked === "1";

  return (
    <AuthPanel
      photo="portCranes"
      label="Karibu tena · Welcome back"
      title={
        <>
          Welcome back. <span className="text-bw-coral-bright">Your cargo is waiting.</span>
        </>
      }
      points={[
        "Every box, Foshan to Dar es Salaam",
        "Invoices and receipts",
        "Pickup notes for Dar",
        "Updates as your goods move",
      ]}
      note="BlueWave staff sign in here too — you will land on your own desk."
    >
      <h1 className="bw-display text-4xl uppercase text-white">Sign in</h1>
      <p className="mt-2 text-sm leading-relaxed text-white/70">Staff and customers use the same door. You will land in the right place.</p>

      {revoked ? (
        <div
          role="alert"
          className="mt-6 flex gap-3 rounded-[2px] border border-amber-500/40 border-l-[3px] border-l-amber-500 bg-amber-500/15 p-3 text-sm text-amber-100"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Your account is no longer active. Speak to your manager if you think this is wrong.</p>
        </div>
      ) : null}

      <LoginForm callbackUrl={params.callbackUrl ?? ""} />

      <p className="mt-7 border-t border-white/10 pt-5 text-sm text-white/70">
        New customer?{" "}
        <Link href="/register" className="font-semibold text-bw-coral-bright underline-offset-4 hover:underline">
          Open an account
        </Link>
      </p>
    </AuthPanel>
  );
}
