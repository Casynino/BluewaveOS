import { NextResponse } from "next/server";

import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { renderPickupNotePdf } from "@/lib/pickup-note-pdf";
import { loadPickupNotePdf } from "@/lib/pickup-note-pdf-data";
import { prisma } from "@/lib/prisma";
import { qrDataUrl } from "@/lib/qr";
import { requireCustomer } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The customer's own pickup note as a file — the same document Finance holds.
 *
 * Ownership is asked of the database before anything is rendered: the id in the
 * address only ever finds a note that is already this customer's, and the
 * customer it is scoped by comes from the session, never from the URL.
 *
 * A withdrawn note is refused for the same reason it is refused to Finance: it
 * is no longer authority to collect anything.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireCustomer();
  const { id } = await params;

  const owned = await prisma.pickupNote.findFirst({
    where: { id, customerId: user.customerId },
    select: { id: true },
  });
  if (!owned) {
    return NextResponse.json({ error: t("en", "Pickup note not found.") }, { status: 404 });
  }

  const loaded = await loadPickupNotePdf(owned.id);
  if (!loaded) {
    return NextResponse.json({ error: t("en", "Pickup note not found.") }, { status: 404 });
  }

  if (loaded.status === "CANCELLED") {
    return NextResponse.json(
      { error: t("en", "This note was withdrawn. Ask us for a new one.") },
      { status: 409 }
    );
  }

  const qr =
    loaded.status === "ACTIVE" ? await qrDataUrl(loaded.qrPayload, 520).catch(() => null) : null;
  const pdf = renderPickupNotePdf({ ...loaded.input, logo: await invoiceLogo(), qr });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${loaded.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
