import "server-only";

import type { NoticeLinks } from "@/lib/cargo-notices";
import { normalSiteUrl } from "@/lib/site-url";
import { trackKey } from "@/lib/track-key";

/**
 * THE ADDRESSES A CUSTOMER IS SENT, BUILT IN ONE PLACE.
 *
 * Every one of these opens a real page:
 *
 *   track     /track/<ref>?k=…          public tracking; the key opens the bill
 *   invoice   /track/<ref>/invoice?i=…  the PDF, by the same key — the customer
 *                                       tapped a WhatsApp link and may never
 *                                       have had an account
 *   viewCargo /portal/cargo/<ref>       signed in; the portal's own gate
 *   payNow    /portal/invoices/<id>     where the portal takes a payment
 *   pickup    /portal/pickups/<id>      the pickup note with its code
 *   warehouse /contact#dar-warehouse    where the Dar warehouse is
 *
 * The portal notification gets the same set as site paths (`portalLinks`), so
 * a notification opened inside the portal never leaves it, and the invoice is
 * the portal's own PDF route behind the session.
 */

/**
 * WHATSAPP REMEMBERS A LINK'S CARD FOREVER.
 *
 * Its servers fetch the preview once per exact address and keep it, so a link
 * already sent keeps showing the card it had that day. Bumping this tag
 * changes the address enough for a fresh fetch while the page is the same.
 */
export const SHARE_TAG = "s=2";

/**
 * The public site, for links that leave the system. A localhost value is
 * refused rather than sent: a link composed on a dev machine would otherwise
 * resolve to the customer's own phone.
 */
export function siteBase(): string {
  return normalSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? "https://www.bluewavecargo.co.tz";
}

export function trackUrl(): string {
  return `${siteBase()}/track`;
}

export function trackLink(reference: string): string {
  return `${siteBase()}/track/${encodeURIComponent(reference)}?${SHARE_TAG}&k=${trackKey(reference)}`;
}

/**
 * THE TWO ADDRESSES A MERGED PAYMENT IS SENT WITH.
 *
 * Both are signed over ONE reference — the consignment named here — and both
 * carry `all=1`, which asks the page and the route to widen to the rest of
 * that customer's bills in the same group. The widening is worked out on the
 * server from the cargo this key names (lib/combined-bill.ts); a customer is
 * never read out of an address bar.
 *
 *   track    the merged view: every consignment in the group, each of them
 *            clickable through to its own tracking page
 *   invoice  the combined bill as a PDF — one document for the one payment
 *
 * The tracking link keeps SHARE_TAG so WhatsApp fetches a fresh card; the
 * invoice link is a download and has no card to draw.
 */
export function mergedLinks(reference: string): { track: string; invoice: string } {
  return {
    track: `${trackLink(reference)}&all=1`,
    invoice: `${siteBase()}/track/${encodeURIComponent(reference)}/invoice?k=${trackKey(reference)}&all=1`,
  };
}

type LinkInput = {
  reference: string;
  /** The live bill, when there is one. A draft is nobody's bill and gets no link. */
  invoiceId?: string | null;
  pickupNoteId?: string | null;
};

/** Absolute addresses, for a message that leaves the system. */
export function messageLinks(input: LinkInput): NoticeLinks {
  const base = siteBase();
  const ref = encodeURIComponent(input.reference);
  const key = trackKey(input.reference);
  return {
    track: trackLink(input.reference),
    viewCargo: `${base}/portal/cargo/${ref}`,
    invoice: input.invoiceId
      ? `${base}/track/${ref}/invoice?i=${encodeURIComponent(input.invoiceId)}&k=${key}`
      : null,
    payNow: input.invoiceId ? `${base}/portal/invoices/${encodeURIComponent(input.invoiceId)}` : null,
    pickup: input.pickupNoteId
      ? `${base}/portal/pickups/${encodeURIComponent(input.pickupNoteId)}`
      : `${base}/portal/cargo/${ref}`,
    warehouse: `${base}/contact#dar-warehouse`,
  };
}

/** Site paths, for the portal notification row. */
export function portalLinks(input: LinkInput): NoticeLinks {
  const ref = encodeURIComponent(input.reference);
  return {
    track: `/portal/cargo/${ref}`,
    viewCargo: `/portal/cargo/${ref}`,
    invoice: input.invoiceId ? `/portal/invoices/${encodeURIComponent(input.invoiceId)}/pdf` : null,
    payNow: input.invoiceId ? `/portal/invoices/${encodeURIComponent(input.invoiceId)}` : null,
    pickup: input.pickupNoteId
      ? `/portal/pickups/${encodeURIComponent(input.pickupNoteId)}`
      : `/portal/cargo/${ref}`,
    warehouse: "/contact#dar-warehouse",
  };
}
