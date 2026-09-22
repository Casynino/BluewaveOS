import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { bwCompany } from "@/components/bw/data";
import { bwFontVars } from "@/components/bw/fonts";
import { BwFooter } from "@/components/bw/footer";
import { BwHeader } from "@/components/bw/header";
import { TrackField } from "@/components/bw/track-field";
import { Action, Frame, Label } from "@/components/bw/ui";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * An address that does not exist on the public site.
 *
 * Rendered with the site's own header and footer, because the root layout has
 * neither, and a bare 404 is a dead end for somebody who followed an old link
 * off a WhatsApp message. Most of them were looking for their cargo, so the
 * tracking field is the first thing offered.
 */
export default async function NotFound() {
  const company = await bwCompany();
  return (
    <div className={`bw ${bwFontVars} flex min-h-dvh flex-col`}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-bw-panel focus:px-4 focus:py-2 focus:text-bw-fg"
      >
        Skip to content
      </a>
      <BwHeader contact={{ dar: company.phone, darHref: company.phoneHref, china: company.chinaPhone }} />
      <main id="main" className="flex flex-1 flex-col">
        <section className="bw-top relative isolate flex-1 overflow-hidden bg-bw-night text-white">
          <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
          <Frame className="grid gap-12 py-16 sm:py-24 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <Label className="text-white/70">Error 404 · Not on the manifest</Label>
              <p aria-hidden className="bw-display mt-6 text-[clamp(6rem,22vw,15rem)] leading-[0.8] text-white/15">
                404
              </p>
              <h1 className="bw-display mt-4 text-[clamp(2.4rem,6vw,4.8rem)] uppercase">We could not find that page</h1>
              <p className="mt-5 max-w-xl text-lg text-white/70">
                The link may be old or mistyped. If you are looking for your cargo, track it by the reference on your
                delivery note or box label.
              </p>
            </div>
            <div className="min-w-0 lg:col-span-5">
              <Label as="h2" className="text-white/70">
                Track your cargo
              </Label>
              <div className="mt-4">
                <TrackField dark />
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Action href="/" tone="light">
                  Home page
                </Action>
                <Action href="/contact" tone="ghost-light">
                  Contact us
                </Action>
              </div>
            </div>
          </Frame>
        </section>
        <nav aria-label="Popular pages" className="border-b border-bw-line bg-bw-panel">
          <Frame>
            <ul className="grid divide-y divide-bw-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
              {[
                ["/schedule", "Sailing schedule"],
                ["/calculator", "Rates & calculator"],
                ["/book", "Book a shipment"],
                ["/pickup", "China pickup"],
              ].map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center justify-between gap-3 py-5 font-bw-display text-xl font-semibold uppercase text-bw-fg hover:text-bw-coral sm:pr-8"
                  >
                    {label}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </Frame>
        </nav>
      </main>
      <BwFooter company={company} />
    </div>
  );
}
