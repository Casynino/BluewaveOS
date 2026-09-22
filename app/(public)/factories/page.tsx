import Link from "next/link";
import type { Metadata } from "next";

import { FactoryCard } from "@/components/bw/ex-cards";
import { Chip, FactoriesEmpty, LogisticsBand, PhotoHero } from "@/components/bw/ex-kit";
import { Action, Frame, Label } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";
import { chinaSettings, listCategories, listCities, listFactories } from "@/lib/explore";

export const revalidate = 300;

type Props = { searchParams: Promise<{ city?: string | string[]; category?: string | string[] }> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function href(filter: { city?: string; category?: string }) {
  const q = new URLSearchParams();
  if (filter.city) q.set("city", filter.city);
  if (filter.category) q.set("category", filter.category);
  const s = q.toString();
  return s ? `/factories?${s}` : "/factories";
}

export const metadata: Metadata = {
  title: "Factory directory — Chinese manufacturers for Tanzanian buyers",
  description:
    "Factories in China listed by the BlueWave team for buyers in Tanzania: what they make, minimum orders and whether visits can be arranged — and how your order ships to Dar es Salaam.",
  alternates: { canonical: "/factories" },
  openGraph: {
    type: "website",
    title: "Factory directory · BlueWave Cargo",
    description: "Chinese factories listed by the BlueWave team, and help finding the one that makes your product.",
    url: "/factories",
  },
};

export default async function FactoriesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [cities, categories, settings, all] = await Promise.all([
    listCities(),
    listCategories(),
    chinaSettings(),
    listFactories(),
  ]);
  const city = cities.find((c) => c.slug === one(sp.city));
  const category = categories.find((c) => c.slug === one(sp.category));
  const factories = city || category ? await listFactories({ city: city?.slug, category: category?.slug }) : all;

  const cityOptions = cities.filter((c) => c._count.factories > 0);
  const categoryOptions = categories.filter((c) => c._count.factories > 0);
  const factoryService = settings.sourcingServices.includes("FACTORY");
  const hasAny = all.length > 0;

  return (
    <>
      <PhotoHero
        image="/photos/cn-textile-factory.jpg"
        alt={PHOTOS.cnTextileFactory.alt}
        crumbs={[["Explore China", "/explore"], ["Factories"]]}
        label="Factory directory"
        title="Buy from the maker"
        lead="For larger orders, your own brand or your own specification, go to the factory. Each listing here is added by the BlueWave team — none is copied from the internet."
      />

      {/* ------------------------------------------------ WHAT A LISTING IS */}
      <section aria-label="How to read a listing" className="border-b border-bw-line bg-bw-panel">
        <Frame className="grid gap-px py-0 sm:grid-cols-2 lg:grid-cols-3">
          {[
            [FACTORY_LISTING_LABEL.PARTNER, "A factory the BlueWave sourcing team works with."],
            [FACTORY_LISTING_LABEL.LISTING, "A factory in the directory, added by our team. Talk to us before you order."],
            ["Photos", "Where a picture shows the kind of factory rather than this one, it says so on the picture."],
          ].map(([term, body], i) => (
            <div
              key={term}
              className={`min-w-0 border-bw-line py-7 sm:pr-6 ${i > 0 ? "border-t sm:border-t-0" : ""} ${i === 1 ? "sm:border-l sm:pl-6" : ""} ${i === 2 ? "sm:col-span-2 sm:border-t lg:col-span-1 lg:border-l lg:border-t-0 lg:pl-6" : ""}`}
            >
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.14em] text-bw-coral">{term}</p>
              <p className="mt-2 text-sm leading-relaxed text-bw-muted">{body}</p>
            </div>
          ))}
        </Frame>
      </section>

      {hasAny ? (
        <section aria-label="Filter factories" className="border-b border-bw-line bg-bw-panel">
          <Frame className="grid gap-6 py-8 lg:grid-cols-12 lg:gap-10">
            <div className="min-w-0 lg:col-span-5">
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">City</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip href={href({ category: category?.slug })} active={!city}>
                  All cities
                </Chip>
                {cityOptions.map((c) => (
                  <Chip key={c.slug} href={href({ city: c.slug, category: category?.slug })} active={city?.slug === c.slug}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="min-w-0 lg:col-span-7">
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">Product</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip href={href({ city: city?.slug })} active={!category}>
                  All products
                </Chip>
                {categoryOptions.map((c) => (
                  <Chip key={c.slug} href={href({ city: city?.slug, category: c.slug })} active={category?.slug === c.slug}>
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          </Frame>
        </section>
      ) : null}

      <section aria-labelledby="factory-results" className="bg-bw-ground">
        <Frame className="py-14 lg:py-20">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-bw-line pb-5">
            <h2 id="factory-results" className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-muted">
              {factories.length} {factories.length === 1 ? "factory" : "factories"} listed
              {category ? ` · ${category.name}` : ""}
              {city ? ` · ${city.name}` : ""}
            </h2>
            {city || category ? (
              <Link href="/factories" className="bw-mono text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark">
                Clear filters
              </Link>
            ) : null}
          </div>

          <div className="mt-8">
            {factories.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {factories.map((factory) => (
                  <li key={factory.id} className="flex min-w-0">
                    <FactoryCard factory={factory} className="w-full" />
                  </li>
                ))}
              </ul>
            ) : (
              <FactoriesEmpty
                where={city?.name}
                factoryServiceOffered={factoryService}
                visitsEnabled={settings.visitsEnabled}
              />
            )}
          </div>

          {/* How a factory search works, so the empty directory still leads somewhere. */}
          <div className="mt-16 grid gap-10 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-4">
              <Label className="text-bw-muted">Factory sourcing</Label>
              <h2 className="bw-display mt-5 text-[clamp(2.2rem,4.4vw,3.6rem)] uppercase text-bw-fg">How we find a factory for you</h2>
            </div>
            <ol className="grid min-w-0 gap-px overflow-hidden rounded-[3px] border border-bw-line bg-bw-line sm:grid-cols-2 lg:col-span-8">
              {[
                ["Tell us the product", "What it is, the quantity, your target price and any specification or brand."],
                ["We look for makers", "We search for factories that make it and ask for prices and minimum orders."],
                ["You choose", "We share what we find. Visit, order samples, or place the order."],
                ["We ship it home", "The factory delivers to our Foshan warehouse, or we collect. It sails to Dar."],
              ].map(([title, body], i) => (
                <li key={title} className="min-w-0 bg-bw-panel p-6">
                  <p className="bw-mono text-xs text-bw-harbour">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-bw-display text-2xl font-semibold uppercase text-bw-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-bw-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Action href={factoryService ? "/sourcing?service=FACTORY" : "/sourcing"}>Ask us to find a factory</Action>
            {settings.visitsEnabled ? (
              <Action href="/visit" tone="line">
                Plan a factory visit
              </Action>
            ) : null}
          </div>
        </Frame>
      </section>

      <LogisticsBand current="Source" />
    </>
  );
}
