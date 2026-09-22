import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  THE PUBLIC SITE'S BUILDING BLOCKS.

  Square corners, hairline rules, condensed capitals for anything a visitor
  reads first and mono capitals for anything they compare. Buttons are slabs,
  not pills. The staff app's kit is deliberately not used here.
*/

/** The page column. Wide, with generous gutters — an editorial measure. */
export function Frame({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "header" | "footer" | "nav";
}) {
  return <Tag className={cn("mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:px-10", className)}>{children}</Tag>;
}

/** A manifest line: mono capitals behind a coral square. */
export function Label({
  children,
  className,
  plain = false,
  as: Tag = "p",
}: {
  children: React.ReactNode;
  className?: string;
  plain?: boolean;
  as?: "p" | "span" | "dt" | "h2" | "h3";
}) {
  return (
    <Tag className={cn("bw-label", className)} data-plain={plain ? "" : undefined}>
      {children}
    </Tag>
  );
}

type ActionTone = "coral" | "ink" | "line" | "light" | "ghost-light";

const TONE: Record<ActionTone, string> = {
  coral: "bg-bw-coral text-white hover:bg-bw-coral-dark",
  ink: "bg-bw-ink text-white hover:bg-bw-deep",
  line: "border border-bw-fg/25 text-bw-fg hover:border-bw-fg hover:bg-bw-panel",
  /* Always white: it sits on photographs and dark bands in both themes. */
  light: "bg-white text-bw-ink hover:bg-bw-concrete",
  "ghost-light": "border border-white/30 text-white hover:border-white hover:bg-white/10",
};

/**
 * A slab button. Condensed capitals and an arrow that travels on hover —
 * the only motion a button needs.
 */
export function Action({
  href,
  children,
  tone = "coral",
  size = "md",
  external = false,
  className,
}: {
  href: string;
  children: React.ReactNode;
  tone?: ActionTone;
  size?: "md" | "lg";
  external?: boolean;
  className?: string;
}) {
  const Icon = external ? ArrowUpRight : ArrowRight;
  const cls = cn(
    "group inline-flex items-center justify-between gap-4 rounded-[2px] font-bw-display font-semibold uppercase tracking-[0.06em] transition-colors",
    size === "lg" ? "h-14 px-6 text-lg" : "h-12 px-5 text-base",
    TONE[tone],
    className
  );
  const body = (
    <>
      <span>{children}</span>
      <Icon className="size-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
    </>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** Section headline: condensed capitals, big, balanced. */
export function Headline({
  children,
  className,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <Tag className={cn("bw-display text-[clamp(2.4rem,5.2vw,4.6rem)] uppercase", className)}>{children}</Tag>
  );
}

/**
 * The opening of a section, asymmetric: the index and headline hold the left
 * two thirds, the explanation sits low on the right. Stacks on a phone.
 */
export function SectionIntro({
  index,
  label,
  title,
  lead,
  dark = false,
  className,
}: {
  index: string;
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-12 lg:items-end", className)}>
      <div className="lg:col-span-7">
        <Label className={dark ? "text-white/70" : "text-bw-muted"}>
          <span className={dark ? "text-bw-cyan" : "text-bw-harbour"}>{index}</span>
          <span aria-hidden>/</span>
          {label}
        </Label>
        <Headline className={cn("mt-5", dark ? "text-white" : "text-bw-fg")}>{title}</Headline>
      </div>
      {lead ? (
        <div className={cn("text-lg leading-relaxed lg:col-span-4 lg:col-start-9", dark ? "text-white/70" : "text-bw-muted")}>
          {lead}
        </div>
      ) : null}
    </div>
  );
}

/** A page's own opening band, for every page but the home page. */
export function PageBanner({
  label,
  title,
  lead,
  children,
  className,
}: {
  label: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bw-top relative isolate overflow-hidden bg-bw-night text-white", className)}>
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_0%,rgb(42_154_212/0.28),transparent_55%)]"
      />
      <Frame className="py-14 sm:py-20">
        <Label className="text-white/70">{label}</Label>
        <h1 className="bw-display mt-5 max-w-4xl text-[clamp(2.8rem,7vw,6rem)] uppercase">{title}</h1>
        {lead ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/70">{lead}</p> : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </Frame>
    </section>
  );
}

/** A figure with its label, mono, for boards and panels. */
export function Figure({
  label,
  value,
  sub,
  className,
  dark = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label as="dt" className={cn("!text-[0.66rem]", dark ? "text-white/60" : "text-bw-muted")}>
        {label}
      </Label>
      <dd className={cn("mt-2 break-words font-bw-display text-3xl font-semibold uppercase leading-none sm:text-4xl", dark ? "text-white" : "text-bw-fg")}>
        {value}
      </dd>
      {sub ? <dd className={cn("bw-mono mt-2 text-xs", dark ? "text-white/55" : "text-bw-muted")}>{sub}</dd> : null}
    </div>
  );
}
