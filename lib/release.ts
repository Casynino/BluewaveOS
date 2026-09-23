import "server-only";

import { Prisma } from "@prisma/client";

import { balanceOf } from "@/lib/invoice-balance";
import { prisma } from "@/lib/prisma";

/**
 * MAY THESE BOXES LEAVE?
 *
 * This is the only answer to that question in the system, and it is COMPUTED
 * from the record every time it is asked. Nothing stores "released: yes".
 * Nobody holds a permission that means "this may go" — `release.execute` is the
 * authority to act on this function's answer, not to overrule it.
 *
 * The rule it replaces is a warehouse handing cargo over because a customer
 * showed them a screenshot, said Finance had confirmed it, or was simply
 * standing there being persuasive. Every condition is checked here and
 * the failing ones come back as sentences, so the floor can tell the customer
 * exactly what is missing without ringing another department.
 */

export type ReleaseCheck = {
  ok: boolean;
  /** Every condition, in the order the business thinks about them. */
  conditions: { label: string; passed: boolean; detail?: string }[];
  /** What is still owed, across every live invoice on this consignment. */
  outstanding: Prisma.Decimal;
  currency: string;
  /** The plain-English reason it cannot go, or null. */
  blockedBy: string | null;
};

type CargoForRelease = {
  status: string;
  operationalHold: boolean;
  operationalHoldReason: string | null;
  /** Finance's written permission to collect. See prisma PickupNote. */
  pickupNote: { status: string; onCredit: boolean } | null;
  darReceiving: { verified: boolean; discrepancy: boolean } | null;
  invoices: {
    status: string;
    total: Prisma.Decimal;
    currency: string;
    fxRate: Prisma.Decimal | null;
    payments: {
      status: string;
      amount: Prisma.Decimal;
      currency: string;
      fxRate: Prisma.Decimal | null;
      baseCurrencyAmount: Prisma.Decimal | null;
      creditedAmount: Prisma.Decimal | null;
    }[];
  }[];
  exceptions: { status: string; reference: string }[];
};

export function checkRelease(cargo: CargoForRelease): ReleaseCheck {
  /* A DRAFT IS NOT A BILL. It is Finance's working, and the customer has never
     been shown it, so it can neither be owed nor paid. */
  const live = cargo.invoices.filter(
    (i) => i.status !== "CANCELLED" && i.status !== "DRAFT"
  );
  const drafts = cargo.invoices.filter((i) => i.status === "DRAFT");

  /* Owed in shillings, summed in shillings. A bill with no rate cannot be
     turned into shillings and is summed in its own currency beside them — the
     two are never added together. */
  const balances = live.map(balanceOf);
  const unconverted = balances.filter((b) => !b.outstandingTzs);
  const outstanding = unconverted.length
    ? unconverted.reduce((sum, b) => sum.add(b.outstanding), new Prisma.Decimal(0))
    : balances.reduce((sum, b) => sum.add(b.outstandingTzs!), new Prisma.Decimal(0));
  const currency = unconverted.length ? (unconverted[0].currency) : "TZS";

  const openCases = cargo.exceptions.filter(
    (e) => e.status !== "RESOLVED" && e.status !== "CLOSED"
  );

  /*
    CREDIT IS A DECISION FINANCE RECORDS, NOT A BALANCE THAT MOVED.

    A note written "on credit" is the one way goods leave before the money
    arrives: a named person, a stated reason, the debt left on the books. Only
    a live note counts — once it is used the goods have gone, and a withdrawn
    one granted nothing.
  */
  const note = cargo.pickupNote;
  const onCredit = note?.status === "ACTIVE" && note.onCredit;
  const handedOver = cargo.status === "COLLECTED" || cargo.status === "DELIVERED";

  const conditions = [
    {
      label: "Not already handed over",
      passed: !handedOver,
      detail: handedOver ? "These goods have already left the warehouse." : undefined,
    },
    {
      label: "Not missing or cancelled",
      passed: cargo.status !== "MISSING_AT_DAR" && cargo.status !== "CANCELLED",
      detail:
        cargo.status === "MISSING_AT_DAR"
          ? "Reported missing at Dar."
          : cargo.status === "CANCELLED"
            ? "This consignment was cancelled."
            : undefined,
    },
    {
      /* Arrived is the Dar floor's confirmation. Never the ship, never an ETA. */
      label: "Received at the Dar warehouse",
      passed: cargo.darReceiving !== null,
      detail:
        cargo.darReceiving === null
          ? "The boxes have not been booked in at Dar."
          : undefined,
    },
    {
      label: "Counted and verified",
      passed: cargo.darReceiving?.verified === true,
      detail:
        cargo.darReceiving && !cargo.darReceiving.verified
          ? "Dar has received it but not signed off the count."
          : undefined,
    },
    {
      label: "No warehouse discrepancy",
      passed: cargo.darReceiving?.discrepancy !== true,
      detail: cargo.darReceiving?.discrepancy
        ? "The count or condition did not match. Resolve the case first."
        : undefined,
    },
    {
      label: "No operational hold",
      passed: !cargo.operationalHold,
      detail: cargo.operationalHold
        ? (cargo.operationalHoldReason ?? "Held by the warehouse.")
        : undefined,
    },
    {
      label: "No open case",
      passed: openCases.length === 0,
      detail:
        openCases.length > 0
          ? `${openCases.map((c) => c.reference).join(", ")} still open.`
          : undefined,
    },
    {
      label: "Invoiced",
      passed: live.length > 0,
      /* The two reasons a consignment is unbilled are answered by different
         people — "raise one" is Finance's job, "issue the one you raised" is
         also Finance's but is one click away. Saying "not billed" about a draft
         that plainly exists is how the warehouse and Finance end up arguing on
         the phone about whose screen is lying. */
      detail:
        live.length > 0
          ? undefined
          : drafts.length > 0
            ? "An invoice has been drafted but not issued to the customer yet."
            : "Nothing has been billed for this consignment yet.",
    },
    {
      label: "Paid in full",
      passed: live.length > 0 && (outstanding.lessThanOrEqualTo(0) || onCredit),
      detail:
        live.length > 0 && outstanding.greaterThan(0) && !onCredit
          ? /* No figure. This sentence is the refusal the Dar floor reads when
               it tries to hand over unpaid boxes, and the warehouse never sees
               a price; the amount is on the bill, for the desks that read it. */
            "Not paid in full yet, counting verified payments only."
          : undefined,
    },
    {
      /* The counter acts on Finance's note, and the note is spent by the
         handover — so the same paper cannot let the goods out twice. */
      label: "Pickup note issued",
      passed: note?.status === "ACTIVE",
      detail:
        note?.status === "ACTIVE"
          ? undefined
          : note?.status === "USED"
            ? "The pickup note has already been used."
            : note?.status === "CANCELLED"
              ? "Finance withdrew the pickup note."
              : "Finance has not issued a pickup note yet.",
    },
  ];

  const failing = conditions.find((c) => !c.passed);

  return {
    ok: conditions.every((c) => c.passed),
    conditions,
    outstanding,
    currency,
    blockedBy: failing ? (failing.detail ?? failing.label) : null,
  };
}

/**
 * WHO CAN MAKE THE ANSWER CHANGE.
 *
 * The check's sentences say what is missing. A counter with a customer in
 * front of it also needs to know whose job it is, because the alternative —
 * the one this replaces — is a clerk who cannot name a department deciding it
 * is easier to hand the boxes over and sort the paperwork out afterwards.
 *
 * Nothing here releases anything. It is a list of phone calls, keyed on the
 * one condition that is failing, and every sentence is a thing that desk does
 * in the system rather than a favour they can do on the phone. No figure
 * appears in any of them: the warehouse reads this screen.
 */
export type ReleaseRemedy = {
  desk: "FINANCE" | "MANAGEMENT" | "DAR_WAREHOUSE" | "CUSTOMER_SUPPORT";
  what: string;
};

const REMEDIES: Record<string, ReleaseRemedy[]> = {
  "Not already handed over": [],
  "Not missing or cancelled": [
    { desk: "MANAGEMENT", what: "Ask the manager what is to happen to these goods." },
  ],
  "Received at the Dar warehouse": [
    { desk: "DAR_WAREHOUSE", what: "The boxes are booked in on the receiving dock first." },
  ],
  "Counted and verified": [
    { desk: "DAR_WAREHOUSE", what: "The floor signs the count off on the check-in screen." },
  ],
  "No warehouse discrepancy": [
    { desk: "DAR_WAREHOUSE", what: "Settle the case on the count before anything leaves." },
    { desk: "MANAGEMENT", what: "The manager closes a case the floor cannot." },
  ],
  "No operational hold": [
    { desk: "MANAGEMENT", what: "Only the desk that placed the hold can lift it." },
  ],
  "No open case": [
    { desk: "DAR_WAREHOUSE", what: "Resolve the case on the consignment's own page." },
    { desk: "MANAGEMENT", what: "The manager closes a case the floor cannot." },
  ],
  Invoiced: [
    { desk: "FINANCE", what: "Finance raises the bill and issues it to the customer." },
  ],
  "Paid in full": [
    { desk: "FINANCE", what: "Finance takes the payment and verifies it." },
    {
      desk: "MANAGEMENT",
      what: "Only the manager lets goods go before the money arrives, and Finance writes the note on credit.",
    },
  ],
  "Pickup note issued": [
    { desk: "FINANCE", what: "Finance issues the pickup note once the bill is settled." },
  ],
};

export function releaseRemedies(check: ReleaseCheck): ReleaseRemedy[] {
  const failing = check.conditions.find((c) => !c.passed);
  return failing ? (REMEDIES[failing.label] ?? []) : [];
}

/** Everything the check needs, in one query shape. */
export const RELEASE_INCLUDE = {
  /* packagesCount is not part of the decision — it is here so the release
     form can default to what Dar actually counted rather than making a clerk
     type it again under a customer's gaze. */
  darReceiving: { select: { verified: true, discrepancy: true, packagesCount: true } },
  invoices: {
    select: {
      status: true,
      total: true,
      currency: true,
      fxRate: true,
      payments: {
        select: { status: true, amount: true, currency: true, fxRate: true, baseCurrencyAmount: true, creditedAmount: true },
      },
    },
  },
  exceptions: { select: { status: true, reference: true } },
  /* noteNumber is not part of the decision either — it is the paper in the
     customer's hand, and the counter matches one against the other. */
  pickupNote: { select: { status: true, onCredit: true, noteNumber: true } },
} satisfies Prisma.CargoInclude;

export async function releaseCheckFor(cargoId: string) {
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: null },
    include: RELEASE_INCLUDE,
  });
  if (!cargo) return null;
  return checkRelease(cargo);
}
