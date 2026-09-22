import "server-only";

import { distinctMark } from "@/lib/customer-name";
import type { DeliveryNotePdfInput } from "@/lib/delivery-note-pdf";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { qrPayload } from "@/lib/qr";

/**
 * The shape the note froze when it was issued.
 *
 * Read back as it was written; the live cargo row is deliberately not consulted
 * for any of it.
 */
type Snapshot = {
  cargoReference: string;
  shippingMark: string | null;
  sender: { name: string; phone: string; code: string };
  receiver: { name: string; phone: string };
  supplier: string | null;
  supplierRef: string | null;
  description: string;
  warehouse: string;
  receivedAt: string;
  packagesCount: number;
  piecesCount: number | null;
  weightKg: string | null;
  cbm: string;
  condition: string;
  lines: {
    reference: string;
    type: string;
    description: string | null;
    quantity: number;
    unit: string;
    length: string | null;
    width: string | null;
    height: string | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
  }[];
};

/**
 * What the delivery note PDF prints, read from the same snapshot the on-screen
 * note reads — and from nothing else.
 *
 * The code is not made here. The route hands it in, the same way the invoice
 * and the pickup note do.
 */
export async function loadDeliveryNotePdf(cargoId: string) {
  const note = await prisma.deliveryNote.findUnique({
    where: { cargoId },
    include: { issuedBy: { select: { name: true } } },
  });
  if (!note) return null;

  const [company, cargo] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.cargo.findUnique({
      where: { id: cargoId },
      select: {
        qrToken: true,
        containerLines: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { container: { select: { reference: true } } },
        },
      },
    }),
  ]);

  const snap = note.snapshot as unknown as Snapshot;
  const container = cargo?.containerLines[0]?.container ?? null;
  const mark = distinctMark(snap.sender.name, snap.shippingMark) ? snap.shippingMark : null;
  const cbm = (value: string | null) => (value ? Number(value).toFixed(3) : "—");
  const kg = (value: string | null) => (value ? `${Number(value).toFixed(2)} kg` : "—");

  const addressLines = (company?.chinaAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);
  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");

  const input: DeliveryNotePdfInput = {
    company: {
      name: company?.name ?? "BlueWave Cargo",
      addressLines,
      contact: contact || null,
      tagline: company?.tagline ?? "From sourcing to delivery",
    },
    reference: note.number,
    issuedOn: formatDateTime(note.issuedAt),
    stamp: `Received · ${snap.condition.toLowerCase().replace(/_/g, " ")}`,
    customer: {
      name: snap.sender.name,
      code: snap.sender.code,
      phone: snap.sender.phone,
      mark,
    },
    details: [
      ["Tracking no.", snap.cargoReference],
      ["Received", formatDateTime(snap.receivedAt)],
      ["At", snap.warehouse],
      ["Container", container?.reference ?? "—"],
      ["Packages", String(snap.packagesCount)],
      ["Pieces", snap.piecesCount ? String(snap.piecesCount) : "—"],
      ["Weight", kg(snap.weightKg)],
      ["Volume", `${Number(snap.cbm).toFixed(3)} CBM`],
    ],
    goods: snap.description,
    lines: snap.lines.map((line) => ({
      reference: line.reference,
      goods: line.description ?? "—",
      packedAs: line.type.charAt(0) + line.type.slice(1).toLowerCase(),
      bale: line.balerNumber,
      quantity: String(line.quantity),
      dimensions:
        line.length && line.width && line.height
          ? `${line.length} × ${line.width} × ${line.height} ${line.unit.toLowerCase()}`
          : "—",
      cbm: cbm(line.cbm),
      weight: kg(line.weightKg),
    })),
    totals: {
      quantity: String(snap.packagesCount),
      cbm: Number(snap.cbm).toFixed(3),
      /* To the same two places as the lines above it. A column that reads
         50.00, 50.00, 50 invites somebody to check the arithmetic of a total
         that was never in doubt. */
      weight: kg(snap.weightKg),
    },
    notes: [
      {
        heading: "What we received",
        body: `This note records the goods ${
          company?.name ?? "BlueWave Cargo"
        } received for you at our Foshan warehouse. The final charge is worked out from the measured volume and the rate for its category.`,
      },
      {
        heading: "Tulichopokea",
        body: "Hati hii inaonyesha mzigo tuliopokea kwa ajili yako kwenye ghala letu Foshan. Gharama ya mwisho inahesabiwa kwa ujazo (CBM) uliopimwa na bei ya aina ya bidhaa.",
      },
    ],
    receivedBy: note.issuedBy?.name ?? null,
  };

  return {
    input,
    /* The consignment's own code: staff who scan it open the record, a customer
       opens their tracking page — see app/t/[token]. */
    qrPayload: cargo ? qrPayload(cargo.qrToken) : null,
    fileName: `${note.number}.pdf`,
  };
}
