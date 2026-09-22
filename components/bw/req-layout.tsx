import { MessageCircle, Phone } from "lucide-react";

import type { BwCompany } from "@/components/bw/data";
import { Frame, Label } from "@/components/bw/ui";
import { cn } from "@/lib/utils";

/**
 * THE REQUEST PAGES' BODY.
 *
 * The form sits on a plain white sheet — square corners, a hairline edge, a
 * docket line across the top — with a column beside it that answers the
 * questions a trader has while filling it in. The forms themselves are the
 * shared ones from components/site/request-forms.tsx (the portal uses them
 * too); here they are only framed. Their own card is flattened into the sheet
 * so the page reads as one document rather than a box inside a box.
 */
export function ReqLayout({
  docket,
  title,
  intro,
  form,
  side,
}: {
  /** The mono line across the top of the sheet, e.g. "Request · China pickup". */
  docket: string;
  title: string;
  intro?: React.ReactNode;
  form: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <section aria-labelledby="req-form-title" className="bg-bw-ground">
      <Frame className="grid gap-8 py-12 sm:py-16 lg:grid-cols-12 lg:gap-10 lg:py-20">
        <div className="min-w-0 lg:col-span-8">
          <div className="rounded-[2px] border border-bw-line bg-bw-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bw-line px-5 py-3 sm:px-8">
              <Label className="text-bw-muted">{docket}</Label>
              <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-bw-muted">Foshan → Dar es Salaam</p>
            </div>
            <div className="px-5 pb-6 pt-6 sm:px-8 sm:pb-8 sm:pt-8">
              <h2 id="req-form-title" className="bw-display text-4xl uppercase text-bw-fg sm:text-5xl">
                {title}
              </h2>
              {intro ? <p className="mt-3 max-w-2xl text-bw-muted">{intro}</p> : null}
              <div
                className={cn(
                  "mt-8",
                  /* Flatten the shared form's own card into this sheet. */
                  "[&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&>div]:shadow-none",
                  /* Square the controls to match the site. */
                  "[&_button]:rounded-[2px] [&_input]:rounded-[2px] [&_textarea]:rounded-[2px]",
                  /* The "sent" note keeps a frame of its own. */
                  "[&>div[role=status]]:border [&>div[role=status]]:border-bw-line [&>div[role=status]]:p-7"
                )}
              >
                {form}
              </div>
            </div>
          </div>
        </div>
        <aside aria-label="Before you send" className="min-w-0 space-y-4 lg:col-span-4">
          {side}
        </aside>
      </Frame>
    </section>
  );
}

/** One block of the side column: a hairline sheet with a manifest line. */
export function ReqBlock({
  label,
  title,
  children,
  dark = false,
  className,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[2px] p-5 sm:p-6",
        dark ? "relative isolate overflow-hidden bg-bw-night text-white" : "border border-bw-line bg-bw-panel text-bw-fg",
        className
      )}
    >
      {dark ? <div aria-hidden className="bw-ribs absolute inset-0 -z-10" /> : null}
      <Label as="h3" className={dark ? "text-white/70" : "text-bw-muted"}>
        {label}
      </Label>
      {title ? (
        <p className={cn("bw-display mt-3 text-3xl uppercase", dark ? "text-white" : "text-bw-fg")}>{title}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A numbered list in the manifest voice. */
export function ReqSteps({ items, dark = false }: { items: [string, string][]; dark?: boolean }) {
  return (
    <ol className={cn("divide-y", dark ? "divide-white/10" : "divide-bw-line")}>
      {items.map(([title, body], i) => (
        <li key={title} className="grid grid-cols-[2rem_1fr] gap-2 py-3 first:pt-0 last:pb-0">
          <span className={cn("bw-mono pt-0.5 text-xs", dark ? "text-bw-cyan" : "text-bw-harbour")}>
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <p className={cn("font-bw-display text-lg font-semibold uppercase leading-tight", dark ? "text-white" : "text-bw-fg")}>
              {title}
            </p>
            <p className={cn("mt-1 text-sm leading-relaxed", dark ? "text-white/65" : "text-bw-muted")}>{body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The office's numbers and WhatsApp, for somebody who would rather talk. */
export function ReqContact({
  company,
  label = "Rather talk to someone?",
  china = false,
}: {
  company: BwCompany;
  label?: string;
  /** Also print the Foshan warehouse's number. */
  china?: boolean;
}) {
  /* Which of the two office numbers is the one answered on WhatsApp. Both
     labelled "Dar es Salaam office" told a customer nothing about which to
     message, and the company answers those two lines differently. */
  const isWhatsApp = (number: string) => {
    const digits = number.replace(/\D/g, "");
    return digits.length >= 9 && !!company.whatsapp?.includes(digits);
  };

  const lines: { where: string; number: string; href: string | null }[] = [];
  if (company.phone) {
    lines.push({
      where: isWhatsApp(company.phone) ? "Dar es Salaam · call or WhatsApp" : "Dar es Salaam office",
      number: company.phone,
      href: company.phoneHref,
    });
  }
  if (company.altPhone) {
    lines.push({
      where: isWhatsApp(company.altPhone) ? "Dar es Salaam · call or WhatsApp" : "Dar es Salaam · second line",
      number: company.altPhone,
      href: company.altPhoneHref,
    });
  }
  if (china && company.chinaPhone) lines.push({ where: `${company.chinaCity} warehouse`, number: company.chinaPhone, href: null });

  return (
    <ReqBlock label={label} dark>
      {lines.length ? (
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.number}>
              <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/55">{line.where}</p>
              {line.href ? (
                <a href={line.href} className="bw-mono mt-1 inline-flex items-center gap-2 text-lg text-white hover:text-bw-coral-bright">
                  <Phone className="size-4 text-bw-coral-bright" aria-hidden />
                  {line.number}
                </a>
              ) : (
                <p className="bw-mono mt-1 inline-flex items-center gap-2 text-lg text-white">
                  <Phone className="size-4 text-bw-cyan" aria-hidden />
                  {line.number}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-white/70">Call or visit our office in Kariakoo, Dar es Salaam.</p>
      )}
      {company.whatsapp ? (
        <a
          href={company.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[2px] border border-white/30 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-white hover:border-white hover:bg-white/10"
        >
          <MessageCircle className="size-4 text-bw-coral-bright" aria-hidden />
          Message us on WhatsApp
        </a>
      ) : null}
    </ReqBlock>
  );
}
