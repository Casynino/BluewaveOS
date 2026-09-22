import Link from "next/link";
import type { Metadata } from "next";
import {
  ClipboardCheck,
  Factory,
  Handshake,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Search,
  Send,
  Ship,
  ShoppingBag,
  Store,
} from "lucide-react";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact, ReqLayout, ReqSteps } from "@/components/bw/req-layout";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { VsFlow, VsFlowKey, type FlowStep } from "@/components/bw/vs-flow";
import { VisitForm } from "@/components/bw/vs-visit-form";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";
import { chinaSettings, listCategories, listCities, listFactories, listMarkets } from "@/lib/explore";

export const metadata: Metadata = {
  title: "Business visits to China — plan a buying trip",
  description:
    "Planning to visit China? BlueWave Cargo helps you turn the trip into a focused sourcing trip: the right markets, suppliers and factories, and your goods shipped home to Dar es Salaam.",
  alternates: { canonical: "/visit" },
  openGraph: {
    type: "website",
    title: "Business visits to China · BlueWave Cargo",
    description: "Markets, suppliers and factories on one plan — and what you buy shipped home to Tanzania.",
    url: "/visit",
  },
};

type Params = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

const COVERS = [
  {
    icon: Store,
    title: "Explore markets",
    body: "Which halls sell what you sell, how long each takes, and which to see first.",
  },
  {
    icon: Handshake,
    title: "Meet suppliers",
    body: "Sit down with sellers, compare quality and prices face to face, and agree terms.",
  },
  {
    icon: Factory,
    title: "Visit factories",
    body: "See where it is made, for larger orders or your own specification.",
  },
  {
    icon: Search,
    title: "Find products",
    body: "Know only what you want to sell? We point you to where it is made and sold.",
  },
];

const HOW: FlowStep[] = [
  { code: "01 · You", title: "Request", body: "Your dates, the cities and markets, and what you want to buy.", icon: Send },
  { code: "02 · Us", title: "We call you", body: "Somebody from the team calls or WhatsApps you to talk the trip through.", icon: PhoneCall, ours: true },
  {
    code: "03 · Us",
    title: "Plan confirmed",
    body: "The team writes down what has been arranged. Only then does your status page say Confirmed.",
    icon: ClipboardCheck,
    ours: true,
  },
  { code: "04 · You", title: "Visit", body: "Walk the markets, meet suppliers, see factories — with the plan in hand.", icon: MapPin },
  { code: "05 · You", title: "Buy", body: "Choose, agree and pay your suppliers. Keep their names and numbers.", icon: ShoppingBag },
  {
    code: "06 · Us",
    title: "We collect and ship",
    body: "We collect from your suppliers or receive at our Foshan warehouse, and ship to Dar es Salaam.",
    icon: Ship,
    ours: true,
    href: "/pickup",
    action: "China pickup",
  },
];

export default async function VisitPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [settings, company, cities, markets, factoryRows, categories] = await Promise.all([
    chinaSettings(),
    bwCompany(),
    listCities(),
    listMarkets(),
    listFactories(),
    listCategories(),
  ]);

  /* Only factories that take visitors are offered for a visit. */
  const factories = factoryRows.filter((f) => f.visitsAvailable);

  /* The address carries slugs; the form posts names, as the request stores them. */
  const want = { city: one(params.city), market: one(params.market), factory: one(params.factory), category: one(params.category) };
  const market = want.market ? markets.find((m) => m.slug === want.market) : undefined;
  const factory = want.factory ? factories.find((f) => f.slug === want.factory) : undefined;
  const cityNames = new Set(cities.map((c) => c.name));
  const pickedCities = [
    cities.find((c) => c.slug === want.city)?.name,
    market?.cityRef?.name,
    factory?.city?.name,
  ].filter((name): name is string => Boolean(name && cityNames.has(name)));
  const selected = {
    cities: [...new Set(pickedCities)],
    markets: market ? [market.name] : [],
    factories: factory ? [factory.name] : [],
    categories: [categories.find((c) => c.slug === want.category)?.name].filter((n): n is string => Boolean(n)),
  };

  /* Markets under their city, in the guide's own city order. */
  const groups = new Map<string, { value: string; label: string; sub: string | null }[]>();
  for (const m of markets) {
    const city = m.cityRef?.name ?? m.city ?? "Other markets";
    const list = groups.get(city) ?? [];
    list.push({ value: m.name, label: m.name, sub: m.visitDuration ? `Allow ${m.visitDuration}` : m.district });
    groups.set(city, list);
  }
  const order = cities.map((c) => c.name);
  const marketGroups = [...groups.entries()]
    .sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    })
    .map(([city, list]) => ({ city, markets: list }));

  return (
    <>
      <PageBanner
        label="Business visits · Explore China"
        title={
          <>
            Planning to visit China? <span className="text-white/55">Make it a buying trip</span>
          </>
        }
        lead="Turn a trip to China into a focused sourcing trip: the markets that sell what you sell, suppliers worth meeting, factories worth the drive — and what you buy shipped home. BlueWave helps organise the business side."
      >
        <div className="flex flex-wrap gap-3">
          <Action href="#visit-form" size="lg">
            {settings.visitsEnabled ? "Request a visit" : "Talk to the team"}
          </Action>
          <Action href="/explore" tone="ghost-light" size="lg">
            Explore markets and cities
          </Action>
        </div>
      </PageBanner>

      {/* ------------------------------------------------ WHAT A VISIT COVERS */}
      <section aria-labelledby="covers" className="bg-bw-ground">
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            index="01"
            label="What a visit covers"
            title={<span id="covers">A trip with a purpose</span>}
            lead="The markets are vast and the days are short. Tell us what you are buying and we help you spend the trip where the goods are."
          />
          <ul className="mt-12 grid border-l border-t border-bw-line sm:grid-cols-2 lg:grid-cols-4">
            {COVERS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="border-b border-r border-bw-line bg-bw-panel p-6">
                <div className="flex items-center justify-between">
                  <Icon className="size-6 text-bw-coral" aria-hidden />
                  <span className="bw-mono text-xs text-bw-muted">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <p className="bw-display mt-8 text-3xl uppercase text-bw-fg">{title}</p>
                <p className="mt-2 text-sm leading-relaxed text-bw-muted">{body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 grid gap-4 lg:grid-cols-12">
            <p className="text-bw-muted lg:col-span-8">
              <span className="font-semibold text-bw-fg">What we help with:</span> which markets, suppliers and
              factories to see and in what order, and getting what you buy to our Foshan warehouse and home to Dar es
              Salaam. Hotel and local transport you can ask about in the form — the team will tell you what can be
              arranged.
            </p>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------------ HOW IT WORKS */}
      <section aria-labelledby="how" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-16 lg:py-24">
          <SectionIntro
            dark
            index="02"
            label="How it works"
            title={<span id="how">From request to goods on the water</span>}
            lead="A visit is a request until the team confirms it. Here is everything that happens between your message and your cartons sailing."
          />
          <div className="mt-14">
            <VsFlow steps={HOW} dark />
          </div>
          <div className="mt-10">
            <VsFlowKey dark />
          </div>
        </Frame>
      </section>

      {/* ----------------------------------------------------- WHERE YOU CAN GO */}
      {cities.length ? (
        <section aria-labelledby="where" className="bw-yard">
          <Frame className="py-16 lg:py-24">
            <SectionIntro
              index="03"
              label="Where you can go"
              title={<span id="where">Cities in our guide</span>}
              lead="Each city page lists its markets and what they sell. Add a city to your visit and it is ticked on the form below."
            />
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cities.map((city) => (
                <li key={city.id} className="flex flex-col rounded-[2px] border border-bw-line bg-bw-panel p-5">
                  <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-bw-muted">
                    {[city.province, city.nameZh].filter(Boolean).join(" · ") || "China"}
                  </p>
                  <p className="bw-display mt-2 text-4xl uppercase text-bw-fg">{city.name}</p>
                  {city.tagline ? <p className="mt-2 text-sm text-bw-muted">{city.tagline}</p> : null}
                  <p className="bw-mono mt-4 text-xs text-bw-muted">
                    {city._count.markets} {city._count.markets === 1 ? "market" : "markets"}
                    {city._count.factories ? ` · ${city._count.factories} ${city._count.factories === 1 ? "factory" : "factories"}` : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-5">
                    <Link
                      href={`/cities/${city.slug}`}
                      className="bw-mono text-[0.7rem] uppercase tracking-[0.14em] text-bw-fg hover:text-bw-coral"
                    >
                      City guide →
                    </Link>
                    {settings.visitsEnabled ? (
                      <Link
                        href={`/visit?city=${encodeURIComponent(city.slug)}#visit-form`}
                        className="bw-mono text-[0.7rem] uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
                      >
                        Add to my visit +
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Frame>
        </section>
      ) : null}

      {/* ------------------------------------------------------ THE REQUEST */}
      <div id="visit-form">
        <ReqLayout
          docket="Request · Business visit"
          title={settings.visitsEnabled ? "Visit request" : "Talk to the team"}
          intro={
            settings.visitsEnabled
              ? "Fill in what you know — a rough idea is enough. The team calls you before anything is arranged."
              : undefined
          }
          form={
            settings.visitsEnabled ? (
              <VisitForm
                key={JSON.stringify(selected)}
                cities={cities.map((c) => ({ value: c.name, label: c.name, sub: c.province }))}
                marketGroups={marketGroups}
                factories={factories.map((f) => ({
                  value: f.name,
                  label: f.name,
                  sub: [f.city?.name, FACTORY_LISTING_LABEL[f.listing]].filter(Boolean).join(" · "),
                }))}
                categories={categories.map((c) => ({ value: c.name, label: c.name }))}
                selected={selected}
              />
            ) : (
              <div className="space-y-5">
                <p className="max-w-2xl text-lg text-bw-muted">
                  We are not taking business-visit requests on the website right now. Call or WhatsApp the office and
                  the team will talk your trip through with you.
                </p>
                <div className="flex flex-wrap gap-3">
                  {company.phone && company.phoneHref ? (
                    <a
                      href={company.phoneHref}
                      className="bw-mono inline-flex h-12 items-center gap-2 rounded-[2px] bg-bw-coral px-5 text-sm text-white hover:bg-bw-coral-dark"
                    >
                      <Phone className="size-4" aria-hidden /> {company.phone}
                    </a>
                  ) : null}
                  {company.whatsapp ? (
                    <a
                      href={company.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-12 items-center gap-2 rounded-[2px] border border-bw-fg/25 px-5 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-bw-fg hover:border-bw-fg"
                    >
                      <MessageCircle className="size-4 text-bw-coral" aria-hidden /> WhatsApp us
                    </a>
                  ) : null}
                  {!company.phone && !company.whatsapp ? (
                    <Action href="/contact" tone="ink">
                      Contact the office
                    </Action>
                  ) : null}
                </div>
              </div>
            )
          }
          side={
            <>
              <ReqBlock label="A request, not a booking" title="What happens next">
                <ReqSteps
                  items={[
                    ["You get a reference", "And a private link to your request's status page. Keep it."],
                    ["We call you", "Usually by phone or WhatsApp, to understand what you want to buy."],
                    ["We plan", "Markets, suppliers and factories that fit your dates — and what else can be arranged."],
                    ["Confirmed", "Only when the status page says Confirmed, with the plan written under it."],
                  ]}
                />
              </ReqBlock>
              <ReqBlock label="Not travelling?" title="We can source it for you">
                <p className="text-sm text-bw-muted">
                  If you would rather not fly, tell us what you want and the sourcing team looks for it from here.
                </p>
                <Link
                  href="/sourcing#sourcing-form"
                  className="bw-mono mt-4 inline-flex text-[0.7rem] uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
                >
                  Send a sourcing request →
                </Link>
              </ReqBlock>
              <ReqContact company={company} china />
            </>
          }
        />
      </div>

      <section className="border-t border-bw-line bg-bw-panel">
        <Frame className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Label className="text-bw-muted">Already sent a request?</Label>
            <p className="mt-2 max-w-xl text-bw-muted">
              Open the status link you were given. Lost it? Call the office with your reference.
            </p>
          </div>
          <Action href="/contact" tone="line">
            Contact the office
          </Action>
        </Frame>
      </section>
    </>
  );
}
