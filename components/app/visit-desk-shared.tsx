import type { VisitStatus } from "@prisma/client";

import type { BadgeProps } from "@/components/ui/badge";

/* What the business-visit screens on the desk share: the colour of a status
   and how a visitor's dates read. Server-side; the form is visit-desk.tsx. */

export const VISIT_STATUS_TONE: Record<VisitStatus, BadgeProps["tone"]> = {
  REQUESTED: "warn",
  UNDER_REVIEW: "progress",
  CONFIRMED: "good",
  IN_PROGRESS: "progress",
  COMPLETED: "good",
  CANCELLED: "neutral",
};

/* The dates are calendar days stored at UTC midnight; read them as such. */
const DAY = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

export const visitDay = (date: Date) => DAY.format(date);

export function visitDates(
  visit: { travelFrom: Date | null; travelTo: Date | null; flexibleDates: boolean },
  tr: (text: string) => string
) {
  if (!visit.travelFrom) return visit.flexibleDates ? tr("Flexible") : "—";
  const range = `${visitDay(visit.travelFrom)}${visit.travelTo ? ` → ${visitDay(visit.travelTo)}` : ""}`;
  return visit.flexibleDates ? `${range} (${tr("flexible")})` : range;
}
