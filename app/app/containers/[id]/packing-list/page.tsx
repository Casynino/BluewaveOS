import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { sheetFor } from "@/lib/packing-list";
import { PackingListSheet } from "@/components/app/packing-list-sheet";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale } from "@/lib/server-t";
/* The saved file is named after the page, so the container's own number goes in
   the title — a downloads folder full of "packing-list.pdf" tells nobody which
   sailing they are holding. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const container = await prisma.container.findUnique({
    where: { id },
    select: { reference: true },
  });
  return {
    title: {
      absolute: container
        ? `Packing list ${container.reference}`
        : "Packing list",
    },
  };
}


/**
 * The manifest, as printed.
 *
 * One container, many customers, one line each — the document that goes to the
 * shipping line and to customs, and the one Dar checks the boxes off against.
 * Rendered from the snapshot rather than the live rows for the same reason as
 * the delivery note.
 */
export default async function PackingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await primeLocale();
  await requirePermission("packingList.view");
  const { id } = await params;

  /* Issued or not, there is always a list; which drawing is the true one is
     lib/packing-list.ts's rule, and the download route asks it the same way. */
  const sheet = await sheetFor(id);
  if (!sheet) notFound();

  return (
    <PackingListSheet
      snap={sheet.snap}
      containerId={id}
      list={sheet.list}
      company={sheet.company}
    />
  );
}
