import type { VisitStatus } from "@prisma/client";

/*
  THE WORDS FOR THE CHINA SIDE OF THE BUSINESS.

  Keys are stored; labels are shown. A status or a service is never stored as
  the sentence a visitor reads, so changing a label never changes a record and
  the staff screens and the public site cannot drift into different meanings.
*/

/** The sourcing help a visitor can ask for. Which ones are offered is on CompanySetting. */
export const SOURCING_SERVICES = {
  PRODUCT: { label: "Product sourcing", blurb: "Tell us what you want to sell; we find where it is made or sold and at what price." },
  SUPPLIER: { label: "Supplier sourcing", blurb: "We find and compare suppliers for a product you already know." },
  FACTORY: { label: "Factory sourcing", blurb: "We look for the factory that makes it, for larger orders or your own specification." },
  PRICE_RESEARCH: { label: "Price research", blurb: "We collect prices from several sellers so you know the market before you buy." },
  SAMPLES: { label: "Product samples", blurb: "We arrange samples from a supplier and send them with your next shipment." },
  COMPARISON: { label: "Supplier comparison", blurb: "You have several suppliers in mind; we compare them for you." },
} as const;

export type SourcingServiceKey = keyof typeof SOURCING_SERVICES;

export function isSourcingService(value: string | null | undefined): value is SourcingServiceKey {
  return Boolean(value && value in SOURCING_SERVICES);
}

/** What BlueWave offers from a guide city, by key. */
export const CITY_SERVICES = {
  SOURCING: "Sourcing help",
  VISITS: "Business visits",
  PICKUP: "Pickup to our Foshan warehouse",
} as const;

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  REQUESTED: "Requested",
  UNDER_REVIEW: "Under review",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** What each status means to the visitor reading their status page. */
export const VISIT_STATUS_NOTE: Record<VisitStatus, string> = {
  REQUESTED: "We have your request. Somebody from the team will call or WhatsApp you to talk it through.",
  UNDER_REVIEW: "We are working out the plan — which markets and factories, and what can be arranged on your dates.",
  CONFIRMED: "Your visit is confirmed. The plan below is what has been arranged.",
  IN_PROGRESS: "Your visit is under way. Call the team if anything changes.",
  COMPLETED: "Your visit is complete. If you bought goods, we can collect them and ship them home.",
  CANCELLED: "This request was cancelled. Send a new one whenever you are ready.",
};

/** The order a visit moves through, for the desk's controls and the status page. */
export const VISIT_FLOW: VisitStatus[] = ["REQUESTED", "UNDER_REVIEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED"];

export const SOURCING_STATUS_NOTE: Record<string, string> = {
  NEW: "We have your request. The sourcing team will contact you.",
  IN_PROGRESS: "We are looking for suppliers and prices.",
  WAITING_CUSTOMER: "We need something from you — please check your phone or WhatsApp.",
  SUPPLIER_FOUND: "We have found suppliers. The team will share the options with you.",
  COMPLETED: "This request is complete.",
  CANCELLED: "This request was cancelled.",
};

export const FACTORY_LISTING_LABEL = {
  LISTING: "Factory listing",
  PARTNER: "BlueWave sourcing partner",
} as const;
