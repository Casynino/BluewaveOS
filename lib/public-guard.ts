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
