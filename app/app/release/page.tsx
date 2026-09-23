import type { Metadata } from "next";
import { Boxes, Hourglass, PackageCheck, TriangleAlert, Truck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import {
  PickupQueueTable,
  type PickupQueueRow,
} from "@/components/app/pickup-queue-table";
import { Card } from "@/components/ui/card";
import { formatDateTime, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { checkRelease, RELEASE_INCLUDE } from "@/lib/release";
import { requirePermission } from "@/lib/session";
import { storageStart, storageState } from "@/lib/storage-clock";

import { primeLocale, P, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Pickup list" };

const DAY = 86_400_000;

/** "4 h", "3 d", "3 d 5 h". Computed here, so hydration cannot disagree. */
function waitLabel(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return T("just now");
  if (hours < 24) return `${hours} ${T("h")}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0 ? `${days} ${T("d")} ${rest} ${T("h")}` : `${days} ${T("d")}`;
}

/**
 * THE PICKUP LIST — EVERYONE WHO MAY COLLECT TODAY.
 *
 * A row is here because the goods have landed in Dar and Finance has written a
 * pickup note against them: the money question is already answered, and the
 * screen shows it as a fact rather than as a figure — the warehouse never sees
 * a price. What is left is the floor's own question, are all the boxes
 * actually here, so every row carries the same check the counter will run.
 * Discovering a shortage here is a phone call; discovering it with the
 * customer at the desk is a claim.
 *
 * NOTHING IS HANDED OVER FROM THIS SCREEN. Release opens the handover, where
 * the box is read, the person collecting is named and the photograph is taken,
 * and where `checkRelease` is asked again inside the transaction. A button
 * drawn on a list is not a permission and never was.
 *
 * The list deliberately includes cargo that is paid, noted and NOT yet ready,
 * because the reason is almost always work on this side of the counter — a
 * container landed and nobody has counted it off. The customer holding that
 * note is real and is ringing somebody, and "Waiting on us" is the honest name
 * for it.
 */
export default async function ReleasePage() {
  await primeLocale();
  const actor = await requirePermission("release.execute");
  /* Finance and the office see what was settled; the floor sees only that it
     was. Same rule as every other warehouse screen. */
  const showMoney = can(actor.role, "finance.view");
  const now = new Date();

  const [settings, cargo] = await Promise.all([
    prisma.companySetting.findFirst({
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
    prisma.cargo.findMany({
      where: {
        deletedAt: null,
        /*
          LANDED CARGO, INCLUDING WHAT IS WAITING ON THIS FLOOR.

          A consignment Finance has billed, been paid for and written a note
          against can still be standing in a container nobody has counted — and
          it used to be invisible here, because the list only held what Dar had
          already booked in. ARRIVED_TANZANIA is that case: the box is in the
          country, the customer has their note, and the counting is ours.
        */
        status: { in: ["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE"] },
        /* Finance's written permission to collect is what puts a row here. */
        pickupNote: { status: "ACTIVE" },
      },
      orderBy: { updatedAt: "asc" },
      take: 200,
      include: {
        ...RELEASE_INCLUDE,
        /* issuedAt is how long the customer has been waiting on us — the one
           figure here that shames the floor rather than the customer. */
        pickupNote: {
          select: {
            status: true,
            onCredit: true,
            noteNumber: true,
            issuedAt: true,
            amountPaid: true,
            currency: true,
            issuedBy: { select: { name: true } },
          },
        },
        receiver: { select: { id: true, fullName: true, phone: true } },
        darReceiving: { select: { verified: true, discrepancy: true, packagesCount: true, receivedAt: true } },
      },
    }),
  ]);

  /* How many of each consignment's boxes Dar has actually counted in. */
  const boxRows = await prisma.cargoBox.groupBy({
    by: ["cargoId"],
    where: { cargoId: { in: cargo.map((c) => c.id) }, voidedAt: null },
    _count: { _all: true, darReceivedAt: true },
  });
  const boxesOf = new Map(
    boxRows.map((r) => [r.cargoId, { checkedIn: r._count.darReceivedAt, total: r._count._all }])
  );

  const rows: PickupQueueRow[] = cargo.map((item) => {
    const check = checkRelease(item);
    const boxes = boxesOf.get(item.id) ?? { checkedIn: 0, total: 0 };
    const packages = boxes.total || item.darReceiving?.packagesCount || 0;
    const issuedAt = item.pickupNote?.issuedAt ?? null;
    const waitingMs = issuedAt ? Math.max(0, now.getTime() - issuedAt.getTime()) : 0;

    /* Days, not money: how long the goods have been sitting past the free
       period. The rate that turns days into shillings is Finance's, and stays
       on Finance's screens. */
    const start = storageStart(item.darReceiving?.receivedAt, item.darArrivedAt);
    const storageDays = start
      ? storageState({
          arrivedAt: start,
          freeDays: settings?.freeStorageDays ?? 0,
          perDay: settings?.storagePerDay ?? null,
          currency: settings?.storageCurrency ?? "USD",
          now,
        }).chargeableDays
      : 0;

    return {
      id: item.id,
      reference: item.reference,
      description: P(item.description, item.descriptionZh),
      noteNumber: item.pickupNote?.noteNumber ?? null,
      ...(showMoney && item.pickupNote
        ? {
            amountPaid: toNumber(item.pickupNote.amountPaid) ?? 0,
            currency: item.pickupNote.currency,
          }
        : {}),
      issuedAtLabel: issuedAt ? formatDateTime(issuedAt) : null,
      issuedByName: item.pickupNote?.issuedBy?.name ?? null,
      waitingMs,
      waitingLabel: issuedAt ? waitLabel(waitingMs) : null,
      customerId: item.receiver.id,
      customerName: item.receiver.fullName,
      customerPhone: item.receiver.phone,
      packagesShort: `${packages} ${packages === 1 ? T("pkg") : T("pkgs")}`,
      boxesCheckedIn: boxes.checkedIn,
      boxesTotal: boxes.total,
      storageDays,
      blockedBy: check.blockedBy,
      ready: check.ok,
    };
  });

  const ready = rows.filter((row) => row.ready).length;
  const held = rows.length - ready;
  const boxesWaiting = rows.reduce((sum, row) => sum + (row.boxesTotal || 0), 0);
  const charging = rows.filter((row) => row.storageDays > 0).length;
  const longestWait = rows.reduce((max, row) => Math.max(max, row.waitingMs), 0);
  const overAWeek = rows.filter((row) => row.waitingMs >= 7 * DAY).length;

  return (
    <div className="space-y-6">
      {/*
        THE PICKUP LIST, NOT "RELEASE".

        The word on the counter is pickup: a customer rings to ask whether their
        goods are ready to collect, and this is the list that answers. The
        screen is named after the question rather than after the operation.
      */}
      <PageHeader
        title={T("Pickup list")}
        description={T("Cargo Finance has cleared for collection. Open a row to release it — the pickup note itself is issued and cancelled by Finance.")}
      />
      <SectionTabs />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="Truck"
            title={T("Nobody is waiting to collect")}
            description={T("Cargo joins this list the moment Finance confirms payment and issues its pickup note.")}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              index={0}
              label={T("Awaiting collection")}
              numeric={rows.length}
              hint={
                longestWait > 0
                  ? `${T("Longest wait")} ${waitLabel(longestWait)}`
                  : T("Just issued")
              }
              icon={Truck}
              tone="brand"
            />
            <KpiCard
              index={1}
              label={T("Ready to release")}
              numeric={ready}
              hint={T("Every box accounted for")}
              icon={PackageCheck}
              tone="success"
              ring={{ value: ready, total: rows.length }}
            />
            <KpiCard
              index={2}
              label={T("Waiting on us")}
              numeric={held}
              hint={held > 0 ? T("Cannot be handed over yet") : T("Nothing blocked")}
              icon={TriangleAlert}
              tone={held > 0 ? "danger" : "success"}
            />
            <KpiCard
              index={3}
              label={T("Boxes on the floor")}
              numeric={boxesWaiting}
              hint={T("Held for these customers")}
              icon={Boxes}
              tone="marine"
            />
            <KpiCard
              index={4}
              label={T("Past the free days")}
              numeric={charging}
              hint={
                overAWeek > 0
                  ? `${overAWeek} ${T("waiting over a week")}`
                  : T("Everyone still inside free storage")
              }
              icon={Hourglass}
              tone={charging > 0 ? "warning" : "success"}
            />
          </div>

          <PickupQueueTable rows={rows} />
        </>
      )}
    </div>
  );
}
