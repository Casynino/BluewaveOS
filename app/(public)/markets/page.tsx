import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Clock, MapPin } from "lucide-react";

import { MarketCard } from "@/components/bw/ex-cards";
import { Chip, FALLBACK, LogisticsBand, PhotoHero, photoOr } from "@/components/bw/ex-kit";
import { Action, Frame, Label } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { listCategories, listCities, listMarkets } from "@/lib/explore";

export const revalidate = 300;

type Props = { searchParams: Promise<{ city?: string | string[]; category?: string | string[] }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** A filter URL that keeps the other filter as it is. */
function href(filter: { city?: string; category?: string }) {
  const q = new URLSearchParams();
  if (filter.city) q.set("city", filter.city);
  if (filter.category) q.set("category", filter.category);
  const s = q.toString();
  return s ? `/markets?${s}` : "/markets";
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const [cities, categories] = await Promise.all([listCities(), listCategories()]);
  const city = cities.find((c) => c.slug === one(sp.city));
  const category = categories.find((c) => c.slug === one(sp.category));
  const title = category
    ? `${category.name} markets in ${city?.name ?? "China"}`
    : city
      ? `Wholesale markets in ${city.name}`
      : "Wholesale markets in China — a trader's guide";
  const description =
    "Guides to the wholesale markets Tanzanian traders buy from in China: what each sells, opening hours, how long to allow and tips before you go.";
  return {
    title,
    description,
    alternates: { canonical: href({ city: city?.slug, category: category?.slug }) },
    openGraph: { type: "website", title: `${title} · BlueWave Cargo`, description, url: "/markets" },
  };
}

export default async function MarketsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [cities, categories] = await Promise.all([listCities(), listCategories()]);
  /* Only filters that name a published row are applied; anything else is ignored. */
  const city = cities.find((c) => c.slug === one(sp.city));
  const category = categories.find((c) => c.slug === one(sp.category));
  const markets = await listMarkets({ city: city?.slug, category: category?.slug });

  const cityOptions = cities.filter((c) => c._count.markets > 0);
  const categoryOptions = categories.filter((c) => c._count.markets > 0);
  const filtered = Boolean(city || category);
  const [lead, ...rest] = markets;

  return (
    <>
      <PhotoHero
        image={photoOr(city?.heroImage, "/photos/cn-market-street.jpg")}
        alt={city ? `${city.name}, ${city.province ?? "China"}` : PHOTOS.cnMarketStreet.alt}
        crumbs={[["Explore China", "/explore"], ["Markets"]]}
        label="Wholesale markets"
        title={city ? `Markets in ${city.name}` : category ? `${category.name} markets` : "Markets worth the trip"}
        lead="Our notes on the wholesale markets Tanzanian traders buy from: what is sold there, when it opens, how long to give it and what to watch for. The markets are independent — BlueWave doesn't run them."
      />

      {/* -------------------------------------------------------- FILTERS */}
      <section aria-label="Filter markets" className="border-b border-bw-line bg-bw-panel">
        <Frame className="grid gap-6 py-8 lg:grid-cols-12 lg:gap-10">
          <FilterRow label="City" className="lg:col-span-5">
            <Chip href={href({ category: category?.slug })} active={!city}>
              All cities
            </Chip>
            {cityOptions.map((c) => (
              <Chip key={c.slug} href={href({ city: c.slug, category: category?.slug })} active={city?.slug === c.slug}>
                {c.name}
              </Chip>
            ))}
          </FilterRow>
          <FilterRow label="Product" className="lg:col-span-7">
            <Chip href={href({ city: city?.slug })} active={!category}>
              All products
            </Chip>
            {categoryOptions.map((c) => (
              <Chip key={c.slug} href={href({ city: city?.slug, category: c.slug })} active={category?.slug === c.slug}>
                {c.name}
              </Chip>
            ))}
          </FilterRow>
        </Frame>
      </section>

      {/* -------------------------------------------------------- RESULTS */}
      <section aria-labelledby="market-results" className="bg-bw-ground">
        <Frame className="py-14 lg:py-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-bw-line pb-5">
            <h2 id="market-results" className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-muted">
              {markets.length} {markets.length === 1 ? "market" : "markets"}
              {category ? ` · ${category.name}` : ""}
              {city ? ` · ${city.name}` : ""}
            </h2>
            {filtered ? (
              <Link href="/markets" className="bw-mono text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark">
                Clear filters
              </Link>
            ) : null}
          </div>

          {lead ? (
            <>
              {/* The first market, set as a feature. */}
              <Link
                href={`/markets/${lead.slug}`}
                className="group mt-8 grid overflow-hidden rounded-[3px] border border-bw-line bg-bw-panel lg:grid-cols-12"
              >
                <div className="relative min-h-[18rem] overflow-hidden bg-bw-ink sm:min-h-[24rem] lg:col-span-7 lg:min-h-[30rem]">
                  <Image
                    src={photoOr(lead.imageUrl, FALLBACK.market)}
                    alt={`${lead.name}, ${lead.cityRef?.name ?? lead.city ?? "China"}`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 58vw, 100vw"
                    className="bw-photo object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="flex min-w-0 flex-col p-6 sm:p-10 lg:col-span-5">
                  <p className="bw-mono inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.14em] text-bw-harbour">
                    <MapPin className="size-3.5" aria-hidden />
                    {[lead.district, lead.cityRef?.name ?? lead.city].filter(Boolean).join(" · ")}
                  </p>
                  <h3 className="bw-display mt-4 break-words text-[clamp(2.6rem,5vw,4.4rem)] uppercase text-bw-fg group-hover:text-bw-coral">
                    {lead.name}
                  </h3>
                  {lead.summary ? <p className="mt-4 text-lg leading-relaxed text-bw-muted">{lead.summary}</p> : null}
                  <div className="mt-auto pt-8">
                    <dl className="grid grid-cols-2 border-t border-bw-line pt-4">
                      <div className="min-w-0">
                        <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">Allow</dt>
                        <dd className="mt-1 inline-flex items-center gap-1.5 text-bw-fg">
                          <Clock className="size-3.5 text-bw-muted" aria-hidden />
                          {lead.visitDuration ?? "Ask us"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">Sells</dt>
                        <dd className="mt-1 break-words text-bw-fg">{lead.categories.map((c) => c.name).join(", ") || "—"}</dd>
                      </div>
                    </dl>
                    <span className="bw-mono mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral">
                      Read the guide <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </span>
                  </div>
                </div>
              </Link>

              {rest.length ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((market) => (
                    <li key={market.id} className="flex min-w-0">
                      <MarketCard market={market} className="w-full" />
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <div className="mt-10 max-w-2xl rounded-[3px] border border-bw-line bg-bw-panel p-6 sm:p-10">
              <Label className="text-bw-muted">Nothing here yet</Label>
              <p className="bw-display mt-4 text-4xl uppercase text-bw-fg">No market guide matches</p>
              <p className="mt-4 text-bw-muted">
                We haven&apos;t written up a market for this yet. Tell us what you are buying and we will tell you where it
                is sold.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Action href={`/sourcing${category ? `?category=${category.slug}` : city ? `?city=${city.slug}` : ""}`}>
                  Request sourcing
                </Action>
                <Action href="/markets" tone="line">
                  All markets
                </Action>
              </div>
            </div>
          )}

          <p className="mt-10 max-w-2xl text-sm leading-relaxed text-bw-muted">
            Opening hours and what is sold change. Confirm with your supplier, or with us, before you travel for a
            particular market.
          </p>
        </Frame>
      </section>

      <LogisticsBand current="Buy" />
    </>
  );
}

function FilterRow({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`min-w-0 ${className ?? ""}`}>
      <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">{label}</p>
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
