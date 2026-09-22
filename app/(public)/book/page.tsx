import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact, ReqLayout, ReqSteps } from "@/components/bw/req-layout";
import { PageBanner } from "@/components/bw/ui";
import { BookingForm } from "@/components/site/request-forms";
import { formatDate } from "@/lib/format";
import { publicRateBook } from "@/lib/public-estimate";
import { ARRIVAL_CAVEAT, publicSailings } from "@/lib/sailing-schedule";

export const metadata: Metadata = {
  title: "Book a shipment — China to Dar es Salaam",
  description:
    "Book space in a shared container, a full 20ft or 40ft container, special cargo or customs clearance at Dar es Salaam. Pick your sailing from Foshan and we confirm space and price.",
  alternates: { canonical: "/book" },
  openGraph: {
    type: "website",
    title: "Book a shipment · BlueWave Cargo",
    description: "Book loose cargo or a full container from Foshan to Dar es Salaam on a weekly sailing.",
    url: "/book",
  },
};

export const revalidate = 300;

/* How many weeks a customer may pick from. Beyond a couple of months the
   readiness date is a guess and Support would rather be told the month. */
const WEEKS_OFFERED = 8;

const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const DAY_MONTH = utc({ weekday: "short", day: "2-digit", month: "short" });

/**
 * One form for the four services.
 *
 * A link from the schedule or the calculator arrives with a service, a sailing
 * or a volume already in the address. They are only defaults on a form a person
 * then reads and sends — nothing in a query string reaches the database
 * unchecked, and nothing in it can set a status or a price.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.slice(0, 120);
  };

  const [sailings, rates, company] = await Promise.all([
    publicSailings({ count: WEEKS_OFFERED }),
    publicRateBook("LCL"),
    bwCompany(),
  ]);

  const open = sailings.filter((sailing) => sailing.bookingOpen);

  /* One option per sailing, named by the day it leaves — which is what a
     customer means when they say "put me on the boat on the third". */
  const options = open.map((sailing) => ({
    departure: sailing.departureDate.toISOString().slice(0, 10),
    label: `Sails ${formatDate(sailing.departureDate)} — cargo in by ${formatDate(sailing.cargoDeadline)}`,
  }));

  return (
    <>
      <PageBanner
        label="Book a shipment · Foshan → Dar es Salaam"
        title={
          <>
            Book your space <span className="text-white/55">on the next container</span>
          </>
        }
        lead="Tell us what you are moving and when it is ready. We come back with space, a price and the sailing it goes on."
      />

      <ReqLayout
        docket="Request · Booking"
        title="Booking request"
        intro="Loose cargo, a full container, special cargo or clearance only — choose the service and the sailing you are aiming for."
        form={
          <BookingForm
            sailings={options}
            cargoTypes={rates.map((rate) => rate.cargoType)}
            defaults={{
              service: first("service"),
              sailing: first("sailing"),
              commodity: first("commodity"),
              cbm: first("cbm"),
            }}
          />
        }
        side={
          <>
            <section aria-labelledby="book-sailings" className="overflow-hidden rounded-[2px] bg-bw-night text-white">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                <h3 id="book-sailings" className="bw-label text-white/70">
                  Next open sailings
                </h3>
                <Link
                  href="/schedule"
                  className="bw-mono inline-flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.14em] text-bw-cyan hover:text-white"
                >
                  All <ArrowRight className="size-3" aria-hidden />
                </Link>
              </div>
              {open.length ? (
                <ol>
                  {open.slice(0, 4).map((sailing) => (
                    <li key={sailing.key} className="grid grid-cols-2 gap-3 border-b border-white/10 px-5 py-4 last:border-b-0">
                      <div>
                        <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/50">Receiving closes</p>
                        <p className="bw-mono mt-1 text-sm text-bw-coral-bright">{DAY_MONTH.format(sailing.cargoDeadline)}</p>
                      </div>
                      <div>
                        <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/50">Departs</p>
                        <p className="bw-mono mt-1 text-sm">{DAY_MONTH.format(sailing.departureDate)}</p>
                      </div>
                      <p className="bw-mono col-span-2 text-[0.7rem] text-white/55">
                        ETA Dar ≈ {DAY_MONTH.format(sailing.estimatedArrival)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="px-5 py-4 text-sm text-white/70">
                  No sailing is open for booking right now. Send the form anyway — the office will tell you when the next
                  container opens.
                </p>
              )}
              <p className="border-t border-white/10 px-5 py-3 text-xs text-white/50">{ARRIVAL_CAVEAT}</p>
            </section>

            <ReqBlock label="After you send it" title="What happens next">
              <ReqSteps
                items={[
                  ["We call you", "The office reads your request and rings or messages you on the number you gave."],
                  ["Space and price", "We confirm room on the sailing and the price from our rate book."],
                  ["Goods to Foshan", "Your supplier delivers to our warehouse — or we collect — before receiving closes."],
                  ["Counted and tracked", "Each package gets a reference you can track until you collect it in Dar es Salaam."],
                ]}
              />
            </ReqBlock>

            <ReqContact company={company} />
          </>
        }
      />
    </>
  );
}
