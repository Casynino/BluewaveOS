import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { InvoiceDocument } from "@/components/app/invoice-document";
import { DocumentActions } from "@/components/app/document-actions";
import { AutoPrint } from "@/components/app/print-button";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { SmartBack } from "@/components/app/smart-back";

import { T, primeLocale } from "@/lib/server-t";
/*
  THE FILENAME IS THE PAGE TITLE.

  A browser saving to PDF names the file after the document title, and an
  office with forty invoices in a downloads folder cannot tell one
  "invoice.pdf" from another. The customer's name goes in the title so the file
  arrives already named after the person it is for.
*/
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { number: true, customer: { select: { fullName: true } } },
  });
  if (!invoice) return { title: "Invoice" };
  /* Absolute, so the layout's "· BlueWave Cargo" suffix stays out of the filename. */
  return {
    title: { absolute: `${invoice.number} - ${invoice.customer.fullName}` },
  };
}

export default async function InvoiceDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  await requirePermission("finance.view");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({ where: { id }, select: { number: true, status: true } });
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <SmartBack fallbackHref={`/app/finance/invoices/${id}`} fallbackLabel={`${invoice.number}`} />
        {/* A draft's price is unconfirmed and the file route refuses it, so
            there is nothing to download until Finance has said so. */}
        <DocumentActions
          href={invoice.status !== "DRAFT" ? `/app/finance/invoices/${id}/pdf` : null}
          printLabel={T("Print")}
          downloadLabel={T("Download PDF")}
        />
        <AutoPrint />
      </div>
      <InvoiceDocument id={id} />
    </div>
  );
}
