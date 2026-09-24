import type { CargoStatus, ContainerStatus } from "@prisma/client";

import { delayFor, expectedArrival } from "@/lib/sailing-schedule";

/**
 * WHERE THE CARGO IS, IN THE CUSTOMER'S WORDS.
 *
 * One function turns the record — the cargo's own status history, what the
 * container did, whether the box has a frozen manifest, whether Dar has counted
 * it, whether a price is waiting or a bill has gone out, what has been paid and
 * whether the release check passes — into the stage a customer recognises. The
 * public tracking page, the portal and the staff message composer all read it,
 * so nobody is told two different stories about the same boxes.
 *
 * Pure on purpose: no database, no clock of its own. Everything it knows is
 * passed in, which is what lets the test in tests/tracking-stage.test.ts pin
 * each rule down without a fixture container.
 *
 * THE BLUEWAVE JOURNEY — SIX STAGES, AND NO CLEARANCE.
 *
 *   Received in China → Stored in China → In transit → Arrived in Dar es
 *   Salaam → Ready for pickup → Collected
 *
 * The statuses the data already uses map onto those six here and nowhere else
 * (`bluewaveStageOf`). There is no customs-clearance stage: the step the
 * inherited system had between the port and our warehouse is gone.
 * "Arrived in Dar" is the owner's own rule — the day somebody pressed Arrived
 * on the container, which is the day the customer was told and the day free
 * storage started. Never the ETA, and never waiting on a scan: Dar's check-in
 * afterwards is VERIFICATION (lib/verification.ts), a separate answer about
 * the same goods, and it does not move this line.
 *
 * TWO GRAINS, AND WHY.
 *
 * `steps` is the spine — the six stages, drawn as a line on the page. `stage`
 * is finer, because the customer's question is not only "which stage" but
 * "what is happening to my goods today": being packed, being counted off the
 * box in Dar, part paid. The headline is the fine stage's own words, so nobody
 * has to compose a sentence at the call site.
 *
 * It says nothing about money beyond "pending", "part paid", "being confirmed"
 * and "paid". The amounts belong behind a sign-in; see lib/tracking.ts for why.
 */

/** The six stages, in order. The keys are the drawn line's keys. */
export type BlueWaveStage =
  | "RECEIVED_IN_CHINA"
  | "STORED_IN_CHINA"
  | "IN_TRANSIT"
  | "ARRIVED_IN_DAR"
  | "READY_FOR_PICKUP"
  | "COLLECTED";

export const BLUEWAVE_STAGES: { key: BlueWaveStage; label: string; sw: string }[] = [
  { key: "RECEIVED_IN_CHINA", label: "Received in China", sw: "Umepokelewa China" },
  { key: "STORED_IN_CHINA", label: "Stored in China", sw: "Umehifadhiwa China" },
  { key: "IN_TRANSIT", label: "In transit", sw: "Uko safarini" },
  { key: "ARRIVED_IN_DAR", label: "Arrived in Dar es Salaam", sw: "Umefika Dar es Salaam" },
  { key: "READY_FOR_PICKUP", label: "Ready for pickup", sw: "Uko tayari kuchukuliwa" },
  { key: "COLLECTED", label: "Collected", sw: "Umechukuliwa" },
];

export const BLUEWAVE_STAGE_LABEL = Object.fromEntries(
  BLUEWAVE_STAGES.map((s) => [s.key, s.label])
) as Record<BlueWaveStage, string>;

/**
 * THE ONE PLACE A STORED STATUS BECOMES A BLUEWAVE STAGE.
 *
 * Null for a consignment that has not reached the Foshan counter, and for the
 * exits (cancelled).
 *
 * MISSING AT DAR READS AS ARRIVED IN DAR, WITH THE TROUBLE SAID PLAINLY.
 *
 * The owner's rule: pressing Arrived lands the box and everything on it, the
 * customer is told that day and the storage clock starts. A consignment that
 * then does not come off the container has NOT gone back to sea, and telling
 * its customer "in transit" a fortnight after we told them their goods had
 * arrived is the system contradicting its own letter. So the stage stands at
 * Arrived in Dar es Salaam and the journey carries the issue — "Being located"
 * — with a notice saying we are looking for them and will be in touch. The
 * status itself is untouched: MISSING_AT_DAR is still the operational fact,
 * release still refuses it, and lib/verification.ts still reads it as MISSING.
 *
 * `stageEvent` below keeps a missing consignment off the arrival letter; the
 * customer hears about it from a person, not from a template.
 *
 * READY_FOR_RELEASE is the status the release check's first yes writes; see
 * lib/cargo-events.ts. A screen that needs the live answer runs the check.
 */
export function bluewaveStageOf(status: CargoStatus): BlueWaveStage | null {
  switch (status) {
    case "REGISTERED":
    case "CANCELLED":
      return null;
    case "RECEIVED_CHINA":
      return "RECEIVED_IN_CHINA";
    case "ASSIGNED_TO_CONTAINER":
    case "CONTAINER_LOADED":
      return "STORED_IN_CHINA";
    case "DEPARTED_CHINA":
    case "IN_TRANSIT":
      return "IN_TRANSIT";
    /* The owner's rule: when the container is marked arrived in Dar, its goods
       have arrived — the customer is told and free storage starts that day.
       Dar's check-in counts them onto the floor; it does not move the date. */
    case "ARRIVED_TANZANIA":
    case "RECEIVED_DAR":
    case "MISSING_AT_DAR":
      return "ARRIVED_IN_DAR";
    case "READY_FOR_RELEASE":
      return "READY_FOR_PICKUP";
    case "COLLECTED":
    case "DELIVERED":
      return "COLLECTED";
  }
}

/** The drawn line's keys are the six stages. */
export type StageKey = BlueWaveStage;

/**
 * WHERE IT IS STANDING NOW, at the finer grain.
 *
 * Every one of these is read off a fact somebody recorded: a status, a
 * container's status, a frozen packing list, a receiving row, a draft, an
 * issued bill, verified money, the release check.
 */
export type StageCode =
  /** Nothing has reached the Foshan counter under this reference. */
  | "AWAITING_CHINA"
  /** Counted, measured and standing on the Foshan floor. */
  | "RECEIVED_CHINA"
  /** On a container's manifest, and the box is still open. */
  | "ASSIGNED"
  /** Sealed: the manifest is frozen and nothing more goes in. */
  | "PACKED"
  /** The box has left Foshan. */
  | "SHIPPED"
  | "AT_SEA"
  /** The vessel is in and the box discharged; our warehouse has not confirmed
      this consignment on its floor. Still in transit. */
  | "AT_DAR_PORT"
  /** Dar has it on the floor and has not signed the count off. */
  | "DAR_VERIFICATION"
  /** Counted in at Dar. Nothing priced yet. */
  | "RECEIVED_DAR"
  /** A price has been worked out and is waiting on the price list. */
  | "PRICING"
  /** A bill is out, and nothing has been claimed or verified against it. */
  | "PAYMENT_PENDING"
  /** The customer says they have paid; Finance has not checked it. */
  | "CONFIRMING_PAYMENT"
  /** Verified money has arrived, and it is not all of it. */
  | "PART_PAID"
  | "PAID"
  | "READY"
  | "COLLECTED"
  | "DELIVERED"
  | "CANCELLED";

/** Which of the six stages a fine stage belongs to. */
export function bluewaveStageOfCode(stage: StageCode): BlueWaveStage | null {
  switch (stage) {
    case "AWAITING_CHINA":
    case "CANCELLED":
      return null;
    case "RECEIVED_CHINA":
      return "RECEIVED_IN_CHINA";
    case "ASSIGNED":
    case "PACKED":
      return "STORED_IN_CHINA";
    case "SHIPPED":
    case "AT_SEA":
      return "IN_TRANSIT";
    case "READY":
      return "READY_FOR_PICKUP";
    case "COLLECTED":
    case "DELIVERED":
      return "COLLECTED";
    default:
      return "ARRIVED_IN_DAR";
  }
}

/**
 * SOMETHING IS WRONG WITH THESE BOXES, SAID IN WORDS A CUSTOMER MAY READ.
 *
 * The company's own vocabulary for these is a case file — a reference, a
 * department, a staff note, an evidence folder. None of that crosses. What
 * crosses is which KIND of trouble it is, so a customer whose goods arrived
 * broken is told so rather than vaguely "on hold", and one sentence saying
 * somebody will be in touch.
 */
export type IssueCode =
  /** On the manifest, not on the floor. */
  | "MISSING"
  /** Dar booked it in damaged, wet, or repacked. */
  | "DAMAGED"
  /** Dar's count did not match the manifest. */
  | "DISCREPANCY"
  /** A case is open on the consignment. */
  | "INVESTIGATING"
  /** A hold the warehouse put on for a reason that is not money. */
  | "HOLD";

export type PaymentState =
  | "NOT_BILLED"
  | "PENDING"
  | "PART_PAID"
  | "CONFIRMING"
  | "PAID";

export type JourneyStep = {
  key: StageKey;
  /** English — the page passes it through t(). */
  label: string;
  /** A few English words for a step that is not a bare fact. */
  detail: string | null;
  at: Date | null;
  /**
   * What `at` is the date OF — "Left China", "Arrived". A bare date under
   * "In transit" reads as the day it arrived.
   */
  atLabel: string;
  state: "done" | "current" | "upcoming";
};

export type Journey = {
  /** Where the boxes are standing now, at the owner's grain. */
  stage: StageCode;
  /** `stage`'s own words, or the trouble's. The page renders this as it is. */
  headline: string;
  tone: "neutral" | "progress" | "good" | "warn" | "bad";
  steps: JourneyStep[];
  /** Which of the six stages it is at. Null before Foshan and once cancelled. */
  current: BlueWaveStage | null;
  /** The stage expected next. Null once collected or cancelled. */
  next: BlueWaveStage | null;
  payment: PaymentState;
  /** Null while nothing is wrong. Never carries a case reference or a note. */
  issue: IssueCode | null;
  /** The release check said yes, or the goods have already gone. */
  ready: boolean;
  /** The promised arrival, only while the box has not arrived. */
  eta: Date | null;
  /** The promise has passed and the box is still at sea. */
  etaPassed: boolean;
  /** How far past that day, in words: "3 days late", "2 weeks late". */
  lateBy: string | null;
  lateBySw: string | null;
  /** Null while nothing stops the cargo moving. */
  notice: string | null;
};

export type JourneyInput = {
  status: CargoStatus;
  /** First time the cargo entered each status, from CargoStatusHistory. */
  stamps: Partial<Record<CargoStatus, Date>>;
  container: {
    status: ContainerStatus;
    departedAt: Date | null;
    arrivedAt: Date | null;
    eta: Date | null;
    /**
     * When the manifest froze. Sealing issues it without anybody pressing
     * anything, so this is also the honest answer to "is the box shut".
     */
    packingListAt: Date | null;
  } | null;
  billing: {
    /** When the first live (issued, not cancelled) invoice went out. Null: none yet. */
    issuedAt: Date | null;
    /** Verified payments do not yet cover the live invoices. */
    owes: boolean;
    /** The customer has told us about a payment Finance has not checked. */
    pendingClaim: boolean;
    /** Verified money has arrived against a live bill. */
    paidSome: boolean;
    /** A price is worked out and waiting to be confirmed. No bill exists yet. */
    drafted: boolean;
  };
  /** lib/release.ts said yes. */
  releasable: boolean;
  /** An operational hold, or an open case. */
  onHold: boolean;
  /** Dar has a receiving row for this consignment. */
  receivedAtDar: boolean;
  /**
   * When Dar confirmed the boxes on its floor — the receiving row's own time.
   * This is "Arrived in Dar", and the day the storage clock starts.
   */
  darReceivedAt?: Date | null;
  /** The day the container was marked arrived in Dar (Cargo.darArrivedAt). */
  darArrivedAt?: Date | null;
  /** Dar has a receiving row and has not signed the count off. */
  awaitingDarVerification: boolean;
  /** Dar booked the boxes in damaged, part damaged or wet. Repacked is not damage. */
  damaged: boolean;
  /** Dar's count or condition did not match what the manifest promised. */
  discrepancy: boolean;
  /** A case is open on this consignment. Never which case. */
  caseOpen: boolean;
  now: Date;
};

/* The physical chain, in order. A later status implies every earlier one — a
   consignment received in Dar was loaded in Foshan even if the history row
   for loading is missing from a migrated record. */
const RANK: Record<CargoStatus, number> = {
  REGISTERED: 0,
  RECEIVED_CHINA: 1,
  ASSIGNED_TO_CONTAINER: 2,
  CONTAINER_LOADED: 2,
  DEPARTED_CHINA: 3,
  IN_TRANSIT: 4,
  ARRIVED_TANZANIA: 5,
  /* Did not come off the container: it got as far as the box arriving, and no
     further. Never ranked as received. */
  MISSING_AT_DAR: 5,
  RECEIVED_DAR: 6,
  READY_FOR_RELEASE: 6,
  COLLECTED: 6,
  DELIVERED: 6,
  /* An exit, not a place. What it reached before is read from the stamps. */
  CANCELLED: 0,
};

const CONTAINER_RANK: Record<ContainerStatus, number> = {
  OPEN: 0,
  LOADING: 0,
  LOADED: 2,
  SEALED: 2,
  DEPARTED: 3,
  IN_TRANSIT: 4,
  ARRIVED: 5,
  CLOSED: 5,
};

function stampedRank(stamps: JourneyInput["stamps"]) {
  let best = 0;
  for (const [status, at] of Object.entries(stamps)) {
    if (!at) continue;
    const rank = RANK[status as CargoStatus];
    if (status !== "CANCELLED" && status !== "MISSING_AT_DAR" && rank > best) {
      best = rank;
    }
  }
  return best;
}

export function paymentState(billing: JourneyInput["billing"]): PaymentState {
  if (!billing.issuedAt) return "NOT_BILLED";
  if (!billing.owes) return "PAID";
  /* A claim Finance has not checked leads whatever else has landed: the
     customer's question is about the money they say they sent, and answering
     "part paid" to somebody waiting on a screenshot reads as a refusal. */
  if (billing.pendingClaim) return "CONFIRMING";
  return billing.paidSome ? "PART_PAID" : "PENDING";
}

/** What each stage is called on a customer's screen. English is the key. */
const STAGE_LABEL: Record<StageCode, string> = {
  AWAITING_CHINA: "Waiting for your goods in Foshan",
  RECEIVED_CHINA: "Received at our Foshan warehouse",
  ASSIGNED: "Assigned to a container in Foshan",
  PACKED: "Container packed and sealed in Foshan",
  SHIPPED: "Shipped from China",
  AT_SEA: "At sea",
  AT_DAR_PORT: "Arrived in Dar es Salaam — at our warehouse",
  DAR_VERIFICATION: "At our Dar es Salaam warehouse",
  RECEIVED_DAR: "At our Dar warehouse — invoice being prepared",
  PRICING: "At our Dar warehouse — price being confirmed",
  PAYMENT_PENDING: "At our Dar warehouse — payment required before pickup",
  CONFIRMING_PAYMENT: "At our Dar warehouse — confirming your payment",
  PART_PAID: "At our Dar warehouse — balance due before pickup",
  PAID: "At our Dar warehouse — paid, pickup note being prepared",
  READY: "Ready for pickup",
  COLLECTED: "Collected",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STAGE_TONE: Record<StageCode, Journey["tone"]> = {
  AWAITING_CHINA: "neutral",
  RECEIVED_CHINA: "progress",
  ASSIGNED: "progress",
  PACKED: "progress",
  SHIPPED: "progress",
  AT_SEA: "progress",
  AT_DAR_PORT: "progress",
  DAR_VERIFICATION: "progress",
  RECEIVED_DAR: "progress",
  PRICING: "progress",
  PAYMENT_PENDING: "warn",
  CONFIRMING_PAYMENT: "progress",
  PART_PAID: "warn",
  PAID: "progress",
  READY: "good",
  COLLECTED: "good",
  DELIVERED: "good",
  CANCELLED: "bad",
};

/** The trouble, named without naming the case. */
const ISSUE_HEADLINE: Record<IssueCode, string> = {
  MISSING: "Being located",
  DAMAGED: "Damage recorded",
  DISCREPANCY: "Checking the count",
  INVESTIGATING: "Under review",
  HOLD: "On hold",
};

const ISSUE_NOTICE: Record<IssueCode, string> = {
  MISSING: "Our team is checking this consignment and will contact you.",
  DAMAGED:
    "We recorded damage when we counted these goods in. Our team will contact you about it.",
  DISCREPANCY:
    "The count did not match our paperwork. We are checking it and will contact you.",
  INVESTIGATING:
    "We are looking into something on this consignment. Our team will be in touch.",
  HOLD: "We are checking something on this consignment. Our team will be in touch.",
};

/**
 * Which trouble to say, when there is more than one.
 *
 * Worst first, and "worst" is whatever changes the customer's day most: boxes
 * nobody can find, then boxes that arrived broken, then a count that does not
 * add up, then an open question, then a hold.
 */
function issueOf(input: JourneyInput): IssueCode | null {
  if (input.status === "MISSING_AT_DAR") return "MISSING";
  if (input.damaged) return "DAMAGED";
  if (input.discrepancy) return "DISCREPANCY";
  if (input.caseOpen) return "INVESTIGATING";
  if (input.onHold) return "HOLD";
  return null;
}

/**
 * WHERE IT IS STANDING, FROM THE FACTS AND NOTHING ELSE.
 *
 * Read top to bottom: the finished states first, then money — which only ever
 * speaks for goods already counted in at Dar — then the physical chain
 * backwards from the quay to the Foshan counter.
 */
function stageOf(
  input: JourneyInput,
  rank: number,
  payment: PaymentState,
  ready: boolean
): StageCode {
  const { status, container, billing } = input;

  if (status === "CANCELLED") return "CANCELLED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "COLLECTED") return "COLLECTED";
  if (ready) return "READY";

  if (rank >= 6 && input.receivedAtDar) {
    /* Booked in, not signed off. The clerk has the boxes and is still counting
       them against the sheet. */
    if (input.awaitingDarVerification) return "DAR_VERIFICATION";
    /* A bill can go out while the container is still at sea, but a customer
       watching a ship does not want "part paid" as the answer to where their
       goods are. Money speaks only once the boxes are on the Dar floor. */
    switch (payment) {
      case "PAID":
        return "PAID";
      case "PART_PAID":
        return "PART_PAID";
      case "CONFIRMING":
        return "CONFIRMING_PAYMENT";
      case "PENDING":
        return "PAYMENT_PENDING";
      case "NOT_BILLED":
        return billing.drafted ? "PRICING" : "RECEIVED_DAR";
    }
  }

  /* Off the vessel and not yet confirmed on our floor: still travelling, the
     last leg from the quay to our warehouse — which is also where a
     consignment nobody can find sits. */
  if (rank >= 5) return "AT_DAR_PORT";
  if (rank >= 4) return "AT_SEA";
  if (rank >= 3) return "SHIPPED";
  if (rank >= 2) {
    /* The seal is the fact, and sealing freezes the manifest without anybody
       pressing anything — so a frozen list means the box is shut even if the
       consignment row has not caught up with the bulk status change. */
    return container?.packingListAt || status === "CONTAINER_LOADED"
      ? "PACKED"
      : "ASSIGNED";
  }
  if (rank >= 1) return "RECEIVED_CHINA";
  return "AWAITING_CHINA";
}

export function publicJourney(input: JourneyInput): Journey {
  const { status, stamps, container, billing, now } = input;

  const handedOver = status === "COLLECTED" || status === "DELIVERED";
  const cancelled = status === "CANCELLED";

  /*
    HOW FAR IT PHYSICALLY GOT.

    The cargo's own status, or the container's when the container has moved on
    and the consignment row has not caught up yet — a box cannot be at sea
    while the cargo inside it is still on the Foshan floor. A cancelled
    consignment keeps what its history proves and nothing more.
  */
  const containerRank = !container || cancelled
    ? 0
    : Math.max(
        CONTAINER_RANK[container.status],
        container.departedAt ? 3 : 0,
        container.arrivedAt ? 5 : 0
      );
  let rank = Math.max(
    cancelled ? 0 : RANK[status],
    stampedRank(stamps),
    containerRank
  );
  /* The container arriving is not the consignment being received: only the
     cargo's own record can say it came off the box. A consignment now marked
     missing keeps no older stamp that claims otherwise — it stands where the
     box stands, at Dar, and goes no further until somebody finds it. */
  if (status === "MISSING_AT_DAR") rank = Math.min(rank, 5);

  const payment = paymentState(billing);
  const ready = !cancelled && (input.releasable || handedOver);
  const stage = stageOf(input, rank, payment, ready);
  const issue = cancelled ? null : issueOf(input);

  const departedAt =
    container?.departedAt ?? stamps.DEPARTED_CHINA ?? null;
  /* Arrived in Dar is the day the container was marked arrived — the owner's
     rule — or, for goods with no such day, the Dar check-in. A consignment
     reported missing did not arrive, whatever its box did. */
  const missing = status === "MISSING_AT_DAR";
  const arrivedAtDar = missing
    ? null
    : (input.darArrivedAt ?? stamps.ARRIVED_TANZANIA ?? input.darReceivedAt ?? stamps.RECEIVED_DAR ?? null);
  const atPort = false;

  const reached: Record<StageKey, boolean> = {
    RECEIVED_IN_CHINA: rank >= 1 || ready,
    STORED_IN_CHINA: rank >= 2 || ready,
    IN_TRANSIT: rank >= 3 || ready,
    /* THE BOX ARRIVED, SO THE LINE READS ARRIVED.
       The owner's rule again: a consignment that did not come off a container
       that landed has not gone back to sea, and its customer was told a
       fortnight ago that their goods had reached Dar. The step stands as
       reached with no date under it — we never print a day these particular
       boxes arrived — and the headline above says "Being located". */
    ARRIVED_IN_DAR: rank >= 5 || ready,
    READY_FOR_PICKUP: ready,
    COLLECTED: handedOver,
  };

  /* The line's date when it gave one, otherwise thirty-five days from
     departure — the lane's habit, and what the office tells customers. */
  const promised = expectedArrival(departedAt, container?.eta ?? null);
  const etaOpen = promised && !reached.ARRIVED_IN_DAR ? promised : null;
  /* Past its day and still not in Dar: the customer is told it is late rather
     than left reading a date that has gone by. */
  const delay = delayFor(etaOpen, now);
  const late = Boolean(delay);

  const arrivedDetail: Partial<Record<StageCode, string>> = {
    AT_DAR_PORT: "Your free storage days have started",
    DAR_VERIFICATION: "Your free storage days have started",
    PRICING: "Price being confirmed",
    RECEIVED_DAR: "Invoice being prepared",
    PAYMENT_PENDING: "Pay first, then collect",
    PART_PAID: "Balance due before pickup",
    CONFIRMING_PAYMENT: "Confirming your payment",
    PAID: "Paid — pickup note being prepared",
  };

  /*
    THE SIX STAGES A CUSTOMER FOLLOWS — the owner's list.

    What happens inside our walls between them — sealing the box, the quay,
    counting it against the sheet — is said in a few words under the stage it
    belongs to, never as a stage of its own.
  */
  const draft: Omit<JourneyStep, "state">[] = [
    {
      key: "RECEIVED_IN_CHINA",
      label: "Received in China",
      detail: null,
      at: stamps.RECEIVED_CHINA ?? null,
      atLabel: "Received",
    },
    {
      key: "STORED_IN_CHINA",
      label: "Stored in China",
      detail:
        stage === "PACKED"
          ? "Container packed and sealed"
          : stage === "ASSIGNED"
            ? "Assigned to a container"
            : null,
      at: stamps.ASSIGNED_TO_CONTAINER ?? stamps.CONTAINER_LOADED ?? null,
      atLabel: "Into a container",
    },
    {
      key: "IN_TRANSIT",
      label: "In transit",
      /* The expected day is printed by the page beside this step; only a date
         that has already gone by, or the last leg, needs words. */
      detail: delay ? `Delayed — ${delay.label}` : null,
      at: departedAt,
      atLabel: "Left China",
    },
    {
      key: "ARRIVED_IN_DAR",
      label: "Arrived in Dar es Salaam",
      /* Nothing about being checked in for goods nobody has found: the
         headline and the notice carry that, in the words a customer reads. */
      detail:
        !ready && reached.ARRIVED_IN_DAR && !missing
          ? (arrivedDetail[stage] ?? null)
          : null,
      at: arrivedAtDar,
      atLabel: "Arrived",
    },
    {
      key: "READY_FOR_PICKUP",
      label: "Ready for pickup",
      detail: ready && !handedOver ? "Bring your ID and pickup note" : null,
      at: stamps.READY_FOR_RELEASE ?? null,
      atLabel: "Ready",
    },
    {
      key: "COLLECTED",
      label: status === "DELIVERED" ? "Delivered" : "Collected",
      detail: null,
      at: stamps.DELIVERED ?? stamps.COLLECTED ?? null,
      atLabel: status === "DELIVERED" ? "Delivered" : "Collected",
    },
  ];

  /* The line is the goods' physical journey. Money is not a place — a bill
     can go out while the ship is at sea — so it is reported beside the line
     (payment), never as a station on it. */
  const lastReached = draft.reduce(
    (last, step, index) => (reached[step.key] ? index : last),
    -1
  );

  const steps: JourneyStep[] = draft.map((step, index) => ({
    ...step,
    state: reached[step.key]
      ? index === lastReached && !handedOver && !cancelled
        ? "current"
        : "done"
      : "upcoming",
  }));

  const current = cancelled
    ? null
    : handedOver
      ? "COLLECTED"
      : lastReached >= 0
        ? draft[lastReached].key
        : null;
  const next =
    cancelled || handedOver
      ? null
      : (draft[lastReached + 1]?.key ?? null);

  /*
    WHAT THE BADGE SAYS.

    The stage, unless something is wrong AND the wrong thing still stands
    between the customer and their goods. Damage recorded on boxes the release
    check has already passed is a conversation, not a barrier: that customer
    reads "Ready for pickup" with the damage in the notice under it, rather
    than being sent away by a badge.
  */
  const blocking = issue !== null && !ready && !handedOver;
  const headline = blocking
    ? ISSUE_HEADLINE[issue]
    : /* A box past its expected day says so itself: the customer should not
         have to work out that the date printed beside it has gone by. */
      late && (stage === "AT_SEA" || stage === "SHIPPED")
      ? `Delayed at sea — ${delay!.label}`
      : STAGE_LABEL[stage];

  const notice = cancelled
    ? "This consignment was cancelled. Contact us if that is not what you expected."
    : issue !== null
      ? ISSUE_NOTICE[issue]
      : null;

  return {
    stage,
    headline,
    current,
    next,
    tone: cancelled
      ? "bad"
      : issue !== null && !handedOver
        ? "warn"
        : STAGE_TONE[stage],
    steps,
    payment,
    issue,
    ready,
    eta: etaOpen,
    etaPassed: late,
    lateBy: delay?.label ?? null,
    lateBySw: delay?.labelSw ?? null,
    notice,
  };
}
