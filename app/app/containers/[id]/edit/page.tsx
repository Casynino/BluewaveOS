import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Prisma, type CargoStatus, type InvoiceStatus } from "@prisma/client";

import { VoyageForm } from "@/components/app/container-controls";
import {
  AddCargoToContainer,
  ContainerCargoEditor,
  type CargoLine,
  type ContainerStage,
} from "@/components/app/container-cargo-editor";
import { PageHeader } from "@/components/app/page-header";
import { Field } from "@/components/app/field";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CARGO_STATUS_META,
  CONTAINER_EDIT_PERMISSIONS,
  CONTAINER_STATUS_LABELS,
  LANDED_CONTAINER_STATUSES,
  LOADABLE_CONTAINER_STATUSES,
  SAILED_CONTAINER_STATUSES,
} from "@/lib/constants";
import { formatCbm, formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can, canAny } from "@/lib/rbac";
import { expectedArrival } from "@/lib/sailing-schedule";
import { requireStaff } from "@/lib/session";

import { P, primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Edit sailing" };

const asDate = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** How many of the waiting pile the picker offers before it asks for a search. */
const CANDIDATE_LIMIT = 100;

/**
 * CORRECTING A CONTAINER, WHATEVER STAGE IT HAS REACHED.
 *
 * The sailing and the cargo on one page, because they are one question. A
 * consignment physically inside a box that left Foshan three weeks ago is a
 * fact somebody has just discovered, and until this page existed there was
 * nowhere to record it: loading stops at the seal and the landed amendments
 * start at the port. The stretch in between — sealed, departed, at sea — is
 * where most of those discoveries are actually made, by the loading bay, the
 * week after the ship left.
 *
 * Three jobs, three gates, one screen. Whoever opens it sees what their own
 * desk may change and a sentence saying who does the rest; every action behind
 * it asks for its own permission again, because a control that is merely
 * unrendered is not a permission.
 */
export default async function EditContainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  const user = await requireStaff();
  if (!canAny(user.role, CONTAINER_EDIT_PERMISSIONS)) redirect("/app/no-access");

  const { id } = await params;
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    include: {
      shipment: true,
      packingList: { select: { number: true } },
      cargoLines: {
        orderBy: { createdAt: "asc" },
        include: {
          cargo: {
            include: {
              sender: { select: { fullName: true } },
              chinaReceiving: { select: { piecesCount: true } },
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
      },
    },
  });
  if (!container) notFound();

  const open = LOADABLE_CONTAINER_STATUSES.includes(container.status);
  const sailed = SAILED_CONTAINER_STATUSES.includes(container.status);
  const landed = LANDED_CONTAINER_STATUSES.includes(container.status);
  const stage: ContainerStage = open ? "open" : sailed ? "sailed" : "landed";

  /* Each stretch has its own authority, and it is the action's rule read back
     here so the page never offers a control the server would refuse. */
  const mayChangeCargo = open
    ? can(user.role, "container.load")
    : sailed
      ? canAny(user.role, ["container.load", "shipment.edit"])
      : can(user.role, "container.amendArrived");
  const mayEditVoyage = can(user.role, "shipment.edit") && Boolean(container.shipment);

  /*
    WHAT COULD GO ON THIS BOX.

    Never a new record: what goes on a manifest is a consignment that already
    exists, with its own reference and its own Foshan measurements. A box still
    in the warehouse draws from the floor; a landed one draws wider, because
    the bale in front of the Dar clerk may be listed on the wrong sailing.
    Nothing billed on an issued invoice appears in either: that bill names a
    sailing, and moving the cargo under it changes what the customer is holding.
  */
  const searchOr = query
    ? {
        OR: [
          { reference: { contains: query, mode: "insensitive" as const } },
          { shippingMark: { contains: query, mode: "insensitive" as const } },
          { paperReceiptNo: { contains: query } },
          { description: { contains: query, mode: "insensitive" as const } },
          { descriptionZh: { contains: query } },
          {
            sender: {
              fullName: { contains: query, mode: "insensitive" as const },
            },
          },
          /* The counter finds a customer by their number more often than by
             the spelling of their name. */
          { sender: { phone: { contains: query } } },
          { sender: { altPhone: { contains: query } } },
        ],
      }
    : {};

  const candidateWhere = {
    deletedAt: null,
    ...(landed
      ? {
          status: {
            in: [
              "RECEIVED_CHINA",
              "ASSIGNED_TO_CONTAINER",
              "CONTAINER_LOADED",
              "DEPARTED_CHINA",
              "IN_TRANSIT",
              "ARRIVED_TANZANIA",
              "MISSING_AT_DAR",
            ] as CargoStatus[],
          },
          containerLines: {
            none: { container: { status: { in: LANDED_CONTAINER_STATUSES } } },
          },
        }
      : {
          status: { in: ["RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER"] as CargoStatus[] },
          /* Not in any box at all. A consignment sitting on another live
             container is taken off that one first, by whoever will say why. */
          containerLines: { none: {} },
        }),
    invoices: { none: { status: { notIn: ["DRAFT", "CANCELLED"] as InvoiceStatus[] } } },
    ...searchOr,
  };

  type Waiting = {
    id: string;
    reference: string;
    shippingMark: string | null;
    description: string;
    descriptionZh: string | null;
    sender: { fullName: string; phone: string };
    chinaReceiving: { piecesCount: number | null } | null;
    packages: {
      quantity: number;
      pieces: number | null;
      cbm: Prisma.Decimal;
      weightKg: Prisma.Decimal | null;
      cargoType: string | null;
    }[];
  };
  const [candidates, candidateTotal]: [Waiting[], number] = mayChangeCargo
    ? await Promise.all([
        prisma.cargo.findMany({
          where: candidateWhere,
          orderBy: { createdAt: "asc" },
          take: CANDIDATE_LIMIT,
          select: {
            id: true,
            reference: true,
            shippingMark: true,
            description: true,
            descriptionZh: true,
            sender: { select: { fullName: true, phone: true } },
            chinaReceiving: { select: { piecesCount: true } },
            packages: {
              where: { deletedAt: null },
              select: {
                quantity: true,
                pieces: true,
                cbm: true,
                weightKg: true,
                cargoType: true,
              },
            },
          },
        }),
        prisma.cargo.count({ where: candidateWhere }),
      ])
    : [[], 0];

  const lines: CargoLine[] = container.cargoLines.map((line) => {
    const items = line.cargo.packages;
    const pieces = items.reduce((sum, k) => sum + (k.pieces ?? 0), 0);
    const weight =
      line.weightKg ??
      items.reduce((sum, k) => sum.add(k.weightKg ?? 0), new Prisma.Decimal(0));
    return {
      cargoId: line.cargoId,
      reference: line.cargo.reference,
      shippingMark: line.cargo.shippingMark,
      customer: line.cargo.sender.fullName,
      goods:
        [...new Set(items.map((k) => k.cargoType).filter(Boolean))].join(", ") ||
        P(line.cargo.description, line.cargo.descriptionZh),
      packages: items.length
        ? items.reduce((sum, k) => sum + k.quantity, 0)
        : line.packagesCount,
      pieces:
        pieces > 0 ? pieces : (line.cargo.chinaReceiving?.piecesCount ?? null),
      cbm: line.cbm.toString(),
      weightKg: weight.greaterThan(0) ? weight.toString() : null,
      status: CARGO_STATUS_META[line.cargo.status].label,
    };
  });

  /*
    WHEN THIS BOX IS DUE, AND WHETHER THAT DAY HAS GONE.

    The line's own ETA when it gave one, otherwise thirty-five days from the
    day it left — the lane's habit, and what the office tells customers. Past
    that day and still not in Dar, the desk should read "Delayed" here rather
    than learn it from a customer on the telephone.

    `blankDefault` is the date the ETA field falls back to when it is left
    empty, which is a different question from what the sailing is currently
    due: the first ignores anything typed, the second does not.
  */
  const blankDefault = expectedArrival(container.shipment?.departureDate ?? null);
  const dueBy = expectedArrival(
    container.shipment?.departureDate ?? null,
    container.shipment?.eta ?? null,
  );
  const late =
    !landed && Boolean(dueBy && dueBy.getTime() < Date.now()) && sailed;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Edit sailing"
        description="Correct the voyage and what is recorded inside this container. Every change is kept with your name and the reason you gave."
        back={{ href: `/app/containers/${container.id}`, label: container.reference }}
        actions={
          <>
            <Badge tone={container.status === "ARRIVED" ? "good" : "progress"}>
              {T(CONTAINER_STATUS_LABELS[container.status])}
            </Badge>
            <span className="tnum self-center text-sm text-muted-foreground">
              {container.reference}
            </span>
          </>
        }
      />

      <section>
        <SectionLabel>{T("The sailing")}</SectionLabel>
        <Card>
          <CardHeader className="space-y-3">
            <div>
              <CardTitle className="text-base">{T("Voyage")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {T("Whoever books the space fills this in. It prints on the packing list and is what the customer is told about the sailing.")}
              </p>
            </div>
            {/* THE TWO DATES THE WHOLE SAILING IS ARGUED OVER, ABOVE THE FORM
                THAT CHANGES THEM. Left China, due in Dar, and — once that day
                has gone by with the box still at sea — the word for it. */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-md bg-secondary px-3 py-2">
              <Field
                label="Left China"
                mono
                value={formatDate(container.shipment?.departureDate) ?? "—"}
              />
              <Field
                label="Expected in Dar"
                mono
                value={
                  dueBy ? (
                    <span className="flex flex-wrap items-center gap-2">
                      {formatDate(dueBy)}
                      {container.shipment?.eta ? null : (
                        <span className="text-xs font-normal text-muted-foreground">
                          {T("thirty-five days after it left")}
                        </span>
                      )}
                      {late ? <Badge tone="bad">{T("Delayed")}</Badge> : null}
                    </span>
                  ) : (
                    "—"
                  )
                }
              />
              {container.shipment?.actualArrival ? (
                <Field
                  label="Arrived"
                  mono
                  value={formatDate(container.shipment.actualArrival)}
                />
              ) : null}
            </div>
            {late ? (
              <p className="text-sm text-destructive">
                {T("This sailing is past the day it was due and the box is still at sea. The customers on it are being told it is delayed.")}
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {mayEditVoyage ? (
              <VoyageForm
                containerId={container.id}
                sailed={sailed || landed}
                etaDefault={blankDefault ? formatDate(blankDefault) : null}
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
            ) : (
              <p className="text-sm text-muted-foreground">
                {T("The sailing is Foshan's to correct — the desk that books the space.")}
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionLabel count={lines.length}>
          {T("The cargo on this container")}
        </SectionLabel>
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-base">
                {T("What is recorded inside")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {open
                  ? T("The doors are open: cargo goes on and comes off as the floor decides.")
                  : sailed
                    ? T("The box is shut. A consignment inside it that the manifest missed is recorded here, and the packing list is drawn again.")
                    : T("The box has landed. Correcting the manifest opens a case, so somebody goes and looks.")}
              </p>
            </div>
            <span className="tnum shrink-0 text-right text-sm font-semibold">
              {formatCbm(
                container.cargoLines.reduce(
                  (sum, l) => sum.add(l.cbm),
                  new Prisma.Decimal(0),
                ),
              )}
            </span>
          </CardHeader>
          <CardContent>
            <ContainerCargoEditor
              containerId={container.id}
              containerReference={container.reference}
              stage={stage}
              lines={lines}
              canEdit={mayChangeCargo}
              reasonRequired={!open}
            />
          </CardContent>
        </Card>
      </section>

      {mayChangeCargo ? (
        <section>
          <SectionLabel>{T("Add cargo")}</SectionLabel>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {open
                  ? T("Waiting in Foshan")
                  : landed
                    ? T("Cargo that could have come off this box")
                    : T("Still on the Foshan floor")}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {sailed
                  ? T("Everything Foshan has taken in that is on no container. A box marked as departed before somebody finished recording the load is the usual reason a consignment is sitting here and is really on the water.")
                  : T("Picked off what Foshan already took in — never retyped. Its own reference, mark and measurements come with it.")}
              </p>
            </CardHeader>
            <CardContent>
              <AddCargoToContainer
                containerId={container.id}
                stage={stage}
                total={candidateTotal}
                query={query}
                candidates={candidates.map((c) => {
                  const cbm = c.packages.reduce(
                    (sum, p) => sum.add(p.cbm),
                    new Prisma.Decimal(0),
                  );
                  const weight = c.packages.reduce(
                    (sum, p) => sum.add(p.weightKg ?? 0),
                    new Prisma.Decimal(0),
                  );
                  const pieces = c.packages.reduce(
                    (n, p) => n + (p.pieces ?? 0),
                    0,
                  );
                  return {
                    id: c.id,
                    reference: c.reference,
                    shippingMark: c.shippingMark,
                    customer: c.sender.fullName,
                    phone: c.sender.phone,
                    goods:
                      [
                        ...new Set(
                          c.packages.map((p) => p.cargoType).filter(Boolean),
                        ),
                      ].join(", ") || P(c.description, c.descriptionZh),
                    packages: c.packages.reduce((n, p) => n + p.quantity, 0),
                    pieces:
                      pieces > 0 ? pieces : (c.chinaReceiving?.piecesCount ?? null),
                    cbm: cbm.toString(),
                    weightKg: weight.greaterThan(0) ? weight.toString() : null,
                  };
                })}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      {container.packingList && !open ? (
        <p className="text-xs text-muted-foreground">
          {T("Packing list")} {container.packingList.number} —{" "}
          {T("it keeps its number and gains a version each time the cargo on this box changes, because a number already on paper at a port must not change under somebody's hand.")}
        </p>
      ) : null}
    </div>
  );
}
