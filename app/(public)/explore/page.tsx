import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowDown } from "lucide-react";

import { CategoryTile, CityCard, FactoryCard, MarketCard } from "@/components/bw/ex-cards";
import { BlockTitle, FactoriesEmpty, FALLBACK, LogisticsBand, VisitBand, photoOr } from "@/components/bw/ex-kit";
import { Action, Frame, Label, SectionIntro } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { chinaSettings, discover, listCategories, listCities, listFactories, listMarkets } from "@/lib/explore";
import { cn } from "@/lib/utils";

export const revalidate = 300;

type Props = { searchParams: Promise<{ category?: string | string[] }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const slug = one((await searchParams).category);
  const found = slug ? await discover(slug) : null;
  const title = found
    ? `Where to source ${found.category.name.toLowerCase()} in China`
    : "Explore China for business — cities, markets and factories";
  const description = found
    ? `The Chinese cities and wholesale markets where ${found.category.name.toLowerCase()} is sold, and how BlueWave ships what you buy from Foshan to Dar es Salaam.`
    : "A trader's guide to China: the business cities, wholesale markets and factories behind what Tanzanian shops sell — and how BlueWave ships it from our Foshan warehouse to Dar es Salaam.";
  return {
    title,
    description,
    alternates: { canonical: found ? `/explore?category=${found.category.slug}` : "/explore" },
    openGraph: { type: "website", title: `${title} · BlueWave Cargo`, description, url: "/explore" },
  };
}

export default async function ExplorePage({ searchParams }: Props) {
  const slug = one((await searchParams).category);
  const [cities, categories, markets, factories, settings, found] = await Promise.all([
    listCities(),
    listCategories(),
    listMarkets(),
    listFactories(),
    chinaSettings(),
    slug ? discover(slug) : Promise.resolve(null),
  ]);

  const featuredMarkets = (markets.some((m) => m.featured) ? markets.filter((m) => m.featured) : markets).slice(0, 6);
  const featuredFactories = (factories.some((f) => f.featured) ? factories.filter((f) => f.featured) : factories).slice(0, 3);
  const factoryService = settings.sourcingServices.includes("FACTORY");
  const [leadCity, ...otherCities] = cities;

  return (
    <>
      {/* -------------------------------------------------------- BANNER */}
      <section className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
        <Image
          src={PHOTOS.chinaNight.src}
          alt={PHOTOS.chinaNight.alt}
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="bw-photo -z-20 object-cover object-[50%_60%]"
        />
        <div aria-hidden className="bw-shade absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-bw-night to-transparent" />
        <Frame className="flex min-h-[34rem] flex-col justify-end pb-12 pt-16 lg:min-h-[calc(94dvh-4.5rem)] lg:pb-16">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="bw-rise min-w-0 lg:col-span-8">
              <Label className="text-white/75">Explore China · 中国</Label>
              <h1 className="bw-display mt-6 text-[clamp(3.2rem,10vw,8.8rem)] uppercase">
                Explore China
                <span className="block text-white/55">for business</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80 sm:text-xl">
                The trading cities, wholesale markets and factories behind what your shop sells — what each is known
                for, how long to give it, and how your goods get from there to Dar es Salaam.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Action href="#sourcing" size="lg">
                  What are you sourcing?
                </Action>
                <Action href="#cities" tone="ghost-light" size="lg">
                  Browse cities
                </Action>
              </div>
            </div>
            <nav aria-label="On this page" className="min-w-0 lg:col-span-3 lg:col-start-10">
              <ol className="border-t border-white/20">
                {[
                  ["#cities", "Cities", `${cities.length}`],
                  ["#sourcing", "What to source", `${categories.length}`],
                  ["#markets", "Markets", `${markets.length}`],
                  ["#factories", "Factories", `${factories.length}`],
                ].map(([href, label, count], i) => (
                  <li key={href} className="border-b border-white/20">
                    <a href={href} className="group flex items-center justify-between gap-3 py-3 hover:text-bw-coral-bright">
                      <span className="flex items-center gap-3">
                        <span className="bw-mono text-xs text-bw-cyan">{String(i + 1).padStart(2, "0")}</span>
                        <span className="font-bw-display text-xl font-semibold uppercase">{label}</span>
                      </span>
                      <span className="bw-mono text-xs text-white/55 group-hover:text-bw-coral-bright">{count}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </Frame>
      </section>

      {/* ----------------------------------------------------- DISCOVERY */}
      {slug ? (
        found ? (
          <Discovery found={found} visitsEnabled={settings.visitsEnabled} factoryService={factoryService} />
        ) : (
          <section id="discover" className="border-b border-bw-line bg-bw-panel">
            <Frame className="py-12">
              <Label className="text-bw-muted">Not in the guide</Label>
              <p className="mt-4 max-w-2xl text-lg text-bw-fg">
                We don&apos;t have a category called &ldquo;{slug}&rdquo;. Pick one below, or tell us what you are
                looking for and we will find where it is sold.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Action href="#sourcing" tone="line">
                  See categories
                </Action>
                <Action href="/sourcing">Request sourcing</Action>
              </div>
            </Frame>
          </section>
        )
      ) : null}

      {/* -------------------------------------------------------- CITIES */}
      <section aria-labelledby="cities-title" id="cities" className="bg-bw-ground">
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            index="01"
            label="Destinations"
            title={<span id="cities-title">Where business happens</span>}
            lead="Each city has its trade. Go where your product is made and sold, not where it is resold."
          />
          {leadCity ? (
            <div className="mt-14 grid gap-3 lg:grid-cols-12">
              <CityCard city={leadCity} size="lead" index={0} className="lg:col-span-7" />
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
                {otherCities.slice(0, 2).map((city, i) => (
                  <CityCard key={city.id} city={city} index={i + 1} className="lg:min-h-0" />
                ))}
              </div>
              {otherCities.slice(2).map((city, i) => (
                <CityCard key={city.id} city={city} index={i + 3} className="lg:col-span-4" />
              ))}
            </div>
          ) : (
            <p className="mt-12 text-bw-muted">City guides are being written. Ask us where your product is sold.</p>
          )}
        </Frame>
      </section>

      {/* ----------------------------------------------------- CATEGORIES */}
      <section aria-labelledby="sourcing-title" id="sourcing" className="bw-yard border-y border-bw-line bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            index="02"
            label="Product finder"
            title={<span id="sourcing-title">What are you sourcing?</span>}
            lead="Pick what you sell. We show you the cities and markets where it is traded, the factories we have listed, and what to do next."
          />
          <ul className="mt-14 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
            {categories.map((category) => (
              <li key={category.id} className="min-w-0">
                <CategoryTile
                  category={category}
                  href={`/explore?category=${category.slug}#discover`}
                  active={found?.category.slug === category.slug}
                />
              </li>
            ))}
            <li className="min-w-0">
              <Link
                href="/sourcing"
                className="group flex h-full min-h-[11rem] flex-col justify-between rounded-[3px] border border-dashed border-bw-fg/30 p-4 transition-colors hover:border-bw-coral sm:min-h-[13rem] sm:p-5"
              >
                <span className="bw-mono text-[0.66rem] uppercase tracking-[0.14em] text-bw-muted">Not listed?</span>
                <span>
                  <span className="bw-display block text-2xl uppercase text-bw-fg sm:text-[1.75rem]">Something else</span>
                  <span className="bw-mono mt-3 inline-flex items-center gap-1.5 text-[0.64rem] uppercase tracking-[0.14em] text-bw-coral">
                    Ask us to find it <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </span>
              </Link>
            </li>
          </ul>
        </Frame>
      </section>

      {/* -------------------------------------------------------- MARKETS */}
      <section aria-labelledby="markets-title" id="markets" className="bg-bw-ground">
        <Frame className="py-20 lg:py-28">
          <BlockTitle
            index="03"
            label="Wholesale markets"
            id="markets-title"
            title="Markets worth the trip"
            action={{ href: "/markets", label: `All ${markets.length} markets` }}
          />
          <p className="mt-5 max-w-2xl text-lg text-bw-muted">
            Our notes on the markets Tanzanian traders buy from: what is sold there, when it is open and what to watch for.
            The markets are independent — we don&apos;t run them.
          </p>
          {featuredMarkets.length ? (
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featuredMarkets.map((market) => (
                <li key={market.id} className="flex min-w-0">
                  <MarketCard market={market} className="w-full" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-12 text-bw-muted">Market guides are being added.</p>
          )}
        </Frame>
      </section>

      {/* ------------------------------------------------------ FACTORIES */}
      <section aria-labelledby="factories-title" id="factories" className="border-t border-bw-line bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <BlockTitle
            index="04"
            label="Factory directory"
            id="factories-title"
            title="Buy from the maker"
            action={featuredFactories.length ? { href: "/factories", label: "Factory directory" } : undefined}
          />
          <p className="mt-5 max-w-2xl text-lg text-bw-muted">
            For larger orders or your own specification, the factory is the place to buy. Listings are added by our
            team one by one.
          </p>
          <div className="mt-12">
            {featuredFactories.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {featuredFactories.map((factory) => (
                  <li key={factory.id} className="flex min-w-0">
                    <FactoryCard factory={factory} className="w-full" />
                  </li>
                ))}
              </ul>
            ) : (
              <FactoriesEmpty factoryServiceOffered={factoryService} visitsEnabled={settings.visitsEnabled} />
            )}
          </div>
        </Frame>
      </section>

      {settings.visitsEnabled ? <VisitBand /> : null}

      <LogisticsBand current="Discover" />
    </>
  );
}

/* --------------------------------------------------------------------------
   "WHERE DOES MY PRODUCT LIVE?" — the answer, as a stepped route:
   cities → markets → factories → what to do next.
--------------------------------------------------------------------------- */

type Found = NonNullable<Awaited<ReturnType<typeof discover>>>;

function Discovery({ found, visitsEnabled, factoryService }: { found: Found; visitsEnabled: boolean; factoryService: boolean }) {
  const { category, cities, markets, factories } = found;
  const name = category.name;
  return (
    <section id="discover" aria-labelledby="discover-title" className="relative isolate overflow-hidden bg-bw-ink text-white">
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
      <Frame className="py-16 lg:py-24">
        {/* Category header */}
        <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-7">
            <Label className="text-white/70">
              <span className="text-bw-cyan">Finder</span>
              <span aria-hidden>/</span>
              Where does it live?
            </Label>
            <h2 id="discover-title" className="bw-display mt-5 break-words text-[clamp(2.8rem,7vw,6rem)] uppercase">
              {name}
            </h2>
            {category.summary ? <p className="mt-4 max-w-xl text-lg text-white/75">{category.summary}</p> : null}
            <p className="bw-mono mt-5 text-xs uppercase tracking-[0.14em] text-white/55">
              {cities.length} {cities.length === 1 ? "city" : "cities"} · {markets.length}{" "}
              {markets.length === 1 ? "market" : "markets"} · {factories.length}{" "}
              {factories.length === 1 ? "factory" : "factories"} in the guide
            </p>
          </div>
          <div className="relative aspect-[16/9] min-w-0 overflow-hidden rounded-[3px] lg:col-span-5">
            <Image
              src={photoOr(category.image, FALLBACK.category)}
              alt={`${name} for sale in China`}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="bw-photo object-cover"
            />
          </div>
        </div>

        {/* The route */}
        <ol className="mt-14 border-t border-white/15">
          <Step n="01" title="Cities" hint="Where it is traded">
            {cities.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cities.map((city) => (
                  <li key={city.slug} className="min-w-0">
                    <Link
                      href={`/cities/${city.slug}`}
                      className="group grid grid-cols-[5rem_1fr] items-stretch overflow-hidden rounded-[2px] border border-white/15 hover:border-white/50"
                    >
                      <span className="relative min-h-[5rem]">
                        <Image src={photoOr(city.heroImage, FALLBACK.city)} alt="" fill sizes="80px" className="bw-photo object-cover" />
                      </span>
                      <span className="min-w-0 p-3">
                        <span className="block font-bw-display text-2xl font-semibold uppercase leading-none">
                          {city.name} {city.nameZh ? <span lang="zh" className="text-base font-normal text-white/40">{city.nameZh}</span> : null}
                        </span>
                        {city.tagline ? <span className="mt-1 block truncate text-sm text-white/60">{city.tagline}</span> : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-white/65">No city in the guide lists {name.toLowerCase()} yet — ask us where it is sold.</p>
            )}
          </Step>

          <Step n="02" title="Markets" hint="Where to buy it wholesale">
            {markets.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {markets.map((m) => (
                  <li key={m.id} className="min-w-0">
                    <Link
                      href={`/markets/${m.slug}`}
                      className="group relative isolate flex min-h-[9rem] flex-col justify-end overflow-hidden rounded-[2px] p-4"
                    >
                      <Image src={photoOr(m.imageUrl, FALLBACK.market)} alt="" fill sizes="(min-width: 1024px) 25vw, 100vw" className="bw-photo -z-20 object-cover" />
                      <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/70 to-bw-night/20" />
                      <span className="bw-mono text-[0.64rem] uppercase tracking-[0.14em] text-white/65">{m.cityRef?.name ?? m.city}</span>
                      <span className="mt-1 flex items-end justify-between gap-2 font-bw-display text-2xl font-semibold uppercase leading-none">
                        <span className="min-w-0 break-words">{m.name}</span>
                        <ArrowRight className="size-4 shrink-0 text-bw-coral-bright transition-transform group-hover:translate-x-1" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-white/65">No market guide for {name.toLowerCase()} yet.</p>
            )}
          </Step>

          <Step n="03" title="Factories" hint="Where it is made">
            {factories.length ? (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {factories.map((f) => (
                  <li key={f.id} className="min-w-0">
                    <Link
                      href={`/factories/${f.slug}`}
                      className="group flex items-center justify-between gap-3 rounded-[2px] border border-white/15 p-4 hover:border-white/50"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-bw-display text-2xl font-semibold uppercase leading-none">{f.name}</span>
                        <span className="bw-mono mt-1 block text-[0.64rem] uppercase tracking-[0.12em] text-white/55">
                          {f.city?.name ?? "China"}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-bw-coral-bright" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="max-w-2xl">
                <p className="text-white/75">
                  No {name.toLowerCase()} factory is listed yet. Listings are added by our team once confirmed — until
                  then, we can look for the maker for you.
                </p>
                <Link
                  href={factoryService ? `/sourcing?service=FACTORY&category=${category.slug}` : `/sourcing?category=${category.slug}`}
                  className="bw-mono mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral-bright hover:text-white"
                >
                  Ask us to find a factory <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            )}
          </Step>

          <Step n="04" title="Next step" hint="Go yourself, or send us" last>
            <div className="flex flex-wrap gap-3">
              {visitsEnabled ? <Action href={`/visit?category=${category.slug}`}>Plan a visit</Action> : null}
              <Action href={`/sourcing?category=${category.slug}`} tone={visitsEnabled ? "ghost-light" : "coral"}>
                Request sourcing
              </Action>
              <Action href="/how-it-works" tone="ghost-light">
                Ship it home
              </Action>
            </div>
          </Step>
        </ol>
      </Frame>
    </section>
  );
}

function Step({
  n,
  title,
  hint,
  children,
  last = false,
}: {
  n: string;
  title: string;
  hint: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <li className="relative grid gap-5 border-b border-white/15 py-8 pl-12 sm:pl-16 lg:grid-cols-12 lg:gap-8 lg:py-10">
      {/* The route line and its station */}
      <span aria-hidden className={cn("absolute left-[0.9rem] top-0 w-px bg-white/15 sm:left-[1.4rem]", last ? "h-12" : "h-full")} />
      <span
        aria-hidden
        className={cn(
          "absolute left-[0.4rem] top-9 grid size-[1.05rem] place-items-center sm:left-[0.9rem] lg:top-11",
          last ? "bg-bw-coral" : "border-2 border-bw-cyan bg-bw-ink"
        )}
      />
      <div className="min-w-0 lg:col-span-3">
        <p className="bw-mono text-xs text-bw-cyan">{n}</p>
        <h3 className="mt-1 font-bw-display text-3xl font-semibold uppercase leading-none">{title}</h3>
        <p className="mt-2 flex items-center gap-2 text-sm text-white/55">
          {hint}
          {!last ? <ArrowDown className="size-3.5 lg:hidden" aria-hidden /> : null}
        </p>
      </div>
      <div className="min-w-0 lg:col-span-9">{children}</div>
    </li>
  );
}
