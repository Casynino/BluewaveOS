import type { Metadata } from "next";

import { bwExchangeRate } from "@/components/bw/data";
import { FreightQuote } from "@/components/bw/freight-quote";
import { Action, Frame, Label, PageBanner } from "@/components/bw/ui";
import { formatCurrency, formatRate, isCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "Rates & freight calculator — China to Tanzania",
  description:
    "Estimate your sea freight from China to Dar es Salaam: choose your goods, enter the CBM or your box sizes, and see the price in USD and TZS from BlueWave's published rates.",
  alternates: { canonical: "/calculator" },
  openGraph: {
    title: "Rates & freight calculator — BlueWave Cargo",
    description: "Price your China to Tanzania sea cargo by CBM, in dollars and shillings.",
  },
};

export const revalidate = 60;

/**
 * RATES, BY QUESTION.
 *
 * By the owner's decision the rate book is not printed as a list: a customer
 * chooses their goods and a volume, and the server prices it from the rows the
 * invoice is raised from. Only the names of the loose-cargo types reach the
 * page; full-container prices are published per box.
 */
export default async function CalculatorPage() {
  const [lcl, fclRows, rate] = await Promise.all([
    publicRateBook("LCL"),
    prisma.shippingRate.findMany({
      where: { active: true, published: true, service: "FCL", cargoType: { not: null } },
      orderBy: { rate: "asc" },
      select: { cargoType: true, rate: true, currency: true },
    }),
    bwExchangeRate(),
  ]);
  const containers = fclRows
    .filter((row) => isCurrency(row.currency))
    .map((row) => ({ cargoType: row.cargoType!, price: formatCurrency(row.rate, row.currency) }));
  const hasRates = lcl.length > 0 || containers.length > 0;

  return (
    <>
      <PageBanner
        label="Rates & calculator"
        title="Price your shipment"
        lead="Choose your goods, give the CBM or measure your boxes, and see the freight in dollars and shillings — from the same rates your invoice is raised from."
      />

      <section aria-label="Freight calculator" className="bg-bw-ground">
        <Frame className="py-12 lg:py-16">
          {hasRates ? (
            <FreightQuote
              cargoTypes={lcl.map((r) => r.cargoType)}
              units={Object.fromEntries(lcl.map((r) => [r.cargoType, r.unit]))}
              containers={containers}
            />
          ) : (
            <div className="rounded-[4px] border border-bw-line bg-bw-panel p-8 sm:p-12">
              <p className="bw-display text-4xl uppercase text-bw-fg">Our rate card is being updated</p>
              <p className="mt-3 max-w-xl text-bw-muted">Tell us what you are shipping and we will come back with a price.</p>
              <div className="mt-6">
                <Action href="/quote">Ask for a quote</Action>
              </div>
            </div>
          )}
        </Frame>
      </section>

      <section aria-labelledby="how-priced" className="bg-bw-panel">
        <Frame className="grid gap-10 py-16 lg:grid-cols-12 lg:py-20">
          <div className="lg:col-span-4">
            <Label className="text-bw-muted">How pricing works</Label>
            <h2 id="how-priced" className="bw-display mt-4 text-[clamp(2.2rem,4.5vw,3.6rem)] uppercase text-bw-fg">
              Volume × rate, in dollars; paid in shillings
            </h2>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-[3px] bg-bw-line sm:grid-cols-2 lg:col-span-8">
            {[
              ["Measured in Foshan", "We count and measure your cargo when it reaches our warehouse. That CBM is what you are charged for."],
              ["Priced by type", "Each kind of goods has its own rate in our rate book — per cubic metre, per tonne, per piece or per bale."],
              ["Checked again in Dar", "Your cargo is counted again when it comes off the container, before the invoice is issued."],
              [
                "Shillings at the invoice rate",
                rate
                  ? `The invoice is in USD with the TZS amount at the rate of the day it is issued — today ${formatRate(rate.rate)}.`
                  : "The invoice is in USD with the TZS amount at the rate of the day it is issued.",
              ],
            ].map(([title, body], i) => (
              <li key={title} className="bg-bw-panel p-6">
                <p className="bw-mono text-xs text-bw-harbour">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-2 font-bw-display text-2xl font-semibold uppercase text-bw-fg">{title}</p>
                <p className="mt-2 text-bw-muted">{body}</p>
              </li>
            ))}
          </ol>
        </Frame>
      </section>
    </>
  );
}
