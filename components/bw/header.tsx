"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, Menu, PackageSearch, Phone, X } from "lucide-react";

import { Lockup } from "@/components/bw/lockup";
import { TrackField } from "@/components/bw/track-field";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; note: string };
type NavGroup = { key: string; label: string; intro: string; links: NavLink[] };

/*
  THE SITE, AS A JOURNEY.

  Four groups in the order a buyer lives them: find it in China, get it bought,
  move it home, and the company behind all three. Markets, factories, visits and
  sourcing are first-class destinations here, not paragraphs on a services page.
*/
export const NAV: NavGroup[] = [
  {
    key: "explore",
    label: "Explore China",
    intro: "Where things are made and sold.",
    links: [
      { href: "/explore", label: "Explore China", note: "Cities, markets and what they sell" },
      { href: "/markets", label: "Markets", note: "Wholesale markets, by city and product" },
      { href: "/factories", label: "Factories", note: "Makers you can source from or visit" },
      { href: "/visit", label: "Business visits", note: "Plan a buying trip to China" },
    ],
  },
  {
    key: "source",
    label: "Source",
    intro: "Get it found and bought.",
    links: [
      { href: "/sourcing", label: "Sourcing", note: "Products, suppliers and factories found for you" },
      { href: "/pickup", label: "China pickup", note: "We collect from your supplier" },
      { href: "/quote", label: "Get a quote", note: "Tell us what you are moving" },
    ],
  },
  {
    key: "ship",
    label: "Logistics",
    intro: "Move it home to Tanzania.",
    links: [
      { href: "/services", label: "Sea cargo", note: "Loose cargo, full containers, clearance" },
      { href: "/schedule", label: "Sailing schedule", note: "This week's container and the next" },
      { href: "/calculator", label: "Rates & calculator", note: "Price a shipment by CBM" },
      { href: "/track", label: "Track cargo", note: "Where your goods are now" },
    ],
  },
  {
    key: "company",
    label: "BlueWave",
    intro: "The company behind the journey.",
    links: [
      { href: "/how-it-works", label: "How it works", note: "China to Dar es Salaam, step by step" },
      { href: "/about", label: "About BlueWave", note: "Who we are, both offices" },
      { href: "/contact", label: "Contact", note: "Dar es Salaam and Foshan" },
    ],
  },
];

type Contact = { dar: string | null; darHref: string | null; china: string | null };

/**
 * THE PUBLIC HEADER.
 *
 * One quiet bar. Four groups open a panel of their pages; the right-hand side
 * carries the theme, tracking and the way into an account. Every public page
 * opens on a dark band, so the bar floats over it in white and turns to a solid
 * panel once the page is scrolled.
 */
export function BwHeader({ contact }: { contact: Contact }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState<"staff" | "customer" | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* A hint the middleware leaves, not a credential: it only decides which
     link to show. See middleware.ts. */
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)bw\.session=(staff|customer)/);
    setSignedIn(match ? (match[1] as "staff" | "customer") : null);
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
    setPanel(null);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  /* The open menu covers the page; the page behind it must not scroll. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const account =
    signedIn === "staff"
      ? { href: "/app/dashboard", label: "Staff desk" }
      : signedIn
        ? { href: "/portal", label: "My account" }
        : { href: "/login", label: "Sign in" };

  const solid = scrolled || panel !== null;
  const activeGroup = NAV.find((g) => g.links.some((l) => pathname === l.href || pathname.startsWith(`${l.href}/`)))?.key;

  const holdPanel = (key: string | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setPanel(key);
  };
  const leavePanel = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPanel(null), 160);
  };

  const current = NAV.find((g) => g.key === panel);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-300",
        solid
          ? "border-bw-line bg-bw-panel/95 backdrop-blur-md supports-[backdrop-filter]:bg-bw-panel/85"
          : "border-transparent bg-transparent"
      )}
      onMouseLeave={leavePanel}
    >
      <div className="mx-auto flex h-[4.5rem] max-w-[1320px] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-10">
        <Link href="/" aria-label="BlueWave Cargo — home" className="shrink-0">
          {/* Over the dark opening band the light cut; once solid, the theme's. */}
          <Lockup dark={!solid} />
        </Link>

        <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
          {NAV.map((group) => (
            <button
              key={group.key}
              type="button"
              aria-expanded={panel === group.key}
              aria-controls={`bw-panel-${group.key}`}
              onMouseEnter={() => holdPanel(group.key)}
              onClick={() => setPanel((p) => (p === group.key ? null : group.key))}
              className={cn(
                "relative inline-flex items-center gap-1 rounded-[2px] px-3 py-2 text-[0.95rem] font-medium transition-colors",
                solid
                  ? panel === group.key || activeGroup === group.key
                    ? "text-bw-fg"
                    : "text-bw-muted hover:text-bw-fg"
                  : "text-white/80 hover:text-white"
              )}
            >
              {group.label}
              <ChevronDown className={cn("size-3.5 transition-transform", panel === group.key && "rotate-180")} aria-hidden />
              {activeGroup === group.key ? (
                <span aria-hidden className="absolute inset-x-3 bottom-0.5 h-[2px] bg-bw-coral" />
              ) : null}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2 lg:ml-3">
          <ThemeToggle
            className={cn(
              "hidden size-10 rounded-[2px] sm:grid",
              solid ? "text-bw-muted hover:bg-bw-ground hover:text-bw-fg" : "text-white/75 hover:bg-white/10 hover:text-white"
            )}
          />
          <Link
            href="/track"
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-[2px] px-2.5 text-[0.95rem] font-medium transition-colors sm:px-3",
              solid ? "text-bw-fg hover:bg-bw-ground" : "text-white hover:bg-white/10"
            )}
          >
            {/* On a phone this is the one thing most visitors came for, so it stays in the bar. */}
            <PackageSearch className="size-5 sm:hidden" aria-hidden />
            <span className="max-[359px]:sr-only">Track</span>
            <span className="hidden sm:inline">&nbsp;cargo</span>
          </Link>
          <Link
            href={account.href}
            className="hidden h-10 items-center gap-2 whitespace-nowrap rounded-[2px] bg-bw-coral px-4 text-[0.95rem] font-semibold sm:inline-flex text-white transition-colors hover:bg-bw-coral-dark"
          >
            {account.label}
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            aria-controls="bw-menu"
            className={cn(
              "grid size-10 place-items-center rounded-[2px] lg:hidden",
              solid ? "text-bw-fg hover:bg-bw-ground" : "text-white hover:bg-white/10"
            )}
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>

      {/* The group's panel: its pages, each with the one line that says why. */}
      {current ? (
        <div
          id={`bw-panel-${current.key}`}
          className="hidden border-t border-bw-line bg-bw-panel lg:block"
          onMouseEnter={() => holdPanel(current.key)}
        >
          <div className="mx-auto grid max-w-[1320px] grid-cols-12 gap-8 px-10 py-8">
            <div className="col-span-3">
              <p className="bw-label text-bw-muted">{current.label}</p>
              <p className="bw-display mt-3 text-3xl uppercase text-bw-fg">{current.intro}</p>
            </div>
            <ul className="col-span-9 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] bg-bw-line xl:grid-cols-4">
              {current.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group flex h-full flex-col bg-bw-panel p-5 transition-colors hover:bg-bw-ground"
                  >
                    <span className="flex items-center justify-between gap-3 font-semibold text-bw-fg">
                      {link.label}
                      <ArrowRight className="size-4 text-bw-coral transition-transform group-hover:translate-x-1" aria-hidden />
                    </span>
                    <span className="mt-1.5 text-sm text-bw-muted">{link.note}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {open ? (
        <div
          id="bw-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bw-night text-white"
        >
          <div className="mx-auto flex h-[4.5rem] w-full max-w-[1320px] shrink-0 items-center justify-between px-4 pt-[env(safe-area-inset-top)] sm:px-6">
            <Lockup dark />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="grid size-10 place-items-center rounded-[2px] hover:bg-white/10"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-10 sm:px-6">
            <div className="mt-4">
              <TrackField dark id="bw-track-menu" />
            </div>
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              {NAV.map((group) => (
                <nav key={group.key} aria-label={group.label}>
                  <p className="bw-label text-white/55">{group.label}</p>
                  <ul className="mt-2 border-t border-white/10">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          className="flex items-center justify-between border-b border-white/10 py-3.5 text-lg font-medium hover:text-bw-coral-bright"
                        >
                          {link.label}
                          <ArrowRight className="size-4 text-white/40" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href={account.href}
                className="inline-flex h-11 items-center gap-2 rounded-[2px] bg-bw-coral px-5 font-semibold text-white hover:bg-bw-coral-dark"
              >
                {account.label}
              </Link>
              {contact.dar && contact.darHref ? (
                <a
                  href={contact.darHref}
                  className="bw-mono inline-flex h-11 items-center gap-2.5 rounded-[2px] border border-white/20 px-4 text-sm"
                >
                  <Phone className="size-4 text-bw-coral-bright" />
                  {contact.dar}
                </a>
              ) : null}
              <ThemeToggle className="size-11 rounded-[2px] border border-white/20 text-white hover:bg-white/10" />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
