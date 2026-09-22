import type { CargoStatus } from "@prisma/client";

/**
 * ARRIVING AND BEING VERIFIED ARE TWO DIFFERENT THINGS.
 *
 * The owner's rule, and the reason this file exists: pressing "Arrived" lands
 * the container and every consignment on it — the storage clock starts, the
 * customer is told — and none of that waits for anybody to scan anything. What
 * Dar does afterwards, box by box, is VERIFICATION, and it is a separate
 * answer about the same consignment.
 *
 * So the operational status says where the goods are and this says what the
 * Dar floor has found. Overloading one column with both is how "arrived" came
 * to mean two things to two desks.
 *
 * It is DERIVED, not stored. Every fact it reads is already written down and
 * already appended to — the cargo's status, Dar's receiving row, the open
 * cases — and a column would be a fourth copy of them to keep in step. The
 * screens, the container summary and the tests all call this, so one word
 * means one thing on the dock, on the container, on the consignment and in the
 * staff lists.
 */
export type Verification =
  /** Nobody has counted it yet, or it is counted and not signed off. */
  | "PENDING"
  /** Counted, clean, signed off by the floor. */
  | "VERIFIED"
  /** On the packing list, not on the floor. Never deleted, never released. */
  | "MISSING"
  /** It is here, and it did not arrive in one piece. */
  | "DAMAGED"
  /** Here, but the count disagrees or a case is open on it. */
  | "ISSUE";

export type VerifiableCargo = {
  status: CargoStatus | string;
  darReceiving: {
    verified: boolean;
    discrepancy: boolean;
    condition: string;
  } | null;
  /** Cases still open on the consignment. Never which case. */
  openCases?: number;
};

/**
 * WORST FIRST, because the floor acts on the worst thing that is true.
 *
 * Missing leads: there is nothing to say about the condition of goods nobody
 * can find. Damage stays on the word for good — a bale that arrived soaked is
 * still the bale that arrived soaked after its case is closed — so it sits
 * above a count that merely disagrees. Signed off comes last of the answers,
 * and anything else is still pending somebody's hands.
 */
export function verificationOf(cargo: VerifiableCargo): Verification {
  if (cargo.status === "MISSING_AT_DAR") return "MISSING";
  const dar = cargo.darReceiving;
  if (!dar) return "PENDING";
  if (DAMAGE_CONDITIONS.includes(dar.condition)) return "DAMAGED";
  if (dar.discrepancy || (cargo.openCases ?? 0) > 0) return "ISSUE";
  return dar.verified ? "VERIFIED" : "PENDING";
}

/* Repacked is not damage — a carton split on the water and made good again on
   the floor is a note, not a claim. It still flags the row, so it reads as an
   issue for somebody to answer, never as goods that arrived broken. */
const DAMAGE_CONDITIONS = ["MINOR_DAMAGE", "DAMAGED", "WET"];

/** English is the key; lib/i18n.ts carries the Chinese. */
export const VERIFICATION_LABEL: Record<Verification, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  MISSING: "Missing",
  DAMAGED: "Damaged",
  ISSUE: "Issue",
};

/** The Badge component's own vocabulary, so a caller never translates it. */
export const VERIFICATION_TONE: Record<
  Verification,
  "neutral" | "good" | "warn" | "bad" | "progress"
> = {
  PENDING: "neutral",
  VERIFIED: "good",
  MISSING: "bad",
  DAMAGED: "bad",
  ISSUE: "warn",
};

/** Counted onto the Dar floor: a receiving row exists, whatever it says. */
export function isCheckedIn(cargo: VerifiableCargo): boolean {
  return cargo.darReceiving !== null;
}

/**
 * GOODS THAT ARE NOT IN THE BOX ARE NOT PART OF THE BOX.
 *
 * The owner's rule for a container's own arithmetic: a consignment reported
 * missing keeps its row, its reference and its history on the manifest, and
 * comes out of the counts — consignments, packages, pieces, volume, weight —
 * because it is not in there. The screens print the exclusion ("5 · 1
 * missing") rather than quietly shrinking, so nobody reads a smaller total as
 * a row that vanished.
 */
export function countsInContainer(cargo: {
  status: CargoStatus | string;
}): boolean {
  return cargo.status !== "MISSING_AT_DAR";
}

export type VerificationSummary = {
  /** Every consignment on the manifest, missing ones included. */
  expected: number;
  /** Counted onto the floor. */
  checkedIn: number;
  /** Not signed off yet — uncounted, or counted and unsigned. */
  pending: number;
  verified: number;
  missing: number;
  damaged: number;
  issue: number;
};

/**
 * THE BOX'S OWN ANSWER, LIVE WHILE DAR IS STILL SCANNING.
 *
 * Read off the same rows the screen underneath it renders, so a strip can
 * never disagree with the list below it, and counted in one place so the dock,
 * the container page and the staff lists cannot each invent their own idea of
 * what "pending" means.
 */
export function verificationSummary(
  lines: VerifiableCargo[]
): VerificationSummary {
  const states = lines.map(verificationOf);
  const count = (state: Verification) =>
    states.filter((s) => s === state).length;
  return {
    expected: lines.length,
    checkedIn: lines.filter(isCheckedIn).length,
    pending: count("PENDING"),
    verified: count("VERIFIED"),
    missing: count("MISSING"),
    damaged: count("DAMAGED"),
    issue: count("ISSUE"),
  };
}
