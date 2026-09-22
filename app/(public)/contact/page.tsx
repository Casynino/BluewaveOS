import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { bwCompany } from "@/components/bw/data";
import { SupplierPlate } from "@/components/bw/info-supplier";
import { Action, Frame, Label, PageBanner, SectionIntro } from "@/components/bw/ui";
import { QuoteForm } from "@/components/site/request-forms";
import { telHref } from "@/lib/site-contact";
import { supplierAddress } from "@/lib/supplier-address";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contact — Dar es Salaam office and Foshan warehouse",
  description:
    "Call or WhatsApp BlueWave Cargo in Kariakoo, Dar es Salaam, get our Foshan warehouse address for your supplier, or ask for a China to Tanzania sea cargo quote.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact BlueWave Cargo",
    description:
      "Our Dar es Salaam office in Kariakoo, our Foshan warehouse address for suppliers, and a quote form for sea cargo from China to Tanzania.",
  },
};

export const revalidate = 300;

/* The China phone setting may carry two numbers — "+86 … / +86 …". */
const splitPhones = (value: string | null) =>
  (value ?? "")
    .split(/\s*[/,;]\s*/)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, "").length >= 6);

export default async function ContactPage() {
  const [company, forSupplier] = await Promise.all([bwCompany(), supplierAddress(null)]);
  const chinaPhones = splitPhones(company.chinaPhone);

  return (
    <>
      <PageBanner
        label="Contact"
        title="Talk to the office"
        lead="Call us, message us on WhatsApp, or leave your details and we will come back to you with a price."
      >
        <div className="flex flex-wrap items-center gap-3">
          {company.phone && company.phoneHref ? (
            <a
              href={company.phoneHref}
              className="inline-flex h-14 items-center gap-3 rounded-[2px] bg-bw-coral px-6 font-bw-display text-xl font-semibold uppercase tracking-[0.04em] text-white transition-colors hover:bg-bw-coral-dark"
            >
              <span className="bw-mono text-[0.68rem] tracking-[0.16em] text-white/80">Call</span>
              {company.phone}
            </a>
          ) : null}
          {company.whatsapp ? (
            <Action href={company.whatsapp} external tone="ghost-light" size="lg">
              WhatsApp us
            </Action>
          ) : null}
          <Link
            href="/track"
            className="bw-mono ml-1 inline-flex h-14 items-center gap-2 px-2 text-xs uppercase tracking-[0.16em] text-white/70 hover:text-white"
          >
            Already shipping? Track cargo <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </PageBanner>

      {/* ------------------------------------------------ OFFICES */}
      <section aria-labelledby="offices" className="bg-bw-panel">
        <Frame className="py-20 lg:py-24">
          <SectionIntro
            index="01"
            label="Offices"
            title={<span id="offices">Two addresses, two jobs</span>}
            lead="Come to Dar es Salaam to talk, pay and collect. Foshan is where your supplier delivers."
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            {/* Dar es Salaam: the office customers visit. */}
            <article aria-labelledby="plate-dar" className="flex min-w-0 flex-col overflow-hidden rounded-[3px] border border-bw-fg bg-bw-panel">
              <PlateHead code="TZ" place="Dar es Salaam" role="Office · pickup warehouse" id="plate-dar" />
              <dl className="flex-1 divide-y divide-bw-line">
                {company.darAddress ? (
                  <PlateRow term="Office">
                    <span className="text-lg leading-snug">{company.darAddress}</span>
                  </PlateRow>
                ) : null}
                {/* The link in every arrival and pickup message lands here. */}
                {company.pickupAddress ? (
                  <PlateRow term="Pickup warehouse">
                    <span id="dar-warehouse" className="scroll-mt-28 text-lg leading-snug">
                      {company.name}, {company.pickupAddress}
                    </span>
                    <span className="mt-1 block text-sm text-bw-muted">
                      Collect here with your ID and pickup note once we tell you your cargo is ready.
                    </span>
                  </PlateRow>
                ) : null}
                {company.phone && company.phoneHref ? (
                  <PlateRow term="Phone">
                    <a href={company.phoneHref} className="bw-display block text-3xl text-bw-fg hover:text-bw-coral sm:text-4xl">
                      {company.phone}
                    </a>
                    {company.altPhone && company.altPhoneHref ? (
                      <a href={company.altPhoneHref} className="bw-mono mt-1 block text-bw-muted hover:text-bw-coral">
                        {company.altPhone}
                      </a>
                    ) : null}
                  </PlateRow>
                ) : null}
                {company.whatsapp ? (
                  <PlateRow term="WhatsApp">
                    <a
                      href={company.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 font-semibold text-bw-fg hover:text-bw-coral"
                    >
                      Message the office <ArrowUpRight className="size-4" aria-hidden />
                    </a>
                  </PlateRow>
                ) : null}
                {company.email ? (
                  <PlateRow term="Email">
                    <a href={`mailto:${company.email}`} className="break-all text-bw-fg hover:text-bw-coral">
                      {company.email}
                    </a>
                  </PlateRow>
                ) : null}
              </dl>
              <p className="border-t border-bw-line bg-bw-ground px-5 py-3 text-sm text-bw-muted sm:px-6">
                Collecting cargo? Bring your pickup note and your ID.
              </p>
            </article>

            {/* Foshan: the door suppliers deliver to. */}
            <article aria-labelledby="plate-cn" className="flex min-w-0 flex-col overflow-hidden rounded-[3px] bg-bw-night text-white">
              <PlateHead code="CN" place={company.chinaCity ?? "Foshan"} role="Warehouse · receiving · loading" id="plate-cn" dark />
              <dl className="flex-1 divide-y divide-white/10">
                {company.chinaAddress ? (
                  <PlateRow term="地址 · For suppliers" dark>
                    <span className="block text-lg leading-snug" lang="zh-CN">
                      {company.chinaAddress}
                    </span>
                  </PlateRow>
                ) : null}
                {company.chinaAddressEnglish ? (
                  <PlateRow term="In English" dark>
                    <span className="leading-snug text-white/80">{company.chinaAddressEnglish}</span>
                  </PlateRow>
                ) : null}
                {chinaPhones.length > 0 ? (
                  <PlateRow term="Phone" dark>
                    <span className="flex flex-col gap-1">
                      {chinaPhones.map((phone) => (
                        <a key={phone} href={telHref(phone)} className="bw-mono text-lg hover:text-bw-coral-bright">
                          {phone}
                        </a>
                      ))}
                    </span>
                  </PlateRow>
                ) : null}
              </dl>
              <p className="border-t border-white/10 px-5 py-3 text-sm text-white/60 sm:px-6">
                For deliveries from your suppliers. Questions about your cargo go to the Dar es Salaam office.
              </p>
            </article>
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ SUPPLIER ADDRESS */}
      <section aria-labelledby="supplier-address" className="bg-bw-ground">
        <Frame className="grid gap-12 py-20 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-5">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">02</span>
              <span aria-hidden>/</span>
              For your supplier
            </Label>
            <h2 id="supplier-address" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              The address to send your supplier
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-bw-muted">
              Suppliers in China read Chinese, so give them the address in Chinese. Copy the whole block and paste it
              into WhatsApp or WeChat.
            </p>
            <ol className="mt-8 space-y-4">
              {[
                "Copy the address block.",
                "Write your shipping mark on the last line — no mark yet? Open an account and you get one.",
                "Ask the supplier to write the mark on every carton and to phone the warehouse before delivering.",
              ].map((text, i) => (
                <li key={text} className="flex gap-4">
                  <span className="bw-mono flex size-7 shrink-0 items-center justify-center bg-bw-ink text-xs text-white">{i + 1}</span>
                  <span className="pt-0.5 leading-relaxed text-bw-fg">{text}</span>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-wrap gap-3">
              <Action href="/register" tone="ink">
                Get my shipping mark
              </Action>
              <Action href="/pickup" tone="line">
                We collect instead
              </Action>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-6 lg:col-start-7">
            {forSupplier ? (
              <SupplierPlate address={forSupplier} />
            ) : (
              <p className="rounded-[3px] border border-bw-line bg-bw-panel p-6 text-bw-muted">
                Call the Dar es Salaam office and we will send you the Foshan address.
              </p>
            )}
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ QUOTE */}
      <section aria-labelledby="ask" className="bg-bw-panel">
        <Frame className="grid gap-10 py-20 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-4">
            <Label className="text-bw-muted">
              <span className="text-bw-harbour">03</span>
              <span aria-hidden>/</span>
              Ask for a price
            </Label>
            <h2 id="ask" className="bw-display mt-5 text-[clamp(2.4rem,5vw,4.2rem)] uppercase text-bw-fg">
              Leave your details
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-bw-muted">The office replies with a price. It helps to tell us:</p>
            <ul className="mt-5 divide-y divide-bw-line border-y border-bw-line">
              {["What the goods are", "Roughly how many cartons or CBM", "Loose cargo or a full container", "Where in China the goods are"].map(
                (item) => (
                  <li key={item} className="flex gap-3 py-3 text-bw-fg">
                    <span aria-hidden className="mt-2.5 h-px w-3 shrink-0 bg-bw-coral" />
                    {item}
                  </li>
                )
              )}
            </ul>
            <nav aria-label="Other requests" className="mt-8">
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">Something else?</p>
              <ul className="mt-3 space-y-2">
                {[
                  ["/pickup", "Request a China pickup"],
                  ["/book", "Book space on a sailing"],
                  ["/calculator", "Price it yourself"],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="group inline-flex items-center gap-2 font-semibold text-bw-fg hover:text-bw-coral">
                      {label}
                      <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="min-w-0 lg:col-span-7 lg:col-start-6">
            <div className="rounded-[3px] border border-bw-line bg-bw-ground p-2 sm:p-3">
              <div className="rounded-[2px] bg-bw-panel p-5 sm:p-8">
                <QuoteForm />
              </div>
            </div>
          </div>
        </Frame>
      </section>
    </>
  );
}

function PlateHead({ code, place, role, id, dark = false }: { code: string; place: string; role: string; id: string; dark?: boolean }) {
  return (
    <header className={cn("flex items-stretch", dark ? "border-b border-white/10" : "border-b border-bw-fg")}>
      <span
        className={cn(
          "bw-display flex w-16 shrink-0 items-center justify-center text-3xl sm:w-20 sm:text-4xl",
          dark ? "bg-bw-coral text-white" : "bg-bw-ink text-white"
        )}
      >
        {code}
      </span>
      <div className="min-w-0 px-5 py-4 sm:px-6">
        <h3 id={id} className="bw-display text-3xl uppercase sm:text-4xl">
          {place}
        </h3>
        <p className={cn("bw-mono mt-1 text-[0.66rem] uppercase tracking-[0.16em]", dark ? "text-white/55" : "text-bw-muted")}>{role}</p>
      </div>
    </header>
  );
}

function PlateRow({ term, children, dark = false }: { term: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div className="grid gap-2 px-5 py-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
      <dt className={cn("bw-mono pt-1 text-[0.66rem] uppercase tracking-[0.14em]", dark ? "text-white/50" : "text-bw-muted")}>{term}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
