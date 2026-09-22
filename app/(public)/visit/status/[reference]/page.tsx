import type { Metadata } from "next";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact } from "@/components/bw/req-layout";
import { Frame, Label, PageBanner } from "@/components/bw/ui";
import { VsFacts, VsNotFound, VsProgress, VsTags, vsDay } from "@/components/bw/vs-status";
import { VISIT_FLOW, VISIT_STATUS_LABEL, VISIT_STATUS_NOTE } from "@/lib/china-content";
import { prisma } from "@/lib/prisma";

/* One visitor's trip: never cached, never indexed, and the key in the address
   is not handed to any page a link here opens. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Business visit — request status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Statuses under which the plan the desk wrote is the visitor's to read. */
const PLAN_SHOWN = new Set(["CONFIRMED", "IN_PROGRESS", "COMPLETED"]);

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * THE VISITOR'S OWN VIEW OF THEIR REQUEST.
 *
 * Opened by reference AND key, both in the where clause: the reference runs
 * in sequence and opens nothing by itself. Anything that does not match — no
 * key, a wrong key, a reference that does not exist — gets the same page, so
 * the address bar cannot be used to learn which references exist. Only what
 * the visitor asked for and where it stands is read; the desk's note, the
 * assignee and the contact details never leave the database here.
 */
export default async function VisitStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}) {
  const [{ reference: raw }, query] = await Promise.all([params, searchParams]);
  const reference = safeDecode(raw).trim().toUpperCase();
  const key = typeof query.k === "string" ? query.k.trim() : "";

  const visit =
    key && key.length <= 200 && reference.length <= 60
      ? await prisma.businessVisitRequest.findFirst({
          where: { reference, publicKey: key },
          select: {
            reference: true,
            status: true,
            travelFrom: true,
            travelTo: true,
            flexibleDates: true,
            cities: true,
            markets: true,
            factories: true,
            categories: true,
            travelers: true,
            language: true,
            wantsHotelHelp: true,
            wantsTransportHelp: true,
            plan: true,
            createdAt: true,
          },
        })
      : null;

  if (!visit) return <VsNotFound kind="visit" />;

  const company = await bwCompany();
  const cancelled = visit.status === "CANCELLED";
  const current = cancelled ? -1 : VISIT_FLOW.indexOf(visit.status);
  const showPlan = PLAN_SHOWN.has(visit.status) && visit.plan;

  const dates = visit.travelFrom
    ? `${vsDay(visit.travelFrom)}${visit.travelTo ? ` → ${vsDay(visit.travelTo)}` : ""}`
    : null;
  const help = [visit.wantsHotelHelp ? "Hotel" : null, visit.wantsTransportHelp ? "Local transport" : null].filter(
    (v): v is string => Boolean(v)
  );

  return (
    <>
      <PageBanner
        label="Business visit · Request status"
        title={<span className="bw-mono tracking-tight">{visit.reference}</span>}
        lead={VISIT_STATUS_NOTE[visit.status]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={
              cancelled
                ? "bw-mono inline-flex h-9 items-center gap-2 rounded-[2px] border border-bw-coral-bright/60 px-3 text-xs uppercase tracking-[0.16em] text-bw-coral-bright"
                : "bw-mono inline-flex h-9 items-center gap-2 rounded-[2px] bg-white/10 px-3 text-xs uppercase tracking-[0.16em] text-white"
            }
          >
            <span aria-hidden className={cancelled ? "size-2 bg-bw-coral-bright" : "size-2 bg-bw-cyan"} />
            {VISIT_STATUS_LABEL[visit.status]}
          </span>
          <span className="bw-mono text-xs text-white/55">Requested {vsDay(visit.createdAt)}</span>
        </div>
      </PageBanner>

      <section className="bg-bw-ground">
        <Frame className="grid gap-8 py-12 sm:py-16 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 space-y-8 lg:col-span-8">
            <div className="rounded-[2px] border border-bw-line bg-bw-panel p-5 sm:p-8">
              <Label className="text-bw-muted">Where your request stands</Label>
              <div className="mt-6">
                <VsProgress
                  steps={VISIT_FLOW.map((key) => ({ key, label: VISIT_STATUS_LABEL[key] }))}
                  current={current}
                  cancelled={cancelled}
                />
              </div>
              {!cancelled && (visit.status === "REQUESTED" || visit.status === "UNDER_REVIEW") ? (
                <p className="mt-6 border-l-2 border-bw-coral pl-4 text-sm text-bw-muted">
                  This is still a request. Nothing is booked until this page says{" "}
                  <span className="font-semibold text-bw-fg">Confirmed</span>, with the plan written under it.
                </p>
              ) : null}
            </div>

            {showPlan ? (
              <div className="relative isolate overflow-hidden rounded-[2px] bg-bw-night p-5 text-white sm:p-8">
                <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
                <Label className="text-white/70">The plan · as arranged by the team</Label>
                <p className="mt-5 whitespace-pre-wrap text-lg leading-relaxed text-white/90">{visit.plan}</p>
              </div>
            ) : null}

            <div>
              <Label className="text-bw-muted">What you asked for</Label>
              <div className="mt-5">
                <VsFacts
                  items={[
                    ["Preferred dates", dates ?? (visit.flexibleDates ? "Flexible" : null)],
                    ["Dates flexible", dates && visit.flexibleDates ? "Yes" : null],
                    ["Travellers", String(visit.travelers)],
                    ["Language support", visit.language],
                    ["Cities", visit.cities.length ? <VsTags items={visit.cities} /> : null],
                    ["Markets", visit.markets.length ? <VsTags items={visit.markets} /> : null],
                    ["Factories", visit.factories.length ? <VsTags items={visit.factories} /> : null],
                    ["Products", visit.categories.length ? <VsTags items={visit.categories} /> : null],
                    ["Help asked for", help.length ? `${help.join(" and ")} — the team will say what can be arranged` : null],
                  ]}
                />
              </div>
            </div>
          </div>

          <aside className="min-w-0 space-y-4 lg:col-span-4">
            <ReqBlock label="Keep this page" title="Your private link">
              <p className="text-sm text-bw-muted">
                This page opens only with the link you were given. Bookmark it, or send it to yourself on WhatsApp — the
                reference alone does not open it.
              </p>
            </ReqBlock>
            <ReqBlock label="Something changed?" title="Tell the team">
              <p className="text-sm text-bw-muted">
                New dates, more travellers, a different market: call or WhatsApp the office and give your reference,{" "}
                <span className="bw-mono text-bw-fg">{visit.reference}</span>.
              </p>
            </ReqBlock>
            <ReqContact company={company} china />
          </aside>
        </Frame>
      </section>
    </>
  );
}
