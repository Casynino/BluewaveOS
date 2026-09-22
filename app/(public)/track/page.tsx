import Image from "next/image";
import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { bwCompany, bwSailings } from "@/components/bw/data";
import { JourneyRail } from "@/components/bw/journey-rail";
import { TrackField } from "@/components/bw/track-field";
import { Action, Frame, Label } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { DEFAULT_TRANSIT_DAYS } from "@/lib/sailing-schedule";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";

/* The browser tab keeps the customer's own words. The share card sells the
   service instead: most of the people who ever see it are not tracking
   anything — they are everybody else in the group the link was pasted into.
   lib/share-card-text.ts owns both those words and the picture's. */
export const metadata: Metadata = {
  title: "Fuatilia mzigo wako — Track your cargo",
  description: SHARE_CARD_TEXT.description,
  alternates: { canonical: "/track" },
  openGraph: {
    type: "website",
    title: SHARE_CARD_TEXT.title,
    description: SHARE_CARD_TEXT.description,
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_CARD_TEXT.title,
    description: SHARE_CARD_TEXT.description,
  },
};

export const revalidate = 300;

/* The stages a result shows, named once for somebody without a reference yet.
   The result page draws the same rail from the cargo's own record. */
const STAGES = [
  ["Received in China", "Foshan warehouse"],
  ["Stored in China", "Assigned to a container"],
  ["In transit", "Foshan → Dar es Salaam"],
  ["Arrived in Dar", "Checked in at our warehouse"],
  ["Ready for pickup", "Paid, pickup note issued"],
  ["Collected", "Handed over to you"],
] as const;

export default async function TrackPage() {
  const [company, sailings] = await Promise.all([bwCompany(), bwSailings(2)]);
  const days = sailings[0]?.transitDays ?? DEFAULT_TRANSIT_DAYS;

  return (
    <>
      {/* The console: one question, one field, big enough for a thumb. */}
      <section aria-labelledby="track-h1" className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
        <Image src={PHOTOS.shipAerial.src} alt="" fill priority sizes="100vw" className="bw-photo -z-20 object-cover opacity-40" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-bw-night/60 via-bw-night/80 to-bw-night" />
        <Frame className="py-16 text-center sm:py-24">
          <Label className="justify-center text-white/70">Fuatilia mzigo · Cargo tracking</Label>
          <h1 id="track-h1" className="bw-display mx-auto mt-5 max-w-4xl text-[clamp(3rem,10vw,7.5rem)] uppercase">
            Where&apos;s your cargo?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/75">Track your cargo from China to Tanzania.</p>
          <div className="mx-auto mt-10 max-w-2xl text-left">
            <TrackField large dark autoFocus />
          </div>
          <p className="bw-mono mt-3 text-xs text-white/50">Your cargo reference, like BW0125 — or a box label like BW0125-P3</p>

          <div className="mx-auto mt-14 max-w-4xl rounded-[4px] border border-white/10 bg-white/[0.03] p-5 text-left sm:p-8">
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                ["China warehouse", "Received, stored, loaded"],
                ["At sea", `About ${days} days`],
                ["Dar es Salaam", "Arrived, ready, collected"],
              ].map(([title, note], i) => (
                <div key={title} className="min-w-0">
                  <p className="bw-mono text-[0.68rem] text-bw-cyan">{String(i + 1).padStart(2, "0")}</p>
                  <p className="font-bw-display text-lg font-semibold uppercase sm:text-2xl">{title}</p>
                  <p className="text-xs text-white/55 sm:text-sm">{note}</p>
                </div>
              ))}
            </div>
            <div aria-hidden className="relative mx-[16%] mt-5 h-[3px] bg-white/15">
              <span className="absolute -top-[5px] left-0 size-[13px] -translate-x-1/2 bg-bw-coral" />
              <span className="absolute -top-[5px] left-1/2 size-[13px] -translate-x-1/2 border-2 border-white/40 bg-bw-night" />
              <span className="absolute -top-[5px] left-full size-[13px] -translate-x-1/2 border-2 border-white/40 bg-bw-night" />
            </div>
          </div>
        </Frame>
      </section>

      {/* What the answer looks like. */}
      <section aria-labelledby="stages" className="border-b border-bw-line bg-bw-panel">
        <Frame className="py-16 lg:py-20">
          <Label className="text-bw-muted">What you will see</Label>
          <h2 id="stages" className="bw-display mt-4 text-[clamp(2.2rem,4.5vw,3.6rem)] uppercase text-bw-fg">
            Every stage, dated as it happens
          </h2>
          <div className="mt-12">
            <JourneyRail
              steps={STAGES.map(([label, place], i) => ({
                key: label,
                label,
                place,
                state: i === 0 ? "current" : "upcoming",
              }))}
            />
          </div>
          <p className="mt-10 max-w-2xl text-bw-muted">
            Once your goods are checked in at Dar, the invoice appears on the same page — in shillings and dollars, at
            the exchange rate it was issued with, with the accounts to pay into.
          </p>
        </Frame>
      </section>

      {/* Where the reference is. */}
      <section aria-labelledby="where" className="bg-bw-ground">
        <Frame className="grid gap-10 py-16 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-4">
            <Label className="text-bw-muted">Your reference</Label>
            <h2 id="where" className="bw-display mt-4 text-[clamp(2.2rem,4.5vw,3.6rem)] uppercase text-bw-fg">
              Where to find it
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-[3px] bg-bw-line sm:grid-cols-3 lg:col-span-8">
            <div className="bg-bw-panel p-6">
              <p className="bw-mono text-xs text-bw-harbour">01</p>
              <p className="mt-2 font-bw-display text-2xl font-semibold uppercase text-bw-fg">Delivery note</p>
              <p className="mt-2 text-bw-muted">Sent when your goods reached our Foshan warehouse.</p>
            </div>
            <div className="bg-bw-panel p-6">
              <p className="bw-mono text-xs text-bw-harbour">02</p>
              <p className="mt-2 font-bw-display text-2xl font-semibold uppercase text-bw-fg">Box label</p>
              <p className="mt-2 text-bw-muted">Every carton carries its own label and QR code.</p>
              <div aria-hidden className="mt-4 inline-flex items-center gap-3 border border-bw-ink/80 bg-white p-2 text-bw-ink">
                <span className="grid size-10 grid-cols-4 gap-px bg-white p-0.5">
                  {[1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1].map((on, i) => (
                    <span key={i} className={on ? "bg-bw-ink" : "bg-transparent"} />
                  ))}
                </span>
                <span className="bw-mono text-sm font-semibold text-bw-ink">BW0125-P3</span>
              </div>
            </div>
            <div className="bg-bw-panel p-6">
              <p className="bw-mono text-xs text-bw-harbour">03</p>
              <p className="mt-2 font-bw-display text-2xl font-semibold uppercase text-bw-fg">Lost it?</p>
              <p className="mt-2 text-bw-muted">The office can find your cargo by your name or phone number.</p>
              {company.whatsapp ? (
                <a
                  href={company.whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bw-mono mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
                >
                  <MessageCircle className="size-4" /> Ask on WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </Frame>
      </section>

      <section className="bg-bw-panel">
        <Frame className="flex flex-wrap items-center justify-between gap-6 py-12">
          <p className="max-w-xl text-lg text-bw-fg">
            Shipping regularly? Your account lists every consignment under your shipping mark, with invoices and pickup
            notes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Action href="/login" tone="ink">
              Customer login
            </Action>
            <Action href="/register" tone="line">
              Open an account
            </Action>
          </div>
        </Frame>
      </section>
    </>
  );
}
