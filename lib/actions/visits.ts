"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit, recordFieldChange } from "@/lib/audit";
import { VISIT_STATUS_LABEL } from "@/lib/china-content";
import { generatePublicKey, nextVisitReference } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { normaliseAnyPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { screenPublicRequest, statusKeyFor } from "@/lib/public-guard";
import { can } from "@/lib/rbac";
import { authorize, currentUser, type SessionUser } from "@/lib/session";

export type VisitState = { error?: string; ok?: string; reference?: string; statusHref?: string };

/*
  BUSINESS VISITS: A REQUEST, NEVER A BOOKING.

  A visitor asks for help planning a trip to China's markets and factories. What
  lands is REQUESTED; nothing is confirmed until somebody on the desk has spoken
  to them and moved it to CONFIRMED with the plan written down. The visitor
  gets a status link carrying a random key, so their reference alone — which
  runs in sequence — opens nobody's trip.
*/

const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;

const list = (max: number) =>
  z
    .array(z.string().trim().min(1).max(120))
    .max(max)
    .transform((values) => [...new Set(values)]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const date = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "That is not a date.");

const requestSchema = z
  .object({
    contactName: z.string().trim().min(2, "Your name, please.").max(120),
    contactPhone: z
      .string()
      .trim()
      .max(40)
      .transform(normaliseAnyPhone)
      .refine((v) => /^\+?\d{9,15}$/.test(v), "Enter a phone number we can call, with the country code if outside Tanzania."),
    whatsapp: optionalText(40),
    contactEmail: z.string().trim().toLowerCase().max(200).email("That is not an email address.").optional().or(z.literal("")),
    travelFrom: date,
    travelTo: date,
    flexibleDates: z.boolean(),
    cities: list(10),
    markets: list(20),
    factories: list(20),
    categories: list(20),
    travelers: z.coerce.number().int("Use a whole number.").min(1, "At least one person.").max(50, "For a group over 50, call us."),
    language: optionalText(80),
    wantsHotelHelp: z.boolean(),
    wantsTransportHelp: z.boolean(),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    const today = Date.now() - 24 * 60 * 60 * 1000;
    if (v.travelFrom && v.travelFrom.getTime() < today) {
      ctx.addIssue({ code: "custom", message: "Choose travel dates from today onwards.", path: ["travelFrom"] });
    }
    if (v.travelFrom && v.travelTo && v.travelTo < v.travelFrom) {
      ctx.addIssue({ code: "custom", message: "The return date is before the arrival date.", path: ["travelTo"] });
    }
    if (!v.travelFrom && !v.flexibleDates) {
      ctx.addIssue({ code: "custom", message: "Give your travel dates, or tick that you are flexible.", path: ["travelFrom"] });
    }
    if (v.cities.length === 0 && v.markets.length === 0 && v.categories.length === 0) {
      ctx.addIssue({ code: "custom", message: "Tell us where you want to go or what you want to buy.", path: ["cities"] });
    }
  });

/** A signed-in customer's own account, from the session and nothing else. */
async function sessionCustomerId() {
  const user = await currentUser();
  return user?.role === "CUSTOMER" ? user.customerId : null;
}

const statusHref = (reference: string, key: string) => `/visit/status/${encodeURIComponent(reference)}?k=${encodeURIComponent(key)}`;

export async function submitVisitRequest(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const company = await prisma.companySetting.findUnique({ where: { id: "singleton" }, select: { visitsEnabled: true } });
  if (company && !company.visitsEnabled) {
    return { error: "We are not taking business-visit requests on the website right now. Please call or WhatsApp us." };
  }

  const parsed = requestSchema.safeParse({
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    whatsapp: formData.get("whatsapp") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? "",
    travelFrom: formData.get("travelFrom") ?? undefined,
    travelTo: formData.get("travelTo") ?? undefined,
    flexibleDates: formData.get("flexibleDates") === "on",
    cities: formData.getAll("cities").map(String),
    markets: formData.getAll("markets").map(String),
    factories: formData.getAll("factories").map(String),
    categories: formData.getAll("categories").map(String),
    travelers: formData.get("travelers") ?? "1",
    language: formData.get("language") ?? undefined,
    wantsHotelHelp: formData.get("wantsHotelHelp") === "on",
    wantsTransportHelp: formData.get("wantsTransportHelp") === "on",
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const screened = await screenPublicRequest(formData, input.contactPhone);
  if (screened) return screened;

  const customerId = await sessionCustomerId();

  /* A second press of Send is the same request, not a second trip. The row it
     finds was matched on a phone number and nothing else, so its key goes back
     only to somebody the row already belongs to — see `statusKeyFor`. */
  const recent = await prisma.businessVisitRequest.findFirst({
    where: { contactPhone: input.contactPhone, createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) } },
    select: { reference: true, publicKey: true, customerId: true },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    const key = statusKeyFor(recent, customerId);
    return {
      ok: `We already have this visit request. Your reference is ${recent.reference}.`,
      reference: recent.reference,
      ...(key ? { statusHref: statusHref(recent.reference, key) } : {}),
    };
  }

  const request = await prisma.$transaction(async (tx) => {
    const reference = await nextVisitReference(tx);
    const created = await tx.businessVisitRequest.create({
      data: {
        reference,
        publicKey: generatePublicKey(),
        customerId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        whatsapp: input.whatsapp,
        contactEmail: input.contactEmail || null,
        travelFrom: input.travelFrom,
        travelTo: input.travelTo,
        flexibleDates: input.flexibleDates,
        cities: input.cities,
        markets: input.markets,
        factories: input.factories,
        categories: input.categories,
        travelers: input.travelers,
        language: input.language,
        wantsHotelHelp: input.wantsHotelHelp,
        wantsTransportHelp: input.wantsTransportHelp,
        notes: input.notes,
      },
      select: { id: true, reference: true, publicKey: true },
    });
    await recordAudit(
      {
        actor: null,
        action: "visit.request",
        entity: "BusinessVisitRequest",
        entityId: created.id,
        summary: `Business visit ${reference} requested on the website by ${input.contactName}`,
      },
      tx
    );
    await notifyStaff(
      await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "request.visit",
        title: `Business visit ${reference}`,
        body: `${input.contactName} · ${input.travelers} ${input.travelers === 1 ? "person" : "people"}${input.cities.length ? ` · ${input.cities.join(", ")}` : ""}`,
        href: `/app/support/visits/${created.id}`,
      },
      tx
    );
    return created;
  });

  revalidatePath("/app/support/visits");
  return {
    ok: `Request received. Your reference is ${request.reference}.`,
    reference: request.reference,
    statusHref: statusHref(request.reference, request.publicKey),
  };
}

/* ------------------------------------------------------------ the desk */

const updateSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["REQUESTED", "UNDER_REVIEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]),
  assignedToId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  plan: optionalText(4000),
  staffNote: optionalText(4000),
});

/**
 * Move a visit along, hand it to somebody, and write down the plan.
 *
 * CONFIRMED needs a plan: the visitor's status page prints it, and "confirmed"
 * with nothing under it is a promise nobody can check.
 */
export async function updateVisitRequest(_prev: VisitState, formData: FormData): Promise<VisitState> {
  let actor: SessionUser;
  try {
    actor = await authorize("request.manage");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const current = await prisma.businessVisitRequest.findUnique({ where: { id: input.id } });
  if (!current) return { error: "That request no longer exists." };

  if (input.status === "CONFIRMED" && !input.plan) {
    return { error: "Write down what has been arranged before confirming — the visitor reads it." };
  }
  if (input.assignedToId && input.assignedToId !== current.assignedToId) {
    if (input.assignedToId !== actor.id && !can(actor.role, "conversation.assign")) {
      return { error: "You can take a request yourself, but not hand it to somebody else." };
    }
    const assignee = await prisma.user.findUnique({ where: { id: input.assignedToId }, select: { role: true, active: true } });
    if (!assignee?.active || !can(assignee.role, "request.view")) {
      return { error: "That person cannot open the requests queue." };
    }
  }

  const changes = (["status", "assignedToId", "plan", "staffNote"] as const).filter(
    (field) => (current[field] ?? null) !== (input[field] ?? null)
  );
  if (changes.length === 0) return { ok: "Nothing to change." };

  await prisma.$transaction(async (tx) => {
    await tx.businessVisitRequest.update({
      where: { id: current.id },
      data: {
        status: input.status,
        assignedToId: input.assignedToId,
        plan: input.plan,
        staffNote: input.staffNote,
      },
    });
    for (const field of changes) {
      await recordFieldChange(
        {
          actor,
          entity: "BusinessVisitRequest",
          entityId: current.id,
          field,
          oldValue: current[field],
          newValue: input[field],
        },
        tx
      );
    }
    await recordAudit(
      {
        actor,
        action: "visit.update",
        entity: "BusinessVisitRequest",
        entityId: current.id,
        summary:
          current.status !== input.status
            ? `${current.reference}: ${VISIT_STATUS_LABEL[current.status]} → ${VISIT_STATUS_LABEL[input.status]}`
            : `${current.reference} updated (${changes.join(", ")})`,
      },
      tx
    );
  });

  revalidatePath("/app/support/visits");
  revalidatePath(`/app/support/visits/${current.id}`);
  return { ok: "Saved." };
}
