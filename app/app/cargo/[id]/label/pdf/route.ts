import { NextResponse, type NextRequest } from "next/server";

import { recordAudit } from "@/lib/audit";
import { stickersFor } from "@/lib/box-labels";
import { t } from "@/lib/i18n";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { renderLabelsPdf } from "@/lib/label-pdf";
import { prisma } from "@/lib/prisma";
import { companySettings } from "@/lib/pricing";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The labels for one consignment as a file — one page per physical box.
 *
 * The same gate as the label page: only a desk that handles the boxes may
 * produce what goes on them. `?box=` takes the one that was torn or went
 * missing, without drawing the whole consignment again.
 *
 * The reference may be the id or the tracking number, because the number is
 * what somebody has in their hand.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) {
    return NextResponse.json({ error: t("en", "You do not have permission to do that.") }, { status: 403 });
  }

  const { id } = await params;
  const key = decodeURIComponent(id);
  const cargo = await prisma.cargo.findFirst({
    where: { deletedAt: null, OR: [{ id: key }, { reference: key.toUpperCase() }] },
    select: { id: true, reference: true },
  });
  if (!cargo) {
    return NextResponse.json({ error: t("en", "Cargo not found.") }, { status: 404 });
  }

  const box = request.nextUrl.searchParams.get("box");
  const stickers = await stickersFor([cargo.id], box);
  if (stickers.length === 0) {
    return NextResponse.json(
      { error: t("en", "There are no boxes on this consignment to label yet.") },
      { status: 409 }
    );
  }

  const [company, logo] = await Promise.all([companySettings(), invoiceLogo()]);

  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Cargo",
    entityId: cargo.id,
    summary: `Downloaded ${stickers.length} box label(s) for ${cargo.reference}`,
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
      "Content-Disposition": `attachment; filename="${cargo.reference} labels.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
