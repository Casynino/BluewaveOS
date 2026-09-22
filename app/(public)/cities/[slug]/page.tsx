import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { FactoryCard, MarketCard } from "@/components/bw/ex-cards";
import { BlockTitle, FactoriesEmpty, FALLBACK, Gallery, LogisticsBand, PhotoHero, photoOr } from "@/components/bw/ex-kit";
import { Action, Frame, Label } from "@/components/bw/ui";
import { CITY_SERVICES } from "@/lib/china-content";
import { chinaSettings, cityBySlug } from "@/lib/explore";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const city = await cityBySlug(slug);
  if (!city) return { title: "City not found" };
  const title = `${city.name} for business — markets, factories and sourcing`;
  const description =
    city.summary ??
    `${city.name}, ${city.province ?? "China"}: what the city trades, where to buy and how BlueWave ships it to Dar es Salaam.`;
  return {
    title,
    description,
    alternates: { canonical: `/cities/${city.slug}` },
    openGraph: {
      type: "article",
      title: `${city.name} — ${city.tagline ?? "business guide"} · BlueWave Cargo`,
      description,
      url: `/cities/${city.slug}`,
      images: city.heroImage?.startsWith("/") ? [{ url: city.heroImage }] : undefined,
    },
  };
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params;
  const [city, settings] = await Promise.all([cityBySlug(slug), chinaSettings()]);
  if (!city) notFound();

  const services = city.services.filter((key): key is keyof typeof CITY_SERVICES => key in CITY_SERVICES);
  const visits = settings.visitsEnabled && services.includes("VISITS");
  const factoryService = settings.sourcingServices.includes("FACTORY");

  const editorial: [title: string, items: string[], note: string][] = [
    ["Known for", city.knownFor, "What the trade knows the city by"],
    ["What to source", city.whatToSource, "Goods worth looking for here"],
    ["Business districts", city.businessDistricts, "Where the buying happens"],
  ];

  return (
    <>
      <PhotoHero
        image={photoOr(city.heroImage, FALLBACK.city)}
        alt={`${city.name}, ${city.province ?? "China"}`}
        crumbs={[["Explore China", "/explore"], ["Cities", "/cities"], [city.name]]}
        label={[city.province, "China"].filter(Boolean).join(" · ")}
        title={
          <>
            {city.nameZh ? (
              <span lang="zh" className="mb-2 block font-bw-sans text-[0.45em] font-light normal-case text-white/45">
                {city.nameZh}
              </span>
            ) : null}
            {city.name}
          </>
        }
        lead={city.tagline}
        tall
        aside={
          <dl className="bw-glass grid grid-cols-2 gap-px overflow-hidden rounded-[4px]">
            <HeroFact label="Markets in guide" value={String(city.markets.length)} />
            <HeroFact label="Factories listed" value={String(city.factories.length)} />
            {city.travelNote ? <HeroFact label="Getting there" value={city.travelNote} wide /> : null}
          </dl>
        }
      />

      {/* ------------------------------------------------------- SUMMARY */}
      <section aria-label={`About ${city.name}`} className="bg-bw-panel">
        <Frame className="grid gap-10 py-16 lg:grid-cols-12 lg:py-24">
          <div className="min-w-0 lg:col-span-3">
            <Label className="text-bw-muted">The city</Label>
          </div>
          <div className="min-w-0 lg:col-span-8">
            {city.summary ? (
              <p className="bw-display text-[clamp(1.9rem,3.6vw,3rem)] normal-case leading-[1.05] text-bw-fg">{city.summary}</p>
            ) : (
              <p className="text-lg text-bw-muted">Our notes on {city.name} are being written.</p>
            )}
            {city.body ? (
              <div className="mt-8 max-w-2xl space-y-4 whitespace-pre-line text-lg leading-relaxed text-bw-muted">{city.body}</div>
            ) : null}
          </div>
        </Frame>
      </section>

      {/* ----------------------------------------------------- EDITORIAL */}
      <section aria-label="What the city trades" className="border-y border-bw-line bg-bw-ground">
        <Frame className="grid py-0 md:grid-cols-3">
          {editorial.map(([title, items, note], i) => (
            <div key={title} className="min-w-0 border-bw-line py-12 [&:not(:last-child)]:border-b md:px-8 md:first:pl-0 md:[&:not(:first-child)]:border-l md:[&:not(:last-child)]:border-b-0 lg:py-16">
              <p className="bw-mono text-xs text-bw-harbour">{String(i + 1).padStart(2, "0")}</p>
              <h2 className="bw-display mt-3 text-4xl uppercase text-bw-fg">{title}</h2>
              <p className="mt-1 text-sm text-bw-muted">{note}</p>
              {items.length ? (
                <ul className="mt-6 border-t border-bw-line">
                  {items.map((item) => (
                    <li key={item} className="border-b border-bw-line py-3 font-bw-display text-xl font-semibold uppercase text-bw-fg">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-6 text-bw-muted">Ask us.</p>
              )}
            </div>
          ))}
        </Frame>
      </section>

      {/* -------------------------------------------------------- GALLERY */}
      {city.gallery.length ? (
        <section aria-label={`Pictures of ${city.name}`} className="bg-bw-panel">
          <Frame className="py-16 lg:py-20">
            <Gallery images={city.gallery} alt={city.name} />
            <p className="bw-mono mt-3 text-[0.66rem] uppercase tracking-[0.12em] text-bw-muted">
              Photographs illustrate the city and its trade.
            </p>
          </Frame>
        </section>
      ) : null}

      {/* -------------------------------------------------------- MARKETS */}
      <section aria-labelledby="city-markets" className="bg-bw-ground">
        <Frame className="py-20 lg:py-24">
          <BlockTitle
            index="A"
            label="Markets"
            id="city-markets"
            title={`Markets in ${city.name}`}
            action={city.markets.length ? { href: `/markets?city=${city.slug}`, label: "Browse on the market list" } : undefined}
          />
          {city.markets.length ? (
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {city.markets.map((market) => (
                <li key={market.id} className="flex min-w-0">
                  <MarketCard market={market} className="w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 max-w-xl text-lg text-bw-muted">
              No market guide for {city.name} yet.{" "}
              <Link href={`/sourcing?city=${city.slug}`} className="text-bw-coral underline-offset-4 hover:underline">
                Ask us where to buy
              </Link>
              .
            </p>
          )}
        </Frame>
      </section>

      {/* ------------------------------------------------------ FACTORIES */}
      <section aria-labelledby="city-factories" className="border-t border-bw-line bg-bw-panel">
        <Frame className="py-20 lg:py-24">
          <BlockTitle
            index="B"
            label="Factories"
            id="city-factories"
            title={`Factories in ${city.name}`}
            action={city.factories.length ? { href: `/factories?city=${city.slug}`, label: "Factory directory" } : undefined}
          />
          <div className="mt-12">
            {city.factories.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {city.factories.map((factory) => (
                  <li key={factory.id} className="flex min-w-0">
                    <FactoryCard factory={factory} className="w-full" />
                  </li>
                ))}
              </ul>
            ) : (
              <FactoriesEmpty where={city.name} factoryServiceOffered={factoryService} visitsEnabled={visits} />
            )}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------- SERVICES + TRAVEL + CTA */}
      <section aria-labelledby="city-help" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="grid gap-12 py-20 lg:grid-cols-12 lg:py-24">
          <div className="min-w-0 lg:col-span-6">
            <Label className="text-white/70">
              <span className="text-bw-cyan">C</span>
              <span aria-hidden>/</span>
              BlueWave in {city.name}
            </Label>
            <h2 id="city-help" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase">
              Buying in {city.name}? We can help
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {visits ? <Action href={`/visit?city=${city.slug}`}>Plan a visit</Action> : null}
              <Action href={`/sourcing?city=${city.slug}`} tone={visits ? "ghost-light" : "coral"}>
                Request sourcing
              </Action>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5 lg:col-start-8">
            <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">Available from here</p>
            {services.length ? (
              <ul className="mt-4 border-t border-white/15">
                {services.map((key) => (
                  <li key={key} className="flex items-center gap-3 border-b border-white/15 py-4">
                    <Check className="size-4 shrink-0 text-bw-coral-bright" aria-hidden />
                    <span className="font-bw-display text-2xl font-semibold uppercase">{CITY_SERVICES[key]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-white/70">Ask the office what we can arrange in {city.name}.</p>
            )}
            {city.travelNote ? (
              <div className="mt-8 border-l-2 border-bw-coral pl-4">
                <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-white/55">Travel note</p>
                <p className="mt-2 text-lg text-white/85">{city.travelNote}</p>
              </div>
            ) : null}
            <Link
              href="/explore#cities"
              className="bw-mono mt-8 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/65 hover:text-white"
            >
              Other cities <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </Frame>
      </section>

      <LogisticsBand current="Discover" />
    </>
  );
}

function HeroFact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`min-w-0 bg-bw-night/40 p-4 ${wide ? "col-span-2" : ""}`}>
      <dt className="bw-mono text-[0.64rem] uppercase tracking-[0.14em] text-white/60">{label}</dt>
      <dd className={wide ? "mt-1 text-base text-white/90" : "bw-display mt-1 text-4xl"}>{value}</dd>
    </div>
  );
}
