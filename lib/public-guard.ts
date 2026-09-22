import "server-only";

import { prisma } from "@/lib/prisma";
import { clientAddress, hit } from "@/lib/rate-limit";

/*
  WHAT STANDS IN FOR `authorize` ON A FORM A STRANGER FILLS IN.

  The website's visit and sourcing forms are writes by nobody in particular, so
  they get the same screening as the quote, pickup and booking forms in
  lib/actions/requests.ts: a field only a script fills in, a per-address limit,
  and a per-phone limit read from the requests themselves so every server
  instance shares it. A queue the team works by hand is only useful while it
  is not full of junk.
*/

export const TRAP_FIELD = "website";
const PER_ADDRESS = 8;
const ADDRESS_WINDOW_MS = 60 * 60 * 1000;
const PER_PHONE_PER_DAY = 6;

export type Screened = { ok?: string; error?: string } | null;

export async function screenPublicRequest(formData: FormData, phone: string): Promise<Screened> {
  if (String(formData.get(TRAP_FIELD) ?? "").trim() !== "") {
    return { ok: "Thank you. We will be in touch." };
  }

  const address = await clientAddress();
  if (!hit(`request:${address}`, PER_ADDRESS, ADDRESS_WINDOW_MS).ok) {
    return { error: "We have had a lot of requests from your connection. Please call or WhatsApp us instead." };
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where = { contactPhone: phone, createdAt: { gte: since } };
  const counts = await Promise.all([
    prisma.quoteRequest.count({ where }),
    prisma.pickupRequest.count({ where }),
    prisma.containerBooking.count({ where }),
    prisma.businessVisitRequest.count({ where }),
    prisma.sourcingRequest.count({ where: { ...where, channel: "WEBSITE" } }),
  ]);
  if (counts.reduce((a, b) => a + b, 0) >= PER_PHONE_PER_DAY) {
    return { error: "We already have several requests from this number today. Our team will call you." };
  }
  return null;
}

/**
 * A PRIVATE STATUS LINK IS NOT HANDED OUT ON THE STRENGTH OF A PHONE NUMBER.
 *
 * Both website forms suppress a duplicate by looking for a request from the
 * same number inside a short window, so a second press of Send does not raise a
 * second trip. What that lookup must not do is answer with the row's
 * `publicKey`: the key is the whole of the status page's security — the page
 * says so in as many words — and a phone number is written on every delivery
 * note and every box. Returning it meant that anybody who typed a customer's
 * number into the public form within the window was handed their private link,
 * with their travel dates, their markets and the plan the desk wrote on it.
 *
 * The key goes back only to somebody the row already belongs to: a signed-in
 * customer whose own id is on it. A stranger is told we have the request and
 * given the reference, which opens nothing by itself.
 */
export function statusKeyFor(
  row: { customerId: string | null; publicKey: string | null },
  viewerCustomerId: string | null
): string | null {
  if (!row.publicKey || !viewerCustomerId) return null;
  return row.customerId === viewerCustomerId ? row.publicKey : null;
}
