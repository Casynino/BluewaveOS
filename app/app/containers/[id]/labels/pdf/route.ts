import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { stickersFor } from "@/lib/box-labels";
import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { renderLabelsPdf } from "@/lib/label-pdf";
import { prisma } from "@/lib/prisma";
import { companySettings } from "@/lib/pricing";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

/* jsPDF and Prisma need Node, never the edge; a full container is hundreds of
   labels and can outrun a short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Every box label in one container, as a file.
 *
 * The same gate as the page it sits beside: every desk may look a box up, and
 * only a desk that handles the boxes may produce what goes on them. Foshan
 * prints them; Dar reprints the one that was torn or soaked.
 *
 * Downloading is counted the same way printing is. The browser's print dialog
 * is invisible to us, and so is what somebody does with a file — but asking for
 * the labels is the signal we have, and it is the same signal either way.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) {
    return NextResponse.json({ error: t("en", "You do not have permission to do that.") }, { status: 403 });
  }

  const { id } = await params;
  const container = await prisma.container.findFirst({
    where: { id: decodeURIComponent(id), deletedAt: null },
    select: { id: true, reference: true, cargoLines: { select: { cargoId: true } } },
  });
  if (!container) {
    return NextResponse.json({ error: t("en", "Container not found.") }, { status: 404 });
  }

  const stickers = await stickersFor(container.cargoLines.map((l) => l.cargoId));
  if (stickers.length === 0) {
    return NextResponse.json(
      { error: t("en", "There are no boxes in this container to label yet.") },
      { status: 409 }
    );
  }

  const [company, logo] = await Promise.all([companySettings(), invoiceLogo()]);

  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Container",
    entityId: container.id,
    summary: `Downloaded ${stickers.length} box label(s) for container ${container.reference}`,
  });

  const pdf = renderLabelsPdf({
    company: company?.name ?? "BlueWave Cargo",
    tagline: company?.tagline ?? "From sourcing to delivery",
    logo,
    stickers,
  });

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${container.reference} labels.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
