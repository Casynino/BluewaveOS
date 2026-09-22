import { NextResponse } from "next/server";

import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { renderPickupNotePdf } from "@/lib/pickup-note-pdf";
import { loadPickupNotePdf } from "@/lib/pickup-note-pdf-data";
import { qrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a long box list can outrun a
   short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The pickup note as a downloadable file.
 *
 * A route handler rather than a button that calls `window.print()`: the note is
 * for the person coming to the counter, and a print dialog on a phone produces
 * nothing to attach to a WhatsApp message.
 *
 * A WITHDRAWN note is refused. The note is the authority to collect, and the
 * whole point of a downloadable one is that it leaves the building — a file
 * that says "withdrawn" in small type is still a file somebody can wave at a
 * counter. A used note does download: it is the record of a handover that
 * happened, and the office has to be able to file it.
 *
 * The code is drawn only while the note is live. A spent code cannot release
 * anything — the counter re-runs the release check on every scan — but there is
 * no reason to put one in a file that travels.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("finance.view");
  const { id } = await params;

  const loaded = await loadPickupNotePdf(decodeURIComponent(id));
  if (!loaded) {
    return NextResponse.json({ error: t("en", "Pickup note not found.") }, { status: 404 });
  }

  if (loaded.status === "CANCELLED") {
    return NextResponse.json(
      { error: t("en", "This note was withdrawn and cannot be downloaded. Issue a new one.") },
      { status: 409 }
    );
  }

  const qr =
    loaded.status === "ACTIVE" ? await qrDataUrl(loaded.qrPayload, 520).catch(() => null) : null;
  const pdf = renderPickupNotePdf({ ...loaded.input, logo: await invoiceLogo(), qr });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // attachment, not inline: the point is a file on the phone that can be
      // forwarded, not another tab.
      "Content-Disposition": `attachment; filename="${loaded.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
