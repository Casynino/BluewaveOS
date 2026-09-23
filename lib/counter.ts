import "server-only";

import { prisma } from "@/lib/prisma";
import { checkRelease, releaseRemedies, RELEASE_INCLUDE, type ReleaseRemedy } from "@/lib/release";

/**
 * ONE SCREEN, ONE HANDOVER.
 *
 * Everything the Dar counter needs while a customer stands in front of it,
 * read in one go: who they are, what is theirs, how many boxes, which of them
 * have been scanned out, what the release check says in its own words, and the
 * state of the paper. A clerk who has to open a second screen to answer "may
 * this go" is a clerk who will eventually answer it from memory.
 *
 * WHAT IS DELIBERATELY NOT HERE IS MONEY. `checkRelease` returns an amount
 * outstanding for the desks that read bills; this shape drops it and keeps only
 * the conditions, whose sentences carry no figure. The warehouse never sees a
 * price, and the way to keep that true is to never put one in the object the
 * screen is handed.
 */
export type CounterBox = {
  id: string;
  sequence: number;
  state: "collected" | "at-dar" | "missing" | "in-container" | "in-china" | "void";
  damaged: boolean;
};

export type CounterHandover = {
  cargoId: string;
  reference: string;
  shippingMark: string | null;
  description: string;
  descriptionZh: string | null;
  status: string;
  receiver: { id: string; fullName: string; phone: string };
  sender: { fullName: string } | null;
  boxes: CounterBox[];
  /** Live boxes, and how many of them have already gone out under a scan. */
  expected: number;
  scannedOut: number;
  /** What Dar counted, for the packages field on the handover form. */
  darPackages: number | null;
  check: {
    ok: boolean;
    conditions: { label: string; passed: boolean; detail?: string }[];
    blockedBy: string | null;
  };
  note: {
    noteNumber: string;
    status: string;
    onCredit: boolean;
    issuedAt: Date;
  } | null;
  /** Set once the goods have gone; the screen then reports rather than asks. */
  released: { number: string; releasedAt: Date; collectedByName: string | null } | null;
  /** Who can make a refusal go away, with a number to ring. */
  remedies: (ReleaseRemedy & { staff: { name: string; phone: string | null }[] })[];
};

const DESK_LABEL: Record<ReleaseRemedy["desk"], string> = {
  FINANCE: "Finance",
  MANAGEMENT: "The manager",
  DAR_WAREHOUSE: "The Dar floor",
  CUSTOMER_SUPPORT: "Customer support",
};

export function deskLabel(desk: ReleaseRemedy["desk"]) {
  return DESK_LABEL[desk];
}

function boxState(box: {
  voidedAt: Date | null;
  collectedAt: Date | null;
  darReceivedAt: Date | null;
  missingAt: Date | null;
  package: { containerId: string | null };
}): CounterBox["state"] {
  if (box.voidedAt) return "void";
  if (box.collectedAt) return "collected";
  if (box.darReceivedAt) return "at-dar";
  if (box.missingAt) return "missing";
  return box.package.containerId ? "in-container" : "in-china";
}

export async function counterHandover(cargoId: string): Promise<CounterHandover | null> {
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: {
      ...RELEASE_INCLUDE,
      /* The check's own shape plus the date the paper was written. When it was
         issued is what a customer arguing "I was never told" is answered with;
         it is not part of the decision, which is why it is added here rather
         than to RELEASE_INCLUDE. */
      pickupNote: { select: { status: true, onCredit: true, noteNumber: true, issuedAt: true } },
      receiver: { select: { id: true, fullName: true, phone: true } },
      sender: { select: { id: true, fullName: true } },
      release: { select: { number: true, releasedAt: true, collectedByName: true } },
      boxes: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          voidedAt: true,
          collectedAt: true,
          darReceivedAt: true,
          missingAt: true,
          damagedAt: true,
          package: { select: { containerId: true } },
        },
      },
    },
  });
  if (!cargo) return null;

  const check = checkRelease(cargo);
  const boxes: CounterBox[] = cargo.boxes.map((box) => ({
    id: box.id,
    sequence: box.sequence,
    state: boxState(box),
    damaged: Boolean(box.damagedAt),
  }));
  const live = boxes.filter((b) => b.state !== "void");

  /* Only fetched when something is actually blocking — the counter reads a
     list of phone numbers when it needs one, not on every handover. */
  const remedies = check.ok ? [] : releaseRemedies(check);
  const desks = [...new Set(remedies.map((r) => r.desk))];
  const staff = desks.length
    ? await prisma.user.findMany({
        where: { department: { in: desks }, active: true, status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { name: true, phone: true, department: true },
      })
    : [];

  return {
    cargoId: cargo.id,
    reference: cargo.reference,
    shippingMark: cargo.shippingMark,
    description: cargo.description,
    descriptionZh: cargo.descriptionZh,
    status: cargo.status,
    receiver: cargo.receiver,
    sender: cargo.senderId === cargo.receiverId ? null : cargo.sender,
    boxes,
    expected: live.length,
    scannedOut: live.filter((b) => b.state === "collected").length,
    darPackages: cargo.darReceiving?.packagesCount ?? null,
    check: { ok: check.ok, conditions: check.conditions, blockedBy: check.blockedBy },
    note: cargo.pickupNote
      ? {
          noteNumber: cargo.pickupNote.noteNumber,
          status: cargo.pickupNote.status,
          onCredit: cargo.pickupNote.onCredit,
          issuedAt: cargo.pickupNote.issuedAt,
        }
      : null,
    released: cargo.release,
    remedies: remedies.map((r) => ({
      ...r,
      staff: staff
        .filter((s) => s.department === r.desk)
        .map((s) => ({ name: s.name, phone: s.phone })),
    })),
  };
}

/**
 * THE CUSTOMER WITH NOTHING IN THEIR HAND.
 *
 * No note, no label, a phone with a photo of a WhatsApp message. They are still
 * a customer and their boxes are still on the floor, so the counter looks them
 * up by whatever they can say: the tracking number, the shipping mark, their
 * name, their phone. The rows come back with nothing on them the counter may
 * not see — a name, a reference, how many boxes, and whether it may go.
 *
 * It is a lookup, never a release: every row leads to the same handover screen,
 * where the same computed check decides.
 */
export type CounterMatch = {
  cargoId: string;
  reference: string;
  shippingMark: string | null;
  receiver: string;
  phone: string;
  status: string;
  boxes: number;
  ready: boolean;
  blockedBy: string | null;
};

export async function counterLookup(raw: string): Promise<CounterMatch[]> {
  const query = raw.trim();
  if (query.length < 2) return [];

  const like = { contains: query, mode: "insensitive" as const };
  /* "0712 345 678" and "+255712345678" are the same person saying the same
     number; the stored form is the compact one, so the digits are what is
     matched rather than whatever punctuation they used. */
  const digits = query.replace(/[\s\-().+]/g, "");

  const rows = await prisma.cargo.findMany({
    where: {
      deletedAt: null,
      /* Handed over, cancelled and missing consignments are not hidden — a
         customer standing at the counter asking after goods that already left
         needs to be told that, by name and date, on the screen they land on. */
      OR: [
        { reference: like },
        { shippingMark: like },
        { receiver: { fullName: like } },
        { sender: { fullName: like } },
        ...(digits.length >= 6
          ? [
              { receiver: { phone: { contains: digits.slice(-9) } } },
              { sender: { phone: { contains: digits.slice(-9) } } },
            ]
          : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      ...RELEASE_INCLUDE,
      receiver: { select: { fullName: true, phone: true } },
      _count: { select: { boxes: { where: { voidedAt: null } } } },
    },
  });

  return rows.map((cargo) => {
    const check = checkRelease(cargo);
    return {
      cargoId: cargo.id,
      reference: cargo.reference,
      shippingMark: cargo.shippingMark,
      receiver: cargo.receiver.fullName,
      phone: cargo.receiver.phone,
      status: cargo.status,
      boxes: cargo._count.boxes,
      ready: check.ok,
      blockedBy: check.blockedBy,
    };
  });
}
