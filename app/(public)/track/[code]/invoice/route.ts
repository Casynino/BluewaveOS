import { NextResponse } from "next/server";

import { renderCombinedBillPdf } from "@/lib/combined-bill-pdf";
import { loadCombinedBillPdf } from "@/lib/combined-bill-pdf-data";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { invoiceLogo, loadInvoicePdf } from "@/lib/invoice-pdf-data";
import { invoiceQr } from "@/lib/invoice-verify";
import { prisma } from "@/lib/prisma";
import { clientAddress, hit } from "@/lib/rate-limit";
import { trackKeyValid } from "@/lib/track-key";
import { referenceFromInput } from "@/lib/tracking";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The customer's invoice, from the link in their own message.
 *
 * No session: the customer tapped a WhatsApp link and may never have had an
 * account. The key in that link is what stands in for one — it is signed over
 * this reference and cannot be made for another — and the bill must belong to
 * this consignment. A draft is nobody's bill yet and is never handed out.
 *
 * `?view=1` serves the same bytes to be opened rather than saved. A public
 * tracking page carries no invoice sheet to print, so opening the document is
 * the print path there — the customer's own viewer has the print button, and it
 * reaches a printer the same way any print dialog does.
 *
 * `?all=1` is the merged payment: one document for every bill this customer's
 * consignment is paid with. The same key is the same authority — it is signed
 * over this reference, the customer is read from the cargo it names and never
 * from the address, and lib/combined-bill.ts decides which of their bills are
 * in the group. Drafts are in no group.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = new URL(request.url);
  const reference = referenceFromInput(decodeURIComponent(code));
  const invoiceId = url.searchParams.get("i") ?? "";
  const merged = url.searchParams.get("all") === "1";

  const address = await clientAddress();
  if (!hit(`track-pdf:${address}`, 20, 10 * 60 * 1000).ok) {
    return NextResponse.json({ error: "Too many downloads. Try again in a few minutes." }, { status: 429 });
  }

  if (!reference || (!invoiceId && !merged) || !trackKeyValid(reference, url.searchParams.get("k"))) {
    return NextResponse.json({ error: "This link cannot open an invoice." }, { status: 404 });
  }

  if (merged) {
    const combined = await loadCombinedBillPdf(reference);
    if (!combined) {
      return NextResponse.json({ error: "There is no merged invoice for this cargo." }, { status: 404 });
    }
    const pdf = renderCombinedBillPdf({ ...combined.input, logo: await invoiceLogo() });
    return pdfResponse(pdf, combined.fileName, url);
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      status: { not: "DRAFT" },
      cargo: { deletedAt: null, reference: { equals: reference, mode: "insensitive" } },
    },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const loaded = await loadInvoicePdf(invoice.id);
  if (!loaded) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });

  const qr = await invoiceQr(invoice.id, 360).catch(() => null);
  const pdf = renderInvoicePdf({ ...loaded.input, logo: await invoiceLogo(), qr });

  return pdfResponse(pdf, loaded.fileName, url);
}

/** The same headers whichever document was drawn: never cached, never indexed. */
function pdfResponse(pdf: Uint8Array, fileName: { ascii: string; full: string }, url: URL) {
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${
        url.searchParams.get("view") === "1" ? "inline" : "attachment"
      }; filename="${fileName.ascii}"; filename*=UTF-8''${encodeURIComponent(fileName.full)}`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
