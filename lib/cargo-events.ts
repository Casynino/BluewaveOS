import "server-only";

import { Prisma } from "@prisma/client";

import { recordAudit } from "@/lib/audit";
import { setCargoStatus } from "@/lib/cargo";
import { portalLinks, messageLinks } from "@/lib/cargo-links";
import {
  buildCargoNotice,
  noticePortal,
  noticeWhatsApp,
  type CargoEvent,
  type CargoNotice,
  type NoticeFacts,
} from "@/lib/cargo-notices";
import { COMPANY } from "@/lib/constants";
import { balanceOf } from "@/lib/invoice-balance";
import type { TxClient } from "@/lib/prisma";
import { RELEASE_INCLUDE, checkRelease } from "@/lib/release";
import type { SessionUser } from "@/lib/session";
import { storageState } from "@/lib/storage-clock";
import { BLUEWAVE_STAGE_LABEL, bluewaveStageOf } from "@/lib/tracking-stage";

/**
 * THE BLUEWAVE JOURNEY, AS EVENTS.
 *
 *   received in China → stored in China → in transit → arrived in Dar →
 *   ready for pickup → collected
 *
 * Each event is written where it happens, inside that transaction, and each
 * customer hears about it once: a notification row carries the event and the
 * consignment as its key, so a departure pressed twice, a check-in retried or
 * a page refreshed finds the row already there and writes nothing more.
 *
 * There is no clearance event. Arrived is the Dar floor confirming the boxes —
 * which is also when the storage clock starts — and ready is the release check
 * saying yes for the first time, whatever completed it: checking in, paying,
 * the pickup note, signing the count off.
 */

export type StorageSettings = {
  freeStorageDays: number;
  storagePerDay: { toString(): string };
  storageCurrency: string;
};

export async function storageSettings(tx: TxClient): Promise<StorageSettings> {
  const row = await tx.companySetting.findUnique({
    where: { id: "singleton" },
    select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
  });
  return row ?? { freeStorageDays: 7, storagePerDay: 0, storageCurrency: "USD" };
}

/**
 * Where customers collect: the Dar warehouse record, not a sentence in code.
 * The office in Kariakoo is a different address and lives on CompanySetting.
 */
export async function pickupAddress(tx: TxClient): Promise<string | null> {
  const dar = await tx.warehouse.findFirst({
    where: { code: "DAR" },
    select: { addressEnglish: true, addressLocal: true },
  });
  const address = dar?.addressEnglish ?? dar?.addressLocal ?? null;
  return address ? `${COMPANY.name}, ${address}` : null;
}

const NOTICE_INCLUDE = {
  sender: { select: { fullName: true } },
  receiver: { select: { fullName: true } },
  chinaReceiving: { select: { packagesCount: true, piecesCount: true, cbm: true } },
  darReceiving: {
    select: { packagesCount: true, piecesCount: true, cbm: true, receivedAt: true, discrepancy: true },
  },
  containerLines: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      container: {
        select: {
          reference: true,
          containerNumber: true,
          shipment: { select: { departureDate: true, eta: true } },
        },
      },
    },
  },
  invoices: {
    where: { status: { notIn: ["DRAFT", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      number: true,
      customerId: true,
      total: true,
      currency: true,
      fxRate: true,
      totalTzs: true,
      payments: {
        select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
      },
    },
  },
  pickupNote: { select: { id: true, noteNumber: true, status: true } },
  release: { select: { number: true, collectedByName: true, releasedAt: true } },
} satisfies Prisma.CargoInclude;

export type NoticeSubject = {
  cargo: { id: string; reference: string; senderId: string; receiverId: string };
  facts: NoticeFacts;
  invoiceId: string | null;
  invoiceCustomerId: string | null;
  pickupNoteId: string | null;
};

const grouped = (value: Prisma.Decimal, places: number) =>
  Number(value.toFixed(places)).toLocaleString("en-US", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });

/**
 * Everything the templates can say about one consignment, read once.
 *
 * `withMoney: false` leaves every figure out, for a reader who is not allowed
 * to see one. `invoiceId` picks the bill a price-confirmed message is about;
 * otherwise the one still owing leads, then the latest.
 */
export async function noticeSubject(
  tx: TxClient,
  cargoId: string,
  options: { invoiceId?: string | null; withMoney?: boolean; now?: Date } = {}
): Promise<NoticeSubject | null> {
  const cargo = await tx.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: NOTICE_INCLUDE,
  });
  if (!cargo) return null;
  const withMoney = options.withMoney ?? true;
  const now = options.now ?? new Date();

  const measured = cargo.darReceiving ?? cargo.chinaReceiving;
  const container = cargo.containerLines[0]?.container ?? null;
  const settings = await storageSettings(tx);

  const bills = cargo.invoices.map((invoice) => ({ invoice, balance: balanceOf(invoice) }));
  const bill =
    bills.find((b) => b.invoice.id === options.invoiceId) ??
    bills.find((b) => !b.balance.settled) ??
    bills.at(-1) ??
    null;
  const paid = bills.length > 0 && bills.every((b) => b.balance.settled);

  let amountTzs: string | null = null;
  let amountUsd: string | null = null;
  let fxRate: string | null = null;
  if (bill && withMoney) {
    const b = bill.balance;
    const settled = b.settled;
    const tzs = settled ? b.totalTzs : b.outstandingTzs;
    amountTzs = tzs ? grouped(tzs, 0) : null;
    if (bill.invoice.currency === "USD") amountUsd = grouped(settled ? b.total : b.outstanding, 2);
    fxRate = b.rate ? grouped(b.rate, 0) : null;
  }

  const arrivedAt =
    cargo.status === "MISSING_AT_DAR" ? null : (cargo.darArrivedAt ?? cargo.darReceiving?.receivedAt ?? null);
  const clock = arrivedAt
    ? storageState({
        arrivedAt,
        freeDays: settings.freeStorageDays,
        perDay: settings.storagePerDay,
        currency: settings.storageCurrency,
        now,
      })
    : null;
  const stage = bluewaveStageOf(cargo.status);
  const activeNote = cargo.pickupNote?.status === "ACTIVE" ? cargo.pickupNote : null;

  const facts: NoticeFacts = {
    customerName: cargo.receiver.fullName,
    reference: cargo.reference,
    description: cargo.description,
    cbm: measured?.cbm != null ? new Prisma.Decimal(measured.cbm).toFixed(3) : null,
    packages: measured?.packagesCount ?? null,
    pieces: measured?.piecesCount ?? null,
    shippingMark: cargo.shippingMark,
    receiptNo: cargo.paperReceiptNo,
    containerRef: container
      ? container.containerNumber
        ? `${container.reference} (${container.containerNumber})`
        : container.reference
      : null,
    departedAt: container?.shipment?.departureDate ?? null,
    eta: container?.shipment?.eta ?? null,
    invoiceNumber: bill?.invoice.number ?? null,
    amountTzs,
    amountUsd,
    fxRate,
    paid: withMoney ? paid : undefined,
    stageLabel: stage ? BLUEWAVE_STAGE_LABEL[stage] : null,
    arrivedAt,
    freeDays: settings.freeStorageDays,
    freeUntil: clock?.lastFreeDay ?? null,
    storagePerDay: withMoney && Number(settings.storagePerDay.toString()) > 0 ? settings.storagePerDay.toString() : null,
    storageCurrency: settings.storageCurrency,
    pickupAddress: await pickupAddress(tx),
    pickupNoteNumber: activeNote?.noteNumber ?? null,
    collectedAt: cargo.release?.releasedAt ?? null,
    collectedBy: cargo.release?.collectedByName ?? null,
    releaseNumber: cargo.release?.number ?? null,
    issue: cargo.darReceiving?.discrepancy === true || cargo.operationalHold,
  };

  return {
    cargo: { id: cargo.id, reference: cargo.reference, senderId: cargo.senderId, receiverId: cargo.receiverId },
    facts,
    invoiceId: withMoney ? (bill?.invoice.id ?? null) : null,
    invoiceCustomerId: bill?.invoice.customerId ?? null,
    pickupNoteId: activeNote?.id ?? null,
  };
}

/** The WhatsApp message for one event, addressed to one person. */
export function whatsappNotice(
  event: CargoEvent,
  subject: NoticeSubject,
  customerName: string,
  now = new Date()
): { notice: CargoNotice; text: string } {
  const notice = buildCargoNotice(
    event,
    { ...subject.facts, customerName },
    messageLinks({
      reference: subject.cargo.reference,
      invoiceId: subject.invoiceId,
      pickupNoteId: subject.pickupNoteId,
    }),
    now
  );
  return { notice, text: noticeWhatsApp(notice) };
}

/**
 * Tell the customer, once.
 *
 * The receiver and the sender both hear about their goods moving; a bill is
 * told to the customer it is addressed to. Returns how many rows were written
 * — zero when everybody has already been told.
 */
export async function announceCargoEvent(
  tx: TxClient,
  event: CargoEvent,
  cargoId: string,
  options: { invoiceId?: string | null; recipients?: "both" | "sender"; issue?: boolean } = {}
): Promise<number> {
  const subject = await noticeSubject(tx, cargoId, { invoiceId: options.invoiceId });
  if (!subject) return 0;
  const facts = { ...subject.facts, issue: options.issue ?? subject.facts.issue };

  const notice = buildCargoNotice(
    event,
    facts,
    portalLinks({
      reference: subject.cargo.reference,
      invoiceId: subject.invoiceId,
      pickupNoteId: subject.pickupNoteId,
    })
  );
  const { title, body } = noticePortal(notice);

  const recipients =
    event === "PRICE_CONFIRMED" && subject.invoiceCustomerId
      ? [subject.invoiceCustomerId]
      : options.recipients === "sender"
        ? [subject.cargo.senderId]
        : [subject.cargo.receiverId, subject.cargo.senderId];
  const billKey = options.invoiceId ?? subject.invoiceId;
  const eventKey =
    event === "PRICE_CONFIRMED" && billKey ? `${event}:${billKey}` : `${event}:${cargoId}`;

  const written = await tx.notification.createMany({
    data: [...new Set(recipients)].filter(Boolean).map((customerId) => ({
      customerId,
      kind: event,
      eventKey,
      title,
      body,
      href: notice.links[0]?.href ?? `/portal/cargo/${encodeURIComponent(subject.cargo.reference)}`,
    })),
    skipDuplicates: true,
  });
  return written.count;
}

async function auditActor(
  tx: TxClient,
  actor: Pick<SessionUser, "id"> | SessionUser | null
): Promise<SessionUser | null> {
  if (!actor) return null;
  if ("email" in actor) return actor;
  const user = await tx.user.findUnique({
    where: { id: actor.id },
    select: { id: true, name: true, email: true, role: true, department: true, warehouseId: true, customerId: true },
  });
  return user ?? null;
}

/**
 * ARRIVED IN DAR ES SALAAM.
 *
 * Called in the check-in transaction, once per consignment that moved to
 * RECEIVED_DAR. The receiving row's own time is the arrival and the first day
 * of storage. If the money and the paperwork are already settled, the ready
 * message follows it — two facts, two messages, each said once.
 */
export async function announceDarArrival(
  tx: TxClient,
  cargo: { id: string },
  options: { discrepancy?: boolean; actorId?: string | null }
) {
  /* Goods whose container was never marked arrived arrive with this check-in;
     goods already dated by their container keep that day. */
  const receiving = await tx.darReceiving.findUnique({ where: { cargoId: cargo.id }, select: { receivedAt: true } });
  await tx.cargo.updateMany({
    where: { id: cargo.id, darArrivedAt: null },
    data: { darArrivedAt: receiving?.receivedAt ?? new Date() },
  });
  await announceCargoEvent(tx, "CARGO_ARRIVED_DAR", cargo.id, { issue: options.discrepancy });
  if (!options.discrepancy) {
    await announceIfReady(tx, cargo.id, options.actorId ? { id: options.actorId } : null);
  }
}

/**
 * READY FOR PICKUP, SAID ONCE.
 *
 * Arrived in Dar is not ready: the release check decides, and it wants the
 * boxes on the Dar floor and signed off, a bill issued and paid (or a note on
 * credit), Finance's pickup note, and nothing missing, held or open. The first
 * time it says yes the consignment moves to READY_FOR_RELEASE and the customer
 * is told. Anything that might have completed readiness calls this;
 * readyNotifiedAt is what stops the second call from telling them twice.
 */
export async function announceIfReady(
  tx: TxClient,
  cargoId: string,
  actor: Pick<SessionUser, "id"> | SessionUser | null
): Promise<boolean> {
  const cargo = await tx.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: RELEASE_INCLUDE,
  });
  if (!cargo || cargo.readyNotifiedAt) return false;
  if (!checkRelease(cargo).ok) return false;

  const claimed = await tx.cargo.updateMany({
    where: { id: cargoId, readyNotifiedAt: null },
    data: { readyNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return false;

  const moved = await setCargoStatus(
    tx,
    cargoId,
    "READY_FOR_RELEASE",
    actor,
    "Arrived in Dar, paid and released for pickup"
  );
  await recordAudit(
    {
      actor: await auditActor(tx, actor),
      action: "cargo.readyForPickup",
      entity: "Cargo",
      entityId: cargoId,
      summary: `${cargo.reference} ready for pickup — the customer told`,
      metadata: {
        oldValue: cargo.status,
        newValue: "READY_FOR_RELEASE",
        moved,
        pickupNote: cargo.pickupNote?.noteNumber ?? null,
      },
    },
    tx
  );
  await announceCargoEvent(tx, "CARGO_READY_FOR_PICKUP", cargoId);
  return true;
}
