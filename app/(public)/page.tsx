import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { Corridor, corridorStations } from "@/components/bw/corridor";
import { bwCompany, bwExchangeRate, bwSailings } from "@/components/bw/data";
import { DepartureBoard } from "@/components/bw/departure-board";
import { SailingPanel } from "@/components/bw/sailing-panel";
import { TrackField } from "@/components/bw/track-field";
import { Action, Frame, Label } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";
import { formatRate } from "@/lib/currency";
import { chinaSettings, listCategories, listCities, listFactories, listMarkets } from "@/lib/explore";
import { DEFAULT_TRANSIT_DAYS } from "@/lib/sailing-schedule";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "BlueWave Cargo — Discover China. Build your business. Move it home." },
  description:
    "Explore China's markets and factories, source products, plan a business visit, and ship your goods from our Foshan warehouse to Dar es Salaam. BlueWave Cargo: your China to Tanzania business journey.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "BlueWave Cargo — China to Tanzania, from sourcing to delivery",
    description: "Markets, factories, sourcing, business visits and sea cargo from China to Tanzania.",
  },
};

/* Sailings, the exchange rate and the guide move during the day. */
export const revalidate = 60;

const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" });
const DAY_MONTH = utc({ weekday: "short", day: "2-digit", month: "short" });

export default async function HomePage() {
  const [company, rate, sailings, cities, categories, markets, factories, offer] = await Promise.all([
    bwCompany(),
    bwExchangeRate(),
    bwSailings(3),
    listCities(),
    listCategories(),
    listMarkets(),
    listFactories(),
    chinaSettings(),
  ]);
  const next = sailings.find((s) => s.bookingOpen) ?? sailings[0] ?? null;
  const transitDays = next?.transitDays ?? DEFAULT_TRANSIT_DAYS;
  const featuredMarkets = markets.filter((m) => m.featured).slice(0, 4);
  const shownMarkets = featuredMarkets.length ? featuredMarkets : markets.slice(0, 4);

  return (
    <>
      {/* ------------------------------------------------- 01 WELCOME TO CHINA */}
      <section className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
        <Image
          src={PHOTOS.chinaNight.src}
          alt="Guangzhou's skyline and river at night"
          fill
          priority
          sizes="100vw"
          className="bw-photo -z-20 object-cover"
        />
        <div aria-hidden className="bw-shade absolute inset-0 -z-10" />
        <Frame className="grid gap-12 pb-12 pt-16 sm:pt-24 lg:min-h-[calc(100dvh-4.5rem)] lg:grid-cols-12 lg:items-end lg:pb-16">
          <div className="bw-rise min-w-0 lg:col-span-7">
            <Label className="text-white/75">China → Tanzania</Label>
            <h1 className="bw-display mt-6 text-[clamp(3rem,8.5vw,7.25rem)] uppercase">
              Discover China.
              <span className="block">Build your business.</span>
              <span className="block text-bw-coral-bright">Move it home.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
              Find the markets and factories behind what you sell, plan a buying trip, get it sourced — and we ship it
              from our Foshan warehouse to Dar es Salaam.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Action href="/explore" size="lg">
                Explore China
              </Action>
              <Action href="/sourcing" tone="ghost-light" size="lg">
                Start sourcing
              </Action>
            </div>
            {/* Tracking, in the opening picture — it is what most visitors came for. */}
            <div className="mt-8 max-w-xl">
              <p className="bw-mono mb-2.5 text-[0.7rem] uppercase tracking-[0.18em] text-bw-cyan">Track your cargo</p>
              <TrackField dark id="bw-track-hero" />
            </div>
          </div>

          {/* The next ship: the date that matters to anyone about to buy. */}
          <aside aria-label="Next sailing" className="bw-rise min-w-0 [animation-delay:150ms] lg:col-span-5">
            <SailingPanel sailings={sailings} />
          </aside>
        </Frame>
      </section>

      {/* ------------------------------------------------- 02 DISCOVER THE MARKETS */}
      <section aria-labelledby="where" className="bg-bw-ground">
        <Frame className="py-20 lg:py-28">
          <ChapterHead
            index="02"
            label="Where business happens"
            title={<span id="where">The cities behind what you sell</span>}
            lead="Explore the markets, factories and business districts that power China's trade — and what each city is known for."
            href="/explore"
            action="Explore China"
          />
          {cities.length > 0 ? (
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cities.slice(0, 4).map((city, i) => (
                <li
                  key={city.slug}
                  className={cn(
                    i === 0 && "sm:col-span-2 lg:col-span-2 lg:row-span-2",
                    /* Four cities leave one small slot empty; the last card takes it. */
                    i === 3 && Math.min(cities.length, 4) === 4 && "sm:col-span-2 lg:col-span-2"
                  )}
                >
                  <Link
                    href={`/cities/${city.slug}`}
                    className={cn(
                      "group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-[3px] p-6 text-white",
                      i === 0 ? "min-h-[22rem] lg:min-h-[36rem]" : "min-h-[17rem]"
                    )}
                  >
                    <Image
                      src={city.heroImage ?? PHOTOS.chinaDusk.src}
                      alt={`${city.name}, ${city.province ?? "China"}`}
                      fill
                      sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
                      className="bw-photo -z-20 object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                    <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/40 to-transparent" />
                    {/* Both halves are optional on the row, so the separator is
                        built from whichever survive — a province nobody filled
                        in must not leave a Chinese name trailing a dot. */}
                    <p className="bw-mono text-xs uppercase tracking-[0.16em] text-white/70">
                      {[city.nameZh, city.province].filter(Boolean).join(" · ")}
                    </p>
                    <p className={cn("bw-display mt-1 uppercase", i === 0 ? "text-6xl sm:text-7xl" : "text-4xl")}>{city.name}</p>
                    {city.tagline ? <p className="mt-2 text-white/80">{city.tagline}</p> : null}
                    <span className="bw-mono mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-bw-coral-bright">
                      Explore city <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}

          {categories.length > 0 ? (
            <div className="mt-14">
              <p className="bw-label text-bw-muted">What are you sourcing?</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={`/explore?category=${category.slug}`}
                      className="inline-flex h-11 items-center gap-2 rounded-[2px] border border-bw-line bg-bw-panel px-4 text-bw-fg transition-colors hover:border-bw-coral hover:text-bw-coral"
                    >
                      {category.name}
                      {category._count.markets > 0 ? (
                        <span className="bw-mono text-xs text-bw-muted">{category._count.markets}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {shownMarkets.length > 0 ? (
            <div className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <p className="bw-label text-bw-muted">Markets worth the trip</p>
                <Link href="/markets" className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark">
                  All markets <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <ul className="mt-5 grid gap-px overflow-hidden rounded-[3px] bg-bw-line sm:grid-cols-2 lg:grid-cols-4">
                {shownMarkets.map((market) => (
                  <li key={market.slug} className="bg-bw-panel">
                    <Link href={`/markets/${market.slug}`} className="group block h-full">
                      <div className="relative aspect-[4/3] overflow-hidden">
                        <Image
                          src={market.imageUrl ?? PHOTOS.cnWholesaleHall.src}
                          alt={market.name}
                          fill
                          sizes="(min-width: 1024px) 25vw, 50vw"
                          className="bw-photo object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        />
                      </div>
                      <div className="p-5">
                        <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-harbour">
                          {market.cityRef?.name ?? market.city}
                        </p>
                        <p className="mt-1 font-bw-display text-2xl font-semibold uppercase leading-tight text-bw-fg">{market.name}</p>
                        {market.summary ? <p className="mt-2 text-sm text-bw-muted">{market.summary}</p> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Frame>
      </section>

      {/* ------------------------------------------------- 03 MEET THE FACTORIES */}
      <section aria-labelledby="factories" className="relative isolate overflow-hidden bg-bw-night text-white">
        <Image src={PHOTOS.cnFactoryLine.src} alt="" fill sizes="100vw" className="bw-photo -z-20 object-cover opacity-50" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bw-night via-bw-night/90 to-bw-night/40" />
        <Frame className="grid gap-10 py-20 lg:grid-cols-12 lg:items-center lg:py-28">
          <div className="lg:col-span-6">
            <Label className="text-white/70">
              <span className="text-bw-cyan">03</span> / Meet the factories
            </Label>
            <h2 id="factories" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.4rem)] uppercase">
              Buy from the people who make it
            </h2>
            <p className="mt-5 max-w-lg text-lg text-white/75">
              Larger orders, your own specification, or simply a better price: find the factory, visit it, and let us bring
              the goods home.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/factories">Browse factories</Action>
              <Action href="/sourcing?service=FACTORY" tone="ghost-light">
                Ask us to find one
              </Action>
            </div>
          </div>
          <div className="lg:col-span-5 lg:col-start-8">
            {factories.length > 0 ? (
              <ul className="grid gap-px overflow-hidden rounded-[3px] bg-white/10">
                {factories.slice(0, 3).map((factory) => (
                  <li key={factory.slug}>
                    <Link href={`/factories/${factory.slug}`} className="group flex items-center justify-between gap-4 bg-bw-night/70 p-5 hover:bg-bw-night">
                      <span className="min-w-0">
                        <span className="bw-mono block text-[0.68rem] uppercase tracking-[0.14em] text-bw-cyan">
                          {factory.city?.name ?? "China"} · {FACTORY_LISTING_LABEL[factory.listing]}
                        </span>
                        <span className="mt-1 block font-bw-display text-2xl font-semibold uppercase">{factory.name}</span>
                        {factory.industry ? <span className="block text-sm text-white/65">{factory.industry}</span> : null}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-bw-coral-bright transition-transform group-hover:translate-x-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="bw-glass rounded-[4px] p-6">
                <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/60">Factory directory</p>
                <p className="mt-3 text-lg">
                  Factory listings are added by the BlueWave team as each one is confirmed. Tell us what you need made and we
                  will look for the factory.
                </p>
              </div>
            )}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------- 04 VISIT & SOURCE */}
      <section aria-labelledby="visit" className="bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <ChapterHead
            index="04"
            label="Visit & source"
            title={<span id="visit">Planning to visit China?</span>}
            lead="Turn a China trip into a focused sourcing trip — or let us do the searching while you stay in Dar."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-2">
            {offer.visitsEnabled ? (
              <FeatureCard
                href="/visit"
                photo={PHOTOS.cnTradeFair}
                code="Business visits"
                title="Plan my visit"
                body="Explore markets, meet suppliers, visit factories and find products. BlueWave helps organise the business side of your trip."
              />
            ) : null}
            <FeatureCard
              href="/sourcing"
              photo={PHOTOS.cnMarketStreet}
              code="Sourcing"
              title="Find it for me"
              body="Tell us the product, the quantity and the price you want. We look for suppliers and factories and come back to you."
            />
          </div>
          <ol className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] bg-bw-line sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Find", "The product"],
              ["Source", "Supplier or factory"],
              ["Visit", "If you want to see it"],
              ["Buy", "Pay your supplier"],
              ["Receive", "At our Foshan warehouse"],
              ["Ship", "Home to Tanzania"],
            ].map(([step, note], i) => (
              <li key={step} className="bg-bw-ground p-5">
                <p className="bw-mono text-xs text-bw-coral">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-1 font-bw-display text-2xl font-semibold uppercase text-bw-fg">{step}</p>
                <p className="text-sm text-bw-muted">{note}</p>
              </li>
            ))}
          </ol>
        </Frame>
      </section>

      {/* ------------------------------------------------- 05 MOVE YOUR GOODS */}
      <section aria-labelledby="move" className="bw-yard relative overflow-hidden">
        <Frame className="py-20 lg:py-28">
          <ChapterHead
            index="05"
            label="Move your goods"
            title={<span id="move">From our Foshan warehouse to your shop in Dar</span>}
            lead="Every package counted, measured and labelled when it reaches us. A container leaves every week."
            href="/how-it-works"
            action="How shipping works"
          />
          <div className="mt-14 lg:mt-20">
            <Corridor stations={corridorStations(transitDays)} />
          </div>
          <div className="mt-14 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <DepartureBoard sailings={sailings} compact />
            </div>
            <div className="flex flex-col justify-between gap-6 rounded-[3px] border border-bw-line bg-bw-panel p-6 lg:col-span-4">
              <div>
                <p className="bw-label text-bw-muted">Price a shipment</p>
                <p className="mt-3 font-bw-display text-3xl font-semibold uppercase text-bw-fg">CBM × rate = USD</p>
                <p className="mt-2 text-bw-muted">
                  Paid in shillings{rate ? ` · today ${formatRate(rate.rate)}` : ""}.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Action href="/calculator">Rates & calculator</Action>
                <Action href="/schedule" tone="line">
                  Sailings
                </Action>
              </div>
            </div>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------- 06 TRACK YOUR JOURNEY */}
      <section aria-labelledby="track" className="border-y border-bw-line bg-bw-panel">
        <Frame className="grid gap-8 py-16 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">06</span> / Track your journey
            </Label>
            <h2 id="track" className="bw-display mt-4 text-[clamp(2.2rem,4.5vw,3.6rem)] uppercase text-bw-fg">
              Where&apos;s your cargo?
            </h2>
            <p className="mt-3 text-bw-muted">China warehouse, at sea, Dar es Salaam — see the stage and what happens next.</p>
          </div>
          <div className="min-w-0 lg:col-span-6 lg:col-start-7">
            <TrackField large />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------- 07 ARRIVE IN TANZANIA */}
      <section aria-labelledby="arrive" className="relative isolate overflow-hidden bg-bw-night text-white">
        <Image src={PHOTOS.portCranes.src} alt="Ship-to-shore cranes over a container terminal" fill sizes="100vw" className="bw-photo -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/75 to-bw-night/20" />
        <Frame className="py-24 lg:py-32">
          <Label className="text-white/70">
            <span className="text-bw-cyan">07</span> / Arrive in Tanzania
          </Label>
          <h2 id="arrive" className="bw-display mt-5 max-w-3xl text-[clamp(2.4rem,5.5vw,4.8rem)] uppercase">
            Arrived, counted and ready in Dar es Salaam
          </h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-[3px] bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Arrive", "Your cargo is checked in at our Dar warehouse and counted again. Free storage starts that day."],
              ["Pay", "Your invoice in shillings, at the rate of the day it is issued."],
              ["Ready", "Once payment is confirmed your pickup note is issued and we tell you it is ready."],
              ["Collect", "Bring your ID and pickup note to our Dar es Salaam warehouse."],
            ].map(([title, body]) => (
              <li key={title} className="bg-bw-night/70 p-5">
                <p className="font-bw-display text-2xl font-semibold uppercase">{title}</p>
                <p className="mt-2 text-sm text-white/70">{body}</p>
              </li>
            ))}
          </ol>
        </Frame>
      </section>

      {/* ------------------------------------------------- 08 BUILD YOUR BUSINESS */}
      <section aria-labelledby="build" className="bg-bw-ground">
        <Frame className="grid gap-10 py-20 lg:grid-cols-12 lg:items-end lg:py-28">
          <div className="lg:col-span-7">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">08</span> / Build your business
            </Label>
            <h2 id="build" className="bw-display mt-5 text-[clamp(2.6rem,6vw,5rem)] uppercase text-bw-fg">
              Start your China journey here
            </h2>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/explore" size="lg">
                Explore China
              </Action>
              <Action href="/sourcing" tone="ink" size="lg">
                Start sourcing
              </Action>
              <Action href="/register" tone="line" size="lg">
                Open an account
              </Action>
            </div>
          </div>
          <div className="rounded-[3px] border border-bw-line bg-bw-panel p-6 lg:col-span-4 lg:col-start-9">
            <p className="bw-label text-bw-muted">Talk to the office</p>
            {company.phone && company.phoneHref ? (
              <a href={company.phoneHref} className="bw-display mt-4 block text-4xl text-bw-fg hover:text-bw-coral">
                {company.phone}
              </a>
            ) : null}
            {company.darAddress ? <p className="mt-3 text-sm text-bw-muted">{company.darAddress}</p> : null}
            {company.whatsapp ? (
              <a
                href={company.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="bw-mono mt-5 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
              >
                WhatsApp us <ArrowUpRight className="size-3.5" />
              </a>
            ) : null}
          </div>
        </Frame>
      </section>
    </>
  );
}

function ChapterHead({
  index,
  label,
  title,
  lead,
  href,
  action,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  lead: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-7">
        <Label className="text-bw-muted">
          <span className="text-bw-harbour">{index}</span>
          <span aria-hidden>/</span>
          {label}
        </Label>
        <h2 className="bw-display mt-5 text-[clamp(2.4rem,5.2vw,4.6rem)] uppercase text-bw-fg">{title}</h2>
      </div>
      <div className="lg:col-span-4 lg:col-start-9">
        <p className="text-lg leading-relaxed text-bw-muted">{lead}</p>
        {href && action ? (
          <Link href={href} className="bw-mono mt-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark">
            {action} <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function FeatureCard({
  href,
  photo,
  code,
  title,
  body,
}: {
  href: string;
  photo: (typeof PHOTOS)[keyof typeof PHOTOS];
  code: string;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="group relative isolate flex min-h-[24rem] flex-col justify-end overflow-hidden rounded-[3px] p-6 text-white sm:p-8">
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        sizes="(min-width: 1024px) 50vw, 100vw"
        className="bw-photo -z-20 object-cover transition-transform duration-700 group-hover:scale-[1.03]"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/50 to-transparent" />
      <span className="bw-mono mb-4 self-start border border-white/40 px-2 py-1 text-xs uppercase tracking-[0.2em]">{code}</span>
      <h3 className="bw-display text-5xl uppercase sm:text-6xl">{title}</h3>
      <p className="mt-3 max-w-md text-white/80">{body}</p>
      <span className="bw-mono mt-6 inline-flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-bw-coral-bright">
        Start <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
