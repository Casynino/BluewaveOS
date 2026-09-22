"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import {
  advanceContainer,
  loadCargo,
  putOnArrivedContainer,
  putOnSailedContainer,
  takeOffArrivedContainer,
  type ActionState,
} from "@/lib/actions/containers";
import { reportMissingAtDar } from "@/lib/actions/dar";

/**
 * CLOSING A SAILING ASKS ABOUT WHAT IS LEFT ON IT.
 *
 * A closed container is finished with: nothing more goes on it, nothing more
 * comes off it, and it leaves the receiving dock — which is the only screen
 * that lists what came off the box. So a consignment nobody has checked in and
 * nobody has reported missing cannot simply be left there. It would be stranded
 * in "arrived" with no list left to find it on, and the first person to notice
 * would be its customer.
 *
 * The old answer was a refusal: "check in or report missing BW0001 before
 * closing", and then the closer went and found another screen. The owner's
 * answer is to put the question where the decision is made. For each
 * consignment still unaccounted for, the person closing the box says one of
 * three things:
 *
 *   MOVE IT — it is really on another sailing. It moves exactly as it is:
 *   same reference, same code, same measurements, same photographs, same
 *   history, same bill if it has one. Nothing is recreated.
 *
 *   REPORT IT MISSING — it was on the list and never came off. Its case opens,
 *   its row stays on this container reading Missing, and the box's counts come
 *   down, because those goods are not in it.
 *
 *   LEAVE IT — then the box does not close. Answering "leave" is how the
 *   closer backs out, and nothing at all happens.
 *
 * NOTHING IS REIMPLEMENTED HERE. Each disposal is the action that desk already
 * uses, called as this user — the take-off and put-on pair for the stage the
 * destination box is at, and Dar's own missing report. Each one is atomic in
 * itself, writes its own FieldChange, ContainerEvent, case and audit line, and
 * redraws whatever packing list it already redraws. The container is closed
 * only when every one of them has succeeded; if one refuses, the box stays
 * open and the message says which consignment and why.
 *
 * THE STORAGE CLOCK FOLLOWS THE GOODS.
 *   · Moved to a container that has landed: it arrived when that box did, and
 *     takes that box's arrival day (putOnArrivedContainer).
 *   · Moved to one still in China or at sea: it is not in Dar at all, so the
 *     clock stops — `darArrivedAt` is cleared by the take-off, and the
 *     consignment stands where its new box stands.
 */
export type CloseState = ActionState & {
  /** Consignments the closer still has to answer for, by reference. */
  outstanding?: string[];
};

/** An answer that does something. Anything else leaves the box open. */
type Answered = { kind: "missing" } | { kind: "move"; containerId: string };

/** What a row's answer can be. Anything else is "not answered". */
type Outcome = Answered | { kind: "leave" };

function readOutcome(raw: string): Outcome | null {
  if (raw === "missing") return { kind: "missing" };
  if (raw === "leave") return { kind: "leave" };
  if (raw.startsWith("move:")) {
    const containerId = raw.slice("move:".length);
    return containerId ? { kind: "move", containerId } : null;
  }
  return null;
}

export async function closeContainer(
  _prev: CloseState,
  formData: FormData
): Promise<CloseState> {
  /*
    Answered rather than thrown, for the reason advanceContainer gives: a
    permission read live can say no to a page that was rendered when it said
    yes, and that is a sentence to read, not an error page.
  */
  let actor;
  try {
    actor = await authorize("container.close");
  } catch {
    return {
      error:
        "Closing a container is Finance's, the manager's and the owner's. Dar counts the boxes off.",
    };
  }

  const containerId = String(formData.get("containerId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);

  const container = await prisma.container.findFirst({
    where: { id: containerId, deletedAt: null },
    select: { id: true, reference: true, status: true },
  });
  if (!container) return { error: "That container no longer exists." };
  if (container.status === "CLOSED") {
    return { ok: `${container.reference} is already closed.` };
  }

  /* The same question the close has always asked: who has said nothing about
     these boxes at all. Counted and missing are both answers. */
  const outstanding = await prisma.cargo.findMany({
    where: {
      containerLines: { some: { containerId: container.id } },
      deletedAt: null,
      darReceiving: null,
      status: { not: "MISSING_AT_DAR" },
    },
    select: { id: true, reference: true },
    orderBy: { reference: "asc" },
  });

  /* The milestone form, built here rather than passed through: the close is
     the same one press it has always been, and this action is the only caller
     that knows the answers came with it. */
  const closeForm = () => {
    const data = new FormData();
    data.append("containerId", container.id);
    data.append("to", "CLOSED");
    return data;
  };

  if (outstanding.length === 0) {
    const closed = await advanceContainer({}, closeForm());
    return closed.ok
      ? { ok: `${container.reference} is closed. Nothing more can happen to it.` }
      : closed;
  }

  if (reason.length < 3) {
    return {
      error: `Say why ${container.reference} is being closed with cargo still open on it.`,
      outstanding: outstanding.map((c) => c.reference),
    };
  }

  /* Every row is answered before anything happens to any of them. Half a
     decision taken and half refused is worse than a refusal. */
  const decisions: { cargoId: string; reference: string; outcome: Answered }[] = [];
  const unanswered: string[] = [];
  for (const cargo of outstanding) {
    const outcome = readOutcome(String(formData.get(`outcome:${cargo.id}`) ?? ""));
    if (!outcome || outcome.kind === "leave") {
      unanswered.push(cargo.reference);
      continue;
    }
    decisions.push({ cargoId: cargo.id, reference: cargo.reference, outcome });
  }
  if (unanswered.length > 0) {
    return {
      error: `${container.reference} stays open: say where ${unanswered.join(", ")} went, or report it missing.`,
      outstanding: unanswered,
    };
  }

  const destinations = await prisma.container.findMany({
    where: {
      id: {
        in: decisions
          .filter((d) => d.outcome.kind === "move")
          .map((d) => (d.outcome as { containerId: string }).containerId),
      },
      deletedAt: null,
    },
    select: { id: true, reference: true, status: true },
  });
  const destinationOf = new Map(destinations.map((c) => [c.id, c]));

  const moved: string[] = [];
  const reportedMissing: string[] = [];

  for (const decision of decisions) {
    const field = (fields: Record<string, string>) => {
      const data = new FormData();
      for (const [key, value] of Object.entries(fields)) data.append(key, value);
      return data;
    };
    const note = `${reason} (recorded while closing ${container.reference})`;

    if (decision.outcome.kind === "missing") {
      const res = await reportMissingAtDar(
        {},
        field({ cargoId: decision.cargoId, note })
      );
      if (res.error) {
        return {
          error: `${container.reference} was not closed — ${decision.reference}: ${res.error}`,
        };
      }
      reportedMissing.push(decision.reference);
      continue;
    }

    const to = destinationOf.get(decision.outcome.containerId);
    if (!to) {
      return {
        error: `${container.reference} was not closed — the container chosen for ${decision.reference} no longer exists.`,
      };
    }
    if (to.id === container.id) {
      return {
        error: `${decision.reference} is already on ${container.reference}. Check it in or report it missing.`,
      };
    }

    /*
      THE SAME PAIR THE FLOOR USES, FOR THE STAGE THE OTHER BOX IS AT.

      A landed box takes the consignment directly — putOnArrivedContainer moves
      it off this manifest itself and gives it that box's arrival day. A box
      still in China or at sea will not take cargo that is standing on another
      live container, so it comes off this one first: that take-off puts it back
      on the Foshan floor and stops its storage clock, which is the truth about
      goods that are not in Dar.
    */
    if (to.status === "ARRIVED") {
      const res = await putOnArrivedContainer(
        {},
        field({ containerId: to.id, cargoId: decision.cargoId, reason: note })
      );
      if (res.error) {
        return {
          error: `${container.reference} was not closed — ${decision.reference} did not go on ${to.reference}: ${res.error}`,
        };
      }
      moved.push(`${decision.reference} → ${to.reference}`);
      continue;
    }

    const off = await takeOffArrivedContainer(
      {},
      field({ containerId: container.id, cargoId: decision.cargoId, reason: note })
    );
    if (off.error) {
      return {
        error: `${container.reference} was not closed — ${decision.reference} could not come off it: ${off.error}`,
      };
    }

    const onward =
      to.status === "OPEN" || to.status === "LOADING"
        ? await loadCargo({}, field({ containerId: to.id, cargoIds: decision.cargoId }))
        : await putOnSailedContainer(
            {},
            field({ containerId: to.id, cargoId: decision.cargoId, reason: note })
          );
    if (onward.error) {
      /* It is off this box and on no other. The take-off opened a case saying
         exactly that, so it is on a list somebody reads rather than lost. */
      return {
        error: `${decision.reference} is off ${container.reference} and did not go on ${to.reference}: ${onward.error}. It is on the Foshan floor with a case open on it, and ${container.reference} is still open.`,
      };
    }
    moved.push(`${decision.reference} → ${to.reference}`);
  }

  const closed = await advanceContainer({}, closeForm());
  if (closed.error) return { error: closed.error };

  /* The decisions, in one line, beside the close's own audit row. Each
     disposal has written its own; this is the record of them being made
     together, by this person, at the moment the box was shut. */
  await recordAudit({
    actor,
    action: "container.close.decisions",
    entity: "Container",
    entityId: container.id,
    summary: `${container.reference} closed with ${decisions.length} consignment(s) answered for — ${moved.length} moved, ${reportedMissing.length} reported missing`,
    metadata: { reason, moved, missing: reportedMissing },
  });

  revalidatePath(`/app/containers/${container.id}`);
  revalidatePath("/app/containers");
  revalidatePath("/app/containers/arrived");
  revalidatePath("/app/containers/closed");
  revalidatePath("/app/receive/dar");

  return {
    ok: [
      `${container.reference} is closed.`,
      moved.length ? `Moved: ${moved.join(", ")}.` : "",
      reportedMissing.length
        ? `Reported missing: ${reportedMissing.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
