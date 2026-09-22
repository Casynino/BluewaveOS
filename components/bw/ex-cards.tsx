import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin } from "lucide-react";

import { FALLBACK, IllustrativeNote, photoOr } from "@/components/bw/ex-kit";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";
import type { CityCard as CityRow, FactoryCard as FactoryRow, MarketCard as MarketRow } from "@/lib/explore";
import { cn } from "@/lib/utils";

/*
  THE GUIDE'S CARDS.

  Destination cards: the photograph carries the card, the name is set over it
  in condensed capitals, and the facts sit in mono underneath. Every card is
  one link. Counts are the published rows, nothing more.
*/

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A city, as a destination. `size="lead"` is the tall first card. */
export function CityCard({
  city,
  size = "normal",
  index,
  className,
}: {
  city: CityRow;
  size?: "lead" | "normal";
  index?: number;
  className?: string;
}) {
  const lead = size === "lead";
  return (
    <Link
      href={`/cities/${city.slug}`}
      className={cn(
        "group relative isolate flex min-w-0 flex-col justify-end overflow-hidden rounded-[3px] bg-bw-night p-5 text-white sm:p-7",
        lead ? "min-h-[30rem] lg:min-h-[40rem]" : "min-h-[22rem]",
        className
      )}
    >
      <Image
        src={photoOr(city.heroImage, FALLBACK.city)}
        alt={`${city.name}, ${city.province ?? "China"}`}
        fill
        sizes={lead ? "(min-width: 1024px) 58vw, 100vw" : "(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"}
        className="bw-photo -z-20 object-cover transition-transform duration-700 group-hover:scale-[1.04]"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/55 to-bw-night/5" />

      <div className="absolute inset-x-5 top-5 flex items-start justify-between gap-3 sm:inset-x-7 sm:top-7">
        {typeof index === "number" ? (
          <span className="bw-mono text-xs text-bw-cyan">{String(index + 1).padStart(2, "0")}</span>
        ) : (
          <span />
        )}
        {city.province ? (
          <span className="bw-mono text-right text-[0.66rem] uppercase tracking-[0.16em] text-white/70">{city.province}</span>
        ) : null}
      </div>

      {city.nameZh ? (
        <p lang="zh" className={cn("font-bw-sans font-light leading-none text-white/35", lead ? "text-6xl sm:text-7xl" : "text-5xl")}>
          {city.nameZh}
        </p>
      ) : null}
      <h3 className={cn("bw-display mt-2 break-words uppercase", lead ? "text-[clamp(3.2rem,7vw,6rem)]" : "text-5xl")}>
        {city.name}
      </h3>
      {city.tagline ? <p className={cn("mt-3 max-w-md text-white/80", lead && "text-lg")}>{city.tagline}</p> : null}
      {lead && city.summary ? <p className="mt-3 hidden max-w-lg text-sm leading-relaxed text-white/65 sm:block">{city.summary}</p> : null}

      {city.knownFor.length ? (
        <ul className="mt-5 flex flex-wrap gap-1.5">
          {city.knownFor.slice(0, lead ? 6 : 3).map((item) => (
            <li key={item} className="bw-mono border border-white/25 px-2 py-1 text-[0.64rem] uppercase tracking-[0.1em] text-white/80">
              {item}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
        <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/65">
          {plural(city._count.markets, "market", "markets")} · {plural(city._count.factories, "factory", "factories")}
        </p>
        <span className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral-bright">
          Explore city <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** A market card: photograph on top, facts below, on the theme's panel. */
export function MarketCard({ market, className }: { market: MarketRow; className?: string }) {
  const city = market.cityRef?.name ?? market.city;
  return (
    <Link
      href={`/markets/${market.slug}`}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-[3px] border border-bw-line bg-bw-panel transition-colors hover:border-bw-fg/40",
        className
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-bw-ink">
        <Image
          src={photoOr(market.imageUrl, FALLBACK.market)}
          alt={`${market.name}${city ? `, ${city}` : ""}`}
          fill
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
          className="bw-photo object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-bw-night/70 via-transparent to-transparent" />
        {city ? (
          <span className="bw-mono absolute bottom-3 left-3 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 bg-bw-night/70 px-2 py-1 text-[0.66rem] uppercase tracking-[0.14em] text-white">
            <MapPin className="size-3 shrink-0 text-bw-coral-bright" aria-hidden />
            <span className="truncate">{city}</span>
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="bw-display break-words text-3xl uppercase text-bw-fg group-hover:text-bw-coral">{market.name}</h3>
        {market.summary ? <p className="mt-2 text-sm leading-relaxed text-bw-muted">{market.summary}</p> : null}
        {market.categories.length ? (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {market.categories.map((c) => (
              <li key={c.slug} className="bw-mono border border-bw-line px-2 py-0.5 text-[0.64rem] uppercase tracking-[0.1em] text-bw-muted">
                {c.name}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-auto pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-bw-line pt-4">
          <span className="bw-mono inline-flex items-center gap-1.5 text-[0.68rem] uppercase tracking-[0.12em] text-bw-muted">
            {market.visitDuration ? (
              <>
                <Clock className="size-3.5" aria-hidden /> {market.visitDuration}
              </>
            ) : market.district ? (
              market.district
            ) : (
              "Market guide"
            )}
          </span>
          <span className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral">
            Read the guide <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </div>
        </div>
      </div>
    </Link>
  );
}

/** A factory card. The listing label comes from the row, never "verified". */
export function FactoryCard({ factory, className }: { factory: FactoryRow; className?: string }) {
  const partner = factory.listing === "PARTNER";
  return (
    <Link
      href={`/factories/${factory.slug}`}
      className={cn(
        "group flex min-w-0 flex-col overflow-hidden rounded-[3px] border border-bw-line bg-bw-panel transition-colors hover:border-bw-fg/40",
        className
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-bw-ink">
        <Image
          src={photoOr(factory.heroImage, FALLBACK.factory)}
          alt={factory.imagesIllustrative ? `Illustration of a ${factory.industry ?? "factory"} — not ${factory.name}` : factory.name}
          fill
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
          className="bw-photo object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <span
          className={cn(
            "bw-mono absolute left-3 top-3 px-2 py-1 text-[0.64rem] uppercase tracking-[0.14em]",
            partner ? "bg-bw-coral text-white" : "bg-bw-night/75 text-white"
          )}
        >
          {FACTORY_LISTING_LABEL[factory.listing]}
        </span>
        {factory.imagesIllustrative || !factory.heroImage ? <IllustrativeNote className="absolute bottom-3 left-3" /> : null}
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        {factory.industry ? (
          <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-harbour">{factory.industry}</p>
        ) : null}
        <h3 className="bw-display mt-2 break-words text-3xl uppercase text-bw-fg group-hover:text-bw-coral">{factory.name}</h3>
        {factory.summary ? <p className="mt-2 text-sm leading-relaxed text-bw-muted">{factory.summary}</p> : null}
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden border border-bw-line bg-bw-line text-sm">
          <div className="min-w-0 bg-bw-panel p-3">
            <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">City</dt>
            <dd className="mt-1 break-words text-bw-fg">{factory.city?.name ?? "—"}</dd>
          </div>
          <div className="min-w-0 bg-bw-panel p-3">
            <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">MOQ</dt>
            <dd className="mt-1 break-words text-bw-fg">{factory.moq ?? "Ask us"}</dd>
          </div>
        </dl>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
          <span className="bw-mono text-[0.68rem] uppercase tracking-[0.12em] text-bw-muted">
            {factory.visitsAvailable ? "Visits can be arranged" : "Sourcing on request"}
          </span>
          <span className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral">
            Profile <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </div>
      </div>
    </Link>
  );
}

/** A product category, for "What are you sourcing?". */
export function CategoryTile({
  category,
  href,
  active = false,
}: {
  category: { slug: string; name: string; summary: string | null; image: string | null; _count?: { markets: number; factories: number } };
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative isolate flex min-h-[11rem] min-w-0 flex-col justify-end overflow-hidden rounded-[3px] bg-bw-night p-4 text-white sm:min-h-[13rem] sm:p-5",
        active && "ring-2 ring-bw-coral ring-offset-2 ring-offset-bw-ground"
      )}
    >
      <Image
        src={photoOr(category.image, FALLBACK.category)}
        alt=""
        fill
        sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
        className="bw-photo -z-20 object-cover opacity-80 transition duration-700 group-hover:scale-[1.05] group-hover:opacity-100"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/60 to-bw-night/10" />
      {category._count ? (
        <span className="bw-mono absolute right-3 top-3 text-[0.68rem] uppercase tracking-[0.12em] text-white/70">
          {plural(category._count.markets, "market", "markets")}
        </span>
      ) : null}
      <h3 className="bw-display break-words text-2xl uppercase leading-[0.95] sm:text-[1.75rem]">{category.name}</h3>
      {category.summary ? <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-white/70">{category.summary}</p> : null}
      <span className="bw-mono mt-3 inline-flex items-center gap-1.5 text-[0.64rem] uppercase tracking-[0.14em] text-bw-coral-bright">
        {active ? "Showing" : "Where it's sold"} <ArrowRight className="size-3 transition-transform group-hover:translate-x-1" aria-hidden />
      </span>
    </Link>
  );
}
