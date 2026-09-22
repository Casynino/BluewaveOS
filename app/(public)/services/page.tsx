import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { ContainerSizes, StationTile } from "@/components/bw/info-iso";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { PHOTOS } from "@/components/site/photos";
import { prisma } from "@/lib/prisma";
import { publicRateBook } from "@/lib/public-estimate";

export const metadata: Metadata = {
  title: "Services — sea cargo, containers, warehouse and clearance",
  description:
    "China to Tanzania sea cargo: loose cargo priced per CBM, full 20ft and 40ft container shipping, our Foshan warehouse, pickup from your supplier, customs clearance in Dar es Salaam, sourcing and special cargo.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "BlueWave Cargo services — China to Tanzania sea cargo",
    description:
      "Loose cargo, full containers, Foshan warehouse, China pickup, clearance at Dar es Salaam, sourcing and special cargo — one team from supplier to shop.",
  },
};

/* The rate book and the free-storage setting are edited in the office. */
export const revalidate = 300;

const INDEX = [
  ["#loose-cargo", "Loose cargo"],
  ["#full-container", "Full container"],
  ["#china-warehouse", "China warehouse"],
  ["#china-pickup", "China pickup"],
  ["#clearance", "Customs & clearance"],
  ["#more", "Sourcing · Special cargo"],
] as const;

export default async function ServicesPage() {
  /* The free period is a commercial setting, not copy. */
  const [company, rateBook] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { freeStorageDays: true } }),
    publicRateBook("LCL"),
  ]);
  const freeDays = company?.freeStorageDays ?? null;
  const sample = rateBook.slice(0, 5);

  return (
    <>
      <PageBanner
        label="Services"
        title="Everything between your supplier and your shop"
        lead="Sea cargo from China to Tanzania, and the work around it: a warehouse in Foshan, pickup from your supplier, clearance in Dar es Salaam, sourcing and special cargo."
      >
        <nav aria-label="Services on this page">
          <ol className="flex flex-wrap gap-x-6 gap-y-3 border-t border-white/15 pt-5">
            {INDEX.map(([href, label], i) => (
              <li key={href}>
                <a
                  href={href}
                  className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/75 hover:text-white"
                >
                  <span className="text-bw-cyan">{String.fromCharCode(65 + i)}</span>
                  {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </PageBanner>

      {/* ------------------------------------------------ SEA CARGO: LCL */}
      <section aria-labelledby="sea-cargo" className="bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            index="01"
            label="Sea cargo"
            title={<span id="sea-cargo">Two ways to put your goods on the ship</span>}
            lead="Every shipment sails from Foshan to Dar es Salaam in a container. What you choose is whether you share the container or take one to yourself."
          />

          <div className="mt-14 grid gap-px overflow-hidden rounded-[3px] bg-bw-line lg:grid-cols-12">
            <div className="relative isolate flex min-h-[26rem] flex-col justify-end overflow-hidden p-6 text-white sm:min-h-[30rem] sm:p-10 lg:col-span-7">
              <Image
                src={PHOTOS.portYard.src}
                alt="Stacked shipping containers and cranes at a container port"
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="bw-photo -z-20 object-cover"
              />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/60 to-bw-night/10" />
              <span className="bw-mono mb-5 self-start border sm:absolute sm:mb-0 sm:left-6 sm:top-6 border-white/40 px-2 py-1 text-xs tracking-[0.2em] sm:left-10 sm:top-10">
                A · LCL
              </span>
              <h2 id="loose-cargo" className="bw-display text-[clamp(3rem,7vw,5.5rem)] uppercase">
                Loose cargo
              </h2>
              <p className="mt-4 max-w-lg text-lg leading-relaxed text-white/80">
                Not enough goods for a whole container? Your cartons share one with other customers&apos; cargo. You pay
                only for the cubic metres (CBM) you use, and your consignment keeps its own reference the whole way.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Action href="/book?service=SHARED_CARGO">Book loose cargo</Action>
                <Action href="/calculator" tone="ghost-light">
                  Price my CBM
                </Action>
              </div>
            </div>

            {/* The rate sheet, straight out of the published rate book. */}
            <div className="flex min-w-0 flex-col bg-bw-ground p-6 sm:p-10 lg:col-span-5">
              <Label className="text-bw-muted">How loose cargo is priced</Label>
              <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5 text-center sm:gap-2">
                <Term value="CBM" label="Volume" />
                <span className="bw-display text-2xl text-bw-muted sm:text-3xl">×</span>
                <Term value="Rate" label="Your goods" />
                <span className="bw-display text-2xl text-bw-muted sm:text-3xl">=</span>
                <Term value="USD" label="Freight" accent />
              </div>
              {/* The types only. By the owner's decision the rate book is not
                  printed as a list: a price is the calculator's answer for the
                  goods and the volume a customer gives it. */}
              {sample.length > 0 ? (
                <>
                  <p className="bw-mono mt-8 text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">
                    Priced by type of goods, for example
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {sample.map((row) => (
                      <li key={row.cargoType} className="border border-bw-line bg-bw-panel px-3 py-1.5 text-sm text-bw-fg">
                        {row.cargoType}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/calculator"
                    className="bw-mono mt-5 inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral hover:text-bw-coral-dark"
                  >
                    Price your goods in the calculator <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </>
              ) : (
                <p className="mt-8 leading-relaxed text-bw-muted">
                  Each type of goods has its own rate per CBM. Use the calculator or ask the office for your price.
                </p>
              )}
              <p className="mt-auto pt-8 text-sm leading-relaxed text-bw-muted">
                The invoice is raised from the same rate book, in USD, and paid in shillings at the exchange rate of the
                day it is issued.
              </p>
            </div>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ SEA CARGO: FCL */}
      <section aria-labelledby="full-container" className="bg-bw-ground">
        <Frame className="grid gap-12 py-20 lg:grid-cols-12 lg:items-center lg:py-28">
          <div className="lg:col-span-5">
            <p className="bw-mono inline-block border border-bw-fg/30 px-2 py-1 text-xs tracking-[0.2em] text-bw-fg">B · FCL</p>
            <h2 id="full-container" className="bw-display mt-6 text-[clamp(3rem,7vw,5.5rem)] uppercase text-bw-fg">
              Full container
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-bw-muted">
              A container to yourself — loaded with your goods only and shipped from Foshan to Dar es Salaam. The better
              choice when you are filling most of a box.
            </p>
            <ul className="mt-8 space-y-3 border-l-2 border-bw-coral pl-5 text-bw-fg">
              <li>Your goods only, nobody else&apos;s in the box</li>
              <li>Sealed before it leaves, seal number recorded</li>
              <li>No waiting for a shared container to fill</li>
            </ul>
            <div className="mt-9">
              <Action href="/book?service=FULL_CONTAINER" tone="ink">
                Book a container
              </Action>
            </div>
          </div>
          <div className="grid min-w-0 gap-6 lg:col-span-6 lg:col-start-7">
            <div className="relative aspect-[16/9] overflow-hidden rounded-[3px]">
              <Image
                src={PHOTOS.craneLift.src}
                alt="A port crane lifting a shipping container"
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="bw-photo object-cover"
              />
            </div>
            <div className="rounded-[3px] border border-bw-line bg-bw-panel p-5 sm:p-8">
              <Label className="text-bw-muted">Container sizes</Label>
              <ContainerSizes className="mt-6" />
            </div>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ CHINA WAREHOUSE */}
      <section aria-labelledby="china-warehouse" className="bw-yard bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <div className="mx-auto w-full max-w-[16rem] lg:col-span-4 lg:max-w-[20rem]">
              <StationTile kind="warehouse" label="Drawing of the BlueWave warehouse in Foshan" />
            </div>
            <div className="lg:col-span-7 lg:col-start-6">
              <Label className="text-bw-muted">
                <span className="text-bw-harbour">02</span>
                <span aria-hidden>/</span>
                Foshan, China
              </Label>
              <h2 id="china-warehouse" className="bw-display mt-5 text-[clamp(2.4rem,5.2vw,4.6rem)] uppercase text-bw-fg">
                China warehouse
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-bw-muted">
                Our warehouse in Nanhai, Foshan is where your goods first come into our hands. Your suppliers deliver to
                one address; we look after everything until it sails.
              </p>
            </div>
          </div>

          <ol className="mt-14 grid border-l border-t border-bw-line bg-bw-panel sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Receiving", "Your supplier delivers with your shipping mark on every carton. We sign for it."],
              ["Counting", "Cartons counted, weighed and measured. The CBM comes from our own measuring, not the supplier's paper."],
              ["Photos", "Your goods are photographed on arrival, so you can see what reached us."],
              ["Storage", "Held on our floor until the container you are booked on is loaded."],
              ["Consolidation", "Goods from several suppliers under your mark wait together and sail together."],
            ].map(([title, body], i) => (
              <li key={title} className="border-b border-r border-bw-line p-5 sm:p-6">
                <p className="bw-mono text-xs text-bw-harbour">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 font-bw-display text-2xl font-semibold uppercase text-bw-fg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-bw-muted">{body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Action href="/contact#supplier-address" tone="line">
              Get the address for your supplier
            </Action>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ CHINA PICKUP */}
      <section aria-labelledby="china-pickup" className="relative isolate overflow-hidden bg-bw-ink text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="grid gap-10 py-16 lg:grid-cols-12 lg:items-center lg:py-20">
          <div className="lg:col-span-5">
            <Label className="text-white/70">
              <span className="text-bw-cyan">03</span>
              <span aria-hidden>/</span>
              China pickup
            </Label>
            <h2 id="china-pickup" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase">
              Supplier won&apos;t deliver? We collect.
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/70">
              Tell us where the goods are waiting — a factory, a showroom, a market stall — and we bring them to our
              Foshan warehouse.
            </p>
            <div className="mt-8">
              <Action href="/pickup">Request a pickup</Action>
            </div>
          </div>

          {/* The short leg: where the goods are, to where they sail from. */}
          <ol
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center lg:col-span-6 lg:col-start-7"
            aria-label="Pickup route"
          >
            <li className="rounded-[3px] border border-white/15 p-5">
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-cyan">From</p>
              <p className="mt-2 font-bw-display text-3xl font-semibold uppercase">Your supplier</p>
              <p className="mt-1 text-sm text-white/60">Factory, showroom or market</p>
            </li>
            <li aria-hidden className="flex justify-center py-2 sm:py-0">
              <svg viewBox="0 0 120 20" className="h-5 w-24 rotate-90 sm:rotate-0">
                <line x1="0" y1="10" x2="106" y2="10" stroke="rgb(255 255 255 / 0.15)" strokeWidth="8" />
                <line x1="0" y1="10" x2="106" y2="10" className="bw-flow" stroke="#F0566A" strokeWidth="3" />
                <path d="M104 3 L118 10 L104 17 Z" fill="#F0566A" />
              </svg>
            </li>
            <li className="rounded-[3px] bg-bw-panel p-5 text-bw-fg">
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-harbour">To</p>
              <p className="mt-2 font-bw-display text-3xl font-semibold uppercase">Foshan warehouse</p>
              <p className="mt-1 text-sm text-bw-muted">Received and measured like any delivery</p>
            </li>
          </ol>
        </Frame>
      </section>

      {/* ------------------------------------------------ CLEARANCE */}
      <section aria-labelledby="clearance" className="bg-bw-panel">
        <Frame className="py-20 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Label className="text-bw-muted">
                <span className="text-bw-harbour">04</span>
                <span aria-hidden>/</span>
                Dar es Salaam
              </Label>
              <h2 id="clearance" className="bw-display mt-5 text-[clamp(2.4rem,5.2vw,4.6rem)] uppercase text-bw-fg">
                Customs &amp; clearance
              </h2>
              <p className="mt-4 max-w-md text-lg leading-relaxed text-bw-muted">
                When the container reaches Dar es Salaam port, our team takes it through customs and into our warehouse.
              </p>
              <div className="mx-auto mt-10 w-full max-w-[14rem] lg:mx-0">
                <StationTile kind="clearance" label="Drawing of a customs desk with a stamp" />
              </div>
            </div>

            <div className="grid gap-px self-start overflow-hidden rounded-[3px] bg-bw-line lg:col-span-7">
              <article className="bg-bw-ground p-6 sm:p-8">
                <p className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-harbour">Shipping with us</p>
                <h3 className="mt-3 font-bw-display text-3xl font-semibold uppercase text-bw-fg">Clearance through arrival</h3>
                <p className="mt-3 leading-relaxed text-bw-muted">
                  Your cargo is cleared as part of its arrival. After that it is counted again against the Foshan figures
                  and waits in our Dar es Salaam warehouse for you.
                </p>
                {freeDays ? (
                  <p className="bw-mono mt-5 inline-block border border-bw-line bg-bw-panel px-3 py-2 text-xs uppercase tracking-[0.14em] text-bw-fg">
                    Free storage · {freeDays} days after arrival
                  </p>
                ) : null}
              </article>
              <article className="bg-bw-panel p-6 sm:p-8">
                <p className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-coral">Your own container</p>
                <h3 className="mt-3 font-bw-display text-3xl font-semibold uppercase text-bw-fg">Clearance only</h3>
                <p className="mt-3 leading-relaxed text-bw-muted">
                  Shipped with somebody else and need the container cleared at Dar es Salaam? Send us the details and the
                  office will tell you what is needed.
                </p>
                <div className="mt-6">
                  <Action href="/book?service=CUSTOMS_CLEARANCE" tone="line">
                    Ask for clearance
                  </Action>
                </div>
              </article>
            </div>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ AROUND IT */}
      <section aria-labelledby="more" className="bg-bw-ground">
        <Frame className="py-20 lg:py-24">
          <SectionIntro
            index="05"
            label="Around the shipment"
            title={<span id="more">Before you buy, and the odd-shaped cargo</span>}
          />
          <ul className="mt-12 border-t border-bw-fg">
            {[
              {
                code: "Sourcing",
                title: "Sourcing in China",
                body: "Know what you want to sell but not where to buy it? We know the markets and factory towns of South China, help you find suppliers, and check goods before they ship.",
                href: "/explore",
                action: "Explore China's markets",
                photo: PHOTOS.cnWholesaleHall,
                alt: "Stalls in a wholesale market hall in China",
              },
              {
                code: "Special",
                title: "Special cargo",
                body: "Machines, vehicles, heavy, long or delicate goods that need to be looked at before they are packed and priced. Describe it and we will tell you how it can travel.",
                href: "/book?service=SPECIAL_CARGO",
                action: "Describe your cargo",
                photo: PHOTOS.warehouseForklift,
                alt: "A forklift moving goods between warehouse racks",
              },
            ].map((item) => (
              <li key={item.title} className="border-b border-bw-line">
                <Link
                  href={item.href}
                  className="group grid gap-6 py-8 transition-colors hover:bg-bw-panel sm:grid-cols-12 sm:items-center sm:px-4 lg:py-10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[2px] sm:col-span-4 lg:col-span-3">
                    <Image src={item.photo.src} alt={item.alt} fill sizes="(min-width: 640px) 30vw, 100vw" className="bw-photo object-cover" />
                  </div>
                  <div className="min-w-0 sm:col-span-8 lg:col-span-6">
                    <p className="bw-mono text-xs uppercase tracking-[0.16em] text-bw-harbour">{item.code}</p>
                    <h3 className="mt-2 font-bw-display text-4xl font-semibold uppercase text-bw-fg sm:text-5xl">{item.title}</h3>
                    <p className="mt-3 max-w-xl leading-relaxed text-bw-muted">{item.body}</p>
                  </div>
                  <span className="bw-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-coral sm:col-span-12 lg:col-span-3 lg:justify-end">
                    {item.action}
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Frame>
      </section>

      {/* ------------------------------------------------ CLOSING */}
      <section aria-labelledby="which" className="relative isolate overflow-hidden bg-bw-night text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="grid gap-8 py-16 lg:grid-cols-12 lg:items-end lg:py-20">
          <div className="lg:col-span-7">
            <Label className="text-white/70">Not sure which one?</Label>
            <h2 id="which" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase">
              Tell us what you are shipping
            </h2>
            <p className="mt-4 max-w-lg text-lg text-white/70">
              What the goods are and roughly how much. We will tell you whether loose cargo or a container is cheaper.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <Action href="/quote">Get a quote</Action>
            <Action href="/calculator" tone="ghost-light">
              Price calculator
            </Action>
          </div>
        </Frame>
      </section>
    </>
  );
}

function Term({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[2px] px-1 py-3 ${accent ? "bg-bw-coral text-white" : "bg-bw-panel text-bw-fg ring-1 ring-bw-line"}`}>
      <p className="bw-display text-xl sm:text-3xl">{value}</p>
      <p className={`bw-mono mt-1 truncate text-[0.55rem] uppercase tracking-[0.1em] ${accent ? "text-white/85" : "text-bw-muted"}`}>{label}</p>
    </div>
  );
}
