import type { Metadata } from "next";
import type { SourcingStatus } from "@prisma/client";

import { bwCompany } from "@/components/bw/data";
import { ReqBlock, ReqContact } from "@/components/bw/req-layout";
import { Frame, Label, PageBanner } from "@/components/bw/ui";
import { VsFacts, VsNotFound, VsProgress } from "@/components/bw/vs-status";
import { SOURCING_SERVICES, SOURCING_STATUS_NOTE, isSourcingService } from "@/lib/china-content";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/* One visitor's request: never cached, never indexed, and the key in the
   address is not handed to any page a link here opens. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sourcing request — status",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** The line a request travels, in the visitor's words. */
const FLOW = [
  { key: "NEW", label: "Received" },
  { key: "IN_PROGRESS", label: "Searching" },
  { key: "SUPPLIER_FOUND", label: "Supplier found" },
  { key: "COMPLETED", label: "Completed" },
];

/* Typed against the enum, so a status added to the schema stops the build
   here rather than printing WAITING_CUSTOMER at a visitor. */
const STATUS_LABEL: Record<SourcingStatus, string> = {
  NEW: "Received",
  IN_PROGRESS: "Searching",
  WAITING_CUSTOMER: "Waiting for you",
  SUPPLIER_FOUND: "Supplier found",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Statuses under which what the team found is the visitor's to read. */
const OUTCOME_SHOWN = new Set(["SUPPLIER_FOUND", "COMPLETED"]);

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * A WEBSITE SOURCING REQUEST, AS ITS SENDER SEES IT.
 *
 * Reference and key together, both in the where clause, and only rows the
 * website created. Anything else gets the same neutral page. What the team
 * found is shown once it is found; the desk's working, the assignee and the
 * contact details are never read here.
 */
export default async function SourcingStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ k?: string | string[] }>;
}) {
  const [{ reference: raw }, query] = await Promise.all([params, searchParams]);
  const reference = safeDecode(raw).trim().toUpperCase();
  const key = typeof query.k === "string" ? query.k.trim() : "";

  const request =
    key && key.length <= 200 && reference.length <= 60
      ? await prisma.sourcingRequest.findFirst({
          where: { reference, publicKey: key, channel: "WEBSITE" },
          select: {
            reference: true,
            status: true,
            service: true,
            product: true,
            category: true,
            quantity: true,
            budget: true,
            preferredCity: true,
            outcome: true,
            createdAt: true,
            _count: { select: { documents: true } },
          },
        })
      : null;

  if (!request) return <VsNotFound kind="sourcing" />;

  const company = await bwCompany();
  const cancelled = request.status === "CANCELLED";
  const waiting = request.status === "WAITING_CUSTOMER";
  const current = cancelled ? -1 : waiting ? 1 : FLOW.findIndex((s) => s.key === request.status);
  const service = isSourcingService(request.service) ? SOURCING_SERVICES[request.service].label : "Sourcing";
  const showOutcome = OUTCOME_SHOWN.has(request.status) && request.outcome;

  return (
    <>
      <PageBanner
        label={`${service} · Request status`}
        title={<span className="bw-mono tracking-tight">{request.reference}</span>}
        lead={SOURCING_STATUS_NOTE[request.status]}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={
              cancelled || waiting
                ? "bw-mono inline-flex h-9 items-center gap-2 rounded-[2px] border border-bw-coral-bright/60 px-3 text-xs uppercase tracking-[0.16em] text-bw-coral-bright"
                : "bw-mono inline-flex h-9 items-center gap-2 rounded-[2px] bg-white/10 px-3 text-xs uppercase tracking-[0.16em] text-white"
            }
          >
            <span aria-hidden className={cancelled || waiting ? "size-2 bg-bw-coral-bright" : "size-2 bg-bw-cyan"} />
            {STATUS_LABEL[request.status]}
          </span>
          <span className="bw-mono text-xs text-white/55">Sent {formatDate(request.createdAt)}</span>
        </div>
      </PageBanner>

      <section className="bg-bw-ground">
        <Frame className="grid gap-8 py-12 sm:py-16 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 space-y-8 lg:col-span-8">
            <div className="rounded-[2px] border border-bw-line bg-bw-panel p-5 sm:p-8">
              <Label className="text-bw-muted">Where your request stands</Label>
              <div className="mt-6">
                <VsProgress
                  steps={FLOW}
                  current={current}
                  currentLabel={waiting ? "Waiting for you" : undefined}
                  cancelled={cancelled}
                />
              </div>
              {waiting ? (
                <p className="mt-6 border-l-2 border-bw-coral pl-4 text-sm text-bw-muted">
                  The team needs something from you before it can go on. Check your phone and WhatsApp, or call the
                  office with your reference.
                </p>
              ) : null}
            </div>

            {showOutcome ? (
              <div className="relative isolate overflow-hidden rounded-[2px] bg-bw-night p-5 text-white sm:p-8">
                <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
                <Label className="text-white/70">What we found</Label>
                <p className="mt-5 whitespace-pre-wrap text-lg leading-relaxed text-white/90">{request.outcome}</p>
                <p className="mt-5 text-sm text-white/55">
                  Nothing is bought until you say so. Talk it through with the team before you pay a supplier.
                </p>
              </div>
            ) : null}

            <div>
              <Label className="text-bw-muted">What you asked for</Label>
              <div className="mt-5">
                <VsFacts
                  items={[
                    ["Service", service],
                    ["Product", request.product],
                    ["Category", request.category],
                    ["Quantity", request.quantity],
                    ["Target price", request.budget],
                    ["Where in China", request.preferredCity ?? "Anywhere"],
                    [
                      "Photos sent",
                      request._count.documents ? `${request._count.documents} with the request` : null,
                    ],
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
            <ReqBlock label="More to add?" title="Tell the team">
              <p className="text-sm text-bw-muted">
                More photos, a changed quantity, a supplier you found yourself: WhatsApp or call the office with your
                reference, <span className="bw-mono text-bw-fg">{request.reference}</span>.
              </p>
            </ReqBlock>
            <ReqContact company={company} china />
          </aside>
        </Frame>
      </section>
    </>
  );
}
