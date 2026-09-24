import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { Download } from "lucide-react";

import { CargoSticker, LABEL_MM, type StickerData } from "@/components/app/cargo-sticker";
import {
  DeliveryNoteSheet,
  type DeliveryNoteSheetData,
} from "@/components/app/delivery-note-sheet";
import { AutoPrint, PrintButton } from "@/components/app/print-button";
import { SmartBack } from "@/components/app/smart-back";
import { Button } from "@/components/ui/button";
import { recordAudit } from "@/lib/audit";
import { stickersFor } from "@/lib/box-labels";
import { prisma } from "@/lib/prisma";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { can, canAny } from "@/lib/rbac";
import { requireStaff } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Receiving documents" };

/**
 * THE RECEIVING PACKAGE: THE DELIVERY NOTE, THEN ONE LABEL PER BOX.
 *
 * What the Foshan counter actually needs in its hand when a customer's goods
 * come off the van — the note that goes to the person who brought them, and a
 * sticker for every carton that stays. Both already exist on their own pages
 * and are printed from them one at a time; this is the two of them in one print
 * job, in that order, each on its own page.
 *
 * NEITHER DOCUMENT IS REMADE HERE. The note is the same sheet the delivery-note
 * page draws, from the same snapshot, and the labels carry the same codes as
 * the label sheet. A second rendering of a document is a second document.
 *
 * The labels are laid two to an A4 page rather than on the 100 × 150 roll: a
 * clerk printing both at once is standing at an office printer. The label page
 * keeps the exact roll size for the label printer.
 */
export default async function CargoDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  const user = await requireStaff();
  const mayLabel = canAny(user.role, ["receiving.china", "receiving.dar"]);
  const mayNote = can(user.role, "deliveryNote.view");
  if (!mayLabel && !mayNote) redirect("/app/no-access");

  const { id } = await params;
  const key = decodeURIComponent(id);

  const cargo = await prisma.cargo.findFirst({
    where: { deletedAt: null, OR: [{ id: key }, { reference: key.toUpperCase() }] },
    select: {
      id: true,
      reference: true,
      qrToken: true,
      deliveryNote: { include: { issuedBy: { select: { name: true } } } },
      containerLines: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: { container: { select: { reference: true } } },
      },
    },
  });
  if (!cargo) notFound();

  const [company, qr, stickers] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    qrDataUrl(qrPayload(cargo.qrToken), 520).catch(() => null),
    mayLabel ? stickersFor([cargo.id], null, "svg") : Promise.resolve([] as StickerData[]),
  ]);

  /* Opening this page is the only signal we have that labels were printed —
     the browser's print dialog is invisible to us. Counted the same way the
     label sheet counts it. */
  if (stickers.length > 0) {
    await recordAudit({
      actor: user,
      action: "cargo.label.print",
      entity: "Cargo",
      entityId: cargo.id,
      summary: `Printed the receiving package for ${cargo.reference}`,
    });
  }

  const note = mayNote && cargo.deliveryNote ? cargo.deliveryNote : null;
  const sheet: DeliveryNoteSheetData | null = note
    ? {
        number: note.number,
        issuedAt: note.issuedAt,
        issuedByName: note.issuedBy?.name ?? null,
        snapshot: note.snapshot as unknown as DeliveryNoteSheetData["snapshot"],
      }
    : null;

  /* Two labels to a page, the way they come off an A4 printer. */
  const pages: StickerData[][] = [];
  for (let i = 0; i < stickers.length; i += 2) pages.push(stickers.slice(i, i + 2));

  return (
    <div className="mx-auto max-w-[820px] space-y-6 print:max-w-none print:space-y-0">
      <AutoPrint />
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .dn-sheet { width: 210mm; min-height: 297mm; padding: 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .label-page { width: 210mm; height: 297mm; padding: 5mm; break-before: page; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .update-pill { display: none !important; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <SmartBack fallbackHref={`/app/cargo/${cargo.id}`} fallbackLabel={cargo.reference} />
          <p className="mt-1 text-xs text-muted-foreground">
            {sheet ? T("The delivery note, then one label for every box.") : T("One label for every box.")}
            {stickers.length > 0
              ? ` ${stickers.length} ${stickers.length === 1 ? T("box") : T("boxes")}.`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PrintButton label={T("Print both")} primary />
          {sheet ? (
            <Button asChild variant="outline">
              <a href={`/app/cargo/${cargo.id}/delivery-note/pdf`} download>
                <Download />
                {T("Delivery note PDF")}
              </a>
            </Button>
          ) : null}
          {stickers.length > 0 ? (
            <Button asChild variant="outline">
              <a href={`/app/cargo/${cargo.id}/label/pdf`} download>
                <Download />
                {T("Labels PDF")}
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Each document keeps its own file. The two PDFs stay separate because a
          label goes on a carton and a note goes to a person, and a clerk asked
          to send one should never have to send the other with it. */}
      {sheet ? (
        <DeliveryNoteSheet
          note={sheet}
          company={company}
          containerReference={cargo.containerLines[0]?.container.reference ?? null}
          qr={qr}
        />
      ) : null}

      {pages.map((page, index) => (
        <div
          key={index}
          className="label-page mx-auto flex flex-wrap content-start items-start justify-center gap-4 print:gap-2"
          style={{ minHeight: `${LABEL_MM.height}mm` }}
        >
          {page.map((sticker) => (
            <CargoSticker key={`${sticker.reference}-${sticker.sequence}`} data={sticker} />
          ))}
        </div>
      ))}

      {!sheet && stickers.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground print:hidden">
          {T("Nothing to print for this consignment yet.")}
        </p>
      ) : null}
    </div>
  );
}
