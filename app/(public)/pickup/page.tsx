import type { Metadata } from "next";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact, ReqLayout, ReqSteps } from "@/components/bw/req-layout";
import { PageBanner } from "@/components/bw/ui";
import { PickupForm } from "@/components/site/request-forms";
import { publicRateBook } from "@/lib/public-estimate";
import { supplierAddress } from "@/lib/supplier-address";

export const metadata: Metadata = {
  title: "China pickup — we collect from your supplier",
  description:
    "Ask BlueWave Cargo to collect your goods from a factory or market in China and bring them to our Foshan warehouse, ready for the next container to Dar es Salaam.",
  alternates: { canonical: "/pickup" },
  openGraph: {
    type: "website",
    title: "China pickup · BlueWave Cargo",
    description: "We collect from your supplier in China and bring the goods to our Foshan warehouse.",
    url: "/pickup",
  },
};

export const revalidate = 300;

export default async function Page() {
  const [rates, company, address] = await Promise.all([publicRateBook("LCL"), bwCompany(), supplierAddress()]);
  /* The rate book's own categories, offered as suggestions. A customer who
     picks one of ours is a customer Support does not have to reclassify. */
  const cargoTypes = rates.map((rate) => rate.cargoType);

  return (
    <>
      <PageBanner
        label="China pickup · Factory or market → Foshan"
        title={
          <>
            We collect it <span className="text-white/55">from your supplier</span>
          </>
        }
        lead="Tell us who your supplier is and when the goods are ready. Our China team collects them and brings them to the Foshan warehouse for the next container to Dar es Salaam."
      />

      <ReqLayout
        docket="Request · China pickup"
        title="Pickup request"
        intro="Fill in what you know. The office will call you to confirm the date and the pickup charge before anybody goes to the supplier."
        form={<PickupForm cargoTypes={cargoTypes} />}
        side={
          <>
            <ReqBlock label="What we need from your supplier" title="Before we go">
              <ReqSteps
                items={[
                  ["Supplier name and phone", "Someone at the factory or shop who answers and can hand our driver the goods."],
                  ["Pickup address", "The factory, market hall or shop number — in Chinese if you have it."],
                  ["Number of cartons", "And roughly how big they are, so we send the right vehicle."],
                  ["Ready date", "The day the goods are packed and paid for, so the driver does not wait."],
                  ["Your shipping mark", "Written on every carton, so your goods stay yours in the warehouse."],
                ]}
              />
            </ReqBlock>

            {address ? (
              <ReqBlock label={`${company.chinaCity} warehouse`} title="Delivering yourself?">
                <p className="text-sm text-bw-muted">
                  If your supplier can deliver, send them this address instead. It is in Chinese, the way a driver in
                  Foshan needs it.
                </p>
                <dl lang="zh-CN" className="mt-4 divide-y divide-bw-line border-y border-bw-line">
                  {address.lines.map((line) => (
                    <div key={line.label} className="grid gap-1 py-2.5">
                      <dt className="bw-mono text-[0.66rem] uppercase tracking-[0.14em] text-bw-muted">{line.label}</dt>
                      <dd className="break-words text-bw-fg">{line.value}</dd>
                    </div>
                  ))}
                </dl>
                {address.english ? (
                  <p className="mt-3 break-words text-sm text-bw-muted">
                    <span className="bw-mono text-[0.66rem] uppercase tracking-[0.14em]">In English · </span>
                    {address.english}
                  </p>
                ) : null}
              </ReqBlock>
            ) : null}

            <ReqContact company={company} china />
          </>
        }
      />
    </>
  );
}
