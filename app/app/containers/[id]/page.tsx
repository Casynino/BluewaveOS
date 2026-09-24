import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Prisma } from "@prisma/client";
import {
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Container as ContainerIcon,
  Layers,
  Lock,
  Package,
  PackageX,
  Pencil,
  Scale,
  TriangleAlert,
  Users,
} from "lucide-react";

import {
  AdvancePanel,
  BoxForm,
  LoadedTable,
  LoadPanel,
  SealPanel,
  VoyageForm,
} from "@/components/app/container-controls";
import { EmptyState } from "@/components/app/empty-state";
import { StatStrip } from "@/components/app/stat-strip";
import { Field } from "@/components/app/field";
import { PackingListButton } from "@/components/app/packing-list-button";
import { KpiCard } from "@/components/app/kpi-card";
import { ContainerMoney } from "@/components/app/container-money";
import { PageHeader } from "@/components/app/page-header";
import { UndoArrivalButton } from "@/components/app/undo-arrival-button";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CONTAINER_EDIT_PERMISSIONS,
  CONTAINER_STATUS_LABELS,
  LOADABLE_CONTAINER_STATUSES,
  SHIPMENT_STATUS_LABELS,
} from "@/lib/constants";
import {
  formatCbm,
  formatDate,
  formatDateTime,
  formatWeight,
} from "@/lib/format";
import { storageSettings } from "@/lib/cargo-events";
import { prisma } from "@/lib/prisma";
import {
  countsInContainer,
  verificationOf,
  verificationSummary,
} from "@/lib/verification";
import { delayFor, expectedArrival } from "@/lib/sailing-schedule";
import { can, canAny } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { P, primeLocale, T } from "@/lib/server-t";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await prisma.container.findUnique({
    where: { id },
    select: { reference: true, containerNumber: true },
  });
  return { title: c?.reference ?? "Container" };
}

const asDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function ContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; floor?: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("container.view");
  const { id } = await params;
  const { edit, floor } = await searchParams;
  const floorQuery = floor?.trim() ?? "";

  /* The paperwork shelf turns into the voyage form and back, so the sailing has
     one home rather than a read-only copy and an editable one somewhere else. */
  const editingVoyage = edit === "voyage" && can(user.role, "shipment.edit");
  /* The box's own particulars — capacity, deadline, note — only while the
     doors are open. The server refuses a sealed one; this only stops the form
     being offered where it would be refused. */
  const editingBox = edit === "box" && can(user.role, "container.edit");

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    include: {
      shipment: true,
      packingList: true,
      cargoLines: {
        include: {
          cargo: {
            include: {
              sender: { select: { fullName: true, code: true } },
              /* WHAT THE DAR FLOOR HAS FOUND, which is a different question
                 from where the box is. The container arriving is the goods
                 arriving; verifying them is Dar's own act afterwards, and the
                 summary below reads it while they are still scanning. */
              darReceiving: {
                select: { verified: true, discrepancy: true, condition: true },
              },
              exceptions: {
                where: { status: { notIn: ["RESOLVED", "CLOSED"] } },
                select: { id: true },
              },
              /* The container's totals are added up from the goods themselves.
                 Nobody types a total anywhere, and a corrected line changes the
                 box's figures the moment it is corrected. */
              packages: {
                where: { deletedAt: null },
                select: {
                  quantity: true,
                  pieces: true,
                  weightKg: true,
                  cbm: true,
                  cargoType: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      events: { include: { actor: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!container) notFound();

  const open = LOADABLE_CONTAINER_STATUSES.includes(container.status);

  /* The money half appears once the box has left China. A container still
     taking cargo has nothing billed against it, so an overview of zeros would
     only be six empty cells above the loading bay's actual work. */
  const sailed = ["DEPARTED", "IN_TRANSIT", "ARRIVED", "CLOSED"].includes(
    container.status
  );
  const showMoney = sailed && can(user.role, "finance.view");
  /* The box is in Dar and the floor is working through it: the verification
     summary belongs on the page from the moment it lands until it is shut. */
  const landed = container.status === "ARRIVED" || container.status === "CLOSED";

  /*
    EVERYTHING RECEIVED IN FOSHAN AND NOT YET ON A BOX.

    Only offered while this container can still take cargo, oldest first,
    because the oldest consignment on the floor is the one a customer is
    already asking about.

    Capped, and the cap is searchable rather than silent. A floor holding more
    than two hundred waiting consignments showed the first two hundred and said
    nothing, so a clerk looking for one that fell off the end concluded it had
    never been received — and it sat there through the next sailing.
  */
  const FLOOR_LIMIT = 200;
  const floorWhere = {
    deletedAt: null,
    status: "RECEIVED_CHINA" as const,
    ...(floorQuery
      ? {
          OR: [
            { reference: { contains: floorQuery, mode: "insensitive" as const } },
            { shippingMark: { contains: floorQuery, mode: "insensitive" as const } },
            { paperReceiptNo: { contains: floorQuery } },
            { description: { contains: floorQuery, mode: "insensitive" as const } },
            { descriptionZh: { contains: floorQuery } },
            {
              sender: {
                fullName: { contains: floorQuery, mode: "insensitive" as const },
              },
            },
          ],
        }
      : {}),
  };

  const [waiting, floorTotal] = open
    ? await Promise.all([
        prisma.cargo.findMany({
          where: floorWhere,
          orderBy: { createdAt: "asc" },
          take: FLOOR_LIMIT,
          include: {
            sender: { select: { fullName: true } },
            packages: {
              where: { deletedAt: null },
              select: { cbm: true, quantity: true, cargoType: true },
            },
          },
        }),
        prisma.cargo.count({ where: floorWhere }),
      ])
    : [[] as never[], 0];

  /*
    NO CARD FOR A STEP THIS DESK CANNOT TAKE.

    "Move it along" rendered for everyone and, for the desk that could not take
    the next step, held a single sentence explaining that somebody else would —
    a card-sized apology sitting beside the voyage form. The step belongs to one
    end of the route; if it is not yours, the card is not there.
  */
  const nextStep =
    container.status === "SEALED"
      ? can(user.role, "container.depart")
      : container.status === "DEPARTED" || container.status === "IN_TRANSIT"
        ? can(user.role, "container.arrive")
        : container.status === "ARRIVED"
          ? can(user.role, "container.close")
          : false;

  /*
    THE NEXT MILESTONE, WHEREVER THE READER IS STANDING.

    It used to live in the manifest column, which is hidden from anyone reading
    the money instead — and once Finance carries the box through the port, that
    was one of the two desks that record the arrival. The card is built here
    and placed on whichever half of the page the reader is looking at.
  */
  /*
    CLOSING ASKS ABOUT WHAT IS LEFT ON THE BOX.

    Everything the panel needs to put the question properly: the consignments
    nobody has counted and nobody has reported, with the customer and the
    figures beside each one, and the live containers a bale could really be on
    — reference, where that box is, its route and how full it is. Fetched only
    when a landed box is in front of somebody who may close it; every other
    reader is looking at a different step.
  */
  const closing =
    container.status === "ARRIVED" && can(user.role, "container.close");
  const [openOnBox, moveTargets] = closing
    ? await Promise.all([
        prisma.cargo.findMany({
          where: {
            containerLines: { some: { containerId: container.id } },
            deletedAt: null,
            darReceiving: null,
            status: { not: "MISSING_AT_DAR" },
          },
          orderBy: { reference: "asc" },
          select: {
            id: true,
            reference: true,
            shippingMark: true,
            description: true,
            declaredPackages: true,
            sender: { select: { fullName: true } },
            chinaReceiving: { select: { packagesCount: true, cbm: true } },
            containerLines: {
              where: { containerId: container.id },
              select: { packagesCount: true, cbm: true },
            },
          },
        }),
        prisma.container.findMany({
          where: {
            deletedAt: null,
            id: { not: container.id },
            /* Boxes something can actually go on. A sealed-but-not-sailed
               LOADED box takes nothing by either route, and a closed one takes
               nothing at all. */
            status: {
              in: ["OPEN", "LOADING", "SEALED", "DEPARTED", "IN_TRANSIT", "ARRIVED"],
            },
          },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            reference: true,
            status: true,
            capacityCbm: true,
            originPort: true,
            destinationPort: true,
            cargoLines: { select: { cbm: true } },
          },
        }),
      ])
    : [[], []];

  /* Which of those this desk may actually move cargo onto. Taking a
     consignment off a landed box is `container.amendArrived`; putting it on a
     box still in China or at sea is Foshan's or the sailing desk's. An option
     nobody can act on is an option that teaches the screen lies. */
  const mayAmendArrived = can(user.role, "container.amendArrived");
  const mayLoad = can(user.role, "container.load");
  const maySail = canAny(user.role, ["container.load", "shipment.edit"]);
  const reachableTargets = moveTargets.filter((t) =>
    t.status === "ARRIVED"
      ? mayAmendArrived
      : t.status === "OPEN" || t.status === "LOADING"
        ? mayAmendArrived && mayLoad
        : mayAmendArrived && maySail
  );

  /* The company's own storage terms, for the sentence the arrival dialog puts
     in front of the press. Read once, never typed. */
  const terms = await storageSettings(prisma);

  const advance = nextStep ? (
    <Card className="border-brand/30">
      <CardContent className="pt-6">
        {/* EACH MILESTONE BELONGS TO A DESK THAT SEES THE THING HAPPEN.
            Foshan records the departure; the arrival is Dar's or Finance's,
            and Dar closes the box once everything on it is booked in. Showing
            a clerk a button their desk cannot press only teaches them the
            system is broken. */}
        <AdvancePanel
          containerId={container.id}
          status={container.status}
          canDepart={can(user.role, "container.depart")}
          canArrive={can(user.role, "container.arrive")}
          canClose={can(user.role, "container.close")}
          arrival={{
            reference: container.reference,
            waiting: container.cargoLines.length,
            terms: {
              freeDays: terms.freeStorageDays,
              perDay: terms.storagePerDay.toString(),
              currency: terms.storageCurrency,
            },
          }}
          close={
            closing
              ? {
                  reference: container.reference,
                  outstanding: openOnBox.map((c) => ({
                    id: c.id,
                    reference: c.reference,
                    customer: c.sender.fullName,
                    shippingMark: c.shippingMark,
                    goods: c.description,
                    packages:
                      c.containerLines[0]?.packagesCount ??
                      c.chinaReceiving?.packagesCount ??
                      c.declaredPackages ??
                      0,
                    cbmLabel: formatCbm(
                      c.containerLines[0]?.cbm ?? c.chinaReceiving?.cbm ?? 0
                    ),
                  })),
                  targets: reachableTargets.map((t) => {
                    const loaded = t.cargoLines.reduce(
                      (sum, l) => sum.add(l.cbm),
                      new Prisma.Decimal(0)
                    );
                    return {
                      id: t.id,
                      reference: t.reference,
                      where: T(CONTAINER_STATUS_LABELS[t.status]),
                      route:
                        t.originPort && t.destinationPort
                          ? `${t.originPort} → ${t.destinationPort}`
                          : (t.originPort ?? t.destinationPort ?? null),
                      fill: t.capacityCbm
                        ? `${formatCbm(loaded)} of ${formatCbm(t.capacityCbm)}`
                        : formatCbm(loaded),
                    };
                  }),
                  mayReportMissing: can(user.role, "receiving.dar"),
                }
              : null
          }
          sailing={(() => {
            const due = expectedArrival(
              container.shipment?.departureDate ?? null,
              container.shipment?.eta ?? null
            );
            if (!due) return null;
            /* Once it has landed the promise is history: the banner reads the
               day it arrived, and how the crossing actually went. */
            const landed = container.shipment?.actualArrival ?? null;
            const departed = container.shipment?.departureDate ?? null;
            const atSea =
              landed && departed
                ? Math.max(
                    1,
                    Math.round((landed.getTime() - departed.getTime()) / (24 * 60 * 60 * 1000))
                  )
                : null;
            return {
              departed: formatDate(departed) ?? null,
              due: formatDate(due) ?? null,
              arrived: formatDate(landed) ?? null,
              took: atSea ? `${atSea} days at sea` : null,
              lateBy: delayFor(due, landed ?? undefined)?.label ?? null,
            };
          })()}
        />
        {container.status === "CLOSED" ? (
          <p className="text-sm text-muted-foreground">
            {T("This container is closed. Everything on it has been received in Dar.")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  ) : null;

  const waitingCbm = waiting.reduce(
    (sum, w) =>
      sum.add(w.packages.reduce((n, p) => n.add(p.cbm), new Prisma.Decimal(0))),
    new Prisma.Decimal(0),
  );
  const waitingCustomers = new Set(waiting.map((w) => w.senderId)).size;

  /* At the port and not yet confirmed on the Dar floor: still in transit to
     the customer, and the check-in is what moves them on. */
  const awaitingCheckIn = await prisma.cargo.count({
    where: {
      deletedAt: null,
      status: "ARRIVED_TANZANIA",
      darReceiving: null,
      containerLines: { some: { containerId: container.id } },
    },
  });

  const arrivalUndoable =
    container.status === "ARRIVED" &&
    (await prisma.cargo.count({
      where: {
        containerLines: { some: { containerId: container.id } },
        OR: [
          { darReceiving: { isNot: null } },
          { status: { notIn: ["ARRIVED_TANZANIA", "CANCELLED"] } },
        ],
      },
    })) === 0;

  /*
    WHAT IS ACTUALLY IN THE BOX.

    A consignment reported missing at Dar keeps its row on this manifest — its
    reference, its QR, its photographs, its history, and the word Missing
    against it, because a row that disappears is a row somebody spends an
    afternoon looking for. It comes out of the ARITHMETIC, though: those goods
    are not in the container, and counting their packages, volume and weight
    into the box's totals states something untrue about a box that has already
    been emptied. Every figure below is over these lines, and the screen prints
    "· N missing" beside them so a smaller total is never a mystery.
  */
  const present = container.cargoLines.filter((l) =>
    countsInContainer({ status: l.cargo.status }),
  );
  const missingLines = container.cargoLines.length - present.length;

  const loadedCbm = present.reduce(
    (sum, l) => sum.add(l.cbm),
    new Prisma.Decimal(0),
  );
  const customers = new Set(present.map((l) => l.cargo.senderId));

  /* One word per consignment, counted in lib/verification.ts — the same helper
     the receiving dock's strip and the check-in rows read, so the box and the
     floor never print two different numbers for the same question. */
  const verification = verificationSummary(
    container.cargoLines.map((l) => ({
      status: l.cargo.status,
      darReceiving: l.cargo.darReceiving,
      openCases: l.cargo.exceptions.length,
    })),
  );

  const totals = present.reduce(
    (acc, line) => {
      const items = line.cargo.packages;
      acc.packages += items.length
        ? items.reduce((sum, k) => sum + k.quantity, 0)
        : line.packagesCount;
      acc.pieces += items.reduce((sum, k) => sum + (k.pieces ?? 0), 0);
      acc.weightKg = acc.weightKg.add(
        line.weightKg ??
          items.reduce(
            (sum, k) => sum.add(k.weightKg ?? 0),
            new Prisma.Decimal(0),
          ),
      );
      return acc;
    },
    { packages: 0, pieces: 0, weightKg: new Prisma.Decimal(0) },
  );

  /*
    THE LOADER GOES FIRST WHILE THE BOX IS EMPTY.

    An empty container opened with a large "Empty" panel at the top and the
    thing you actually came to do — pick cargo off the floor and load it —
    below the fold. The order follows the work: nothing in it yet, so the floor
    list leads; once there is something in it, what is inside leads and the
    floor list sits underneath.
  */
  const loader =
    open && can(user.role, "container.load") ? (
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <CardTitle className="text-base">{T("Waiting in Foshan")}</CardTitle>
          {/* The same summary the box carries, for the pile it draws from. */}
          {waiting.length > 0 ? (
            <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
              <span className="block text-sm font-semibold text-foreground">
                {formatCbm(waitingCbm)}
              </span>
              {floorTotal} waiting · {waitingCustomers} customer
              {waitingCustomers === 1 ? "" : "s"}
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Its own GET form, outside the loading form below it — a form
              cannot be nested in a form, and the floor has to stay searchable
              while cargo is ticked. */}
          {floorTotal > FLOOR_LIMIT || floorQuery ? (
            <form className="flex gap-2">
              <Input
                name="floor"
                defaultValue={floorQuery}
                placeholder={T("Name, reference, mark or receipt no.…")}
                aria-label={T("Search the Foshan floor")}
              />
              <Button type="submit" variant="outline" size="sm">
                {T("Find")}
              </Button>
            </form>
          ) : null}
          {floorTotal > waiting.length ? (
            <p className="text-xs text-muted-foreground">
              Showing the {waiting.length} oldest of {floorTotal} waiting. Search
              for the rest.
            </p>
          ) : null}
          <LoadPanel
            containerId={container.id}
            loadedCbm={Number(loadedCbm)}
            capacityCbm={
              container.capacityCbm ? Number(container.capacityCbm) : null
            }
            waiting={waiting.map((w) => ({
              id: w.id,
              reference: w.reference,
              customer: w.sender.fullName,
              shippingMark: w.shippingMark,
              description: P(w.description, w.descriptionZh),
              category:
                [
                  ...new Set(
                    w.packages.map((k) => k.cargoType).filter(Boolean),
                  ),
                ].join(", ") || null,
              packages: w.packages.reduce((n, k) => n + k.quantity, 0),
              cbm: w.packages
                .reduce((sum, p) => sum.add(p.cbm), new Prisma.Decimal(0))
                .toString(),
            }))}
          />
        </CardContent>
      </Card>
    ) : null;

  return (
    <div className="space-y-6">
      {/* OUR NUMBER IS THE CONTAINER'S NAME. It runs from one, it is the same
          on the list, the packing list and the whiteboard, and it exists the
          moment the box is opened. The line's own MSCU… number is allocated
          late, changes every sailing and belongs in the paperwork below. */}
      <PageHeader
        title={container.reference}
        description={
          container.containerNumber
            ? `${container.containerNumber} · ${container.originPort} → ${container.destinationPort}`
            : `${container.originPort} → ${container.destinationPort}`
        }
        back={{ href: "/app/containers", label: "Containers" }}
        actions={
          <>
            <Badge tone={container.status === "ARRIVED" ? "good" : "progress"}>
              {T(CONTAINER_STATUS_LABELS[container.status])}
            </Badge>
            {/* ONE DOOR, WHATEVER STAGE THE BOX HAS REACHED.
                Correcting a sailing and correcting what is inside used to be
                two different gestures in two different places, and for a box
                between the seal and the port the second did not exist at all —
                a consignment found inside a container already at sea could not
                be recorded until it landed. */}
            {canAny(user.role, CONTAINER_EDIT_PERMISSIONS) ? (
              <Button asChild variant="outline">
                <Link href={`/app/containers/${container.id}/edit`}>
                  <Pencil />
                  {T("Edit")}
                </Link>
              </Button>
            ) : null}
            {can(user.role, "packingList.view") ? (
              <PackingListButton
                containerId={container.id}
                existing={container.packingList}
                canIssue={
                  can(user.role, "packingList.issue") &&
                  container.cargoLines.length > 0
                }
              />
            ) : null}
            {can(user.role, "receiving.dar") && awaitingCheckIn > 0 ? (
              <Button asChild>
                <Link href={`/app/receive/dar/${container.id}`}>
                  {T("Check in at Dar")} ({awaitingCheckIn})
                </Link>
              </Button>
            ) : null}
            {can(user.role, "container.arrive") && container.status === "ARRIVED" && arrivalUndoable ? (
              <UndoArrivalButton
                containerId={container.id}
                reference={container.reference}
                waiting={container.cargoLines.length}
              />
            ) : null}
            {(can(user.role, "receiving.china") || can(user.role, "receiving.dar")) &&
            container.cargoLines.length > 0 ? (
              <Link
                href={`/app/containers/${container.id}/labels`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
              >
                {T("Box labels")}
              </Link>
            ) : null}
          </>
        }
      />

      {/*
        THE BOX, IN SIX FIGURES.

        All six are added up from the consignments actually in it — nobody
        types a total anywhere, and anything reported missing at Dar is left
        out and named in the hint rather than quietly dropped. The volume card
        carries a ring, because "4.8 CBM" means nothing on its own and "4.8 of
        67" is the only question the loading bay is actually asking.
      */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          index={0}
          label={T("Consignments")}
          numeric={present.length}
          icon={Package}
          tone="brand"
          hint={
            missingLines > 0
              ? `${missingLines} ${T("missing, not counted")}`
              : open
                ? T("Still taking cargo")
                : undefined
          }
        />
        <KpiCard
          index={1}
          label={T("Customers")}
          numeric={customers.size}
          icon={Users}
          tone="marine"
          hint={T("Sharing this box")}
        />
        <KpiCard
          index={2}
          label={T("Packages")}
          numeric={totals.packages}
          icon={Boxes}
          tone="signal"
        />
        {/* Nothing counted is not the same as none. A box whose pieces were
            never tallied says so, rather than claiming zero. */}
        <KpiCard
          index={3}
          label={T("Pieces")}
          {...(totals.pieces > 0
            ? { numeric: totals.pieces }
            : { value: "—", hint: "Not tallied" })}
          icon={Layers}
          tone="marine"
        />
        <KpiCard
          index={4}
          label={T("Weight")}
          {...(totals.weightKg.greaterThan(0)
            ? {
                numeric: Number(totals.weightKg),
                decimals: 0,
                suffix: " kg",
              }
            : { value: "—", hint: "Nothing weighed" })}
          icon={Scale}
          tone="warning"
        />
        <KpiCard
          index={5}
          label={T("Volume loaded")}
          numeric={Number(loadedCbm)}
          decimals={3}
          suffix=" CBM"
          icon={ContainerIcon}
          tone="success"
          hint={
            container.capacityCbm
              ? `of ${formatCbm(container.capacityCbm)}`
              : T("No capacity set")
          }
          ring={
            container.capacityCbm
              ? {
                  value: Number(loadedCbm),
                  total: Number(container.capacityCbm),
                }
              : undefined
          }
        />
      </div>

      {/*
        WHAT DAR HAS FOUND, WHILE THEY ARE STILL FINDING IT.

        The arrival was one press and it moved the whole box; this is the other
        half of the owner's rule — the floor's own verification, consignment by
        consignment, rendered live as they scan. "Expected" is the manifest
        including anything missing, because the missing ones are exactly what
        this box has to answer for.
      */}
      {landed ? (
        <StatStrip
          chips={[
            {
              label: "Expected",
              value: String(verification.expected),
              icon: Package,
            },
            {
              label: "Checked in",
              value: `${verification.checkedIn} / ${verification.expected}`,
              icon: ClipboardCheck,
              tone:
                verification.checkedIn === verification.expected
                  ? "success"
                  : "neutral",
            },
            {
              label: "Verified",
              value: String(verification.verified),
              icon: ClipboardCheck,
              tone: verification.verified > 0 ? "success" : "neutral",
            },
            {
              label: "Pending",
              value: String(verification.pending),
              icon: ClipboardCheck,
              tone: verification.pending > 0 ? "warning" : "success",
            },
            {
              label: "Missing",
              value: String(verification.missing),
              icon: PackageX,
              tone: verification.missing > 0 ? "danger" : "neutral",
            },
            {
              label: "Damaged",
              value: String(verification.damaged),
              icon: TriangleAlert,
              tone: verification.damaged > 0 ? "danger" : "neutral",
            },
            {
              label: "Issue",
              value: String(verification.issue),
              icon: TriangleAlert,
              tone: verification.issue > 0 ? "warning" : "neutral",
            },
          ]}
        />
      ) : null}

      {/*
        THE MONEY, ON THE SAME SCREEN AS THE BOX.

        One container, one page. The floor reads the contents and Finance reads
        the margin, and neither has to know a second address to find the other's
        half. It sits below the six figures because those describe the box, and
        a box has to be described before it can be valued.

        Renders nothing without `finance.view`: the warehouse never sees a price.
      */}
      {/*
        THE NEXT STEP, FIRST.

        Once the box is sealed the only thing left to do on this page is the
        next milestone — departure, then arrival, then closing — so it sits
        straight under the six figures, one press, for whichever desk takes
        it. It was below the manifest, and on the money view not at all.
      */}
      {!open ? advance : null}

      {showMoney ? <ContainerMoney id={container.id} user={user} /> : null}

      {/*
        A SEALED BOX IS ONE PAGE, NOT TWO COLUMNS.

        The split exists so a loader can pick from the floor on the left and
        watch it land in the box on the right. Once the seal is on nothing goes
        in or comes out — there is no floor list to show, and half the width
        spent on an empty half is half a page wasted. The manifest takes the
        whole page, and the voyage and the next milestone sit beneath it.
      */}
      {open ? (
        <div className="grid grid-cols-1 items-stretch gap-6 xl:h-[36rem] xl:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-6">{loader}</div>

          <div className="flex min-h-0 flex-col gap-6">
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                <CardTitle className="text-base">
                  {T("What is in this container")}
                </CardTitle>
                {/* The running total, where the eye already is. It was a bar
                          under the table, which meant scrolling to read the one figure
                          a loader checks every time they add a pallet. */}
                {container.cargoLines.length > 0 ? (
                  <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                    <span className="block text-sm font-semibold text-foreground">
                      {formatCbm(loadedCbm)}
                    </span>
                    {present.length} consignment
                    {present.length === 1 ? "" : "s"} ·{" "}
                    {totals.packages} pkg · {customers.size} customer
                    {customers.size === 1 ? "" : "s"}
                    {missingLines > 0 ? ` · ${missingLines} missing` : ""}
                  </span>
                ) : null}
              </CardHeader>
              {container.cargoLines.length === 0 ? (
                <EmptyState
                  icon="Boxes"
                  title={T("Empty")}
                  description={T("Load cargo from the Foshan floor to start filling it.")}
                />
              ) : (
                <CardContent className="flex min-h-0 flex-1 flex-col">
                  <LoadedTable
                    containerId={container.id}
                    canEdit={open && can(user.role, "container.load")}
                    lines={container.cargoLines.map((line) => ({
                      cargoId: line.cargoId,
                      reference: line.cargo.reference,
                      shippingMark: line.cargo.shippingMark,
                      customer: line.cargo.sender.fullName,
                      packages: line.packagesCount,
                      category:
                        [
                          ...new Set(
                            line.cargo.packages
                              .map((k) => k.cargoType)
                              .filter(Boolean),
                          ),
                        ].join(", ") || null,
                      cbm: line.cbm.toString(),
                      /* The row stays on the manifest whatever Dar found, and
                         says which it was. lib/verification.ts decides the
                         word; nothing here re-invents it. */
                      verification: verificationOf({
                        status: line.cargo.status,
                        darReceiving: line.cargo.darReceiving,
                        openCases: line.cargo.exceptions.length,
                      }),
                    }))}
                  />

                  {/* The box's own action, at the foot of the box's own card —
                            where Load sits under the floor list beside it. */}
                  {open && can(user.role, "container.seal") ? (
                    <div className="mt-3">
                      <SealPanel
                        containerId={container.id}
                        containerNumber={container.containerNumber}
                        lineCount={container.cargoLines.length}
                      />
                    </div>
                  ) : null}
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      ) : showMoney ? null : (
        <div className="space-y-6">
          <Card className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base">
                {T("What is in this container")}
              </CardTitle>
              {/* The running total, where the eye already is. It was a bar
                        under the table, which meant scrolling to read the one figure
                        a loader checks every time they add a pallet. */}
              {container.cargoLines.length > 0 ? (
                <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block text-sm font-semibold text-foreground">
                    {formatCbm(loadedCbm)}
                  </span>
                  {present.length} consignment
                  {present.length === 1 ? "" : "s"} ·{" "}
                  {totals.packages} pkg · {customers.size} customer
                  {customers.size === 1 ? "" : "s"}
                  {missingLines > 0 ? ` · ${missingLines} missing` : ""}
                </span>
              ) : null}
            </CardHeader>
            {container.cargoLines.length === 0 ? (
              <EmptyState
                icon="Boxes"
                title={T("Empty")}
                description={T("Load cargo from the Foshan floor to start filling it.")}
              />
            ) : (
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <LoadedTable
                  containerId={container.id}
                  canEdit={open && can(user.role, "container.load")}
                  lines={container.cargoLines.map((line) => ({
                    cargoId: line.cargoId,
                    reference: line.cargo.reference,
                    shippingMark: line.cargo.shippingMark,
                    customer: line.cargo.sender.fullName,
                    packages: line.packagesCount,
                    category:
                      [
                        ...new Set(
                          line.cargo.packages
                            .map((k) => k.cargoType)
                            .filter(Boolean),
                        ),
                      ].join(", ") || null,
                    cbm: line.cbm.toString(),
                    verification: verificationOf({
                      status: line.cargo.status,
                      darReceiving: line.cargo.darReceiving,
                      openCases: line.cargo.exceptions.length,
                    }),
                  }))}
                />

                {/* The box's own action, at the foot of the box's own card —
                          where Load sits under the floor list beside it. */}
                {open && can(user.role, "container.seal") ? (
                  <div className="mt-3">
                    <SealPanel
                      containerId={container.id}
                      containerNumber={container.containerNumber}
                      lineCount={container.cargoLines.length}
                    />
                  </div>
                ) : null}
              </CardContent>
            )}
          </Card>

        </div>
      )}

      {/*
        ONE PLACE FOR THE PAPERWORK, READ OR WRITTEN.

        The voyage details had their own form on the page — eight editable
        fields over a container that may have sailed a month ago — while the
        same facts sat read-only on the shelf below. Two places for one truth.
        The shelf is now the only place: it reads at a glance, and whoever books
        the space opens it to write.
      */}
      <section>
        <SectionLabel
          action={
            editingVoyage || editingBox
              ? {
                  href: `/app/containers/${container.id}`,
                  label: "Done",
                  keepScroll: true,
                }
              : /* The full page: the sailing AND what is inside, which is the
                   half this shelf could never reach. The small form below is
                   still here on `?edit=voyage` for a link somebody kept. */
                can(user.role, "shipment.edit") && container.shipment
                ? {
                    href: `/app/containers/${container.id}/edit`,
                    label: "Edit the sailing",
                  }
                : /* While the doors are open the box's own particulars are the
                     thing worth correcting; once it has sailed, only the
                     sailing is. Whichever this desk can do is offered. */
                  open && can(user.role, "container.edit")
                  ? { href: `?edit=box`, label: "Edit the container", keepScroll: true }
                  : undefined
          }
        >
          {T("The paperwork")}
        </SectionLabel>

        {/*
        THE PAPERWORK, AT THE FOOT.

        Reference numbers, the seal, the sailing: looked up when somebody is
        filling in a customs form or answering a shipping line, and never while
        loading. They sat across the top for a while, which put ten things
        nobody was looking for above the two things everybody was.
      */}
        {editingBox ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{T("Container")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("What the loading bar measures against and the day Foshan stops taking cargo for this sailing. The line's own container and seal numbers are recorded when the box is sealed.")}
              </p>
            </CardHeader>
            <CardContent>
              <BoxForm
                containerId={container.id}
                box={{
                  capacityCbm: container.capacityCbm?.toString() ?? null,
                  cargoDeadline: asDate(container.cargoDeadline),
                  notes: container.notes,
                }}
              />
            </CardContent>
          </Card>
        ) : null}

        {editingVoyage ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">{T("Voyage")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("Whoever books the space fills this in. It prints on the packing list and is what the customer is told about the sailing.")}
              </p>
            </CardHeader>
            <CardContent>
              <VoyageForm
                containerId={container.id}
                sailed={sailed}
                etaDefault={
                  /* The same sentence the full edit page prints, so the two
                     forms never disagree about when the box is due. */
                  formatDate(expectedArrival(container.shipment?.departureDate ?? null)) ?? null
                }
                shipment={
                  container.shipment
                    ? {
                        shippingLine: container.shipment.shippingLine,
                        vessel: container.shipment.vessel,
                        voyage: container.shipment.voyage,
                        billOfLading: container.shipment.billOfLading,
                        departureDate: asDate(container.shipment.departureDate),
                        eta: asDate(container.shipment.eta),
                        notes: container.shipment.notes,
                      }
                    : null
                }
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="flex flex-wrap gap-x-8 gap-y-4 py-4">
            {[
              ["Our reference", container.reference, true],
              ["Container no.", container.containerNumber ?? "—", true],
              ["Type", container.type.replace("_", " "), false],
              ["Seal", container.sealNumber ?? "—", true],
              ["Sealed", formatDateTime(container.sealedAt) ?? "—", false],
              [
                "Cargo deadline",
                formatDate(container.cargoDeadline) ?? "—",
                false,
              ],
              ...(container.shipment
                ? ([
                    ["Shipment", container.shipment.reference, true],
                    [
                      "Voyage",
                      T(SHIPMENT_STATUS_LABELS[container.shipment.status]),
                      false,
                    ],
                    [
                      /* The line's date, or the lane's thirty-five days from
                         the day it left — and it says so when that day has
                         gone by, because that is what the customer is told. */
                      "ETA",
                      (() => {
                        const due = expectedArrival(
                          container.shipment.departureDate,
                          container.shipment.eta
                        );
                        if (!due) return "—";
                        const late =
                          !container.shipment.actualArrival && due.getTime() < Date.now();
                        return `${formatDate(due)}${late ? ` · ${T("Delayed")}` : ""}`;
                      })(),
                      false,
                    ],
                    [
                      "Arrived",
                      formatDate(container.shipment.actualArrival) ?? "—",
                      false,
                    ],
                  ] as [string, string, boolean][])
                : []),
            ].map(([label, value, mono]) => (
              <div key={label as string}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {label}
                </p>
                <p className={cn("mt-0.5 text-sm", mono && "tnum font-medium")}>
                  {value}
                </p>
              </div>
            ))}
            {container.notes ? (
              <p className="w-full rounded-md bg-secondary px-3 py-2 text-sm">
                {container.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/*
        THE BOX'S LIFE, ACROSS THE FOOT OF THE PAGE.

        A vertical list of four events sat alone at the bottom of a column and
        left half the screen empty beneath it. Laid out along the route it
        reads as what it is — a journey with dates on it — and it closes the
        page instead of trailing off.

        Hidden for anybody reading the money half, whose Timeline tab is the
        same events. One page, one copy of each fact.
      */}
      <section className={showMoney ? "hidden" : undefined}>
        <SectionLabel>{T("History")}</SectionLabel>
        <Card>
          <CardContent className="py-5">
            <ol className="flex flex-wrap gap-x-10 gap-y-5">
              {[...container.events].reverse().map((event, index) => (
                <li key={event.id} className="relative min-w-[10rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        index === container.events.length - 1
                          ? "bg-brand"
                          : "bg-border",
                      )}
                    />
                    <p className="text-sm font-medium">
                      {T(CONTAINER_STATUS_LABELS[event.to])}
                    </p>
                  </div>
                  <p className="mt-1 pl-[1.125rem] text-xs text-muted-foreground">
                    {formatDateTime(event.createdAt)}
                  </p>
                  {event.actor || event.note ? (
                    <p className="pl-[1.125rem] text-xs text-muted-foreground">
                      {[event.actor?.name, event.note]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
