import Link from "next/link";
import { Instagram, MessageCircle } from "lucide-react";

import type { BwCompany } from "@/components/bw/data";
import { Lockup } from "@/components/bw/lockup";
import { Label } from "@/components/bw/ui";
import { darFields } from "@/lib/dar-time";

const COLUMNS: { title: string; links: [string, string][] }[] = [
  {
    title: "Explore China",
    links: [
      ["/explore", "Explore China"],
      ["/markets", "Markets"],
      ["/factories", "Factories"],
      ["/visit", "Business visits"],
    ],
  },
  {
    title: "Source & ship",
    links: [
      ["/sourcing", "Sourcing"],
      ["/pickup", "China pickup"],
      ["/services", "Sea cargo"],
      ["/schedule", "Sailing schedule"],
      ["/calculator", "Rates & calculator"],
      ["/track", "Track cargo"],
    ],
  },
  {
    title: "BlueWave",
    links: [
      ["/how-it-works", "How it works"],
      ["/about", "About BlueWave"],
      ["/contact", "Contact"],
      ["/register", "Open an account"],
      ["/login", "Sign in"],
    ],
  },
];

/**
 * THE FOOTER: TWO OFFICES, THEN THE WAY AROUND.
 *
 * Both ends of the lane are printed the way they are used — the Dar office for
 * customers, the Foshan warehouse in Chinese for suppliers — so the footer
 * answers "where do I go" and "where do I send it" on every page.
 */
export function BwFooter({ company }: { company: BwCompany }) {
  return (
    <footer className="relative isolate overflow-hidden bg-bw-night text-white/75">
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />

      <div className="mx-auto grid max-w-[1320px] gap-px bg-white/10 px-0 sm:grid-cols-2 lg:mt-0">
        <Office
          label="Dar es Salaam · Office"
          title="Kariakoo"
          lines={[company.darAddress, company.phone, company.altPhone]}
          accent="bg-bw-coral"
        />
        <Office
          label="Foshan · China warehouse"
          title="Nanhai, Foshan"
          lines={[company.chinaAddress, company.chinaAddressEnglish, company.chinaPhone]}
          accent="bg-bw-cyan"
        />
      </div>

      <div className="mx-auto grid max-w-[1320px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:px-10">
        <div className="lg:col-span-4">
          <Lockup dark />
          <p className="mt-5 max-w-sm leading-relaxed text-white/65">
            Your China to Tanzania business journey — markets, factories, sourcing and business visits, then sea
            cargo from our Foshan warehouse to Dar es Salaam.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {company.whatsapp ? (
              <a
                href={company.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[2px] border border-white/20 px-3.5 text-sm hover:border-white hover:text-white"
              >
                <MessageCircle className="size-4 text-bw-coral-bright" />
                WhatsApp
              </a>
            ) : null}
            {company.instagram ? (
              <a
                href={`https://www.instagram.com/${company.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-[2px] border border-white/20 px-3.5 text-sm hover:border-white hover:text-white"
              >
                <Instagram className="size-4 text-bw-cyan" />@{company.instagram}
              </a>
            ) : null}
          </div>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title} className="lg:col-span-2 lg:col-start-auto">
            <Label className="text-white/55">{column.title}</Label>
            <ul className="mt-5 space-y-3">
              {column.links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className="hover:text-white">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-white/10">
        <div className="bw-mono mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-[0.7rem] uppercase tracking-[0.12em] text-white/45 sm:px-6 lg:px-10">
          <p>
            {/* The year Dar is in, not the year the server's own clock is in:
                for three hours every New Year's Eve those are different. */}
            © {darFields().year} {company.legalName ?? company.name}
            {company.tin ? ` · TIN ${company.tin}` : ""}
          </p>
          <p>Discover · Source · Ship · Collect</p>
        </div>
      </div>
    </footer>
  );
}

function Office({
  label,
  title,
  lines,
  accent,
}: {
  label: string;
  title: string;
  lines: (string | null)[];
  accent: string;
}) {
  const shown = lines.filter(Boolean) as string[];
  return (
    <div className="bg-bw-night px-4 py-10 sm:px-6 lg:px-10">
      <p className="bw-mono inline-flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.16em] text-white/55">
        <span className={`size-2 ${accent}`} aria-hidden />
        {label}
      </p>
      <p className="bw-display mt-3 text-4xl uppercase text-white">{title}</p>
      <address className="mt-4 space-y-1 not-italic text-white/70">
        {shown.map((line) => (
          <p key={line} className="break-words">
            {line}
          </p>
        ))}
      </address>
    </div>
  );
}
