import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma, VisitStatus } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { Tx } from "@/components/app/tx";
import { VISIT_STATUS_TONE, visitDates } from "@/components/app/visit-desk-shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VISIT_STATUS_LABEL } from "@/lib/china-content";
import { formatDateTime, formatRelative } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Business visits" };

const PAGE_SIZE = 50;

const FILTERS: { key: string; label: string; statuses?: VisitStatus[] }[] = [
  { key: "", label: "Open", statuses: ["REQUESTED", "UNDER_REVIEW", "CONFIRMED", "IN_PROGRESS"] },
  { key: "REQUESTED", label: "Requested", statuses: ["REQUESTED"] },
  { key: "UNDER_REVIEW", label: "Under review", statuses: ["UNDER_REVIEW"] },
  { key: "CONFIRMED", label: "Confirmed", statuses: ["CONFIRMED"] },
  { key: "IN_PROGRESS", label: "In progress", statuses: ["IN_PROGRESS"] },
  { key: "COMPLETED", label: "Completed", statuses: ["COMPLETED"] },
  { key: "CANCELLED", label: "Cancelled", statuses: ["CANCELLED"] },
  { key: "all", label: "Everything" },
];

/**
 * BUSINESS VISITS, AS THEY CAME IN.
 *
 * Every row is somebody asking for help planning a trip to China. None of it
 * is booked until a member of the desk has spoken to them and confirmed it with
 * a plan; the status says which. Newest first, fifty to a page, the total
 * always printed.
 */
export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await primeLocale();
  await requirePermission("request.view");
  const params = await searchParams;

  const filter = FILTERS.find((f) => f.key && f.key === params.status) ?? FILTERS[0];
  const page = Math.max(1, Math.floor(Number(params.page)) || 1);
  const where: Prisma.BusinessVisitRequestWhereInput = filter.statuses ? { status: { in: filter.statuses } } : {};

  const [visits, total, counts] = await Promise.all([
    prisma.businessVisitRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        contactName: true,
        contactPhone: true,
        travelFrom: true,
        travelTo: true,
        flexibleDates: true,
        cities: true,
        travelers: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.businessVisitRequest.count({ where }),
    prisma.businessVisitRequest.groupBy({ by: ["status"], _count: true }),
  ]);

  const countFor = (statuses?: VisitStatus[]) =>
    counts.filter((row) => !statuses || statuses.includes(row.status)).reduce((sum, row) => sum + row._count, 0);

  const link = (next: { status?: string; page?: number }) => {
    const qs = new URLSearchParams();
    const status = "status" in next ? next.status : filter.key;
    if (status) qs.set("status", status);
    if (next.page && next.page > 1) qs.set("page", String(next.page));
    const s = qs.toString();
    return `/app/support/visits${s ? `?${s}` : ""}`;
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Business visits")}
        description={T("Visitors asking for help planning a buying trip to China. A request is not a booking until somebody here confirms it with a plan.")}
      />
      <SectionTabs />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option) => {
          const active = option.key === filter.key;
          return (
            <Link
              key={option.key || "open"}
              href={link({ status: option.key || undefined })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active ? "border-brand bg-brand text-brand-foreground" : "bg-card hover:bg-secondary"
              )}
            >
              <Tx>{option.label}</Tx>
              <span
                className={cn(
                  "tnum rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-secondary text-muted-foreground"
                )}
              >
                {countFor(option.statuses)}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {total === 0
          ? T("Nothing matches.")
          : pages > 1
            ? `${firstOnPage}–${lastOnPage} / ${total}`
            : `${total}`}
      </p>

      {visits.length === 0 ? (
        <Card>
          <EmptyState
            icon="Plane"
            title={T("No visit requests in this view.")}
            description={T("Requests sent from the website's business-visits page land here.")}
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {visits.map((visit) => (
              <li key={visit.id}>
                <Link
                  href={`/app/support/visits/${visit.id}`}
                  className="block rounded-xl border bg-card p-4 shadow-soft hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{visit.contactName}</p>
                    <Badge tone={VISIT_STATUS_TONE[visit.status]}>{T(VISIT_STATUS_LABEL[visit.status])}</Badge>
                  </div>
                  <p className="tnum mt-0.5 font-mono text-xs text-muted-foreground">
                    {visit.reference} · {visit.contactPhone}
                  </p>
                  <p className="mt-1 text-sm">{visitDates(visit, T)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {visit.cities.join(", ") || "—"} · {visit.travelers} {T(visit.travelers === 1 ? "person" : "people")}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {visit.assignedTo?.name ?? T("Unassigned")} · {formatRelative(visit.createdAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{T("Reference")}</TableHead>
                  <TableHead>{T("Visitor")}</TableHead>
                  <TableHead>{T("Travel dates")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{T("Cities")}</TableHead>
                  <TableHead className="text-right">{T("Travellers")}</TableHead>
                  <TableHead>{T("Status")}</TableHead>
                  <TableHead className="hidden xl:table-cell">{T("Handled by")}</TableHead>
                  <TableHead className="text-right">{T("Received")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.id} className="align-top">
                    <TableCell>
                      <Link
                        href={`/app/support/visits/${visit.id}`}
                        className="tnum font-mono text-sm font-medium hover:underline"
                      >
                        {visit.reference}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/app/support/visits/${visit.id}`} className="text-sm hover:underline">
                        {visit.contactName}
                      </Link>
                      <div className="tnum text-xs text-muted-foreground">{visit.contactPhone}</div>
                    </TableCell>
                    <TableCell className="text-sm">{visitDates(visit, T)}</TableCell>
                    <TableCell className="hidden max-w-[16rem] text-sm lg:table-cell">
                      {visit.cities.join(", ") || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">{visit.travelers}</TableCell>
                    <TableCell>
                      <Badge tone={VISIT_STATUS_TONE[visit.status]}>{T(VISIT_STATUS_LABEL[visit.status])}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">
                      {visit.assignedTo?.name ?? T("Unassigned")}
                    </TableCell>
                    <TableCell
                      className="text-right text-xs text-muted-foreground"
                      title={formatDateTime(visit.createdAt)}
                    >
                      {formatRelative(visit.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page - 1 })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              ← {T("Previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="tnum text-xs text-muted-foreground">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: page + 1 })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-secondary"
            >
              {T("Next")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
