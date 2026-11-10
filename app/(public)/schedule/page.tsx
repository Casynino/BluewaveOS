import Link from "next/link";
import type { Metadata } from "next";

import { bwSailings } from "@/components/bw/data";
import { SW_ARRIVAL_CAVEAT, SW_DELAY_NOTE } from "@/components/bw/ratiba";
import { SailingCard } from "@/components/bw/sailing-card";
import { Frame, PageBanner } from "@/components/bw/ui";

export const metadata: Metadata = {
  title: "Ratiba ya meli — sailing schedule, Foshan to Dar es Salaam",
  description:
    "The BlueWave Cargo timetable: when the Foshan warehouse stops receiving for each container, the day it sails and the estimated arrival in Dar es Salaam. A container every week.",
  alternates: { canonical: "/schedule" },
  openGraph: {
    type: "website",
    title: "Ratiba ya meli · BlueWave Cargo",
    description: "Meli kila Jumatatu. Mzigo mwisho Ijumaa. Foshan hadi Dar es Salaam.",
    url: "/schedule",
  },
};

export const revalidate = 60;

/* A quarter ahead. Far enough that somebody ordering from a factory today can
   see the week their goods will be ready for, and no further — the rule holds
   for ever, but a date twelve months out is a promise nobody has made. */
const WEEKS_SHOWN = 12;

/**
 * RATIBA YA MELI.
 *
 * Copied word for word from the live schedule of the owner's other sea-cargo
 * system (owner, 10 Nov 2026): the headline and its one paragraph, a card per
 * sailing (components/bw/sailing-card.tsx), and the two lines about arrival
 * dates. Nothing else on the page.
 */
export default async function SchedulePage() {
  const sailings = await bwSailings(WEEKS_SHOWN);

  return (
    <>
      <PageBanner
        label="Ratiba ya meli"
        title={
          <>
            Meli kila Jumatatu. <span className="text-white/55">Mzigo mwisho Ijumaa.</span>
          </>
        }
        lead="Tunapokea mzigo kila siku, ila tunapakia kontena kila wiki. Tunapakia kila Ijumaa, na Jumatatu meli inaanza safari kuja Tanzania. Safari huchukua siku 28 hadi 35."
      />

      <section aria-label="Ratiba ya meli" className="bg-bw-ground">
        <Frame className="py-12 sm:py-16">
          {sailings.length === 0 ? (
            <div className="rounded-xl border border-bw-line bg-bw-panel p-10 text-center">
              <p className="font-medium text-bw-fg">Hakuna meli kwenye ratiba kwa sasa</p>
              <p className="mt-1 text-sm text-bw-muted">Wasiliana nasi, tutakujulisha meli inayofuata.</p>
              <Link
                href="/contact"
                className="mt-6 inline-flex rounded-lg border border-bw-line px-5 py-2.5 text-sm font-medium text-bw-fg transition-colors hover:border-bw-fg/40"
              >
                Wasiliana nasi
              </Link>
            </div>
          ) : (
            <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sailings.map((sailing) => (
                <li key={sailing.key}>
                  <SailingCard sailing={sailing} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-8 text-xs text-bw-muted">{SW_ARRIVAL_CAVEAT}</p>
          <p className="mt-2 text-xs text-bw-muted">{SW_DELAY_NOTE}</p>
        </Frame>
      </section>
    </>
  );
}
