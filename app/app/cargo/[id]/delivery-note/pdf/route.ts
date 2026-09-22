import { NextResponse } from "next/server";

import { renderDeliveryNotePdf } from "@/lib/delivery-note-pdf";
import { loadDeliveryNotePdf } from "@/lib/delivery-note-pdf-data";
import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { qrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a consignment with many measured
   lines can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The delivery note as a downloadable file — the paper the customer keeps.
 *
 * The same gate as the page beside it. Nothing is refused: the note exists only
 * because goods were taken in, and a note that has been issued is evidence of
 * that whatever happened to the consignment afterwards.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("deliveryNote.view");
  const { id } = await params;

  const loaded = await loadDeliveryNotePdf(decodeURIComponent(id));
  if (!loaded) {
    return NextResponse.json({ error: t("en", "Delivery note not found.") }, { status: 404 });
  }

  const qr = loaded.qrPayload ? await qrDataUrl(loaded.qrPayload, 520).catch(() => null) : null;
  const pdf = renderDeliveryNotePdf({ ...loaded.input, logo: await invoiceLogo(), qr });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${loaded.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
