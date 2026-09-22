import "server-only";

import { pickupAddress } from "@/lib/cargo-events";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { PickupNotePdfInput, PickupNoteTone } from "@/lib/pickup-note-pdf";
import { prisma } from "@/lib/prisma";
import { qrPayload } from "@/lib/qr";

/**
 * What the pickup note PDF prints, read from the same rows the on-screen note
 * reads.
 *
 * Kept apart from the routes so the file Finance downloads and the file the
 * customer downloads from the portal come out of one set of queries — the two
 * of them are the same document, and the counter has to be able to check either
 * against the other.
 *
 * The code is not made here. The routes hand it in, because a note that can no
 * longer be scanned must not carry a scannable code out of the building.
 */
export async function loadPickupNotePdf(id: string) {
  const [note, company] = await Promise.all([
    prisma.pickupNote.findUnique({
      where: { id },
      include: {
        customer: true,
        issuedBy: { select: { name: true } },
        cargo: {
          include: {
            darReceiving: true,
            sender: { select: { fullName: true } },
            boxes: {
              where: { voidedAt: null },
              orderBy: { sequence: "asc" },
              include: { package: { select: { reference: true, description: true } } },
            },
            containerLines: {
              take: 1,
              orderBy: { createdAt: "desc" },
              include: { container: { select: { reference: true } } },
            },
          },
        },
      },
    }),
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
  ]);
  if (!note) return null;

  /* Where the goods are handed over: the Dar warehouse record, which is not the
     office on the letterhead. */
  const pickupAt = await pickupAddress(prisma);

  const container = note.cargo.containerLines[0]?.container ?? null;
  const boxes = note.cargo.boxes;
  const packages = boxes.length || note.cargo.darReceiving?.packagesCount || 0;

  const stamp: { label: string; swahili: string; tone: PickupNoteTone } =
    note.status === "ACTIVE"
      ? note.onCredit
        ? { label: "Released on credit", swahili: "Imetolewa kwa mkopo", tone: "amber" }
        : { label: "Paid in full", swahili: "Imelipwa yote", tone: "green" }
      : note.status === "USED"
        ? { label: "Collected", swahili: "Imechukuliwa", tone: "grey" }
        : { label: "Withdrawn", swahili: "Imesitishwa", tone: "red" };

  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);

  const input: PickupNotePdfInput = {
    company: {
      name: company?.name ?? "BlueWave Cargo",
      addressLines,
      contact: contact || null,
      email: company?.email ?? null,
      tagline: company?.tagline ?? "From sourcing to delivery",
    },
    reference: note.noteNumber,
    issuedOn: formatDateTime(note.issuedAt),
    stamp,
    collector: {
      name: note.customer.fullName,
      code: note.customer.code,
      phone: note.customer.phone,
      sentBy:
        note.cargo.sender.fullName !== note.customer.fullName ? note.cargo.sender.fullName : null,
    },
    details: [
      ["Tracking no.", note.cargo.reference],
      ["Container", container?.reference ?? "—"],
      ["Boxes to collect", packages ? String(packages) : "—"],
      [note.onCredit ? "Paid so far" : "Settled", formatMoney(note.amountPaid, note.currency)],
      ["In shillings", note.amountTzs ? formatMoney(note.amountTzs, "TZS") : "—"],
      ["Goods", note.cargo.description],
    ],
    collectFrom: pickupAt,
    /* The recorded exception to "nothing leaves unpaid" reads the same on the
       file as it does on the screen, because the debt is still owed. */
    credit: note.onCredit
      ? [
          "Released on credit.",
          note.creditReason ?? "",
          note.creditDueAt ? `Balance due by ${formatDateTime(note.creditDueAt)}.` : "",
          "The customer still owes the balance.",
        ]
          .filter(Boolean)
          .join(" ")
      : null,
    boxes: boxes.map((box) => ({
      sequence: `${box.sequence}/${boxes.length}`,
      description: box.package.description ?? box.package.reference,
      collected: box.collectedAt !== null,
    })),
    notes: [
      {
        heading: "This note releases the cargo above",
        body: "Our warehouse checks every box against it and asks for identification. It is valid once only and is marked used the moment the goods are handed over.",
      },
      {
        heading: "Hati hii ni idhini ya kuchukua mzigo",
        body: "Ghala letu litakagua kila mzigo na kuomba kitambulisho chenye picha. Inatumika mara moja tu, na itawekwa alama ya kutumika mara mzigo utakapokabidhiwa.",
      },
    ],
    issuedBy: note.issuedBy?.name ?? null,
  };

  return {
    status: note.status,
    /* The very payload the screen's code carries, so a scanner reads the file
       and the screen as one note rather than two. */
    qrPayload: qrPayload(note.qrToken),
    input,
    fileName: `${note.noteNumber}.pdf`,
  };
}
