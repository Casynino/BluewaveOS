import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  publicJourney,
  type JourneyInput,
  type StageKey,
} from "@/lib/tracking-stage";

const NOW = new Date("2026-09-17T10:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/* A consignment that has reached the Dar floor has a receiving row; one that
   has not, has not. Saying so at every call site would bury the rule each test
   is actually about, so the fixture follows the status unless a test overrides
   it — which is exactly what the check-in actions do. */
const ON_THE_DAR_FLOOR: JourneyInput["status"][] = [
  "RECEIVED_DAR",
  "READY_FOR_RELEASE",
  "COLLECTED",
  "DELIVERED",
];

function input(over: Partial<JourneyInput> = {}): JourneyInput {
  const status = over.status ?? "REGISTERED";
  return {
    status,
    stamps: {},
    container: null,
    billing: {
      issuedAt: null,
      owes: false,
      pendingClaim: false,
      paidSome: false,
      drafted: false,
    },
    releasable: false,
    onHold: false,
    receivedAtDar: ON_THE_DAR_FLOOR.includes(status),
    awaitingDarVerification: false,
    damaged: false,
    discrepancy: false,
    caseOpen: false,
    now: NOW,
    ...over,
  };
}

const box = (
  over: Partial<NonNullable<JourneyInput["container"]>> = {}
): NonNullable<JourneyInput["container"]> => ({
  status: "OPEN",
  departedAt: null,
  arrivedAt: null,
  eta: null,
  packingListAt: null,
  ...over,
});

const state = (j: ReturnType<typeof publicJourney>, key: StageKey) =>
  j.steps.find((s) => s.key === key)!.state;

const detail = (j: ReturnType<typeof publicJourney>, key: StageKey) =>
  j.steps.find((s) => s.key === key)!.detail;

describe("public journey", () => {
  test("nothing received yet: every step upcoming", () => {
    const j = publicJourney(input());
    assert.equal(j.stage, "AWAITING_CHINA");
    assert.equal(j.headline, "Waiting for your goods in Foshan");
    assert.ok(j.steps.every((s) => s.state === "upcoming"));
    assert.equal(j.payment, "NOT_BILLED");
    assert.equal(j.issue, null);
    assert.equal(j.ready, false);
  });

  test("received in China is the current step, stamped from history", () => {
    const j = publicJourney(
      input({ status: "RECEIVED_CHINA", stamps: { RECEIVED_CHINA: day(-3) } })
    );
    assert.equal(j.stage, "RECEIVED_CHINA");
    assert.equal(j.headline, "Received at our Foshan warehouse");
    assert.equal(state(j, "RECEIVED_IN_CHINA"), "current");
    assert.equal(state(j, "STORED_IN_CHINA"), "upcoming");
    assert.equal(state(j, "IN_TRANSIT"), "upcoming");
    assert.deepEqual(j.steps[0].at, day(-3));
    assert.equal(j.current, "RECEIVED_IN_CHINA");
    assert.equal(j.next, "STORED_IN_CHINA");
    assert.equal(detail(j, "RECEIVED_IN_CHINA"), null, "the date says it; no sentence");
  });

  test("on a manifest with the box still open: assigned, being packed", () => {
    const j = publicJourney(
      input({
        status: "ASSIGNED_TO_CONTAINER",
        stamps: { RECEIVED_CHINA: day(-8), ASSIGNED_TO_CONTAINER: day(-2) },
        container: box({ status: "LOADING" }),
      })
    );
    assert.equal(j.stage, "ASSIGNED");
    assert.equal(j.headline, "Assigned to a container in Foshan");
    /* In a container in Foshan is the second BlueWave stage: stored in China. */
    assert.equal(state(j, "RECEIVED_IN_CHINA"), "done");
    assert.equal(state(j, "STORED_IN_CHINA"), "current");
    assert.equal(detail(j, "STORED_IN_CHINA"), "Assigned to a container");
    assert.deepEqual(j.steps[1].at, day(-2));
  });

  test("a frozen packing list means the box is shut", () => {
    const j = publicJourney(
      input({
        /* The consignment row has not caught up with the bulk move the seal
           makes; the manifest has. The manifest wins. */
        status: "ASSIGNED_TO_CONTAINER",
        stamps: { ASSIGNED_TO_CONTAINER: day(-2) },
        container: box({ status: "SEALED", packingListAt: day(-1) }),
      })
    );
    assert.equal(j.stage, "PACKED");
    assert.equal(j.headline, "Container packed and sealed in Foshan");
    assert.equal(state(j, "STORED_IN_CHINA"), "current", "sealed is still in Foshan");
    assert.equal(state(j, "IN_TRANSIT"), "upcoming");
  });

  test("sealed with no list yet is still packed, by the cargo's own status", () => {
    const j = publicJourney(
      input({
        status: "CONTAINER_LOADED",
        container: box({ status: "SEALED" }),
      })
    );
    assert.equal(j.stage, "PACKED");
  });

  test("departed China is shipped, before any transit row exists", () => {
    const j = publicJourney(
      input({
        status: "DEPARTED_CHINA",
        container: box({ status: "DEPARTED", departedAt: day(-1), eta: day(27) }),
      })
    );
    assert.equal(j.stage, "SHIPPED");
    assert.equal(j.headline, "Shipped from China");
    /* Departing is going to sea: one step, "In transit". */
    assert.equal(state(j, "IN_TRANSIT"), "current");
    assert.deepEqual(j.steps.find((s) => s.key === "IN_TRANSIT")!.at, day(-1), "the day it left");
  });

  test("at sea shows the ETA and not an arrival", () => {
    const j = publicJourney(
      input({
        status: "IN_TRANSIT",
        container: box({ status: "IN_TRANSIT", departedAt: day(-10), eta: day(18) }),
      })
    );
    assert.equal(j.stage, "AT_SEA");
    assert.equal(j.headline, "At sea");
    assert.equal(state(j, "IN_TRANSIT"), "current");
    assert.equal(state(j, "ARRIVED_IN_DAR"), "upcoming");
    assert.equal(j.next, "ARRIVED_IN_DAR");
    assert.deepEqual(j.eta, day(18));
    assert.equal(j.etaPassed, false);
    /* Received and stored are implied even with no history row for them. */
    assert.equal(state(j, "RECEIVED_IN_CHINA"), "done");
    assert.equal(state(j, "STORED_IN_CHINA"), "done");
  });

  test("a passed ETA is admitted rather than shown as a date in the past", () => {
    const j = publicJourney(
      input({
        status: "IN_TRANSIT",
        container: box({ status: "IN_TRANSIT", departedAt: day(-40), eta: day(-2) }),
      })
    );
    assert.equal(j.etaPassed, true);
    assert.match(detail(j, "IN_TRANSIT") ?? "", /Delayed/);
    assert.equal(j.headline, "Delayed at sea — later than expected");
  });

  test("no ETA from the line means thirty days from departure, and late after it", () => {
    const onTime = publicJourney(
      input({ status: "IN_TRANSIT", container: box({ status: "IN_TRANSIT", departedAt: day(-10), eta: null }) })
    );
    assert.equal(onTime.etaPassed, false, "ten days out is not late");
    assert.ok(onTime.eta, "the lane's thirty days stand in for a promise nobody made");

    const late = publicJourney(
      input({ status: "IN_TRANSIT", container: box({ status: "IN_TRANSIT", departedAt: day(-31), eta: null }) })
    );
    assert.equal(late.etaPassed, true, "day thirty-one is late");
    assert.equal(late.headline, "Delayed at sea — later than expected");
  });

  test("the container moving ahead of the cargo row still moves the customer's view", () => {
    const j = publicJourney(
      input({
        status: "CONTAINER_LOADED",
        container: box({ status: "DEPARTED", departedAt: day(-1), eta: day(28) }),
      })
    );
    assert.equal(j.stage, "SHIPPED");
  });

  test("a container marked arrived means the goods have arrived in Dar, being checked in", () => {
    const j = publicJourney(
      input({
        status: "ARRIVED_TANZANIA",
        container: box({
          status: "ARRIVED",
          departedAt: day(-30),
          arrivedAt: day(-1),
          eta: day(-2),
        }),
      })
    );
    assert.equal(j.stage, "AT_DAR_PORT");
    assert.equal(j.headline, "Arrived in Dar es Salaam — being checked in at our warehouse");
    assert.equal(j.current, "ARRIVED_IN_DAR");
    assert.equal(state(j, "IN_TRANSIT"), "done");
    assert.equal(state(j, "ARRIVED_IN_DAR"), "current");
    assert.equal(j.eta, null, "no ETA once the ship is in");
  });

  test("booked in but not signed off is under verification, not received", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        stamps: { RECEIVED_DAR: day(0) },
        receivedAtDar: true,
        awaitingDarVerification: true,
      })
    );
    assert.equal(j.stage, "DAR_VERIFICATION");
    assert.equal(j.headline, "Arrived in Dar — being checked in");
    assert.equal(state(j, "ARRIVED_IN_DAR"), "current");
    assert.equal(detail(j, "ARRIVED_IN_DAR"), "Being checked in");
  });

  test("a price waiting on the list is not a bill", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: null,
          owes: false,
          pendingClaim: false,
          paidSome: false,
          drafted: true,
        },
      })
    );
    assert.equal(j.stage, "PRICING");
    assert.equal(j.headline, "At our Dar warehouse — price being confirmed");
    assert.equal(j.payment, "NOT_BILLED", "a draft is owed by nobody");
  });

  test("received at Dar with an unpaid bill says payment pending, no amount", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-1),
          owes: true,
          pendingClaim: false,
          paidSome: false,
          drafted: false,
        },
      })
    );
    assert.equal(j.stage, "PAYMENT_PENDING");
    assert.equal(j.headline, "At our Dar warehouse — payment required before pickup");
    assert.equal(j.payment, "PENDING");
    /* Ticked, never the "you are here" marker: that is where the goods are. */
    const text = [j.headline, j.notice, ...j.steps.flatMap((s) => [s.label, s.detail])].join(" ");
    assert.ok(!/\d/.test(text), "no figures in anything a stranger reads");
  });

  test("verified money that does not cover the bill is part paid", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-4),
          owes: true,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
      })
    );
    assert.equal(j.stage, "PART_PAID");
    assert.equal(j.payment, "PART_PAID");
    assert.equal(j.headline, "At our Dar warehouse — balance due before pickup");
  });

  test("a claimed payment is being confirmed, not paid, and outranks part paid", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-1),
          owes: true,
          pendingClaim: true,
          paidSome: true,
          drafted: false,
        },
      })
    );
    assert.equal(j.payment, "CONFIRMING");
    assert.equal(j.stage, "CONFIRMING_PAYMENT");
    assert.notEqual(j.headline, "Ready for pickup");
  });

  test("paid but not yet released is paid, not ready", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-2),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        releasable: false,
      })
    );
    assert.equal(j.stage, "PAID");
    assert.equal(j.payment, "PAID");
    assert.equal(j.ready, false);
    assert.equal(state(j, "COLLECTED"), "upcoming");
    assert.equal(state(j, "READY_FOR_PICKUP"), "upcoming", "paid is not ready");
  });

  test("arrived with the bill unpaid says pay first, then collect", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        receivedAtDar: true,
        darReceivedAt: day(-1),
        billing: { issuedAt: day(-9), owes: true, pendingClaim: false, paidSome: false, drafted: false },
      })
    );
    assert.equal(j.stage, "PAYMENT_PENDING");
    assert.equal(j.headline, "At our Dar warehouse — payment required before pickup");
    assert.equal(state(j, "ARRIVED_IN_DAR"), "current");
    assert.equal(detail(j, "ARRIVED_IN_DAR"), "Pay first, then collect");
    assert.deepEqual(j.steps.find((s) => s.key === "ARRIVED_IN_DAR")!.at, day(-1), "the check-in is the arrival");
    assert.equal(j.next, "READY_FOR_PICKUP");
  });

  test("no step, label or detail anywhere speaks of clearance", () => {
    const statuses = [
      "REGISTERED", "RECEIVED_CHINA", "ASSIGNED_TO_CONTAINER", "CONTAINER_LOADED", "DEPARTED_CHINA",
      "IN_TRANSIT", "ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE", "COLLECTED",
      "DELIVERED", "MISSING_AT_DAR", "CANCELLED",
    ] as const;
    for (const status of statuses) {
      for (const releasable of [false, true]) {
        const j = publicJourney(input({ status, releasable }));
        const text = [j.headline, j.notice, ...j.steps.flatMap((s) => [s.label, s.detail, s.atLabel])].join(" ");
        assert.ok(!/clear|customs/i.test(text), `${status}: ${text}`);
        assert.deepEqual(
          j.steps.map((s) => s.key),
          ["RECEIVED_IN_CHINA", "STORED_IN_CHINA", "IN_TRANSIT", "ARRIVED_IN_DAR", "READY_FOR_PICKUP", "COLLECTED"]
        );
      }
    }
  });

  test("received and not yet billed", () => {
    const j = publicJourney(input({ status: "RECEIVED_DAR" }));
    assert.equal(j.stage, "RECEIVED_DAR");
    assert.equal(j.headline, "At our Dar warehouse — invoice being prepared");
  });

  test("money says nothing about place while the boxes are still at sea", () => {
    /* A bill can go out before the vessel is in. Somebody asking where their
       goods are is not asking about the bill. */
    const j = publicJourney(
      input({
        status: "IN_TRANSIT",
        container: box({ status: "IN_TRANSIT", departedAt: day(-9), eta: day(19) }),
        billing: {
          issuedAt: day(-3),
          owes: true,
          pendingClaim: false,
          paidSome: false,
          drafted: false,
        },
      })
    );
    assert.equal(j.stage, "AT_SEA");
    assert.equal(j.payment, "PENDING", "the bill is still reported, just not as a place");
    assert.equal(state(j, "IN_TRANSIT"), "current");
  });

  test("checked in at Dar with no container on record", () => {
    /* Cargo that was already on the Dar floor when the system started: one
       history row, no sailing. The earlier steps are implied by being received,
       and none of them is given a date nobody recorded. */
    const j = publicJourney(
      input({ status: "RECEIVED_DAR", stamps: { RECEIVED_DAR: day(-1) } })
    );
    for (const key of ["RECEIVED_IN_CHINA", "STORED_IN_CHINA", "IN_TRANSIT"] as StageKey[]) {
      assert.equal(state(j, key), "done", key);
      assert.equal(j.steps.find((s) => s.key === key)!.at, null, key);
    }
    assert.equal(state(j, "ARRIVED_IN_DAR"), "current");
    assert.deepEqual(j.steps.find((s) => s.key === "ARRIVED_IN_DAR")!.at, day(-1));
    assert.equal(state(j, "COLLECTED"), "upcoming");
    assert.equal(j.eta, null);
  });

  test("ready is only what the release check says", () => {
    const paidButNotReleasable = publicJourney(
      input({
        status: "READY_FOR_RELEASE",
        billing: {
          issuedAt: day(-2),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        releasable: false,
      })
    );
    assert.notEqual(paidButNotReleasable.headline, "Ready for pickup");
    assert.equal(paidButNotReleasable.ready, false);
    assert.equal(state(paidButNotReleasable, "READY_FOR_PICKUP"), "upcoming");

    const releasable = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-2),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        releasable: true,
      })
    );
    assert.equal(releasable.stage, "READY");
    assert.equal(releasable.headline, "Ready for pickup");
    assert.equal(releasable.ready, true);
    assert.equal(state(releasable, "READY_FOR_PICKUP"), "current");
    assert.equal(state(releasable, "ARRIVED_IN_DAR"), "done");
    assert.equal(detail(releasable, "READY_FOR_PICKUP"), "Bring your ID and pickup note");
  });

  test("a hold outranks progress and never says why", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-2),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        onHold: true,
      })
    );
    assert.equal(j.issue, "HOLD");
    assert.equal(j.headline, "On hold");
    assert.equal(j.tone, "warn");
    assert.ok(j.notice);
  });

  test("damage is named as damage, not as a vague hold", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        damaged: true,
        discrepancy: true,
        caseOpen: true,
      })
    );
    assert.equal(j.issue, "DAMAGED", "the worst true thing leads");
    assert.equal(j.headline, "Damage recorded");
    assert.match(j.notice ?? "", /damage/i);
  });

  test("a short count is a count question, and an open case is a review", () => {
    const short = publicJourney(
      input({ status: "RECEIVED_DAR", discrepancy: true, caseOpen: true })
    );
    assert.equal(short.issue, "DISCREPANCY");
    assert.equal(short.headline, "Checking the count");

    const review = publicJourney(input({ status: "RECEIVED_DAR", caseOpen: true }));
    assert.equal(review.issue, "INVESTIGATING");
    assert.equal(review.headline, "Under review");
  });

  test("the case's own words never cross", () => {
    for (const over of [
      { caseOpen: true },
      { discrepancy: true },
      { damaged: true },
      { onHold: true },
      { status: "MISSING_AT_DAR" as const },
    ]) {
      const j = publicJourney(input({ status: "RECEIVED_DAR", ...over }));
      const text = `${j.headline} ${j.notice ?? ""}`;
      assert.ok(!/EXC-|\bcase\b|investigat/i.test(text), text);
      assert.ok(!/\d/.test(text), text);
    }
  });

  test("damage on boxes already ready to go does not send the customer away", () => {
    const j = publicJourney(
      input({
        status: "RECEIVED_DAR",
        billing: {
          issuedAt: day(-3),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        releasable: true,
        damaged: true,
      })
    );
    assert.equal(j.stage, "READY");
    assert.equal(j.headline, "Ready for pickup");
    assert.equal(j.issue, "DAMAGED", "still said, in the notice under it");
    assert.match(j.notice ?? "", /damage/i);
  });

  test("missing at Dar is being located, never received", () => {
    const j = publicJourney(
      input({
        status: "MISSING_AT_DAR",
        stamps: { RECEIVED_CHINA: day(-40) },
        container: box({
          status: "ARRIVED",
          departedAt: day(-30),
          arrivedAt: day(-2),
          eta: day(-3),
        }),
      })
    );
    assert.equal(j.issue, "MISSING");
    assert.equal(j.stage, "AT_DAR_PORT");
    assert.equal(j.headline, "Being located");
    /* The box landed; these goods were not on it. The step saying they arrived
       is not claimed — the marker stays on the last thing that is true. */
    assert.equal(state(j, "IN_TRANSIT"), "current");
    assert.equal(state(j, "ARRIVED_IN_DAR"), "upcoming");
  });

  test("collected and delivered close every step", () => {
    const collected = publicJourney(
      input({
        status: "COLLECTED",
        billing: {
          issuedAt: day(-5),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
        stamps: { COLLECTED: day(-1) },
      })
    );
    assert.equal(collected.stage, "COLLECTED");
    assert.equal(collected.headline, "Collected");
    assert.ok(collected.steps.every((s) => s.state === "done"));

    const delivered = publicJourney(
      input({
        status: "DELIVERED",
        billing: {
          issuedAt: day(-5),
          owes: false,
          pendingClaim: false,
          paidSome: true,
          drafted: false,
        },
      })
    );
    assert.equal(delivered.stage, "DELIVERED");
    assert.equal(delivered.steps.at(-1)!.label, "Delivered");
  });

  test("cancelled keeps what history proves and nothing current", () => {
    const j = publicJourney(
      input({ status: "CANCELLED", stamps: { RECEIVED_CHINA: day(-3) } })
    );
    assert.equal(j.stage, "CANCELLED");
    assert.equal(j.headline, "Cancelled");
    assert.equal(j.tone, "bad");
    assert.equal(j.issue, null, "a cancelled consignment is not also a case");
    assert.equal(state(j, "RECEIVED_IN_CHINA"), "done");
    assert.equal(state(j, "IN_TRANSIT"), "upcoming");
    assert.ok(!j.steps.some((s) => s.state === "current"));
    assert.equal(j.current, null);
    assert.equal(j.next, null);
  });
});
