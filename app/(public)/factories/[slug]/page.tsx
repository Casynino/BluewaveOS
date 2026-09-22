import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, MapPin } from "lucide-react";

import { MarketCard } from "@/components/bw/ex-cards";
import { BlockTitle, FALLBACK, Gallery, JourneyStrip, PhotoHero, Tags, mapHref, photoOr } from "@/components/bw/ex-kit";
import { Action, Frame, Label } from "@/components/bw/ui";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";
import { chinaSettings, factoryBySlug } from "@/lib/explore";
import { cn } from "@/lib/utils";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const factory = await factoryBySlug(slug);
  if (!factory) return { title: "Factory not found" };
  const where = factory.city?.name ?? "China";
  const title = `${factory.name}${factory.industry ? ` — ${factory.industry}` : ""}, ${where}`;
  const description =
    factory.summary ??
    `${factory.name} in ${where}: what they make, minimum order and how to source from them with BlueWave.`;
  return {
    title,
    description,
    alternates: { canonical: `/factories/${factory.slug}` },
    openGraph: {
      type: "article",
      title: `${factory.name} · BlueWave Cargo`,
      description,
      url: `/factories/${factory.slug}`,
      /* An illustrative picture is not put forward as this factory's. */
      images: !factory.imagesIllustrative && factory.heroImage?.startsWith("/") ? [{ url: factory.heroImage }] : undefined,
    },
  };
}

export default async function FactoryPage({ params }: Props) {
  const { slug } = await params;
  const [factory, settings] = await Promise.all([factoryBySlug(slug), chinaSettings()]);
  if (!factory) notFound();

  const partner = factory.listing === "PARTNER";
  const where = factory.city?.name ?? null;
  const illustrative = factory.imagesIllustrative || !factory.heroImage;
  const canVisit = factory.visitsAvailable && settings.visitsEnabled;
  const map = mapHref({
    latitude: factory.latitude,
    longitude: factory.longitude,
    query: [factory.name, factory.district, where].filter(Boolean).join(", "),
  });
  const pinned = typeof factory.latitude === "number" && typeof factory.longitude === "number";

  const business: [label: string, value: React.ReactNode][] = [
    ["Listing", FACTORY_LISTING_LABEL[factory.listing]],
    ["Industry", factory.industry ?? "—"],
    ["City", factory.city ? <Link href={`/cities/${factory.city.slug}`} className="hover:text-bw-coral">{factory.city.name}</Link> : "—"],
    ["District", factory.district ?? "—"],
    ["Visits", canVisit ? "Can be arranged on request" : "Not offered for now"],
    ["Categories", factory.categories.map((c) => c.name).join(", ") || "—"],
  ];

  return (
    <>
      <PhotoHero
        image={photoOr(factory.heroImage, FALLBACK.factory)}
        alt={illustrative ? `Illustration of a ${factory.industry ?? "factory"} — not ${factory.name}` : factory.name}
        crumbs={[["Explore China", "/explore"], ["Factories", "/factories"], [factory.name]]}
        label={
          <>
            <MapPin className="size-3.5 text-bw-coral-bright" aria-hidden />
            {[factory.district, where].filter(Boolean).join(" · ") || "China"}
          </>
        }
        title={factory.name}
        lead={factory.summary}
        illustrative={illustrative}
        aside={
          <div className="bw-glass rounded-[4px] p-5 sm:p-6">
            <p
              className={cn(
                "bw-mono inline-block px-2 py-1 text-[0.66rem] uppercase tracking-[0.14em]",
                partner ? "bg-bw-coral text-white" : "border border-white/30 text-white"
              )}
            >
              {FACTORY_LISTING_LABEL[factory.listing]}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div className="min-w-0">
                <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/55">Industry</dt>
                <dd className="mt-1 break-words text-white/90">{factory.industry ?? "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/55">MOQ</dt>
                <dd className="mt-1 break-words text-white/90">{factory.moq ?? "Ask us"}</dd>
              </div>
            </dl>
          </div>
        }
      >
        <div className="flex flex-wrap gap-3">
          {canVisit ? <Action href={`/visit?factory=${factory.slug}`}>Visit this factory</Action> : null}
          <Action href={`/sourcing?factory=${factory.slug}`} tone={canVisit ? "ghost-light" : "coral"}>
            Request sourcing
          </Action>
        </div>
      </PhotoHero>

      {/* ---------------------------------------------------------- ABOUT */}
      <section aria-labelledby="about-factory" className="bg-bw-panel">
        <Frame className="grid gap-12 py-20 lg:grid-cols-12 lg:py-24">
          <div className="min-w-0 lg:col-span-7">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">01</span>
              <span aria-hidden>/</span>
              About
            </Label>
            <h2 id="about-factory" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              The factory
            </h2>
            {factory.body ? (
              <div className="mt-6 whitespace-pre-line text-lg leading-relaxed text-bw-fg/85">{factory.body}</div>
            ) : factory.summary ? (
              <p className="mt-6 text-lg leading-relaxed text-bw-fg/85">{factory.summary}</p>
            ) : (
              <p className="mt-6 text-lg text-bw-muted">Ask us for more about this factory.</p>
            )}
            {factory.categories.length ? <Tags items={factory.categories.map((c) => c.name)} className="mt-8" /> : null}
          </div>

          {factory.products.length ? (
            <div className="min-w-0 lg:col-span-4 lg:col-start-9">
              <Label className="text-bw-muted">
                <span className="text-bw-harbour">02</span>
                <span aria-hidden>/</span>
                Products
              </Label>
              <ul className="mt-6 border-t border-bw-line">
                {factory.products.map((product) => (
                  <li key={product} className="flex items-start gap-3 border-b border-bw-line py-3">
                    <Check className="mt-1 size-4 shrink-0 text-bw-coral" aria-hidden />
                    <span className="min-w-0 break-words font-bw-display text-xl font-semibold uppercase text-bw-fg">{product}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Frame>
      </section>

      {/* ----------------------------------------- PRODUCTION / MOQ / EXPORT */}
      <section aria-label="Production and orders" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="grid gap-px py-0 md:grid-cols-3">
          {[
            ["03", "Production", factory.production],
            ["04", "Minimum order", factory.moq],
            ["05", "Export experience", factory.exportExperience],
          ].map(([n, title, body], i) => (
            <div
              key={title}
              className={cn("min-w-0 py-12 md:px-8 lg:py-16", i === 0 ? "md:pl-0" : "border-t border-white/15 md:border-l md:border-t-0")}
            >
              <p className="bw-mono text-xs text-bw-cyan">{n}</p>
              <h2 className="bw-display mt-3 text-4xl uppercase">{title}</h2>
              <p className={cn("mt-4 whitespace-pre-line leading-relaxed", body ? "text-white/80" : "text-white/45")}>
                {body ?? "Ask us — we find out for you."}
              </p>
            </div>
          ))}
        </Frame>
      </section>

      {/* -------------------------------------------------------- GALLERY */}
      {factory.gallery.length ? (
        <section aria-label={`Pictures for ${factory.name}`} className="bg-bw-ground">
          <Frame className="py-16 lg:py-20">
            <Gallery images={factory.gallery} alt={factory.name} illustrative={factory.imagesIllustrative} />
          </Frame>
        </section>
      ) : null}

      {/* ------------------------------------------ LOCATION + BUSINESS INFO */}
      <section aria-labelledby="business-info" className="border-t border-bw-line bg-bw-panel">
        <Frame className="grid gap-10 py-20 lg:grid-cols-12 lg:py-24">
          <div className="min-w-0 lg:col-span-7">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">06</span>
              <span aria-hidden>/</span>
              Business information
            </Label>
            <h2 id="business-info" className="bw-display mt-5 text-[clamp(2.2rem,4.4vw,3.6rem)] uppercase text-bw-fg">
              At a glance
            </h2>
            <dl className="mt-8 grid border-l border-t border-bw-line sm:grid-cols-2">
              {business.map(([label, value]) => (
                <div key={label} className="min-w-0 border-b border-r border-bw-line p-4 sm:p-5">
                  <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">{label}</dt>
                  <dd className="mt-1.5 break-words text-bw-fg">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm text-bw-muted">
              {partner
                ? "A BlueWave sourcing partner is a factory our sourcing team works with. Talk to us before you order."
                : "A factory listing is added by the BlueWave team. Talk to us before you order."}
            </p>
          </div>
          <aside className="min-w-0 lg:col-span-4 lg:col-start-9">
            <div className="relative isolate overflow-hidden rounded-[3px] bg-bw-night p-6 text-white sm:p-8">
              <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
              <Label className="text-white/70">Location</Label>
              <p className="bw-display mt-4 break-words text-4xl uppercase">{factory.district ?? where ?? "China"}</p>
              {where && factory.district ? <p className="mt-1 text-white/70">{where}</p> : null}
              <a
                href={map}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-6 inline-flex w-full items-center justify-between gap-3 rounded-[2px] border border-white/30 px-4 py-3 font-bw-display text-base font-semibold uppercase tracking-[0.06em] hover:border-white hover:bg-white/10"
              >
                {pinned ? "Open on the map" : "Search on the map"}
                <ArrowUpRight className="size-4 shrink-0" aria-hidden />
              </a>
              <p className="bw-mono mt-2 text-[0.68rem] text-white/45">OpenStreetMap · opens in a new tab</p>
            </div>
          </aside>
        </Frame>
      </section>

      {/* ------------------------------------------------ RELATED MARKETS */}
      {factory.markets.length ? (
        <section aria-labelledby="factory-markets" className="bg-bw-ground">
          <Frame className="py-20 lg:py-24">
            <BlockTitle label="Also sold in markets" id="factory-markets" title="See the goods in a market first" action={{ href: "/markets", label: "All markets" }} />
            <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {factory.markets.map((m) => (
                <li key={m.id} className="flex min-w-0">
                  <MarketCard market={m} className="w-full" />
                </li>
              ))}
            </ul>
          </Frame>
        </section>
      ) : null}

      {/* -------------------------------------------------- JOURNEY + CTA */}
      <section aria-labelledby="factory-next" className="relative isolate overflow-hidden bg-bw-night text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-20 lg:py-24">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 lg:col-span-7">
              <Label className="text-white/70">From this factory to your shop</Label>
              <h2 id="factory-next" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.4rem)] uppercase">
                One team, factory to Dar es Salaam
              </h2>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
              {canVisit ? <Action href={`/visit?factory=${factory.slug}`}>Visit this factory</Action> : null}
              <Action href={`/sourcing?factory=${factory.slug}`} tone={canVisit ? "ghost-light" : "coral"}>
                Request sourcing
              </Action>
              <Action href="/how-it-works" tone="light">
                Ship with BlueWave
              </Action>
            </div>
          </div>
          <JourneyStrip dark current="Source" className="mt-14" />
          <Link
            href="/factories"
            className="bw-mono mt-10 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/65 hover:text-white"
          >
            <ArrowRight className="size-3.5 rotate-180" aria-hidden /> Factory directory
          </Link>
        </Frame>
      </section>
    </>
  );
}
