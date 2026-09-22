import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, ArrowUpRight, Clock, MapPin } from "lucide-react";

import { FactoryCard, MarketCard } from "@/components/bw/ex-cards";
import { BlockTitle, FALLBACK, Gallery, LogisticsBand, PhotoHero, Tags, mapHref, photoOr } from "@/components/bw/ex-kit";
import { Action, Frame, Label } from "@/components/bw/ui";
import { chinaSettings, listCities, marketBySlug } from "@/lib/explore";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const market = await marketBySlug(slug);
  if (!market) return { title: "Market not found" };
  const where = market.cityRef?.name ?? market.city ?? "China";
  const title = `${market.name}, ${where} — market guide`;
  const description =
    market.summary ??
    `${market.name} in ${where}: what is sold there, opening hours, how long to allow and tips before you go.`;
  return {
    title,
    description,
    alternates: { canonical: `/markets/${market.slug}` },
    openGraph: {
      type: "article",
      title: `${market.name} · BlueWave Cargo`,
      description,
      url: `/markets/${market.slug}`,
      images: market.imageUrl?.startsWith("/") ? [{ url: market.imageUrl }] : undefined,
    },
  };
}

export default async function MarketPage({ params }: Props) {
  const { slug } = await params;
  const [market, cities, settings] = await Promise.all([marketBySlug(slug), listCities(), chinaSettings()]);
  if (!market) notFound();

  const cityName = market.cityRef?.name ?? market.city ?? null;
  /* A city is linked only while its own guide page is published. */
  const cityLive = market.cityRef && cities.some((c) => c.slug === market.cityRef?.slug) ? market.cityRef : null;
  const map = mapHref({
    latitude: market.latitude,
    longitude: market.longitude,
    query: [market.name, market.district, cityName].filter(Boolean).join(", "),
  });
  const pinned = typeof market.latitude === "number" && typeof market.longitude === "number";
  const categories = market.categories.map((c) => c.name);

  const facts: [label: string, value: string | null][] = [
    ["City", cityName],
    ["District", market.district],
    ["Open", market.hours],
    ["Allow", market.visitDuration],
  ];

  return (
    <>
      <PhotoHero
        image={photoOr(market.imageUrl, FALLBACK.market)}
        alt={`${market.name}${cityName ? `, ${cityName}` : ""}`}
        crumbs={[["Explore China", "/explore"], ["Markets", "/markets"], [market.name]]}
        label={
          <>
            <MapPin className="size-3.5 text-bw-coral-bright" aria-hidden />
            {[market.district, cityName].filter(Boolean).join(" · ") || "China"}
          </>
        }
        title={market.name}
        lead={market.summary}
        tall
      >
        {categories.length ? <Tags items={categories} dark /> : null}
      </PhotoHero>

      {/* ------------------------------------------------------ FACT RAIL */}
      <section aria-label="At a glance" className="border-b border-bw-line bg-bw-panel">
        <Frame>
          <dl className="grid grid-cols-2 lg:grid-cols-4">
            {facts.map(([label, value], i) => (
              <div
                key={label}
                className={`min-w-0 border-bw-line py-6 pr-4 ${i % 2 === 1 ? "border-l pl-4" : ""} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-4" : ""}`}
              >
                <dt className="bw-mono text-[0.64rem] uppercase tracking-[0.16em] text-bw-muted">{label}</dt>
                <dd className="mt-2 break-words font-bw-display text-xl font-semibold uppercase leading-tight text-bw-fg sm:text-2xl">
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      {/* ---------------------------------------------- STORY + LOCATION */}
      <section aria-labelledby="about-market" className="bg-bw-ground">
        <Frame className="grid gap-12 py-20 lg:grid-cols-12 lg:py-28">
          <article className="min-w-0 lg:col-span-7">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">01</span>
              <span aria-hidden>/</span>
              The market
            </Label>
            <h2 id="about-market" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              What it is
            </h2>
            {market.description ? (
              <div className="mt-6 space-y-5 whitespace-pre-line text-lg leading-relaxed text-bw-fg/85 first-letter:float-left first-letter:mr-3 first-letter:font-bw-display first-letter:text-7xl first-letter:font-semibold first-letter:leading-[0.8] first-letter:text-bw-coral">
                {market.description}
              </div>
            ) : (
              <p className="mt-6 text-lg text-bw-muted">Our full notes on this market are being written. Ask us about it.</p>
            )}

            <div className="mt-14 border-t border-bw-line pt-10">
              <Label className="text-bw-muted">
                <span className="text-bw-harbour">02</span>
                <span aria-hidden>/</span>
                Why businesses visit
              </Label>
              <p className="bw-display mt-5 text-[clamp(1.8rem,3.4vw,2.8rem)] normal-case leading-[1.05] text-bw-fg">
                {market.summary ??
                  (categories.length ? `A place to buy ${categories.join(", ").toLowerCase()} wholesale.` : "Wholesale buying, in quantity.")}
              </p>
              <p className="mt-4 max-w-xl text-bw-muted">
                Traders come to see the goods, compare sellers side by side and order by the carton
                {cityName ? ` — and to meet the suppliers ${cityName} is known for` : ""}.
              </p>
            </div>
          </article>

          <aside aria-labelledby="location" className="min-w-0 lg:col-span-4 lg:col-start-9">
            <div className="lg:sticky lg:top-24">
              <div className="relative isolate overflow-hidden rounded-[3px] bg-bw-night p-6 text-white sm:p-8">
                <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
                <Label className="text-white/70">Location</Label>
                <h2 id="location" className="bw-display mt-4 break-words text-4xl uppercase">
                  {market.district ?? cityName ?? "China"}
                </h2>
                <dl className="mt-6 space-y-4 border-t border-white/15 pt-5 text-sm">
                  {cityName ? (
                    <div>
                      <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">City</dt>
                      <dd className="mt-1 text-white/90">
                        {cityLive ? (
                          <Link href={`/cities/${cityLive.slug}`} className="underline-offset-4 hover:text-bw-coral-bright hover:underline">
                            {cityLive.name}
                          </Link>
                        ) : (
                          cityName
                        )}
                      </dd>
                    </div>
                  ) : null}
                  {market.address ? (
                    <div>
                      <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">Address</dt>
                      <dd className="mt-1 whitespace-pre-line break-words text-white/90">{market.address}</dd>
                    </div>
                  ) : null}
                </dl>
                <a
                  href={map}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group mt-6 inline-flex w-full items-center justify-between gap-3 rounded-[2px] border border-white/30 px-4 py-3 font-bw-display text-base font-semibold uppercase tracking-[0.06em] hover:border-white hover:bg-white/10"
                >
                  {pinned ? "Open on the map" : "Search on the map"}
                  <ArrowUpRight className="size-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </a>
                <p className="bw-mono mt-2 text-[0.68rem] text-white/45">OpenStreetMap · opens in a new tab</p>
              </div>

              <div className="mt-3 rounded-[3px] border border-bw-line bg-bw-panel p-6 sm:p-8">
                <Label className="text-bw-muted">Hours</Label>
                <p className="mt-4 inline-flex items-start gap-2 text-lg text-bw-fg">
                  <Clock className="mt-1 size-4 shrink-0 text-bw-muted" aria-hidden />
                  <span className="break-words">{market.hours ?? "Ask us before you go"}</span>
                </p>
                {market.visitDuration ? (
                  <p className="mt-3 text-bw-muted">
                    Allow <span className="text-bw-fg">{market.visitDuration.toLowerCase()}</span>.
                  </p>
                ) : null}
                <p className="mt-5 flex gap-2 border-t border-bw-line pt-4 text-sm leading-relaxed text-bw-muted">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bw-coral" aria-hidden />
                  <span>{market.verify ?? "Hours can change. Confirm with your supplier, or with us, before you travel."}</span>
                </p>
              </div>
            </div>
          </aside>
        </Frame>
      </section>

      {/* ------------------------------------------------------ PRODUCTS */}
      {market.products.length ? (
        <section aria-labelledby="products" className="relative isolate overflow-hidden bg-bw-ink text-white">
          <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
          <Frame className="grid gap-10 py-20 lg:grid-cols-12 lg:py-24">
            <div className="min-w-0 lg:col-span-4">
              <Label className="text-white/70">
                <span className="text-bw-cyan">03</span>
                <span aria-hidden>/</span>
                On the floors
              </Label>
              <h2 id="products" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase">
                What you can find
              </h2>
            </div>
            <ol className="grid min-w-0 gap-px self-end overflow-hidden rounded-[2px] bg-white/10 sm:grid-cols-2 lg:col-span-8">
              {market.products.map((product, i) => (
                <li key={product} className="flex min-w-0 items-baseline gap-4 bg-bw-ink p-5">
                  <span className="bw-mono text-xs text-bw-cyan">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 break-words font-bw-display text-2xl font-semibold uppercase leading-tight">{product}</span>
                </li>
              ))}
            </ol>
          </Frame>
        </section>
      ) : null}

      {/* ---------------------------------------------------------- TIPS */}
      {market.tips.length ? (
        <section aria-labelledby="tips" className="bg-bw-panel">
          <Frame className="py-20 lg:py-24">
            <BlockTitle index="04" label="Before you go" id="tips" title="Tips from the office" />
            <ol className="mt-12 grid gap-px overflow-hidden rounded-[3px] border border-bw-line bg-bw-line md:grid-cols-2 lg:grid-cols-3">
              {market.tips.map((tip, i) => (
                <li key={tip} className="min-w-0 bg-bw-panel p-6 sm:p-8">
                  <p className="bw-display text-5xl text-bw-coral">{String(i + 1).padStart(2, "0")}</p>
                  <p className="mt-4 text-lg leading-relaxed text-bw-fg">{tip}</p>
                </li>
              ))}
            </ol>
          </Frame>
        </section>
      ) : null}

      {/* -------------------------------------------------------- GALLERY */}
      {market.gallery.length ? (
        <section aria-label={`Pictures of ${market.name}`} className="bg-bw-ground">
          <Frame className="py-16 lg:py-20">
            <Gallery images={market.gallery} alt={market.name} />
          </Frame>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ CTA */}
      <section aria-labelledby="market-cta" className="border-y border-bw-line bg-bw-ground">
        <Frame className="grid gap-8 py-16 lg:grid-cols-12 lg:items-end lg:py-20">
          <div className="min-w-0 lg:col-span-7">
            <Label className="text-bw-muted">Buying here?</Label>
            <h2 id="market-cta" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              Go yourself, or let us buy for you
            </h2>
            <p className="mt-4 max-w-xl text-lg text-bw-muted">
              {settings.visitsEnabled
                ? "Ask us to plan a visit around this market, or send us what you need and we look for it here for you."
                : "Send us what you need and we look for it here for you."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            {settings.visitsEnabled ? (
              <Action href={`/visit?market=${market.slug}`} size="lg">
                Plan a visit
              </Action>
            ) : null}
            <Action href={`/sourcing?market=${market.slug}`} tone={settings.visitsEnabled ? "line" : "coral"} size="lg">
              Request sourcing
            </Action>
          </div>
        </Frame>
      </section>

      {/* ----------------------------------------------- FACTORIES + NEARBY */}
      {market.factories.length ? (
        <section aria-labelledby="market-factories" className="bg-bw-panel">
          <Frame className="py-20 lg:py-24">
            <BlockTitle label="Related factories" id="market-factories" title="Buy from the maker" action={{ href: "/factories", label: "Factory directory" }} />
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {market.factories.map((factory) => (
                <li key={factory.id} className="flex min-w-0">
                  <FactoryCard factory={factory} className="w-full" />
                </li>
              ))}
            </ul>
          </Frame>
        </section>
      ) : null}

      {market.nearby.length ? (
        <section aria-labelledby="nearby" className="bg-bw-ground">
          <Frame className="py-20 lg:py-24">
            <BlockTitle
              label={cityName ? `Also in ${cityName}` : "Nearby"}
              id="nearby"
              title="Nearby markets"
              action={cityLive ? { href: `/markets?city=${cityLive.slug}`, label: `All ${cityLive.name} markets` } : undefined}
            />
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {market.nearby.map((m) => (
                <li key={m.id} className="flex min-w-0">
                  <MarketCard market={m} className="w-full" />
                </li>
              ))}
            </ul>
          </Frame>
        </section>
      ) : null}

      <section aria-label="More" className="border-t border-bw-line bg-bw-panel">
        <Frame className="flex flex-wrap items-center justify-between gap-4 py-6">
          <Link href="/markets" className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-fg hover:text-bw-coral">
            <ArrowRight className="size-3.5 rotate-180" aria-hidden /> All markets
          </Link>
          <p className="max-w-xl text-sm text-bw-muted">
            BlueWave doesn&apos;t run or represent this market. These are our notes for traders.
          </p>
        </Frame>
      </section>

      <LogisticsBand current="Buy" />
    </>
  );
}
