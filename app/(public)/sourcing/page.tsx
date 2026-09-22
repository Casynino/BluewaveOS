import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Scale, Search, Ship, ShoppingBag, Warehouse } from "lucide-react";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact, ReqLayout, ReqSteps } from "@/components/bw/req-layout";
import { Action, Frame, PageBanner, SectionIntro } from "@/components/bw/ui";
import { VsFlow, VsFlowKey, type FlowStep } from "@/components/bw/vs-flow";
import { SourcingForm } from "@/components/bw/vs-sourcing-form";
import { SOURCING_SERVICES, isSourcingService } from "@/lib/china-content";
import { chinaSettings, listCategories, listCities, listFactories, listMarkets } from "@/lib/explore";

export const metadata: Metadata = {
  title: "Sourcing in China — products, suppliers and factories found for you",
  description:
    "Tell BlueWave Cargo what you want to buy in China. Our China team looks for the product, the supplier or the factory, and once you have bought, we receive it at our Foshan warehouse and ship it to Dar es Salaam.",
  alternates: { canonical: "/sourcing" },
  openGraph: {
    type: "website",
    title: "Sourcing in China · BlueWave Cargo",
    description: "Products, suppliers and factories found for you — and shipped from Foshan to Dar es Salaam.",
    url: "/sourcing",
  },
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

const FLOW: FlowStep[] = [
  {
    code: "01 · Find",
    title: "Find",
    body: "You tell us what you want — a name, a photo, a price to hit. We look for where it is made and sold.",
    icon: Search,
    ours: true,
  },
  {
    code: "02 · Source",
    title: "Source",
    body: "We compare suppliers and prices and bring you the options, so you choose with the facts in front of you.",
    icon: Scale,
    ours: true,
  },
  {
    code: "03 · Visit",
    title: "Visit",
    body: "Want to see it with your own eyes? Visit the market or factory with our help — or skip this and decide from here.",
    icon: MapPin,
    href: "/visit",
    action: "Business visits",
  },
  {
    code: "04 · Buy",
    title: "Buy",
    body: "You choose the supplier and agree the order. Nothing is bought without your say.",
    icon: ShoppingBag,
  },
  {
    code: "05 · Receive",
    title: "Receive",
    body: "Delivered by the supplier, or collected by us, to our Foshan warehouse — counted and photographed.",
    icon: Warehouse,
    ours: true,
    href: "/pickup",
    action: "China pickup",
  },
  {
    code: "06 · Ship",
    title: "Ship",
    body: "Loaded on the next container to Dar es Salaam and tracked until you collect in Tanzania.",
    icon: Ship,
    ours: true,
    href: "/schedule",
    action: "Sailings",
  },
];

export default async function SourcingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [settings, company, cities, categories, markets, factories] = await Promise.all([
    chinaSettings(),
    bwCompany(),
    listCities(),
    listCategories(),
    listMarkets(),
    listFactories(),
  ]);

  /* Only what the company offers, in the order it lists them. */
  const services = settings.sourcingServices
    .filter(isSourcingService)
    .map((key) => ({ key, label: SOURCING_SERVICES[key].label, blurb: SOURCING_SERVICES[key].blurb }));

  /* The address carries slugs and keys; the form posts names. */
  const want = {
    service: one(params.service),
    category: one(params.category),
    city: one(params.city),
    market: one(params.market),
    factory: one(params.factory),
  };
  const market = want.market ? markets.find((m) => m.slug === want.market) : undefined;
  const factory = want.factory ? factories.find((f) => f.slug === want.factory) : undefined;
  const cityNames = cities.map((c) => c.name);
  const cityName =
    cities.find((c) => c.slug === want.city)?.name ??
    [market?.cityRef?.name, factory?.city?.name].find((name) => name && cityNames.includes(name));
  const interested = [market?.name, factory?.name].filter(Boolean);
  const preset = {
    service: want.service && services.some((s) => s.key === want.service) ? want.service : undefined,
    category: categories.find((c) => c.slug === want.category)?.name,
    city: cityName,
    details: interested.length ? `Interested in: ${interested.join(", ")}\n` : undefined,
  };

  return (
    <>
      <PageBanner
        label="Sourcing · Find it in China"
        title={
          <>
            We find it. <span className="text-white/55">You buy it. We ship it.</span>
          </>
        }
        lead="Tell us what you want to sell. Our China team looks for where it is made and sold, compares suppliers and prices, and once you have bought, we receive it at our Foshan warehouse and ship it to Dar es Salaam."
      >
        <div className="flex flex-wrap gap-3">
          {services.length ? (
            <Action href="#sourcing-form" size="lg">
              Send a sourcing request
            </Action>
          ) : null}
          <Action href="/visit" tone="ghost-light" size="lg">
            Go yourself — business visits
          </Action>
        </div>
      </PageBanner>

      {/* ---------------------------------------------------------- THE FLOW */}
      <section aria-labelledby="flow" className="bw-yard">
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            index="01"
            label="From idea to Dar es Salaam"
            title={<span id="flow">Find · Source · Visit · Buy · Receive · Ship</span>}
            lead="One team from the first question to the goods landing in Tanzania. You decide what to buy; we do the looking, the receiving and the shipping."
          />
          <div className="mt-14 rounded-[2px] border border-bw-line bg-bw-panel/80 p-6 backdrop-blur-[1px] sm:p-10">
            <VsFlow steps={FLOW} />
            <div className="mt-10 border-t border-bw-line pt-6">
              <VsFlowKey />
            </div>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------------ THE SERVICES */}
      {services.length ? (
        <section aria-labelledby="services" className="relative isolate overflow-hidden bg-bw-ink text-white">
          <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
          <Frame className="py-16 lg:py-24">
            <SectionIntro
              dark
              index="02"
              label="What we can do"
              title={<span id="services">Sourcing help</span>}
              lead="Pick the one closest to what you need. Not sure? Choose the first — the team will steer it when they call."
            />
            <ul className="mt-12 grid gap-px overflow-hidden rounded-[2px] bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service, i) => (
                <li key={service.key} className="flex flex-col bg-bw-ink p-6 sm:p-7">
                  <span className="bw-mono text-xs text-bw-cyan">{String(i + 1).padStart(2, "0")}</span>
                  <p className="bw-display mt-6 text-4xl uppercase">{service.label}</p>
                  <p className="mt-3 leading-relaxed text-white/70">{service.blurb}</p>
                  <Link
                    href={`/sourcing?service=${service.key}#sourcing-form`}
                    className="bw-mono group mt-auto inline-flex items-center gap-2 pt-6 text-[0.72rem] uppercase tracking-[0.14em] text-white hover:text-bw-coral-bright"
                  >
                    Ask for this
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Frame>
        </section>
      ) : null}

      {/* ------------------------------------------------------ THE REQUEST */}
      <div id="sourcing-form">
        <ReqLayout
          docket="Request · Sourcing"
          title={services.length ? "Sourcing request" : "Talk to the team"}
          intro={
            services.length
              ? "The more you tell us, the better the first answer. Only the product and your phone number are needed."
              : undefined
          }
          form={
            services.length ? (
              <SourcingForm
                key={JSON.stringify(preset)}
                services={services}
                categories={categories.map((c) => c.name)}
                cities={cityNames}
                preset={preset}
              />
            ) : (
              <div>
                <p className="max-w-2xl text-lg text-bw-muted">
                  We are not taking sourcing requests on the website right now. Call or WhatsApp the office and the
                  team will help you.
                </p>
              </div>
            )
          }
          side={
            <>
              <ReqBlock label="What helps us find it" title="Before you send">
                <ReqSteps
                  items={[
                    ["A photo", "From a catalogue, a sample you hold, or a screenshot. It settles more than a paragraph."],
                    ["Quantity", "A few cartons or a container — suppliers answer differently to each."],
                    ["Target price", "What it has to cost for you to sell it at home."],
                    ["Specification", "Sizes, materials, power, packaging, anything that must be exact."],
                  ]}
                />
              </ReqBlock>
              <ReqBlock label="Prefer to go yourself?" title="Visit China">
                <p className="text-sm text-bw-muted">
                  Plan a buying trip to the markets and factories, and we help organise the business side.
                </p>
                <Link
                  href="/visit#visit-form"
                  className="bw-mono mt-4 inline-flex text-[0.7rem] uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
                >
                  Request a business visit →
                </Link>
              </ReqBlock>
              <ReqContact company={company} china />
            </>
          }
        />
      </div>
    </>
  );
}
