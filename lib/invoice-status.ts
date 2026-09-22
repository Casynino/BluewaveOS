import { prisma } from "@/lib/prisma";
import { impliedStatus } from "@/lib/invoice-balance";
import { withdrawPickupNoteIfOwing } from "@/lib/pickup-note";

/**
 * Bring an invoice's stored status back in line with its payments.
 *
 * The status column exists so screens can filter cheaply; the truth is always
 * the payment rows. This is called after anything that moves money, so the two
 * can never drift far enough for somebody to act on the wrong one.
 *
 * THE PERMISSION GOES WITH THE MONEY, WHICHEVER SIDE OF IT MOVED. A payment
 * taken back withdraws the pickup note where it is reversed; a bill that grows
 * — storage added, a charge, a re-price — leaves the customer owing just the
 * same, and a note in their hand still reading "paid" is a printout the counter
 * has to argue with. The release check refuses the goods either way; this is so
 * the paper agrees with it.
 */
export async function refreshInvoiceStatus(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!invoice) return;
  if (invoice.status === "DRAFT" || invoice.status === "CANCELLED") return;

  const should = impliedStatus(invoice);
  if (should !== invoice.status) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: should },
    });
  }

  if (should !== "PAID") {
    /* Only a note that rested on the money is withdrawn: one written on credit
       never did, and one already used is history — see lib/pickup-note.ts. */
    await withdrawPickupNoteIfOwing(
      prisma,
      invoice.cargoId,
      `${invoice.number} is no longer settled`
    );
  }
}
