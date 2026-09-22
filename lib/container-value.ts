/**
 * WHAT A SAILING IS EXPECTED TO BE WORTH.
 *
 * Expected, not earned: a consignment nobody has confirmed a price for still
 * carries a draft priced from the published rate book, and that draft counts
 * towards the figure. Nobody has been asked for it, so it moves until Finance
 * confirms it.
 *
 * GOODS NOBODY CAN FIND ARE NOT THIS SAILING'S MONEY. A consignment reported
 * missing at Dar keeps its draft — a draft is Finance's working, not a demand —
 * and the draft is simply not added here. Counting it would say the box is
 * worth money for boxes that never came off it, and the first person to notice
 * would be whoever reconciled the sailing weeks later.
 *
 * A BILL ALREADY ISSUED against a missing consignment is a different thing
 * entirely: the customer is holding it. It stays in the figure exactly as
 * issued, and cancelling or crediting it is Finance's decision with a reason
 * on it — never arithmetic that quietly drops it. The screens say how many
 * consignments are in that position rather than hiding them.
 *
 * Pure, so the number on the container page and the number in the test are the
 * same number.
 */
export type ValuedLine = {
  /** Reported missing at Dar. */
  missing: boolean;
  /** The total of every live (issued, not cancelled) bill on it. */
  billed: number;
  /** Is there a live bill at all? */
  issued: boolean;
  /** The draft's total, where one has been priced from the book. */
  draftTotal: number;
};

export function expectedRevenueOf(lines: ValuedLine[]): number {
  return lines.reduce(
    (sum, line) =>
      sum + (line.issued ? line.billed : line.missing ? 0 : line.draftTotal),
    0
  );
}
