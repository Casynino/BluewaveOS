import Link from "next/link";
import type { Metadata } from "next";

import { AuthPanel } from "@/components/bw/auth-panel";
import { RegisterForm } from "@/components/site/register-form";

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

export default function RegisterPage() {
  return (
    <AuthPanel
      photo="portYard"
      label="New customer · Karibu BlueWave"
      title={
        <>
          Ship from China <span className="text-white/55">with your own mark</span>
        </>
      }
      points={[
        "Your own shipping mark, straight away",
        "Our Foshan warehouse address for your suppliers",
        "All your cargo, invoices and pickup notes",
        "Updates as your goods move",
      ]}
    >
      <h1 className="bw-display text-5xl uppercase text-bw-fg">Open an account</h1>
      <p className="mt-2 text-bw-muted">
        You get a shipping mark and our Foshan warehouse address as soon as you register.
      </p>

      <div className="mt-7">
        <RegisterForm />
      </div>

      <p className="mt-8 border-t border-bw-line pt-5 text-sm text-bw-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-bw-coral underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthPanel>
  );
}
