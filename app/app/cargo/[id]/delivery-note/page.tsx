import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  DeliveryNoteSheet,
  type DeliveryNoteSheetData,
} from "@/components/app/delivery-note-sheet";
import { DocumentActions } from "@/components/app/document-actions";
import { AutoPrint } from "@/components/app/print-button";
import { qrDataUrl, qrPayload } from "@/lib/qr";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

import { T, primeLocale } from "@/lib/server-t";

export const metadata: Metadata = { title: "Delivery note" };

/**
 * The paper the customer keeps.
 *
 * The sheet itself lives in `components/app/delivery-note-sheet.tsx`, because
 * the Foshan counter also prints it inside the receiving package beside the box
 * labels, and one document drawn in two places drifts into two documents.
 *
 * `?print=1` opens the clerk's own print dialog on arrival, so "Print delivery
 * note" on the cargo page is one press rather than a page to hunt a button on.
 */
export default async function DeliveryNotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  await requirePermission("deliveryNote.view");
  const { id } = await params;

  const note = await prisma.deliveryNote.findUnique({
    where: { cargoId: id },
    include: { issuedBy: { select: { name: true } } },
  });
  if (!note) notFound();

  const [company, cargo] = await Promise.all([
    prisma.companySetting.findUnique({ where: { id: "singleton" } }),
    prisma.cargo.findUnique({
      where: { id },
      select: {
        qrToken: true,
        containerLines: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: { container: { select: { reference: true } } },
        },
      },
    }),
  ]);

  /* The consignment's own code: staff who scan it open the record, a
     customer opens their tracking page — see app/t/[token]. */
  const qr = cargo ? await qrDataUrl(qrPayload(cargo.qrToken), 520) : null;
  const sheet: DeliveryNoteSheetData = {
    number: note.number,
    issuedAt: note.issuedAt,
    issuedByName: note.issuedBy?.name ?? null,
    snapshot: note.snapshot as unknown as DeliveryNoteSheetData["snapshot"],
  };

  return (
    <div className="mx-auto max-w-[820px] space-y-6 print:max-w-none print:space-y-0">
      <AutoPrint />
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .dn-sheet { width: 210mm; min-height: 297mm; padding: 12mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .update-pill { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/cargo/${id}`} fallbackLabel={sheet.snapshot.cargoReference} />
        <DocumentActions
          href={`/app/cargo/${id}/delivery-note/pdf`}
          printLabel={T("Print delivery note")}
          downloadLabel={T("Download PDF")}
        />
      </div>

      <DeliveryNoteSheet
        note={sheet}
        company={company}
        containerReference={cargo?.containerLines[0]?.container.reference ?? null}
        qr={qr}
      />
    </div>
  );
}
