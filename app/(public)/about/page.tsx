import Image from "next/image";
import type { Metadata } from "next";

import { bwCompany } from "@/components/bw/data";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { WorldRoute } from "@/components/bw/world-route";
import { PHOTOS } from "@/components/site/photos";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "About us — China to Tanzania sea cargo from Foshan to Dar es Salaam",
  description:
    "BlueWave Cargo ships loose cargo and full containers by sea from our warehouse in Foshan, China to Dar es Salaam, Tanzania — weekly sailings, from sourcing to delivery, with our office in Kariakoo.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About BlueWave Cargo",
    description:
      "Sea cargo from China to Tanzania: a warehouse in Foshan, an office in Kariakoo, Dar es Salaam, and a container every week between them.",
  },
};

export const revalidate = 300;

/**
 * WHO WE ARE, IN FACTS THE BUSINESS CAN STAND BEHIND.
 *
 * No founding story, no customer counts, no quotes: nothing here is a claim
 * somebody would have to invent. The company's details are read from its
 * settings, so the page changes when they do.
 */
export default async function AboutPage() {
  const [company, entities] = await Promise.all([
    bwCompany(),
    prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { chinaEntity: true } }),
  ]);
  const tagline = company.tagline ?? "From sourcing to delivery";
  const instagram = company.instagram?.replace(/^@/, "") || null;

  const register: [string, React.ReactNode][] = [
    ["Trading name", company.name],
    ...(company.legalName ? ([["Registered in Tanzania", company.legalName]] as [string, React.ReactNode][]) : []),
    ...(entities?.chinaEntity ? ([["Receiving in China", entities.chinaEntity]] as [string, React.ReactNode][]) : []),
    ...(company.tin ? ([["TIN", company.tin]] as [string, React.ReactNode][]) : []),
    ...(company.darAddress ? ([["Dar es Salaam office", company.darAddress]] as [string, React.ReactNode][]) : []),
    ...(company.chinaAddressEnglish || company.chinaAddress
      ? ([["China warehouse", company.chinaAddressEnglish ?? company.chinaAddress]] as [string, React.ReactNode][])
      : []),
    ["Sailings", "Weekly, Foshan → Dar es Salaam"],
    ["Services", "Loose cargo · Full containers"],
    ...(instagram
      ? ([
          [
            "Instagram",
            <a
              key="ig"
              href={`https://instagram.com/${instagram}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-bw-coral underline-offset-4 hover:text-bw-coral-bright"
            >
              @{instagram}
            </a>,
          ],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <>
      <PageBanner
        label={`About ${company.name}`}
        title={tagline}
        lead="We ship goods by sea from China to Tanzania for traders and businesses — shared containers for loose cargo, whole containers for those who fill them, and help in China for those still looking for a supplier."
      />

      {/* ------------------------------------------------ WHO WE ARE */}
      <section aria-labelledby="who" className="bg-bw-panel">
        <Frame className="grid gap-14 py-20 lg:grid-cols-12 lg:py-28">
          <div className="lg:col-span-7">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">01</span>
              <span aria-hidden>/</span>
              Who we are
            </Label>
            <h2 id="who" className="bw-display mt-5 text-[clamp(2.4rem,5.2vw,4.6rem)] uppercase text-bw-fg">
              One company at both ends of the sea
            </h2>
            <div className="mt-8 max-w-2xl space-y-5 text-xl leading-relaxed text-bw-fg">
              <p>
                {company.name} runs one route: China to Tanzania by sea. Our warehouse in Nanhai, Foshan receives your
                goods from your suppliers. A container leaves every week for Dar es Salaam, where our warehouse hands
                the cargo over to you.
              </p>
              <p className="text-bw-muted">
                Because the same company holds the goods from the Foshan door to the Dar es Salaam counter, there is one
                reference, one set of figures and one office to call — not a chain of agents passing your cartons along.
              </p>
            </div>
          </div>

          {/* The company's particulars, read from its settings. */}
          <aside aria-labelledby="register" className="min-w-0 lg:col-span-5">
            <div className="overflow-hidden rounded-[3px] bg-bw-night text-white">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
                <p id="register" className="bw-mono text-[0.66rem] uppercase tracking-[0.18em] text-white/60">
                  Company particulars
                </p>
                <span aria-hidden className="size-2 bg-bw-coral" />
              </div>
              <dl className="divide-y divide-white/10">
                {register.map(([term, value]) => (
                  <div key={term} className="grid gap-1 px-5 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                    <dt className="bw-mono text-[0.66rem] uppercase tracking-[0.14em] text-white/50">{term}</dt>
                    <dd className="min-w-0 break-words leading-snug">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </Frame>
      </section>

      {/* ------------------------------------------------ TWO ENDS */}
      <section aria-labelledby="ends" className="relative isolate overflow-hidden bg-bw-night text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            dark
            index="02"
            label="Where we work"
            title={<span id="ends">Foshan to Dar es Salaam</span>}
            lead="Two floors, a sea lane between them, and a container on it every week."
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-12 lg:items-stretch">
            <End
              className="lg:col-span-4"
              photo={PHOTOS.warehouseRacks.src}
              alt="Boxed goods stored on warehouse racks"
              code="CN · Foshan"
              title="China warehouse"
              lines={["Nanhai District, Foshan, Guangdong", "Receiving, measuring, photos, storage", "Containers loaded here"]}
            />
            <div className="flex min-w-0 flex-col justify-center rounded-[3px] border border-white/10 p-4 sm:p-6 lg:col-span-4">
              <WorldRoute className="h-auto w-full" />
              <p className="bw-mono mt-4 text-center text-[0.66rem] uppercase tracking-[0.16em] text-white/55">
                Through the Malacca Strait and across the Indian Ocean
              </p>
            </div>
            <End
              className="lg:col-span-4"
              photo={PHOTOS.portCranes.src}
              alt="Ship-to-shore cranes over a container terminal"
              code="TZ · Dar es Salaam"
              title="Office & warehouse"
              lines={["Dar es Salaam", "Arrival, recount, storage", "Invoices, payments, collection"]}
            />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ HOW WE WORK */}
      <section aria-labelledby="principles" className="bg-bw-ground">
        <Frame className="py-20 lg:py-28">
          <SectionIntro
            index="03"
            label="How we work"
            title={<span id="principles">The rules the floor works by</span>}
            lead="Not promises — the way the warehouses and the office actually run."
          />
          <dl className="mt-14 border-t-2 border-bw-fg">
            {[
              [
                "Measured at both ends",
                "Foshan counts, weighs and measures every consignment when it arrives. Dar es Salaam does it again when it comes off the container. Both figures are kept, side by side.",
              ],
              [
                "Photographed on arrival",
                "Your goods are photographed when Foshan receives them, so you can see they are in our hands long before they reach you.",
              ],
              [
                "One reference per package",
                "Every package gets its own reference and QR label in Foshan and keeps it until you collect. Shared containers, separate cargo.",
              ],
              [
                "Priced from the rate book",
                "Loose cargo is priced per CBM from our published rates. The invoice is in USD with shillings at the rate of the day it is issued, and that rate stays on the invoice.",
              ],
              [
                "Released to the right person",
                "Cargo leaves our warehouse only once the invoice is paid and confirmed, against a pickup note and ID, with every box scanned out.",
              ],
            ].map(([title, body], i) => (
              <div key={title} className="grid gap-3 border-b border-bw-line py-8 md:grid-cols-12 md:gap-8">
                <dt className="flex items-baseline gap-4 md:col-span-5">
                  <span className="bw-mono text-sm text-bw-harbour">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-bw-display text-3xl font-semibold uppercase leading-none text-bw-fg sm:text-4xl">
                    {title}
                  </span>
                </dt>
                <dd className="text-lg leading-relaxed text-bw-muted md:col-span-6 md:col-start-7">{body}</dd>
              </div>
            ))}
          </dl>
        </Frame>
      </section>

      {/* ------------------------------------------------ CLOSING */}
      <section aria-labelledby="next" className="bg-bw-panel">
        <Frame className="grid gap-8 py-16 lg:grid-cols-12 lg:items-end lg:py-20">
          <div className="lg:col-span-7">
            <Label className="text-bw-muted">Ship with us</Label>
            <h2 id="next" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              Your next order, from Foshan to Kariakoo
            </h2>
          </div>
          <div className="flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <Action href="/quote">Get a quote</Action>
            <Action href="/contact" tone="line">
              Contact the office
            </Action>
          </div>
        </Frame>
      </section>
    </>
  );
}

function End({
  photo,
  alt,
  code,
  title,
  lines,
  className,
}: {
  photo: (typeof PHOTOS)[keyof typeof PHOTOS]["src"];
  alt: string;
  code: string;
  title: string;
  lines: string[];
  className?: string;
}) {
  return (
    <article className={`relative isolate flex min-h-[22rem] flex-col justify-end overflow-hidden rounded-[3px] p-6 ${className ?? ""}`}>
      <Image src={photo} alt={alt} fill sizes="(min-width: 1024px) 33vw, 100vw" className="bw-photo -z-20 object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-bw-night via-bw-night/70 to-bw-night/10" />
      <p className="bw-mono mb-5 self-start border sm:absolute sm:mb-0 sm:left-6 sm:top-6 border-white/40 px-2 py-1 text-xs tracking-[0.2em]">{code.toUpperCase()}</p>
      <h3 className="bw-display text-4xl uppercase">{title}</h3>
      <ul className="mt-4 space-y-1.5 text-sm text-white/80">
        {lines.map((line) => (
          <li key={line} className="flex gap-3">
            <span aria-hidden className="mt-2 h-px w-3 shrink-0 bg-bw-coral-bright" />
            {line}
          </li>
        ))}
      </ul>
    </article>
  );
}
