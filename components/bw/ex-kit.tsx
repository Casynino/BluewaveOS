import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

import { Action, Frame, Label } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { cn } from "@/lib/utils";

/*
  THE EXPLORE CHINA KIT.

  Pieces shared by the guide pages — /explore, /cities, /markets, /factories.
  Photography first, condensed capitals over it, mono for the facts a trader
  compares. Everything is drawn from what the guide tables hold; nothing here
  invents a figure or vouches for a place.
*/

/**
 * A picture path from the guide, or a stand-in from the site's own photos.
 * Only local paths are drawn: the image optimiser is not a proxy for the web.
 */
export function photoOr(src: string | null | undefined, fallback: string): string {
  return src && src.startsWith("/") && !src.startsWith("//") ? src : fallback;
}

/** Stand-ins, by what a row is about. */
export const FALLBACK = {
  city: "/photos/cn-canton-tower.jpg",
  market: "/photos/cn-wholesale-hall.jpg",
  factory: "/photos/cn-factory-line.jpg",
  category: "/photos/cn-market-street.jpg",
} as const;

/** A plain OpenStreetMap link — no embedded map, no third-party script. */
export function mapHref({
  latitude,
  longitude,
  query,
}: {
  latitude?: number | null;
  longitude?: number | null;
  query: string;
}): string {
  if (typeof latitude === "number" && typeof longitude === "number") {
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`;
  }
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(query)}`;
}

/** Breadcrumbs for the dark opening band. */
export function Crumbs({ items }: { items: [label: string, href?: string][] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="bw-mono flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/60">
        {items.map(([label, href], i) => (
          <li key={`${label}-${i}`} className="flex min-w-0 items-center gap-2">
            {i > 0 ? <span aria-hidden>/</span> : null}
            {href ? (
              <Link href={href} className="hover:text-white">
                {label}
              </Link>
            ) : (
              <span aria-current="page" className="break-words text-white/85">
                {label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * The opening band of a guide page: a full-bleed photograph, the headline set
 * low over it. Always dark and always carrying `bw-top`, so it clears the
 * fixed header in both themes.
 */
export function PhotoHero({
  image,
  alt,
  crumbs,
  label,
  title,
  aside,
  lead,
  children,
  tall = false,
  illustrative = false,
}: {
  image: string;
  alt: string;
  crumbs?: [string, string?][];
  label?: React.ReactNode;
  title: React.ReactNode;
  aside?: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  tall?: boolean;
  illustrative?: boolean;
}) {
  return (
    <section className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
      <Image src={image} alt={alt} fill priority sizes="100vw" className="bw-photo -z-20 object-cover" />
      <div aria-hidden className="bw-shade absolute inset-0 -z-10" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-bw-night/90 via-bw-night/30 to-transparent" />
      <Frame
        className={cn(
          "flex flex-col justify-end pb-10 pt-10 sm:pb-14 sm:pt-16",
          tall ? "min-h-[34rem] lg:min-h-[calc(92dvh-4.5rem)]" : "min-h-[28rem] lg:min-h-[36rem]"
        )}
      >
        {crumbs ? <Crumbs items={crumbs} /> : null}
        <div className="mt-auto grid gap-8 pt-16 lg:grid-cols-12 lg:items-end">
          <div className="bw-rise min-w-0 lg:col-span-8">
            {label ? <Label className="text-white/75">{label}</Label> : null}
            <h1 className="bw-display mt-5 break-words text-[clamp(2.9rem,9vw,8rem)] uppercase">{title}</h1>
            {lead ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/80 sm:text-xl">{lead}</p> : null}
            {children ? <div className="mt-8">{children}</div> : null}
          </div>
          {aside ? <div className="min-w-0 lg:col-span-4">{aside}</div> : null}
        </div>
        {illustrative ? <IllustrativeNote className="mt-6 self-start" /> : null}
      </Frame>
    </section>
  );
}

/** Printed on any picture that shows the kind of place, not the place. */
export function IllustrativeNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        "bw-mono inline-block bg-bw-night/80 px-2 py-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/85",
        className
      )}
    >
      Illustrative photo — not this factory
    </p>
  );
}

/** A filter link, square, mono. Active is coral. */
export function Chip({ href, active = false, children, dark = false }: { href: string; active?: boolean; children: React.ReactNode; dark?: boolean }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={cn(
        "bw-mono inline-flex min-h-9 items-center rounded-[2px] border px-3 py-1.5 text-xs uppercase tracking-[0.12em] transition-colors",
        active
          ? "border-bw-coral bg-bw-coral text-white"
          : dark
            ? "border-white/25 text-white/85 hover:border-white hover:bg-white/10"
            : "border-bw-line bg-bw-panel text-bw-fg hover:border-bw-fg/50"
      )}
    >
      {children}
    </Link>
  );
}

/** A plain list of words, set as hairline tags. */
export function Tags({ items, dark = false, className }: { items: string[]; dark?: boolean; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "bw-mono border px-2 py-1 text-[0.66rem] uppercase tracking-[0.1em]",
            dark ? "border-white/25 text-white/80" : "border-bw-line text-bw-muted"
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A section's own heading when SectionIntro is too much. */
export function BlockTitle({
  index,
  label,
  title,
  id,
  className,
  action,
}: {
  index?: string;
  label: string;
  title: React.ReactNode;
  id?: string;
  className?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="min-w-0">
        <Label className="text-bw-muted">
          {index ? (
            <>
              <span className="text-bw-harbour">{index}</span>
              <span aria-hidden>/</span>
            </>
          ) : null}
          {label}
        </Label>
        <h2 id={id} className="bw-display mt-4 break-words text-[clamp(2.2rem,4.6vw,3.8rem)] uppercase text-bw-fg">
          {title}
        </h2>
      </div>
      {action ? (
        <Link
          href={action.href}
          className="bw-mono group inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
        >
          {action.label}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/**
 * A picture strip. The first picture leads, large; the rest follow. Wraps on a
 * phone, never scrolls sideways.
 */
export function Gallery({
  images,
  alt,
  illustrative = false,
}: {
  images: string[];
  alt: string;
  illustrative?: boolean;
}) {
  const list = images.filter((src) => src.startsWith("/") && !src.startsWith("//"));
  if (!list.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
      {list.map((src, i) => (
        <li
          key={`${src}-${i}`}
          className={cn(
            "relative overflow-hidden rounded-[3px] bg-bw-ink",
            i === 0 ? "col-span-2 aspect-[16/10] lg:row-span-2 lg:aspect-auto lg:min-h-[26rem]" : "aspect-[4/3]"
          )}
        >
          <Image
            src={src}
            alt={`${alt} — picture ${i + 1}`}
            fill
            sizes={i === 0 ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
            className="bw-photo object-cover"
          />
          {illustrative ? <IllustrativeNote className="absolute bottom-2 left-2" /> : null}
        </li>
      ))}
    </ul>
  );
}

/** The trader's road, from the first look to the ship. */
const JOURNEY: [label: string, href: string][] = [
  ["Discover", "/explore"],
  ["Visit", "/visit"],
  ["Source", "/sourcing"],
  ["Buy", "/markets"],
  ["Foshan warehouse", "/how-it-works"],
  ["Ship to Tanzania", "/services"],
];

export function JourneyStrip({ dark = false, current, className }: { dark?: boolean; current?: string; className?: string }) {
  return (
    <ol
      aria-label="From China to your shop"
      className={cn(
        "grid grid-cols-2 border-l border-t sm:grid-cols-3 lg:grid-cols-6",
        dark ? "border-white/15" : "border-bw-line",
        className
      )}
    >
      {JOURNEY.map(([label, href], i) => {
        const on = label === current;
        return (
          <li key={label} className={cn("min-w-0 border-b border-r", dark ? "border-white/15" : "border-bw-line")}>
            <Link
              href={href}
              aria-current={on ? "step" : undefined}
              className={cn(
                "group flex h-full flex-col justify-between gap-6 p-4 transition-colors sm:p-5",
                on ? "bg-bw-coral text-white" : dark ? "hover:bg-white/5" : "hover:bg-bw-panel"
              )}
            >
              <span
                className={cn(
                  "bw-mono flex items-center justify-between text-xs",
                  on ? "text-white/80" : dark ? "text-bw-cyan" : "text-bw-harbour"
                )}
              >
                {String(i + 1).padStart(2, "0")}
                {i < JOURNEY.length - 1 ? (
                  <ArrowRight
                    className={cn("size-3.5", on ? "text-white/70" : dark ? "text-white/30" : "text-bw-muted/60")}
                    aria-hidden
                  />
                ) : null}
              </span>
              <span
                className={cn(
                  "break-words font-bw-display text-xl font-semibold uppercase leading-none sm:text-2xl",
                  on ? "text-white" : dark ? "text-white" : "text-bw-fg"
                )}
              >
                {label}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Bought in China, shipped by us: the band that ties the guide to the cargo
 * side of the business.
 */
export function LogisticsBand({ current }: { current?: string }) {
  return (
    <section aria-labelledby="send-it" className="relative isolate overflow-hidden bg-bw-night text-white">
      <Image
        src={PHOTOS.warehouseRacks.src}
        alt=""
        fill
        sizes="100vw"
        className="bw-photo -z-20 object-cover opacity-40"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-bw-night via-bw-night/90 to-bw-night/60" />
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
      <Frame className="py-20 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-7">
            <Label className="text-white/70">
              <MapPin className="size-3.5 text-bw-coral-bright" aria-hidden /> Nanhai, Foshan
            </Label>
            <h2 id="send-it" className="bw-display mt-5 text-[clamp(2.4rem,5.4vw,4.8rem)] uppercase">
              Bought it? Send it to our Foshan warehouse
            </h2>
          </div>
          <div className="min-w-0 lg:col-span-4 lg:col-start-9">
            <p className="text-lg leading-relaxed text-white/75">
              Your supplier delivers to one address. We receive, count and photograph your goods, then ship them by
              container to Dar es Salaam. If the supplier won&apos;t deliver, we collect.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/how-it-works">How it works</Action>
              <Action href="/pickup" tone="ghost-light">
                Request a pickup
              </Action>
            </div>
          </div>
        </div>
        <JourneyStrip dark current={current} className="mt-14" />
      </Frame>
    </section>
  );
}

/** "Planning to visit China?" — shown only while visits are offered. */
export function VisitBand({ href = "/visit", note }: { href?: string; note?: React.ReactNode }) {
  return (
    <section aria-labelledby="visit-band" className="border-y border-bw-line bg-bw-panel">
      <Frame className="grid gap-0 py-0 lg:grid-cols-12">
        <div className="relative -mx-4 min-h-[16rem] overflow-hidden sm:-mx-6 lg:col-span-5 lg:mx-0 lg:-ml-10 lg:min-h-[24rem]">
          <Image
            src={PHOTOS.cnTradeFair.src}
            alt={PHOTOS.cnTradeFair.alt}
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="bw-photo object-cover"
          />
        </div>
        <div className="min-w-0 py-14 lg:col-span-6 lg:col-start-7 lg:py-20">
          <Label className="text-bw-muted">Business visits</Label>
          <h2 id="visit-band" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
            Planning to visit China?
          </h2>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-bw-muted">
            {note ??
              "Tell us what you want to buy and when you can travel. We work out which markets and factories are worth your days and talk the plan through with you before anything is arranged."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Action href={href} tone="ink">
              Plan a visit
            </Action>
            <Action href="/contact" tone="line">
              Talk to us first
            </Action>
          </div>
        </div>
      </Frame>
    </section>
  );
}

/**
 * No factory to show. Said plainly, with the next thing to do.
 */
export function FactoriesEmpty({
  factoryServiceOffered,
  visitsEnabled,
  where,
  compact = false,
}: {
  factoryServiceOffered: boolean;
  visitsEnabled: boolean;
  where?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative isolate grid overflow-hidden rounded-[3px] border border-bw-line bg-bw-panel",
        compact ? "" : "lg:grid-cols-12"
      )}
    >
      {!compact ? (
        <div className="relative min-h-[14rem] lg:col-span-5">
          <Image
            src={PHOTOS.cnFactoryLine.src}
            alt="A production line inside a factory (illustration, not a listed factory)"
            fill
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="bw-photo object-cover grayscale-[35%]"
          />
          <div aria-hidden className="absolute inset-0 bg-bw-night/35" />
          <span className="bw-mono absolute left-4 top-4 border border-white/40 bg-bw-night/50 px-2 py-1 text-[0.66rem] uppercase tracking-[0.16em] text-white">
            Directory · 0 listed{where ? ` · ${where}` : ""}
          </span>
        </div>
      ) : null}
      <div className={cn("min-w-0 p-6 sm:p-10", compact ? "" : "lg:col-span-7")}>
        <Label className="text-bw-muted">Factory listings</Label>
        <h3 className="bw-display mt-4 text-[clamp(1.9rem,3.6vw,3rem)] uppercase text-bw-fg">
          {where ? `No factory listed in ${where} yet` : "Factory listings are being added"}
        </h3>
        <p className="mt-4 max-w-xl leading-relaxed text-bw-muted">
          The BlueWave team adds a factory to this directory only once it has been confirmed — none is copied from
          the internet. Until one is listed, ask us: we look for the factory that makes your product and tell you what
          we find.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Action href={factoryServiceOffered ? "/sourcing?service=FACTORY" : "/sourcing"}>Ask us to find a factory</Action>
          {visitsEnabled ? (
            <Action href="/visit" tone="line">
              Plan a factory visit
            </Action>
          ) : (
            <Action href="/contact" tone="line">
              Contact us
            </Action>
          )}
        </div>
      </div>
    </div>
  );
}
