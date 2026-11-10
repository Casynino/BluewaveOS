import Image from "next/image";
import type { Metadata } from "next";

import { bwCompany, bwSailings } from "@/components/bw/data";
import { bookHref, DepartureBoard } from "@/components/bw/departure-board";
import { RATIBA, swDate, swDay, swDaysLeft, swFull } from "@/components/bw/ratiba";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { DEFAULT_TRANSIT_DAYS } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Ratiba ya meli — sailing schedule, Foshan to Dar es Salaam",
  description:
    "The BlueWave Cargo timetable: when the Foshan warehouse stops receiving for each container, the day it sails and the estimated arrival in Dar es Salaam. A container every week.",
  alternates: { canonical: "/schedule" },
  openGraph: {
    type: "website",
    title: "Ratiba ya meli · BlueWave Cargo",
    description: "Kupakia, kuondoka na kufika (makadirio) — meli kila wiki kutoka Foshan hadi Dar es Salaam.",
    url: "/schedule",
  },
};

export const revalidate = 60;

/* A quarter ahead. Far enough that somebody ordering from a factory today can
   see the week their goods will be ready for, and no further — the rule holds
   for ever, but a date twelve months out is a promise nobody has made. */
const WEEKS_SHOWN = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

/**
 * RATIBA YA MELI.
 *
 * The schedule speaks the Swahili of the office's weekly poster (owner, 10 Nov
 * 2026): Kupakia, Kuondoka, Kufika (makadirio), dates as "Ijumaa, 13 Novemba"
 * (components/bw/ratiba.ts), and every way to book says "Book now". Kept short:
 * the next sailing as the poster has it, the timetable, then three steps that
 * tell a customer what to do.
 */
export default async function SchedulePage() {
  const [sailings, company] = await Promise.all([bwSailings(WEEKS_SHOWN), bwCompany()]);
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0] ?? null;
  const transitDays = next?.transitDays ?? DEFAULT_TRANSIT_DAYS;
  const gap = next ? days(next.cargoDeadline, next.departureDate) : null;
  const left = next?.bookingOpen ? swDaysLeft(next.cargoDeadline, new Date()) : null;

  return (
    <>
      <PageBanner
        label="Foshan → Dar es Salaam · kila wiki"
        title="Ratiba ya meli"
        lead="Leta mzigo wako kwenye ghala letu la Foshan kabla ya siku ya kupakia, nao utasafiri na kontena la wiki hiyo. Kontena huondoka kila wiki."
      >
        {next ? (
          <div className="max-w-3xl">
            <dl
              aria-label="Meli ijayo"
              className="bw-glass grid grid-cols-1 divide-y divide-white/10 overflow-hidden rounded-[4px] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
            >
              {(
                [
                  [RATIBA.load, next.cargoDeadline, false, left],
                  [RATIBA.depart, next.departureDate, false, null],
                  [RATIBA.arrive, next.estimatedArrival, true, null],
                ] as const
              ).map(([term, date, approx, note]) => (
                <div key={term} className="flex items-baseline justify-between gap-4 px-4 py-3.5 sm:block sm:p-5">
                  <dt className="text-sm text-white/60">{term}</dt>
                  <dd className="text-right sm:mt-2 sm:text-left">
                    <span className="bw-display block text-2xl uppercase sm:text-3xl">
                      {approx ? "≈ " : ""}
                      {swDate(date)}
                    </span>
                    <span className="mt-0.5 block text-sm text-white/60">{swDay(date)}</span>
                    {note ? <span className="mt-1 block text-sm text-bw-coral-bright">{note}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <Action href={next.bookingOpen ? bookHref(next) : "/book"} size="lg">
                Book now
              </Action>
            </div>
          </div>
        ) : null}
      </PageBanner>

      {/* ------------------------------------------------------ TIMETABLE */}
      <section aria-labelledby="timetable" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            dark
            index="01"
            label="Ratiba"
            title={<span id="timetable">Meli zinazofuata</span>}
            lead={
              sailings.length
                ? `${sailings.length === 1 ? "Meli ijayo." : `Meli ${sailings.length} zijazo.`} Chagua meli yako kisha bonyeza Book now.`
                : "Hakuna meli kwenye ratiba kwa sasa."
            }
          />
          <div className="mt-10 lg:mt-12">
            {sailings.length ? (
              <DepartureBoard sailings={sailings} />
            ) : (
              <div className="rounded-[3px] bg-bw-night p-8 ring-1 ring-white/10">
                <p className="bw-display text-3xl uppercase">Hakuna meli kwa sasa</p>
                <p className="mt-3 max-w-xl text-white/70">Wasiliana nasi, tutakujulisha meli inayofuata.</p>
                <div className="mt-6">
                  <Action href="/contact" tone="ghost-light">
                    Wasiliana na ofisi
                  </Action>
                </div>
              </div>
            )}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------------ WHAT TO DO */}
      <section aria-labelledby="hatua" className="bg-bw-panel">
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            index="02"
            label="Ufanye nini"
            title={<span id="hatua">Hatua tatu</span>}
            lead="Tarehe pekee unayopaswa kuwahi ni ya kupakia."
          />

          <ol className="mt-12 grid border-l border-t border-bw-line md:grid-cols-3">
            <Step
              n="01"
              title="Weka nafasi"
              body="Chagua meli kwenye ratiba na ubonyeze Book now. Tunakuthibitishia nafasi na bei."
              example={null}
            />
            <Step
              n="02"
              title="Leta mzigo Foshan"
              body="Mpe msambazaji wako anwani ya ghala letu la Foshan. Mzigo ufike kabla ya mwisho wa siku ya kupakia (saa za China); ukichelewa, utaenda na kontena linalofuata."
              example={next ? `${RATIBA.load}: ${swFull(next.cargoDeadline)}` : null}
              accent
            />
            <Step
              n="03"
              title="Pokea Dar es Salaam"
              body={`${
                gap !== null ? `Kontena huondoka China siku ${gap} baada ya kupakia. ` : ""
              }Baada ya takriban siku ${transitDays} baharini linafika kwenye ghala letu la Dar; ukishalipa, mzigo wako uko tayari kuchukuliwa.`}
              example={next ? `${RATIBA.arrive}: ≈ ${swFull(next.estimatedArrival)}` : null}
            />
          </ol>

          <div className="mt-8 grid gap-6 rounded-[3px] border border-bw-line bg-bw-ground p-5 sm:p-6 lg:grid-cols-12 lg:items-center">
            <p className="font-bw-display text-2xl font-semibold uppercase leading-tight text-bw-fg lg:col-span-5">
              Tarehe ya kufika ni makadirio
            </p>
            <p className="text-bw-muted lg:col-span-6 lg:col-start-7">
              Meli zinaweza kuchelewa kwa sababu ya hali ya hewa, msongamano bandarini au forodha — tutakujulisha
              ikitokea. Mzigo wako ukishapakiwa kwenye kontena, makadirio yake yanaonekana kwenye ukurasa wa kufuatilia
              mzigo.
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
            <Label className="text-white/75">Meli ijayo</Label>
            <h2 id="schedule-next" className="bw-display mt-5 text-[clamp(2.4rem,5.5vw,4.6rem)] uppercase">
              Weka nafasi, au tukuchukulie mzigo
            </h2>
            <p className="mt-4 max-w-xl text-lg text-white/75">
              Weka nafasi kisha mpe msambazaji wako anwani yetu ya Foshan — au timu yetu ya China ichukue mzigo kiwandani
              au sokoni.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/book" size="lg">
                Book now
              </Action>
              <Action href="/pickup" tone="light" size="lg">
                Omba tuchukue mzigo
              </Action>
            </div>
          </div>
          <div className="rounded-[4px] border border-white/10 bg-bw-night/80 p-6 lg:col-span-4 lg:col-start-9">
            <Label className="text-white/70">Uliza kuhusu meli</Label>
            {company.phone && company.phoneHref ? (
              <a href={company.phoneHref} className="bw-display mt-4 block text-4xl hover:text-bw-coral-bright">
                {company.phone}
              </a>
            ) : (
              <p className="mt-4 text-white/75">Piga simu au tembelea ofisi yetu Kariakoo.</p>
            )}
            {company.whatsapp ? (
              <div className="mt-5">
                <Action href={company.whatsapp} external tone="ghost-light">
                  Tuandikie WhatsApp
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
        <p className={`mt-6 border-t border-bw-line pt-4 text-sm ${accent ? "text-bw-coral" : "text-bw-fg"}`}>{example}</p>
      ) : null}
    </li>
  );
}
