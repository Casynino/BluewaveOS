import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { Corridor, corridorStations } from "@/components/bw/corridor";
import { bwExchangeRate, bwSailings } from "@/components/bw/data";
import { StationTile } from "@/components/bw/info-iso";
import type { StationKind } from "@/components/bw/iso";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { ARRIVAL_CAVEAT, DEFAULT_TRANSIT_DAYS } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "How it works — China to Tanzania cargo, step by step",
  description:
    "How sea cargo moves from your supplier in China to Dar es Salaam: our Foshan warehouse, weekly container shipping, arrival at our Dar es Salaam warehouse, invoice, payment and collection.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How BlueWave Cargo works — China to Tanzania, step by step",
    description:
      "Supplier to Foshan warehouse, container to Dar es Salaam, arrival, invoice and collection — what we do and what you do at every step.",
  },
};

/* The next sailing and the exchange rate move during the day. */
export const revalidate = 60;

const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const DAY_MONTH = utc({ weekday: "short", day: "2-digit", month: "short" });

/** "2,700" — grouped for reading; nothing rounded or converted. */
const grouped = (value: string) => {
  const [whole, frac] = value.split(".");
  const tidy = frac && Number(frac) !== 0 ? `.${frac.replace(/0+$/, "")}` : "";
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${tidy}`;
};

type Step = {
  place: string;
  title: string;
  kind?: StationKind;
  /** For the paper steps, which have no station on the lane. */
  paper?: string;
  we: React.ReactNode[];
  you: React.ReactNode[];
  links?: [string, string][];
  note?: React.ReactNode;
};

export default async function HowItWorksPage() {
  const [sailings, rate] = await Promise.all([bwSailings(4), bwExchangeRate()]);
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0] ?? null;
  const days = next?.transitDays ?? DEFAULT_TRANSIT_DAYS;

  const phases: { code: string; name: string; steps: Step[] }[] = [
    {
      code: "CN",
      name: "In China",
      steps: [
        {
          place: "Your supplier",
          title: "Send your goods to Foshan",
          kind: "supplier",
          we: [
            "Give you a shipping mark of your own when you open an account.",
            "Give you our Foshan warehouse address in Chinese, ready to forward to your supplier.",
            "Collect from the factory or market ourselves if the supplier will not deliver.",
          ],
          you: [
            "Send your supplier our Foshan address and your shipping mark.",
            "Ask them to write the mark on every carton and to phone the warehouse before delivering.",
          ],
          links: [
            ["/contact#supplier-address", "The address for your supplier"],
            ["/pickup", "Request a pickup"],
          ],
        },
        {
          place: "Foshan warehouse",
          title: "Received, measured, photographed",
          kind: "warehouse",
          we: [
            "Count, weigh and measure every package, and work out the CBM.",
            "Photograph the goods on arrival.",
            "Give each package its own reference and a QR label it keeps until you collect.",
          ],
          you: [
            "Check the reference, the figures and the photos on the tracking page or in your account.",
            "Tell us at once if something you paid for has not arrived.",
          ],
          links: [["/track", "Track a reference"]],
        },
        {
          place: "Foshan",
          title: "Loaded on the week's container",
          kind: "loading",
          we: [
            "Load the goods that arrived before receiving closed onto that week's container.",
            "Loose cargo shares the container, but every consignment stays separate and traceable.",
          ],
          you: ["Make sure your goods reach Foshan before receiving closes for the sailing you want."],
          links: [["/schedule", "Sailing schedule"]],
          note: next ? (
            <>
              Next receiving closes <strong className="font-semibold text-bw-fg">{DAY_MONTH.format(next.cargoDeadline)}</strong>
              {" · "}departs <strong className="font-semibold text-bw-fg">{DAY_MONTH.format(next.departureDate)}</strong>
            </>
          ) : null,
        },
      ],
    },
    {
      code: "SEA",
      name: "At sea",
      steps: [
        {
          place: "Indian Ocean",
          title: "In transit",
          kind: "sea",
          we: [
            "The moment the container departs, your cargo shows as In transit.",
            `The crossing to Dar es Salaam takes about ${days} days.`,
          ],
          you: ["Follow it with your reference. The tracking page shows the container and the estimated arrival."],
          links: [["/track", "Track cargo"]],
          note: ARRIVAL_CAVEAT,
        },
      ],
    },
    {
      code: "TZ",
      name: "In Dar es Salaam",
      steps: [
        {
          place: "Dar es Salaam port",
          title: "Arrival and recount",
          kind: "port",
          we: [
            "Bring the container from the port to our warehouse.",
            "Count your cargo again and compare it with the figures taken in Foshan. Both counts are kept.",
            "Check it in on our warehouse floor. That is the day it counts as arrived, and free storage starts.",
          ],
          you: ["Nothing yet — we tell you the day your cargo has arrived."],
        },
        {
          place: "Office",
          title: "Your invoice",
          paper: "Invoice",
          we: [
            "Price your cargo from the rate book and issue the invoice in USD.",
            "Show the amount in shillings at the exchange rate of the day the invoice is issued. That rate is pinned to the invoice and does not change afterwards.",
          ],
          you: ["Open the invoice in your account and check the figures against your cargo."],
          note: rate ? (
            <>
              Today&apos;s rate <strong className="font-semibold text-bw-fg">1 USD = {grouped(rate.rate)} TZS</strong>
            </>
          ) : null,
        },
        {
          place: "Office",
          title: "Payment",
          paper: "Paid",
          we: ["Confirm your payment against our accounts."],
          you: [
            "Pay only to the accounts printed on the invoice, and keep your payment slip.",
            "If anybody gives you a different account, call the office before you pay.",
          ],
          links: [["/login", "View and pay your invoice"]],
        },
        {
          place: "Office",
          title: "Pickup note",
          paper: "Pickup note",
          we: ["Issue your pickup note once the payment is confirmed."],
          you: ["Receive the pickup note in your account and bring it with you."],
        },
        {
          place: "Dar es Salaam",
          title: "Collect your cargo",
          kind: "customer",
          we: [
            "Check the pickup note and your ID.",
            "Scan every box out against your consignment, so nothing leaves that is not yours and nothing of yours is left behind.",
          ],
          you: ["Come to our Dar es Salaam warehouse with your ID and pickup note once we tell you it is ready."],
          links: [["/contact#dar-warehouse", "Warehouse address"]],
        },
      ],
    },
  ];

  let n = 0;

  return (
    <>
      <PageBanner
        label="How it works"
        title="From your supplier in China to your hands in Dar"
        lead="Every step your cargo takes, who does it, and what — if anything — you need to do. One reference follows your goods the whole way."
      >
        <dl className="grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-[2px] bg-white/10 sm:grid-cols-3">
          <div className="bg-bw-night/60 p-4">
            <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">Sailings</dt>
            <dd className="bw-display mt-1 text-3xl">Weekly</dd>
          </div>
          <div className="bg-bw-night/60 p-4">
            <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">At sea</dt>
            <dd className="bw-display mt-1 text-3xl">≈ {days} days</dd>
          </div>
          <div className="col-span-2 bg-bw-night/60 p-4 sm:col-span-1">
            <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">Next receiving closes</dt>
            <dd className="bw-display mt-1 text-3xl">{next ? DAY_MONTH.format(next.cargoDeadline) : "Ask the office"}</dd>
          </div>
        </dl>
      </PageBanner>

      {/* ------------------------------------------------ THE LANE */}
      <section aria-labelledby="lane" className="bw-yard relative overflow-hidden bg-bw-ground">
        <Frame className="py-20 lg:py-24">
          <SectionIntro
            index="01"
            label="The lane"
            title={<span id="lane">Seven stations, one reference</span>}
            lead="The whole route at a glance. Below, each step in detail."
          />
          <div className="mt-14 lg:mt-20">
            <Corridor stations={corridorStations(days)} />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ STEP BY STEP */}
      <section aria-labelledby="steps" className="bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            index="02"
            label="Step by step"
            title={<span id="steps">What we do. What you do.</span>}
            lead="Read across each step: our side on the left, yours on the right."
          />

          <div className="mt-14 space-y-16">
            {phases.map((phase) => (
              <div key={phase.code}>
                <div className="flex items-center gap-4 border-b-2 border-bw-fg pb-3">
                  <span className="bw-mono bg-bw-ink px-2 py-1 text-xs tracking-[0.2em] text-white">{phase.code}</span>
                  <h3 className="font-bw-display text-3xl font-semibold uppercase text-bw-fg">{phase.name}</h3>
                </div>
                <ol>
                  {phase.steps.map((step) => {
                    n += 1;
                    return <StepRow key={step.title} step={step} index={n} />;
                  })}
                </ol>
              </div>
            ))}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ SUMMARY */}
      <section aria-labelledby="summary" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-20 lg:py-24">
          <SectionIntro
            dark
            index="03"
            label="Your checklist"
            title={<span id="summary">Before, during, after</span>}
            lead="The short version: everything you do yourself, in order."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-[3px] bg-white/10 md:grid-cols-3">
            {[
              {
                when: "Before",
                items: [
                  "Get a quote or price it in the calculator",
                  "Open an account for your shipping mark",
                  "Send your supplier our Foshan address and your mark",
                  "Deliver before receiving closes",
                ],
              },
              {
                when: "During",
                items: [
                  "Check the photos and figures from Foshan",
                  "Track your reference while it is at sea",
                  "Keep your phone on while it clears",
                ],
              },
              {
                when: "After",
                items: [
                  "Check your invoice",
                  "Pay only to the accounts on the invoice",
                  "Receive your pickup note",
                  "Collect at our Dar warehouse with your ID",
                ],
              },
            ].map((stage) => (
              <div key={stage.when} className="bg-bw-night/70 p-6 sm:p-8">
                <p className="bw-display text-5xl uppercase text-bw-cyan">{stage.when}</p>
                <ul className="mt-6 space-y-3">
                  {stage.items.map((item) => (
                    <li key={item} className="flex gap-3 leading-snug text-white/85">
                      <span aria-hidden className="mt-1.5 size-3 shrink-0 border border-white/50" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ CLOSING */}
      <section aria-labelledby="start" className="relative isolate overflow-hidden text-white">
        <Image src={PHOTOS.shipSea.src} alt="" fill sizes="100vw" className="bw-photo -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bw-night via-bw-night/85 to-bw-night/40" />
        <Frame className="py-20 lg:py-28">
          <Label className="text-white/75">Start here</Label>
          <h2 id="start" className="bw-display mt-5 max-w-3xl text-[clamp(2.6rem,6vw,5rem)] uppercase">
            Price it, book it, follow it
          </h2>
          <div className="mt-10 grid max-w-4xl gap-px overflow-hidden rounded-[3px] bg-white/15 sm:grid-cols-3">
            {[
              ["/quote", "Get a quote", "Tell us what you are shipping"],
              ["/book", "Book a shipment", "Space on a coming sailing"],
              ["/track", "Track cargo", "Your reference, where it is now"],
            ].map(([href, title, body]) => (
              <Link key={href} href={href} className="group bg-bw-night/70 p-6 transition-colors hover:bg-bw-coral">
                <p className="font-bw-display text-3xl font-semibold uppercase">{title}</p>
                <p className="mt-1 text-sm text-white/70 group-hover:text-white">{body}</p>
                <ArrowRight className="mt-5 size-5 transition-transform group-hover:translate-x-1" aria-hidden />
              </Link>
            ))}
          </div>
        </Frame>
      </section>
    </>
  );
}

function StepRow({ step, index }: { step: Step; index: number }) {
  return (
    <li className="grid gap-6 border-b border-bw-line py-10 lg:grid-cols-12 lg:gap-8">
      <div className="flex items-start gap-5 lg:col-span-4">
        <div className="w-16 shrink-0 sm:w-20">
          {step.kind ? <StationTile kind={step.kind} /> : <PaperGlyph word={step.paper ?? ""} />}
        </div>
        <div className="min-w-0">
          <p className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-harbour">
            {String(index).padStart(2, "0")} · {step.place}
          </p>
          <h4 className="mt-2 font-bw-display text-3xl font-semibold uppercase leading-none text-bw-fg sm:text-4xl">
            {step.title}
          </h4>
          {step.note ? <p className="bw-mono mt-3 text-xs leading-relaxed text-bw-muted">{step.note}</p> : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-px overflow-hidden rounded-[3px] bg-bw-line sm:grid-cols-2 lg:col-span-8">
        <Side who="What we do" items={step.we} />
        <Side who="What you do" items={step.you} links={step.links} you />
      </div>
    </li>
  );
}

function Side({ who, items, links, you = false }: { who: string; items: React.ReactNode[]; links?: [string, string][]; you?: boolean }) {
  return (
    <div className={cn("min-w-0 p-5 sm:p-6", you ? "bg-bw-ground" : "bg-bw-panel")}>
      <p className={cn("bw-label", you ? "text-bw-coral" : "text-bw-muted")} data-plain={you ? undefined : ""}>
        {who}
      </p>
      <ul className="mt-4 space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-3 leading-relaxed text-bw-fg">
            <span aria-hidden className={cn("mt-2.5 h-px w-3 shrink-0", you ? "bg-bw-coral" : "bg-bw-muted")} />
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      {links?.length ? (
        <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
          {links.map(([href, label]) => (
            <li key={href}>
              <Link
                href={href}
                className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
              >
                {label} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** A sheet of paper for the office steps — invoice, payment, pickup note. */
function PaperGlyph({ word }: { word: string }) {
  return (
    <svg viewBox="0 0 80 96" className="h-auto w-full" aria-hidden>
      <rect x="10" y="6" width="60" height="80" fill="#fff" stroke="#C9D3DC" strokeWidth="1.5" />
      <rect x="10" y="6" width="60" height="14" fill="#0A2236" />
      {[32, 40, 48, 56].map((y) => (
        <line key={y} x1="18" y1={y} x2={y === 56 ? 44 : 62} y2={y} stroke="#C9D3DC" strokeWidth="2" />
      ))}
      <rect x="16" y="64" width="48" height="14" fill="none" stroke="#D63C50" strokeWidth="1.5" />
      <text
        x="40"
        y="74"
        textAnchor="middle"
        fontSize={word.length > 8 ? 5.5 : 7}
        letterSpacing="0.8"
        fill="#D63C50"
        style={{ fontFamily: "var(--font-bw-mono)" }}
      >
        {word.toUpperCase()}
      </text>
    </svg>
  );
}
