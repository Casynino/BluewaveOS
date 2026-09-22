import type { Metadata } from "next";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact, ReqLayout, ReqSteps } from "@/components/bw/req-layout";
import { Action, PageBanner } from "@/components/bw/ui";
import { QuoteForm } from "@/components/site/request-forms";

export const metadata: Metadata = {
  title: "Get a shipping quote — China to Tanzania",
  description:
    "Tell BlueWave Cargo what you are shipping from China to Dar es Salaam — goods, cartons, volume and where they are — and we come back with a price for loose cargo or a full container.",
  alternates: { canonical: "/quote" },
  openGraph: {
    type: "website",
    title: "Get a shipping quote · BlueWave Cargo",
    description: "Tell us what you ship from China to Tanzania and we come back with a price.",
    url: "/quote",
  },
};

/* The office's numbers come from settings; a few minutes is soon enough for a
   changed number to reach this page. */
export const revalidate = 300;

export default async function Page() {
  const company = await bwCompany();

  return (
    <>
      <PageBanner
        label="Quote · China → Tanzania"
        title={
          <>
            Get a quote <span className="text-white/55">for your cargo</span>
          </>
        }
        lead="Tell us what you are shipping and we come back with a price — loose cargo by the cubic metre, or a whole container."
      />

      <ReqLayout
        docket="Request · Quote"
        title="Quote request"
        intro="The more you tell us, the closer the price. An estimate is fine — the warehouse measures every carton when it arrives in Foshan."
        form={<QuoteForm />}
        side={
          <>
            <ReqBlock label="For an accurate price" title="What to include">
              <ReqSteps
                items={[
                  ["What the goods are", "Shoes, tiles, machine parts… Different goods have different rates."],
                  ["Volume or carton sizes", "The CBM from your supplier, or the size and number of cartons."],
                  ["Weight", "Roughly, in kilograms. It matters for heavy goods like tiles or metal."],
                  ["Where they are in China", "The city or market, if we need to collect them."],
                  ["Loose or full container", "Sharing a container, or a 20ft / 40ft of your own."],
                ]}
              />
            </ReqBlock>

            <ReqBlock label="Want a figure now?">
              <p className="text-sm text-bw-muted">
                The calculator prices loose cargo from the same rate book your invoice is raised from.
              </p>
              <Action href="/calculator" tone="ink" className="mt-4 w-full">
                Open the calculator
              </Action>
            </ReqBlock>

            <ReqContact company={company} label="Call or WhatsApp" />
          </>
        }
      />
    </>
  );
}
