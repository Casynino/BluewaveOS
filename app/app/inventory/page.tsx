import Link from "next/link";
import type { Metadata } from "next";
import type { CargoStatus } from "@prisma/client";
import {
  Boxes,
  Container as ContainerIcon,
  Download,
  Package,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionTabs } from "@/components/app/section-tabs";
import { SectionLabel } from "@/components/app/section-label";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatDate, formatWeight } from "@/lib/format";
import { NotifyRow } from "@/components/app/notify-row";
import { CARGO_EVENT_ACTION } from "@/lib/cargo-notices";
import { composeMessage, composeNotice, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { cargoTypeOptions } from "@/lib/valuation";
import { requirePermission } from "@/lib/session";

import { P, primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Warehouse floor" };

/*
  THE FLOOR IS WHAT IS STILL WAITING.

  A consignment leaves this list the moment it goes into a container: from then
  on it is the container's, and the container is where anyone asks about it.
  Keeping loaded cargo here made the floor read as fuller than the building was,
  and a clerk counting shelves against the screen could never make the two
  agree.

  It is still REACHABLE from here, because "where is BW0041" is asked of the
  floor whether or not the answer is "in a box by the door". The `loaded` filter
  is that question, and it is the only view in which Foshan is shown cargo it
  has already put into a container.
*/
const CHINA_STATUSES: CargoStatus[] = ["RECEIVED_CHINA"];

/** In a box in Foshan, not yet at sea. */
const CHINA_LOADED_STATUSES: CargoStatus[] = [
  "ASSIGNED_TO_CONTAINER",
  "CONTAINER_LOADED",
];

const DAR_STATUSES: CargoStatus[] = [
  "ARRIVED_TANZANIA",
  "RECEIVED_DAR",
  "READY_FOR_RELEASE",
];

/**
 * WHAT IS ON MY FLOOR.
 *
 * Which floor depends on who is asking. A Foshan clerk opening this used to
 * see cargo sitting in Dar es Salaam — everything of theirs was invisible,
 * because the page only ever queried the Tanzanian statuses. The desk decides
 * the question now, and each warehouse sees its own stock.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    state?: string;
    type?: string;
    from?: string;
    to?: string;
    at?: string;
  }>;
}) {
  await primeLocale();
  const user = await requirePermission("inventory.view");
  const { q, state, type, from, to, at } = await searchParams;
  const query = q?.trim() ?? "";
  const category = type?.trim() ?? "";

  /* Dar's own desk sees Dar. China, and management looking at the origin end,
     see Foshan. */
  /* Every desk may ask what is still in China (the "Cargo in China" menu
     entry passes at=china); Dar's own floor stays its default. */
  const askedChina = at === "china";
  const floorPath = askedChina ? "/app/inventory/china" : "/app/inventory";
  const inChina =
    askedChina || can(user.role, "receiving.china") || !can(user.role, "receiving.dar");

  const statuses = inChina ? CHINA_STATUSES : DAR_STATUSES;

  /* A day typed into a date box means the whole of that day. Read as a bare
     timestamp, "to 3 March" excluded everything received on 3 March. */
  const day = (value: string | undefined, endOfDay = false) => {
    if (!value?.trim()) return null;
    const parsed = new Date(`${value.trim()}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };
  const since = day(from);
  const until = day(to, true);

  /* The floor a Foshan clerk is standing on is the unassigned pile; asking
     after a consignment already in a box is a different question with its own
     view, and mixing the two made the volume on the floor read as double the
     building. */
  const loadedView = inChina && state === "loaded";

  /*
    THE OFFICE'S QUESTION IS EVERYTHING STILL IN CHINA.

    Support, Finance and management tell customers their goods have arrived in
    Foshan, so the list they open is every consignment still in China — on the
    floor, or in a container that has not sailed — with whether its customer
    has been told. Read-only: receiving and loading stay Foshan's.
  */
  const mayNotify =
    inChina && (can(user.role, "conversation.reply") || can(user.role, "payment.submit"));
  const allChina = inChina && (state === "china" || (!state && (mayNotify || askedChina)));

  const filtered: CargoStatus[] = loadedView
    ? CHINA_LOADED_STATUSES
    : allChina
      ? [...CHINA_STATUSES, ...CHINA_LOADED_STATUSES]
      : state === "waiting"
      ? [inChina ? "RECEIVED_CHINA" : "RECEIVED_DAR"]
      : statuses;

  const receivingFilter =
    since || until
      ? { receivedAt: { ...(since ? { gte: since } : {}), ...(until ? { lte: until } : {}) } }
      : null;

  const cargo = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      status: { in: filtered },
      ...(state === "hold" ? { operationalHold: true } : {}),
      /* The attention list on the dashboard links straight here: a warning that
         cannot be turned into the actual rows is a warning nobody acts on. */
      ...(state === "nophoto" ? { photos: { none: {} } } : {}),
      /* The rate band, as the floor named it on the line. One consignment can
         carry several, so a match on any line is a match. */
      ...(category
        ? { packages: { some: { deletedAt: null, cargoType: category } } }
        : {}),
      /* Two independent questions, each of which wants an OR of its own — the
         date can match either receiving row, and the search box matches any of
         six columns. Side by side as `OR` they would be one key overwriting the
         other, and the filter that lost would silently do nothing. */
      AND: [
        ...(receivingFilter
          ? [
              inChina
                ? { chinaReceiving: receivingFilter }
                : {
                    OR: [
                      { darReceiving: receivingFilter },
                      { chinaReceiving: receivingFilter },
                    ],
                  },
            ]
          : []),
        ...(query
          ? [
              {
                OR: [
                  { reference: { contains: query, mode: "insensitive" as const } },
                  { shippingMark: { contains: query, mode: "insensitive" as const } },
                  { paperReceiptNo: { contains: query } },
                  { description: { contains: query, mode: "insensitive" as const } },
                  { descriptionZh: { contains: query } },
                  {
                    sender: {
                      OR: [
                        { fullName: { contains: query, mode: "insensitive" as const } },
                        { phone: { contains: query } },
                      ],
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    orderBy: { updatedAt: "asc" },
    take: 200,
    include: {
      sender: { select: { fullName: true, phone: true } },
      chinaReceiving: {
        select: {
          cbm: true,
          packagesCount: true,
          piecesCount: true,
          weightKg: true,
          location: true,
          receivedAt: true,
        },
      },
      darReceiving: {
        select: {
          cbm: true,
          packagesCount: true,
          piecesCount: true,
          weightKg: true,
          location: true,
          receivedAt: true,
        },
      },
      packages: {
        where: { deletedAt: null },
        select: { pieces: true, cargoType: true },
      },
      /* The proof photographs, thumbnailed on the row. A clerk checking a
         consignment against a shelf should not have to open a page to see
         what the boxes looked like when they came in. */
      photos: {
        select: { id: true, url: true, caption: true },
        orderBy: { createdAt: "asc" },
        take: 3,
      },
      containerLines: {
        include: {
          container: { select: { id: true, reference: true, containerNumber: true } },
        },
      },
    },
  });

  const [waiting, loaded, held] = await Promise.all([
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: inChina ? "RECEIVED_CHINA" : "RECEIVED_DAR",
      },
    }),
    prisma.cargo.count({
      where: {
        deletedAt: null,
        status: {
          in: inChina
            ? (["ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED"] as CargoStatus[])
            : (["READY_FOR_RELEASE"] as CargoStatus[]),
        },
      },
    }),
    prisma.cargo.count({
      where: { deletedAt: null, operationalHold: true, status: { in: statuses } },
    }),
  ]);

  /* The categories the rate book actually prices, so the filter offers what the
     counter was offered rather than a free-text box nobody spells the same. */
  const categories = await cargoTypeOptions();

  /* Who has been told, per consignment and per China stage: the last
     WhatsApp logged for it, with the name of whoever sent it. */
  const told = mayNotify
    ? await prisma.customerContact.findMany({
        where: {
          cargoId: { in: cargo.map((c) => c.id) },
          kind: { in: ["CARGO_RECEIVED_CHINA", "CARGO_STORED_CHINA", "cargo.received_china", "cargo.loaded"] },
        },
        orderBy: { createdAt: "desc" },
        select: { cargoId: true, kind: true, createdAt: true, sentBy: { select: { name: true } } },
      })
    : [];
  const lastTold = (cargoId: string, kind: string) => {
    const earlier = kind === "CARGO_RECEIVED_CHINA" ? "cargo.received_china" : "cargo.loaded";
    const row = told.find((c) => c.cargoId === cargoId && (c.kind === kind || c.kind === earlier));
    return row ? { when: formatDate(row.createdAt), by: row.sentBy?.name ?? "somebody" } : null;
  };

  const floorCbm = cargo.reduce((sum, item) => {
    const cbm = inChina
      ? item.chinaReceiving?.cbm
      : (item.darReceiving?.cbm ?? item.chinaReceiving?.cbm);
    return sum + Number(cbm ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={inChina ? T("Cargo in China") : T("Dar es Salaam floor")}
        description={
          inChina
            ? loadedView
              ? T("Received in Foshan and already in a container, with the box it went into.")
              : allChina
                ? T("Everything received in Foshan that has not sailed yet — on the floor or in a container — and whether its customer has been told.")
                : T("Everything received and still waiting for a container.")
            : T("Everything landed in Dar, oldest first.")
        }
        actions={
          inChina && can(user.role, "receiving.china") ? (
            <Button asChild>
              <Link href="/app/receive/new">
                <Package />
                {T("Receive cargo")}
              </Link>
            </Button>
          ) : null
        }
      />
      <SectionTabs />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={loadedView ? T("Shown here") : T("On the floor")}
          numeric={cargo.length}
          icon={Warehouse}
          tone="brand"
          hint={loadedView ? T("Consignments in a box") : T("Consignments physically here")}
        />
        <KpiCard
          index={1}
          label={inChina ? T("Waiting for a container") : T("Waiting to be released")}
          numeric={waiting}
          icon={Boxes}
          tone={waiting > 0 ? "signal" : "success"}
          href={inChina ? `${floorPath}?state=waiting` : "/app/release"}
        />
        <KpiCard
          index={2}
          label={inChina ? T("Gone into containers") : T("Ready for pickup")}
          numeric={loaded}
          icon={ContainerIcon}
          tone="marine"
          hint={inChina ? T("Still in Foshan, in a box") : undefined}
          href={inChina ? `${floorPath}?state=loaded` : undefined}
        />
        <KpiCard
          index={3}
          label={loadedView ? T("Volume shown") : T("Volume on the floor")}
          numeric={floorCbm}
          decimals={2}
          suffix="CBM"
          icon={Package}
          tone="success"
        />
      </div>

      <form className="flex flex-wrap gap-3">
        <Input
          name="q"
          defaultValue={query}
          placeholder={T("Reference, mark, receipt no., customer or phone…")}
          className="max-w-sm"
          aria-label={T("Search the floor")}
        />
        <NativeSelect
          name="state"
          defaultValue={state ?? ""}
          className="w-56"
          aria-label={T("Filter")}
        >
          <option value="">{mayNotify ? T("Everything in China") : T("Everything here")}</option>
          <option value="waiting">
            {inChina ? "Waiting for a container" : "Not yet released"}
          </option>
          {/* The other half of the building's stock. Not mixed into the default
              view, where it would double the volume on the floor, but reachable
              — "where is BW0041" is asked of the floor either way. */}
          {inChina ? <option value="loaded">{T("In a container")}</option> : null}
          {inChina && !mayNotify ? <option value="china">{T("Everything in China")}</option> : null}
          <option value="hold">{T("On hold")}</option>
          <option value="nophoto">{T("No photograph")}</option>
        </NativeSelect>
        {categories.length > 0 ? (
          <NativeSelect
            name="type"
            defaultValue={category}
            className="w-48"
            aria-label={T("Cargo type")}
          >
            <option value="">{T("Any cargo type")}</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        {/* Received between two dates. The floor is asked this every time
            somebody reconciles a week of the paper book against the screen. */}
        <Input
          type="date"
          name="from"
          defaultValue={from ?? ""}
          min="2000-01-01"
          max="2099-12-31"
          className="w-40"
          aria-label={T("Received from")}
        />
        <Input
          type="date"
          name="to"
          defaultValue={to ?? ""}
          min="2000-01-01"
          max="2099-12-31"
          className="w-40"
          aria-label={T("Received up to")}
        />
        <Button type="submit" variant="outline">
          {T("Filter")}
        </Button>
      </form>

      <section>
        <SectionLabel count={held}>
          {inChina ? "Received cargo" : "Landed cargo"}
        </SectionLabel>
        <Card>
          {cargo.length === 0 ? (
            <EmptyState
              icon="Warehouse"
              title={query ? T("Nothing matches") : T("The floor is clear")}
              description={
                query
                  ? T("Try a receipt number, or the mark written on the box.")
                  : loadedView
                    ? T("Nothing received in Foshan is sitting in a container.")
                    : inChina
                      ? T("Nothing is waiting. Everything received has gone into a container.")
                      : T("Nothing landed is still sitting here.")
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* THE NAME LEADS. A clerk looking for a consignment on the
                      floor is looking for a person — the tracking number is how
                      they confirm it, not how they find it. */}
                  <TableHead>{T("Customer")}</TableHead>
                  <TableHead>{T("Tracking no.")}</TableHead>
                  <TableHead className="hidden lg:table-cell">{T("Goods")}</TableHead>
                  <TableHead className="text-right">{T("Pkgs")}</TableHead>
                  {/* Weight is not what this floor is sold or planned on —
                      volume is, and a kilo figure beside a cubic metre invited
                      somebody to price on the wrong one. It is still on the
                      consignment, where a claim needs it. */}
                  <TableHead className="text-right">{T("Pieces")}</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead>{T("Proof")}</TableHead>
                  {/* "Received in China" on the Foshan floor is every row
                      saying the name of the page. It is the customer's sentence,
                      not the warehouse's, and the date beside it already says
                      when. Dar keeps it: there a consignment can be landed,
                      booked in or ready for pickup, and those are different jobs. */}
                  {inChina ? null : <TableHead>{T("Status")}</TableHead>}
                  {/* Nothing in the default Foshan view is in a container —
                      that is what "on the floor" means, and a column of "Not
                      assigned" was one word repeated twenty-three times. It
                      comes back for the loaded view, where the box it went into
                      is the whole reason somebody opened the list, and Dar keeps
                      it always: there, the box it came off is how a consignment
                      is found. */}
                  {!inChina || loadedView || allChina ? <TableHead>{T("Container")}</TableHead> : null}
                  {mayNotify ? <TableHead className="hidden md:table-cell">{T("Mark · type · weight")}</TableHead> : null}
                  {/* Which warehouse it is in is the title of the page, and a
                      shelf number nobody fills in was two lines of nothing. The
                      date it came in is the fact a clerk actually wants. */}
                  <TableHead className="hidden xl:table-cell">{T("Received")}</TableHead>
                  {mayNotify ? <TableHead>{T("Customer told")}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargo.map((item) => {
                  const receiving = inChina
                    ? item.chinaReceiving
                    : (item.darReceiving ?? item.chinaReceiving);
                  const container = item.containerLines.at(-1)?.container;
                  /* Counted from the goods, never typed. The receiving row's
                     own totals win when it has them — Dar recounts, and the
                     recount is the truth for the Dar floor. */
                  const pieces =
                    receiving?.piecesCount ??
                    item.packages.reduce((sum, k) => sum + (k.pieces ?? 0), 0);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-sm font-semibold">
                        {item.sender.fullName}
                        {item.operationalHold ? (
                          <Badge tone="bad" className="ml-1.5">
                            held
                          </Badge>
                        ) : null}
                        <span className="tnum block text-xs font-normal text-muted-foreground">
                          {item.sender.phone}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/app/cargo/${item.id}`}
                          className="tnum font-medium tracking-wide hover:underline"
                        >
                          {item.reference}
                        </Link>
                        {item.paperReceiptNo ? (
                          <span className="tnum block text-xs text-muted-foreground">
                            note {item.paperReceiptNo}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden max-w-xs truncate text-sm text-muted-foreground lg:table-cell">
                        {P(item.description, item.descriptionZh)}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm">
                        {receiving?.packagesCount ?? "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm text-muted-foreground">
                        {pieces > 0 ? pieces.toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="tnum text-right text-sm font-medium">
                        {formatCbm(receiving?.cbm)}
                      </TableCell>
                      <TableCell>
                        {item.photos.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Link
                              href={`/app/cargo/${item.id}`}
                              className="flex -space-x-2"
                              aria-label={`${item.photos.length} photo(s) of ${item.reference}`}
                            >
                              {item.photos.map((photo) => (
                                /* Uploads from a warehouse phone, of unknown
                                   dimensions — the optimiser cannot help. */
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                  key={photo.id}
                                  src={photo.url}
                                  alt=""
                                  className="size-9 rounded border-2 border-background object-cover"
                                />
                              ))}
                            </Link>
                            <a
                              href={item.photos[0].url}
                              download
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Download the photo of ${item.reference}`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-4" />
                            </a>
                          </div>
                        ) : (
                          <Badge tone="warn">{T("No photo")}</Badge>
                        )}
                      </TableCell>
                      {inChina ? null : (
                        <TableCell>
                          <CargoStatusBadge status={item.status} />
                        </TableCell>
                      )}
                      {!inChina || loadedView || allChina ? (
                        <TableCell>
                          {container ? (
                            <Link
                              href={`/app/containers/${container.id}`}
                              className="tnum text-sm hover:underline"
                            >
                              {container.reference}
                            </Link>
                          ) : (
                            <Badge tone="neutral">—</Badge>
                          )}
                        </TableCell>
                      ) : null}
                      {mayNotify ? (
                        <TableCell className="hidden text-xs text-muted-foreground md:table-cell">
                          {item.shippingMark ? <span className="block font-medium text-foreground">{item.shippingMark}</span> : null}
                          {[...new Set(item.packages.map((k) => k.cargoType).filter(Boolean))].join(", ") || "—"}
                          {receiving?.weightKg ? <span className="tnum block">{formatWeight(receiving.weightKg)}</span> : null}
                        </TableCell>
                      ) : null}
                      <TableCell className="tnum hidden text-sm text-muted-foreground xl:table-cell">
                        {formatDate(receiving?.receivedAt)}
                      </TableCell>
                      {mayNotify
                        ? (() => {
                            const event =
                              item.status === "RECEIVED_CHINA" ? "CARGO_RECEIVED_CHINA" : "CARGO_STORED_CHINA";
                            const context = {
                              status: item.status,
                              customerName: item.sender.fullName,
                              reference: item.reference,
                              description: item.description,
                              shippingMark: item.shippingMark,
                              receiptNo: item.paperReceiptNo,
                              packages: receiving?.packagesCount ?? null,
                              pieces: pieces > 0 ? pieces : null,
                              cbm: receiving?.cbm != null ? Number(receiving.cbm).toFixed(3) : null,
                              containerNumber: container
                                ? container.containerNumber
                                  ? `${container.reference} (${container.containerNumber})`
                                  : container.reference
                                : null,
                            } as const;
                            const notice = composeNotice(event, context);
                            return (
                              <TableCell>
                                <NotifyRow
                                  cargoId={item.id}
                                  phone={whatsappNumber(item.sender.phone)}
                                  kind={event}
                                  action={CARGO_EVENT_ACTION[event]}
                                  body={composeMessage(event, context)}
                                  links={notice.links.map((l) => ({ label: l.label, href: l.href }))}
                                  notified={lastTold(item.id, event)}
                                />
                              </TableCell>
                            );
                          })()
                        : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
