import Image from "next/image";
import type { Metadata } from "next";

import { bwCompany, bwSailings } from "@/components/bw/data";
import { DepartureBoard } from "@/components/bw/departure-board";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { SAILING_STATUS_LABEL } from "@/lib/constants";
import { ARRIVAL_CAVEAT, DEFAULT_TRANSIT_DAYS, type Sailing } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Sailing schedule — Foshan to Dar es Salaam",
  description:
    "The BlueWave Cargo timetable: when the Foshan warehouse stops receiving for each container, the day it sails and the estimated arrival in Dar es Salaam. A container every week.",
  alternates: { canonical: "/schedule" },
  openGraph: {
    type: "website",
    title: "Sailing schedule · BlueWave Cargo",
    description: "Receiving deadlines, departures from Foshan and estimated arrivals in Dar es Salaam, week by week.",
    url: "/schedule",
  },
};

export const revalidate = 60;

/* A quarter ahead. Far enough that somebody ordering from a factory today can
   see the week their goods will be ready for, and no further — the rule holds
   for ever, but a date twelve months out is a promise nobody has made. */
const WEEKS_SHOWN = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const DAY_MONTH = utc({ weekday: "short", day: "2-digit", month: "short" });

/* What each status on the board means to somebody with goods to send. */
const STATUS_MEANING: Record<Sailing["status"], string> = {
  OPEN_FOR_BOOKING: "Room on this container. Book, and get your goods to Foshan before receiving closes.",
  CUTOFF_APPROACHING: "Receiving closes in the next few days. Goods must reach Foshan quickly.",
  CLOSED: "Receiving has closed. New cargo goes on a later sailing.",
  DEPARTED: "The container has left China.",
  IN_TRANSIT: "At sea, on the way to Dar es Salaam.",
  ARRIVED: "The container has reached Dar es Salaam.",
  DELAYED: "Running late. Customers with cargo on board are told.",
  CANCELLED: "This sailing will not run. The office tells you which sailing your cargo takes.",
};

const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export default async function SchedulePage() {
  const [sailings, company] = await Promise.all([bwSailings(WEEKS_SHOWN), bwCompany()]);
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0] ?? null;
  const transitDays = next?.transitDays ?? DEFAULT_TRANSIT_DAYS;
  const gap = next ? days(next.cargoDeadline, next.departureDate) : null;
  const statuses = [...new Set(sailings.map((s) => s.status))];

  return (
    <>
      <PageBanner
        label="Sailing schedule · Foshan → Dar es Salaam"
        title={
          <>
            A container <span className="text-white/55">every week</span>
          </>
        }
        lead="Get your goods to our Foshan warehouse before receiving closes and they sail on that week's container. The timetable below is the one the office works to."
      >
        {next ? (
          <dl
            aria-label="Next sailing"
            className="bw-glass grid max-w-3xl grid-cols-1 divide-y divide-white/10 overflow-hidden rounded-[4px] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          >
            {[
              ["Next · receiving closes", DAY_MONTH.format(next.cargoDeadline), "text-bw-coral-bright"],
              ["Departs Foshan", DAY_MONTH.format(next.departureDate), "text-white"],
              ["ETA Dar es Salaam", `≈ ${DAY_MONTH.format(next.estimatedArrival)}`, "text-white"],
            ].map(([term, value, tone]) => (
              <div key={term} className="p-4 sm:p-5">
                <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">
                  {term}
                </dt>
                <dd className={`bw-display mt-2 text-3xl uppercase ${tone}`}>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </PageBanner>

      {/* ------------------------------------------------------ TIMETABLE */}
      <section aria-labelledby="timetable" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            dark
            index="01"
            label="Timetable"
            title={<span id="timetable">Departures from Foshan</span>}
            lead={
              sailings.length
                ? `The next ${sailings.length} sailings. Book on any row marked open.`
                : "No sailings are published at the moment."
            }
          />
          <div className="mt-10 lg:mt-12">
            {sailings.length ? (
              <DepartureBoard sailings={sailings} />
            ) : (
              <div className="rounded-[3px] bg-bw-night p-8 ring-1 ring-white/10">
                <p className="bw-display text-3xl uppercase">No sailings on the board</p>
                <p className="mt-3 max-w-xl text-white/70">
                  Contact us and we will tell you when the next container closes for cargo.
                </p>
                <div className="mt-6">
                  <Action href="/contact" tone="ghost-light">
                    Contact the office
                  </Action>
                </div>
              </div>
            )}
          </div>

          {statuses.length ? (
            <div className="mt-10">
              <Label as="h3" className="text-white/60">
                Reading the status column
              </Label>
              <dl className="mt-5 grid gap-px overflow-hidden rounded-[2px] bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
                {statuses.map((status) => (
                  <div key={status} className="bg-bw-ink p-4">
                    <dt className="bw-mono text-xs uppercase tracking-[0.14em] text-white">
                      {SAILING_STATUS_LABEL[status] ?? status}
                    </dt>
                    <dd className="mt-1.5 text-sm text-white/65">{STATUS_MEANING[status]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
        </Frame>
      </section>

      {/* ------------------------------------------------------ THE RHYTHM */}
      <section aria-labelledby="rhythm" className="bg-bw-panel">
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            index="02"
            label="How the week works"
            title={<span id="rhythm">Three dates on every sailing</span>}
            lead="Every row on the timetable follows the same rhythm. The only date you have to meet is the first one."
          />

          <ol className="mt-12 grid border-l border-t border-bw-line md:grid-cols-3">
            <Step
              n="01"
              title="Receiving closes"
              body="The Foshan warehouse takes cargo for this sailing until the end of that day, China time. Goods that arrive later go on the next container."
              example={next ? DAY_MONTH.format(next.cargoDeadline) : null}
              accent
            />
            <Step
              n="02"
              title="Container departs"
              body={
                gap !== null
                  ? `The container is packed and leaves China ${gap} ${gap === 1 ? "day" : "days"} after receiving closes.`
                  : "The container is packed and leaves China a few days after receiving closes."
              }
              example={next ? DAY_MONTH.format(next.departureDate) : null}
            />
            <Step
              n="03"
              title="Estimated arrival"
              body={`About ${transitDays} days at sea later it reaches Dar es Salaam and comes into our warehouse, and once it is paid your goods are ready for pickup.`}
              example={next ? `≈ ${DAY_MONTH.format(next.estimatedArrival)}` : null}
            />
          </ol>

          <div className="mt-8 grid gap-6 border-l-[3px] border-bw-coral bg-bw-ground p-5 sm:p-6 lg:grid-cols-12 lg:items-center">
            <p className="font-bw-display text-2xl font-semibold uppercase leading-tight text-bw-fg lg:col-span-5">
              {ARRIVAL_CAVEAT}
            </p>
            <p className="text-bw-muted lg:col-span-6 lg:col-start-7">
              Sailings slip for weather, port congestion and customs, and we tell you when one does. Your cargo&apos;s
              own estimate is on its tracking page once it is on a container.
            </p>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------------ NEXT STEP */}
      <section aria-labelledby="schedule-next" className="relative isolate overflow-hidden text-white">
        <Image src={PHOTOS.containerStack.src} alt="" fill sizes="100vw" className="bw-photo -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bw-night via-bw-night/85 to-bw-night/40" />
        <Frame className="grid gap-10 py-16 lg:grid-cols-12 lg:items-end lg:py-24">
          <div className="lg:col-span-7">
            <Label className="text-white/75">Make the next container</Label>
            <h2 id="schedule-next" className="bw-display mt-5 text-[clamp(2.4rem,5.5vw,4.6rem)] uppercase">
              Book your space, or let us collect
            </h2>
            <p className="mt-4 max-w-xl text-lg text-white/75">
              Book a sailing and send your supplier our Foshan address — or ask our China team to pick the goods up
              from the factory or market.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/book" size="lg">
                Book a shipment
              </Action>
              <Action href="/pickup" tone="light" size="lg">
                Request a China pickup
              </Action>
            </div>
          </div>
          <div className="bw-glass rounded-[4px] p-6 lg:col-span-4 lg:col-start-9">
            <Label className="text-white/70">Ask about a sailing</Label>
            {company.phone && company.phoneHref ? (
              <a href={company.phoneHref} className="bw-display mt-4 block text-4xl hover:text-bw-coral-bright">
                {company.phone}
              </a>
            ) : (
              <p className="mt-4 text-white/75">Call or visit our office in Kariakoo.</p>
            )}
            {company.whatsapp ? (
              <div className="mt-5">
                <Action href={company.whatsapp} external tone="ghost-light">
                  WhatsApp us
                </Action>
              </div>
            ) : null}
          </div>
        </Frame>
      </section>
    </>
  );
}

function Step({
  n,
  title,
  body,
  example,
  accent = false,
}: {
  n: string;
  title: string;
  body: string;
  example: string | null;
  accent?: boolean;
}) {
  return (
    <li className="flex flex-col border-b border-r border-bw-line p-5 sm:p-7">
      <span className="bw-mono text-sm text-bw-harbour">{n}</span>
      <h3 className="mt-2 font-bw-display text-3xl font-semibold uppercase text-bw-fg">{title}</h3>
      <p className="mt-3 flex-1 text-bw-muted">{body}</p>
      {example ? (
        <p className="bw-mono mt-6 border-t border-bw-line pt-4 text-xs uppercase tracking-[0.14em] text-bw-muted">
          Next sailing ·{" "}
          <span className={accent ? "text-bw-coral" : "text-bw-fg"}>{example}</span>
        </p>
      ) : null}
    </li>
  );
}
