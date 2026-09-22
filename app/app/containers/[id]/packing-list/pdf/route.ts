import { NextResponse } from "next/server";

import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { packingListPdfInput, renderPackingListPdf } from "@/lib/packing-list-pdf";
import { sheetFor } from "@/lib/packing-list";
import { requirePermission } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a full container is a long
   document and can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The packing list as a downloadable file.
 *
 * The manifest is asked for by email — by the shipping line, by a clearing
 * agent, by customs — and a print dialog is no answer to that.
 *
 * Nothing is refused here. A list drawn before the seal is not a lesser
 * document, it is the honest answer to what is in the box right now, and it
 * says PROVISIONAL across the top and in its footing rather than being withheld
 * from the clerk who needs it. A container that no longer exists, or that has
 * never been loaded, is the only 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("packingList.view");
  const { id } = await params;

  const sheet = await sheetFor(decodeURIComponent(id));
  if (!sheet) {
    return NextResponse.json({ error: t("en", "Container not found.") }, { status: 404 });
  }

  const input = packingListPdfInput(sheet.snap, sheet.list, sheet.company);
  const pdf = renderPackingListPdf({ ...input, logo: await invoiceLogo() });

  /* The list's own number once it has one; before that the container's
     reference, because a downloads folder full of "packing-list.pdf" tells
     nobody which sailing they are holding. */
  const fileName = sheet.list
    ? `${sheet.list.number}.pdf`
    : `${sheet.snap.reference} packing list.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
