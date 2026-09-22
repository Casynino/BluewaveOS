import Link from "next/link";
import type { Metadata } from "next";
import { Camera, Clock, Download, FileText, MessageCircle } from "lucide-react";

import { JourneyGroups, PHASE_COPY, RouteStage, WhatNext, phaseOf } from "@/components/bw/track-journey";
import { TrackField } from "@/components/bw/track-field";
import { Action, Frame, Label } from "@/components/bw/ui";
import { CargoPhotos } from "@/components/site/cargo-photos";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/session";
import { clientAddress, hit } from "@/lib/rate-limit";
import { whatsappLink, WHATSAPP_OPENER } from "@/lib/site-contact";
import { SHARE_CARD_TEXT } from "@/lib/share-card-text";
import { trackKeyValid } from "@/lib/track-key";
import { referenceFromInput, trackByReference, type PublicTracking } from "@/lib/tracking";
import { cn } from "@/lib/utils";

/* One customer's cargo: never cached, never indexed. A cached page is
   yesterday's ETA and, now, somebody else's amount due. */
export const dynamic = "force-dynamic";

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * The card WhatsApp draws when this link is pasted into a chat.
 *
 * WhatsApp shows it to everybody in the group the link was pasted into, so no
 * reference, no name and no figure belongs on it. The page stays unindexed.
 */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const reference = referenceFromInput(safeDecode(code));
  return {
    /* The browser tab is the one place the reference helps: it is the reader's
       own tab, not a card in somebody else's group chat. */
    title: reference ? `Track ${reference}` : "Track your cargo",
    description: SHARE_CARD_TEXT.description,
    openGraph: { type: "website", title: SHARE_CARD_TEXT.title, description: SHARE_CARD_TEXT.description },
    twitter: { card: "summary_large_image", title: SHARE_CARD_TEXT.title, description: SHARE_CARD_TEXT.description },
    robots: { index: false, follow: false },
    /* The link may carry the invoice key; a page it opens from here is not
       told the address it came from. */
    referrer: "no-referrer",
  };
}

/*
  HOW OFTEN ONE ADDRESS MAY LOOK SOMETHING UP.

  The page publishes the bill and the counter photographs, so walking the
  sequence is worth something. Enough for an office checking a customer's
  consignments over the telephone, far too slow to read four thousand
  references. The burst window catches the shape a script has and a person
  does not. See lib/rate-limit.ts.
*/
const LOOKUPS_PER_WINDOW = 30;
const WINDOW_MS = 10 * 60 * 1000;
const BURST = 10;
const BURST_MS = 60 * 1000;

const TONE: Record<string, string> = {
  neutral: "bg-white/10 text-white",
  progress: "bg-bw-cyan/15 text-bw-cyan",
  good: "bg-emerald-400/15 text-emerald-300",
  warn: "bg-amber-400/15 text-amber-300",
  bad: "bg-bw-coral/20 text-bw-coral-bright",
};

/** "27,000" — grouped for reading. Nothing is rounded or converted here. */
function grouped(value: string) {
  const [whole, frac] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${frac ? `.${frac}` : ""}`;
}

const dayMonthYear = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Dar_es_Salaam",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "—";

export default async function TrackResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ k?: string }>;
}) {
  const { code } = await params;
  const { k } = await searchParams;
  const reference = referenceFromInput(safeDecode(code));

  if (!reference) {
    return (
      <Notice title="That is not a tracking reference">
        <p>Your reference is on your delivery note and on every box label. It looks like BW0125.</p>
      </Notice>
    );
  }

  const address = await clientAddress();
  const steady = hit(`track:${address}`, LOOKUPS_PER_WINDOW, WINDOW_MS);
  const burst = hit(`track-burst:${address}`, BURST, BURST_MS);
  if (!steady.ok || !burst.ok) {
    return (
      <Notice reference={reference} title="Too many lookups" icon={<Clock className="size-7 text-bw-cyan" />}>
        <p>Please wait a few minutes and try again, or sign in to see all of your cargo at once.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Action href="/login?callbackUrl=%2Fportal">Sign in</Action>
          <Action href="/contact" tone="ghost-light">
            Contact us
          </Action>
        </div>
      </Notice>
    );
  }

  const result = await trackByReference(reference);

  if (!result) {
    return (
      <Notice reference={reference} title={`We cannot find ${reference}`}>
        <p>
          Check the reference on your delivery note or box label. If your goods were only received today they may not
          be on the system yet.
        </p>
        <p className="mt-2 text-sm text-white/50">
          Shipping marks cannot be tracked here. Sign in to see everything under your mark.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Action href="/contact">Ask us instead</Action>
          <Action href="/login?callbackUrl=%2Fportal" tone="ghost-light">
            Sign in
          </Action>
        </div>
      </Notice>
    );
  }

  const invoiceHref =
    /* Only from the customer's own link: see lib/track-key.ts. */
    result.charge && trackKeyValid(result.reference, k)
      ? `/track/${encodeURIComponent(result.reference)}/invoice?i=${encodeURIComponent(
          result.charge.invoiceId
        )}&k=${encodeURIComponent(k!)}`
      : null;

  /*
    WHO SEES THE MONEY.

    The reference is printed on every box, so it proves nothing about who is
    reading. The amount owed, the accounts, the storage charge and the counter
    photographs are shown to the owner only: somebody holding the key from the
    customer's own message, or the signed-in customer the cargo belongs to.
    Everyone else sees the journey and whether it is paid.
  */
  const viewer = await currentUser();
  const owner =
    viewer?.role === "CUSTOMER" && viewer.customerId
      ? await prisma.cargo.count({
          where: {
            reference: result.reference,
            deletedAt: null,
            OR: [{ receiverId: viewer.customerId }, { senderId: viewer.customerId }],
          },
        })
      : 0;
  const full = trackKeyValid(result.reference, k) || owner > 0;

  return <Result result={result} invoiceHref={invoiceHref} full={full} />;
}

function Result({ result, invoiceHref, full }: { result: PublicTracking; invoiceHref: string | null; full: boolean }) {
  const { journey, charge, storage } = result;
  /* Opens with the greeting already in the box. See lib/site-contact.ts. */
  const wa = whatsappLink(result.whatsapp, WHATSAPP_OPENER);
  const phase = phaseOf(journey.stage);
  const copy = PHASE_COPY[phase];
  const settled = charge?.status === "PAID";
  const latest = [...journey.steps].reverse().find((step) => step.at);
  const eta = journey.eta;

  return (
    <>
      {/* ------------------------------------------------ WHERE IT IS NOW */}
      <section aria-labelledby="ref" className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
        <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_0%,rgb(42_154_212/0.25),transparent_55%)]" />
        <Frame className="py-8 sm:py-12">
          <div className="max-w-xl">
            <TrackField dark value={result.reference} />
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-end">
            <div className="min-w-0 lg:col-span-7">
              <p className="bw-mono text-sm tracking-[0.12em] text-white/60">
                <span id="ref">{result.reference}</span>
              </p>
              <h1 className="bw-display mt-3 break-words text-[clamp(2.6rem,8vw,5.5rem)] uppercase">{copy.title}</h1>
              <p className="mt-4 max-w-xl text-lg text-white/80">{copy.line}</p>
              <p className="mt-1 max-w-xl text-white/55">{copy.sw}</p>
              {journey.headline !== copy.title ? (
                <p className="mt-5 inline-flex max-w-full items-start gap-2 rounded-[2px] bg-white/10 px-3 py-2 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 bg-bw-coral-bright" aria-hidden />
                  <span className="min-w-0 break-words">{journey.headline}</span>
                </p>
              ) : null}
              {journey.notice ? <p className="mt-3 max-w-xl text-sm text-amber-300">{journey.notice}</p> : null}
            </div>

            {/* The consignment, as it would read on a boarding pass. */}
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[3px] bg-white/10 lg:col-span-5">
              <Stat label="Cargo" value={result.description} />
              <Stat label="Counted as" value={result.countedAs} />
              <Stat label="Volume" value={result.cbm ? `${result.cbm} CBM` : "—"} mono />
              <Stat label="Container" value={result.containerReference ?? "Not yet loaded"} mono />
              <Stat
                label={phase === "SEA" || phase === "CHINA" ? "Expected in Dar" : "Latest update"}
                value={phase === "SEA" || phase === "CHINA" ? (eta ? dayMonthYear(eta) : "Once it sails") : latest?.label ?? "—"}
                sub={phase === "SEA" || phase === "CHINA" ? null : latest?.at ? formatDateTime(latest.at) : null}
              />
              <Stat label="Shipper" value={result.shipperInitials} />
            </dl>
          </div>

          <div className="mt-12 rounded-[4px] border border-white/10 bg-white/[0.03] p-5 sm:p-8">
            <RouteStage phase={phase} eta={eta} vessel={result.vessel} />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ WHAT HAPPENS NEXT */}
      <section aria-labelledby="next" className="border-b border-bw-line bg-bw-ground">
        <Frame className="py-10 lg:py-14">
          <Label className="text-bw-muted">What happens next</Label>
          <h2 id="next" className="bw-display mt-3 text-3xl uppercase text-bw-fg sm:text-4xl">
            From here to your hands
          </h2>
          <div className="mt-6">
            <WhatNext steps={journey.steps} done={phase === "DONE"} />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ THE JOURNEY */}
      <section aria-labelledby="journey" className="bg-bw-ground">
        <Frame className="py-10 lg:py-14">
          <Label className="text-bw-muted">Your cargo journey</Label>
          <h2 id="journey" className="bw-display mt-3 text-3xl uppercase text-bw-fg sm:text-4xl">
            {result.origin} → {result.destination}
          </h2>
          <p className="mt-1 text-bw-muted">
            {result.service === "FCL" ? "Full container" : "Loose cargo"}
            {result.vessel ? ` · ${result.vessel}` : ""}
          </p>
          <div className="mt-6">
            <JourneyGroups steps={journey.steps} eta={eta} etaPassed={journey.etaPassed} />
          </div>
        </Frame>
      </section>

      {/* ------------------------------------------------ PAYMENT & PICKUP */}
      <section aria-labelledby="payment" className="border-t border-bw-line bg-bw-panel">
        <Frame className="grid gap-6 py-10 lg:grid-cols-12 lg:py-14">
          <div className="space-y-6 lg:col-span-7">
            <div>
              <Label className="text-bw-muted">Payment</Label>
              <h2 id="payment" className="bw-display mt-3 text-3xl uppercase text-bw-fg sm:text-4xl">
                {!charge ? "No invoice yet" : settled ? "Paid" : charge.status === "PART_PAID" ? "Partly paid" : "Payment due"}
              </h2>
            </div>

            {!charge ? (
              <p className="text-bw-muted">
                Your invoice is raised once the cargo is checked in at our Dar es Salaam warehouse. It will appear here and in your account.
              </p>
            ) : full ? (
              <FullCharge result={result} invoiceHref={invoiceHref} wa={wa} />
            ) : (
              /* A stranger with a reference sees whether it is paid, not what
                 somebody owes or where they bank. */
              <div className="rounded-[3px] border border-bw-line bg-bw-ground p-5">
                <p className="text-bw-fg">
                  {settled
                    ? "This consignment is paid in full."
                    : "An invoice has been issued for this consignment and payment is needed before pickup."}
                </p>
                <p className="mt-2 text-sm text-bw-muted">
                  The amount, the invoice and where to pay are shown to the owner: open the link from your BlueWave message, or sign in.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Action href={`/login?callbackUrl=${encodeURIComponent(`/portal/cargo/${result.reference}`)}`} tone="ink">
                    Sign in to view invoice
                  </Action>
                </div>
              </div>
            )}

            {full && result.photos.length > 0 ? (
              <Panel title="Pictures of your cargo" icon={<Camera className="size-4" />}>
                <div className="bg-bw-panel p-4">
                  <CargoPhotos
                    reference={result.reference}
                    photos={result.photos.map((photo) => ({
                      ...photo,
                      /* The reference is what opens the file without a session —
                         see lib/file-access.ts. */
                      url: `${photo.url}?ref=${encodeURIComponent(result.reference)}`,
                    }))}
                  />
                </div>
              </Panel>
            ) : null}
          </div>

          <aside className="space-y-4 lg:col-span-5">
            {storage ? (
              <Panel title="At our Dar warehouse">
                <dl className="grid grid-cols-2 gap-px bg-bw-line">
                  <Cell label="Arrived" value={dayMonthYear(storage.arrivedAt)} />
                  {storage.collected ? (
                    <Cell label="Status" value="Collected" />
                  ) : storage.chargeableDays > 0 ? (
                    <Cell label="Days over the free period" value={`${storage.chargeableDays}`} tone="text-bw-coral" />
                  ) : (
                    <Cell label="Free storage left" value={`${storage.freeDaysRemaining} ${storage.freeDaysRemaining === 1 ? "day" : "days"}`} />
                  )}
                  {full && storage.charged ? (
                    <Cell
                      label="Storage so far"
                      value={storage.chargeTzs !== null ? `TSh ${grouped(storage.chargeTzs)}` : `${storage.currency} ${grouped(storage.charge)}`}
                      tone={Number(storage.charge) > 0 ? "text-bw-coral" : undefined}
                    />
                  ) : null}
                </dl>
                {!storage.collected && storage.charged ? (
                  <p className="border-t border-bw-line bg-bw-panel px-4 py-3 text-sm text-bw-muted">
                    The first {storage.freeDays} days are free. Collecting sooner costs less.
                  </p>
                ) : null}
              </Panel>
            ) : null}

            <div className={cn("rounded-[3px] p-5", phase === "READY" ? "bg-emerald-700 text-white" : "bg-bw-ink text-white")}>
              <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-white/60">Pickup</p>
              <p className="mt-2">
                {phase === "READY"
                  ? "Everything is settled. Bring your ID and this reference to our Dar es Salaam warehouse."
                  : phase === "DONE"
                    ? "Handed over. Thank you for shipping with BlueWave."
                    : charge && !settled
                      ? "We release cargo once payment is confirmed. Your pickup note follows the payment."
                      : "When your cargo is ready we will tell you, and your pickup note will be in your account."}
              </p>
              {result.officeAddress ? <p className="mt-2 text-sm text-white/65">{result.officeAddress}</p> : null}
            </div>

            {wa ? (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-[3px] border border-bw-line bg-bw-panel px-5 py-4 text-bw-fg hover:border-bw-fg"
              >
                <span className="inline-flex items-center gap-3">
                  <MessageCircle className="size-5 text-bw-coral" />
                  Ask about this cargo
                </span>
                <span className="bw-mono text-xs text-bw-muted">{result.whatsappLabel}</span>
              </a>
            ) : null}
            {!full ? (
              <p className="text-sm text-bw-muted">
                Shipping regularly?{" "}
                <Link href="/login" className="font-medium text-bw-fg underline-offset-4 hover:underline">
                  Sign in
                </Link>{" "}
                to see every consignment, invoice and pickup note in one place.
              </p>
            ) : null}
          </aside>
        </Frame>
      </section>
    </>
  );
}

/** The bill as its owner sees it: shillings first, the lines, where to pay. */
function FullCharge({ result, invoiceHref, wa }: { result: PublicTracking; invoiceHref: string | null; wa: string | null }) {
  const charge = result.charge!;
  const settled = charge.status === "PAID";
  return (
    <div className="overflow-hidden rounded-[3px] border border-bw-line bg-bw-panel">
      <div className="border-b border-bw-line p-6">
        <p className="bw-mono text-[0.68rem] uppercase tracking-[0.16em] text-bw-muted">{settled ? "Settled in full" : "Amount due"}</p>
        {(settled ? charge.totalTzs : charge.outstandingTzs) !== null ? (
          <>
            <p className="bw-mono mt-2 text-[clamp(2rem,5vw,3rem)] font-semibold leading-none text-bw-fg">
              <span className="mr-2 text-xl text-bw-muted">TSh</span>
              {grouped((settled ? charge.totalTzs : charge.outstandingTzs)!)}
            </p>
            <p className="bw-mono mt-2 text-sm text-bw-muted">
              {charge.currency} {grouped(settled ? charge.total : charge.outstanding)} on the invoice
            </p>
          </>
        ) : (
          <p className="bw-mono mt-2 text-[clamp(2rem,5vw,3rem)] font-semibold leading-none text-bw-fg">
            {charge.currency} {grouped(settled ? charge.total : charge.outstanding)}
          </p>
        )}
        {charge.status === "PART_PAID" ? (
          <p className="bw-mono mt-2 text-xs text-bw-muted">
            {charge.currency} {grouped(charge.paid)} received of {charge.currency} {grouped(charge.total)}.
          </p>
        ) : null}
      </div>

      {invoiceHref ? (
        <a
          href={invoiceHref}
          download
          rel="nofollow"
          className="group flex items-center gap-4 border-b border-bw-line bg-bw-ground px-6 py-4"
        >
          <FileText className="size-6 shrink-0 text-bw-harbour" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-bw-fg">Pakua invoice hapa</span>
            <span className="block text-sm text-bw-muted">Download your invoice · PDF</span>
          </span>
          <Download className="size-5 shrink-0 text-bw-coral transition-transform group-hover:translate-y-0.5" />
        </a>
      ) : null}

      {charge.lines.length > 0 ? (
        <dl className="space-y-2 px-6 py-5 text-sm">
          {charge.lines.map((line) => (
            <div key={line.label} className="flex justify-between gap-4">
              <dt className="min-w-0 text-bw-muted">
                {line.label}
                {line.note ? <span className="bw-mono block text-[11px]">{line.note}</span> : null}
              </dt>
              <dd className="bw-mono shrink-0 text-bw-fg">
                {charge.currency} {grouped(line.amount)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 border-t border-bw-line pt-2 font-semibold text-bw-fg">
            <dt>Jumla</dt>
            <dd className="bw-mono">
              {charge.currency} {grouped(charge.total)}
            </dd>
          </div>
          {charge.rate ? (
            /* The invoice's own pinned rate. Never today's. */
            <div className="flex justify-between gap-4 text-xs text-bw-muted">
              <dt>Rate iliyotumika</dt>
              <dd className="bw-mono">USD 1 = TZS {grouped(String(Math.round(Number(charge.rate))))}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {!settled && result.accounts.length > 0 ? (
        <div className="border-t border-bw-line px-6 py-6">
          <p className="font-bw-display text-xl font-semibold uppercase text-bw-fg">Njia za malipo</p>
          <ul className="mt-4 grid gap-px overflow-hidden rounded-[2px] bg-bw-line sm:grid-cols-2">
            {result.accounts.map((account) => (
              <li key={`${account.bankName}-${account.accountNumber}`} className="bg-bw-panel p-4">
                <p className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">
                  {account.bankName}
                  {account.kind === "MOBILE_MONEY" ? " — Lipa number" : ` — ${account.currency}`}
                </p>
                <p className="bw-mono mt-1 text-lg font-semibold text-bw-fg">{account.accountNumber}</p>
                <p className="text-sm text-bw-muted">{account.accountName}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-bw-muted">
            Tafadhali tumia <span className="bw-mono font-semibold text-bw-fg">{result.reference}</span> kama kumbukumbu ya malipo. Baada ya kulipa, tuma uthibitisho kwa{" "}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className="font-semibold text-bw-coral hover:underline">
                WhatsApp {result.whatsappLabel}
              </a>
            ) : (
              "WhatsApp"
            )}
            .
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub, mono = false }: { label: string; value: string; sub?: string | null; mono?: boolean }) {
  return (
    <div className="min-w-0 bg-bw-night/70 p-4">
      <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-white/50">{label}</dt>
      <dd className={cn("mt-1 break-words text-white", mono ? "bw-mono" : "font-medium")}>{value}</dd>
      {sub ? <dd className="bw-mono mt-0.5 text-[0.72rem] text-white/50">{sub}</dd> : null}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[3px] border border-bw-line">
      <h3 className="flex items-center gap-2 border-b border-bw-line bg-bw-panel px-4 py-3 font-bw-display text-lg font-semibold uppercase tracking-[0.04em] text-bw-fg">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0 bg-bw-panel p-4">
      <dt className="bw-mono text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">{label}</dt>
      <dd className={cn("mt-1 font-semibold text-bw-fg", tone)}>{value}</dd>
    </div>
  );
}

/* Nothing found, or nothing askable. The field stays where they typed. */
function Notice({
  title,
  reference,
  icon,
  children,
}: {
  title: string;
  reference?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
      <Frame className="py-16 sm:py-24">
        <div className="max-w-xl">
          <TrackField dark value={reference} />
        </div>
        <div className="mt-12 max-w-2xl">
          {icon}
          <h1 className="bw-display mt-4 break-words text-[clamp(2.4rem,6vw,4.4rem)] uppercase">{title}</h1>
          <div className="mt-4 text-lg text-white/70">{children}</div>
          <p className="mt-10 text-sm text-white/50">
            <Link href="/track" className="underline-offset-4 hover:text-white hover:underline">
              Back to tracking
            </Link>
          </p>
        </div>
      </Frame>
    </section>
  );
}
