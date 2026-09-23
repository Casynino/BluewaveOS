"use client";

import Link from "next/link";
import { ArrowRight, PackageCheck, TriangleAlert } from "lucide-react";

import { DataTable, type Column, type TableFilter } from "@/components/app/data-table";
import { useT } from "@/components/app/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PickupQueueRow = {
  /** The consignment. The handover screen opens on it, and release keys on it. */
  id: string;
  reference: string;
  description: string;

  noteNumber: string | null;
  /**
   * Money is OPTIONAL and absent for the warehouse.
   *
   * The floor needs to know Finance has cleared the cargo, not what the
   * customer paid — the rule is that a warehouse screen carries no price.
   * Optional rather than always-present means a caller that omits it cannot
   * render it by accident.
   */
  amountPaid?: number;
  currency?: string;
  issuedAtLabel: string | null;
  issuedByName: string | null;

  /**
   * The wait is computed on the server. A "time since" computed in the browser
   * recomputes at hydration and disagrees with the HTML that was sent.
   */
  waitingMs: number;
  waitingLabel: string | null;

  customerId: string;
  customerName: string;
  customerPhone: string | null;

  packagesShort: string;
  boxesCheckedIn: number;
  boxesTotal: number;

  /** Days past the free storage window, counted from the day the box landed. */
  storageDays: number;

  /** lib/release.ts's own sentence, or null when the boxes may go. */
  blockedBy: string | null;
  ready: boolean;
};

const DAY = 86_400_000;

/** Escalates with the wait: two days is normal, a week is a phone call. */
function waitTone(ms: number) {
  if (ms >= 7 * DAY) return "text-destructive";
  if (ms >= 2 * DAY) return "text-warning";
  return "text-muted-foreground";
}

/**
 * WHO MAY COLLECT TODAY.
 *
 * One row per consignment standing on the Dar floor with Finance's note
 * against it: the money question is already answered and is shown as a fact,
 * never as something the warehouse can touch. What is left is the warehouse's
 * own question — are all the boxes actually here — so every row carries the
 * same check `releaseCargo` will run at the counter. Discovering a shortage
 * here is a phone call; discovering it with the customer at the desk is a
 * claim.
 *
 * The Release button does not release. It opens the handover screen, where the
 * box is read, the person collecting is named and the photograph is taken —
 * and where `checkRelease` is asked again, because a button drawn on a list is
 * not a permission and never was.
 */
export function PickupQueueTable({ rows }: { rows: PickupQueueRow[] }) {
  const t = useT();

  /* Every row here is paid and noted, so a row that cannot go is held up by
     work on this side of the counter — which is what the badge says. */
  const state = (row: PickupQueueRow) => (row.ready ? t("Ready") : t("Waiting on us"));

  const columns: Column<PickupQueueRow>[] = [
    {
      id: "customer",
      header: t("Customer"),
      sortValue: (row) => row.customerName,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/customers/${row.customerId}`}
            className="font-medium hover:text-brand hover:underline"
          >
            {row.customerName}
          </Link>
          <div className="tnum text-xs text-muted-foreground">
            {row.customerPhone ?? t("no phone")}
          </div>
        </div>
      ),
    },
    {
      id: "cargo",
      header: t("Cargo"),
      sortValue: (row) => row.reference,
      cell: (row) => (
        <div className="min-w-0">
          <Link
            href={`/app/cargo/${row.id}`}
            className="tnum text-xs font-medium hover:text-brand hover:underline"
          >
            {row.reference}
          </Link>
          <div className="truncate text-xs text-muted-foreground">{row.description}</div>
        </div>
      ),
    },
    {
      id: "boxes",
      header: t("Boxes"),
      sortValue: (row) => row.boxesCheckedIn - row.boxesTotal,
      cell: (row) => (
        <div>
          <p className="tnum text-sm">{row.packagesShort}</p>
          <p
            className={cn(
              "tnum text-xs",
              row.boxesTotal === 0 || row.boxesCheckedIn < row.boxesTotal
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {row.boxesTotal === 0
              ? t("no labels on file")
              : `${row.boxesCheckedIn} ${t("of")} ${row.boxesTotal} ${t("checked in")}`}
          </p>
        </div>
      ),
    },
    {
      id: "note",
      header: t("Pickup note"),
      sortValue: (row) => row.noteNumber ?? "",
      cell: (row) => (
        <div>
          <p className="tnum text-xs font-medium">{row.noteNumber ?? "—"}</p>
          <p className="tnum text-xs text-muted-foreground">
            {row.amountPaid !== undefined && row.currency
              ? `${t("paid")} ${formatMoney(row.amountPaid, row.currency)}`
              : row.noteNumber
                ? t("payment confirmed")
                : t("no note yet")}
          </p>
        </div>
      ),
    },
    {
      id: "issued",
      header: t("Issued"),
      hideBelow: "xl",
      className: "text-xs text-muted-foreground",
      sortValue: (row) => row.waitingMs,
      cell: (row) => row.issuedAtLabel ?? "—",
    },
    {
      id: "waiting",
      header: t("Waiting"),
      align: "right",
      sortValue: (row) => row.waitingMs,
      cell: (row) => (
        <div>
          <p className={cn("tnum text-sm font-medium", waitTone(row.waitingMs))}>
            {row.waitingLabel ?? "—"}
          </p>
          {row.storageDays > 0 ? (
            <p className="tnum text-xs text-warning">
              {row.storageDays} {t("d of storage")}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "state",
      header: t("State"),
      sortValue: (row) => (row.ready ? 0 : 1),
      cell: (row) =>
        row.ready ? (
          <Badge tone="good">{t("Ready")}</Badge>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Badge tone="warn">{state(row)}</Badge>
            {row.blockedBy ? (
              <span className="text-xs text-muted-foreground">{t(row.blockedBy)}</span>
            ) : null}
          </div>
        ),
    },
    {
      id: "action",
      header: "",
      align: "right",
      cell: (row) => (
        <Button asChild size="sm" variant={row.ready ? "default" : "outline"} className="rounded-lg">
          <Link href={`/app/scan/${row.id}`}>
            {t("Release")}
            <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      ),
    },
  ];

  const filters: TableFilter<PickupQueueRow>[] = [
    {
      id: "state",
      label: t("State"),
      options: [
        { value: "ready", label: t("Ready to release") },
        { value: "waiting", label: t("Waiting on us") },
      ],
      match: (row, value) => (value === "ready" ? row.ready : !row.ready),
    },
    {
      id: "waiting",
      label: t("Waiting"),
      options: [
        { value: "today", label: t("Issued today") },
        { value: "2", label: t("Over 2 days") },
        { value: "7", label: t("Over a week") },
      ],
      match: (row, value) => {
        if (value === "today") return row.waitingMs < DAY;
        return row.waitingMs >= Number(value) * DAY;
      },
    },
    {
      id: "storage",
      label: t("Storage"),
      options: [
        { value: "charging", label: t("Past the free days") },
        { value: "free", label: t("Still free") },
      ],
      match: (row, value) => (value === "charging" ? row.storageDays > 0 : row.storageDays === 0),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      filters={filters}
      initialSort={{ id: "waiting", dir: "desc" }}
      columnsKey="pickup-list"
      searchValue={(row) =>
        [
          row.customerName,
          row.customerPhone ?? "",
          row.reference,
          row.noteNumber ?? "",
          row.description,
        ].join(" ")
      }
      searchPlaceholder={t("Customer, phone, tracking or pickup note")}
      emptyTitle={t("Nothing matches")}
      emptyDescription={t("No cargo in the pickup list matches those filters.")}
      renderCard={(row) => (
        <div className="rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{row.customerName}</p>
              <p className="tnum text-xs text-muted-foreground">
                {row.reference}
                {row.noteNumber ? ` · ${row.noteNumber}` : ""}
              </p>
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {row.packagesShort}
                {row.boxesTotal > 0
                  ? ` · ${row.boxesCheckedIn} ${t("of")} ${row.boxesTotal} ${t("checked in")}`
                  : ""}
              </p>
            </div>
            <Badge tone={row.ready ? "good" : "warn"}>{state(row)}</Badge>
          </div>

          {row.ready ? null : (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {row.blockedBy ? t(row.blockedBy) : t("Not cleared for collection.")}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className={cn("tnum text-xs", waitTone(row.waitingMs))}>
              {row.waitingLabel ? `${t("waiting")} ${row.waitingLabel}` : t("on the floor")}
            </span>
            <Button
              asChild
              size="sm"
              variant={row.ready ? "default" : "outline"}
              className="rounded-lg"
            >
              <Link href={`/app/scan/${row.id}`}>
                <PackageCheck className="mr-1.5 size-3.5" />
                {t("Release")}
              </Link>
            </Button>
          </div>
        </div>
      )}
    />
  );
}
