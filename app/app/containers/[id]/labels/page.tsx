import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

import { CargoSticker, LABEL_MM } from "@/components/app/cargo-sticker";
import { DocumentActions } from "@/components/app/document-actions";
import { SmartBack } from "@/components/app/smart-back";
import { recordAudit } from "@/lib/audit";
import { boxCountFor, stickersFor } from "@/lib/box-labels";
import { prisma } from "@/lib/prisma";
import { canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

import { T, primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Box labels" };

/** How many stickers this screen draws; the PDF beside it carries the rest. */
const ON_SCREEN = 400;

/**
 * EVERY BOX LABEL IN ONE CONTAINER, IN ONE PRINT.
 *
 * The container has no code of its own — it only organises consignments whose
 * boxes already carry theirs. This prints each of those box stickers again,
 * consignment by consignment, for a floor relabelling a load.
 */
export default async function ContainerLabelsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requireStaff();
  if (!canAny(user.role, ["receiving.china", "receiving.dar"])) redirect("/app/no-access");
  const { id } = await params;

  const container = await prisma.container.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, reference: true, cargoLines: { select: { cargoId: true } } },
  });
  if (!container) notFound();

  /*
    A SAILING'S WORTH OF STICKERS IS A FILE, NOT A PAGE.

    A full container is a couple of thousand boxes, and drawing every one of
    them into one document put tens of megabytes through the browser and took
    the server's memory with it. The screen draws a batch — and builds only
    that batch — while the PDF beside it, the same stickers drawn properly, is
    what a floor relabelling a whole load actually prints from. The count is
    asked for on its own so the sentence below can say how many are not here.
  */
  const cargoIds = container.cargoLines.map((l) => l.cargoId);
  const [drawn, boxes] = await Promise.all([
    stickersFor(cargoIds, null, "svg", ON_SCREEN),
    boxCountFor(cargoIds),
  ]);

  await recordAudit({
    actor: user,
    action: "cargo.label.print",
    entity: "Container",
    entityId: container.id,
    summary: `Printed ${drawn.length} of ${boxes} box label(s) for container ${container.reference}`,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:max-w-none print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <SmartBack fallbackHref={`/app/containers/${container.id}`} fallbackLabel={container.reference} />
          <p className="mt-1 text-xs text-muted-foreground">
            {boxes} box label{boxes === 1 ? "" : "s"} in {container.reference}. One code per
            physical box. {LABEL_MM.width} × {LABEL_MM.height} mm.
          </p>
          {boxes > drawn.length ? (
            <p className="mt-1 text-xs text-warning">
              {T("This page draws the first {shown} of {total}. Download the PDF for every label on the sailing.")
                .replace("{shown}", String(drawn.length))
                .replace("{total}", String(boxes))}
            </p>
          ) : null}
        </div>
        <DocumentActions
          href={`/app/containers/${container.id}/labels/pdf`}
          primaryPrint
          printLabel={`${T("Print")} ${drawn.length} ${drawn.length === 1 ? T("label") : T("labels")}`}
          downloadLabel={T("Download PDF")}
        />
      </div>
      <div className="-mx-4 overflow-x-auto px-4 print:mx-0 print:overflow-visible print:px-0">
        <div className="mx-auto flex w-max flex-col items-center gap-4 print:gap-0">
          {drawn.map((sticker) => (
            <CargoSticker key={`${sticker.reference}-${sticker.sequence}`} data={sticker} />
          ))}
        </div>
      </div>
    </div>
  );
}
