"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { SOURCING_SERVICES, isSourcingService } from "@/lib/china-content";
import { generatePublicKey, nextSourcingReference } from "@/lib/ids";
import { notifyStaff, staffInDepartment } from "@/lib/notify";
import { normaliseAnyPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { filePublicly, screenPublicRequest, statusKeyFor } from "@/lib/public-guard";
import { currentUser } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type SourcingPublicState = { error?: string; ok?: string; reference?: string; statusHref?: string };

/*
  "FIND IT FOR ME", OFF THE WEBSITE.

  Lands in the same SourcingRequest table the desk already works, marked as
  from the website, so it is one queue whichever way a customer asked. Nothing
  here is a price, an order or a promise — the desk calls the customer back.
  Only the services the company offers (CompanySetting.sourcingServices) are
  accepted; a form posted by hand for anything else is refused.
*/

const DUPLICATE_WINDOW_MS = 15 * 60 * 1000;
const MAX_PHOTOS = 3;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const schema = z.object({
  service: z.string().trim(),
  product: z.string().trim().min(2, "What are you looking for?").max(200),
  category: optionalText(120),
  details: optionalText(3000),
  quantity: optionalText(120),
  budget: optionalText(120),
  specifications: optionalText(2000),
  preferredCity: optionalText(120),
  supplierNeeds: optionalText(1000),
  contactName: z.string().trim().min(2, "Your name, please.").max(120),
  contactPhone: z
    .string()
    .trim()
    .max(40)
    .transform(normaliseAnyPhone)
    .refine((v) => /^\+?\d{9,15}$/.test(v), "Enter a phone number we can call, with the country code if outside Tanzania."),
  whatsapp: optionalText(40),
  contactEmail: z.string().trim().toLowerCase().max(200).email("That is not an email address.").optional().or(z.literal("")),
});

const statusHref = (reference: string, key: string) =>
  `/sourcing/status/${encodeURIComponent(reference)}?k=${encodeURIComponent(key)}`;

export async function submitSourcingRequest(
  _prev: SourcingPublicState,
  formData: FormData
): Promise<SourcingPublicState> {
  const parsed = schema.safeParse({
    service: formData.get("service") ?? "",
    product: formData.get("product") ?? "",
    category: formData.get("category") ?? undefined,
    details: formData.get("details") ?? undefined,
    quantity: formData.get("quantity") ?? undefined,
    budget: formData.get("budget") ?? undefined,
    specifications: formData.get("specifications") ?? undefined,
    preferredCity: formData.get("preferredCity") ?? undefined,
    supplierNeeds: formData.get("supplierNeeds") ?? undefined,
    contactName: formData.get("contactName") ?? "",
    contactPhone: formData.get("contactPhone") ?? "",
    whatsapp: formData.get("whatsapp") ?? undefined,
    contactEmail: formData.get("contactEmail") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const input = parsed.data;

  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { sourcingServices: true },
  });
  const offered = company?.sourcingServices ?? ["PRODUCT", "SUPPLIER", "FACTORY"];
  if (!isSourcingService(input.service) || !offered.includes(input.service)) {
    return { error: "Choose the kind of help you need." };
  }
  const service = input.service;

  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > MAX_PHOTOS) return { error: `Send up to ${MAX_PHOTOS} photos.` };

  const screened = await screenPublicRequest(formData, input.contactPhone);
  if (screened) return screened;

  const viewer = await currentUser();
  const customerId = viewer?.role === "CUSTOMER" ? viewer.customerId : null;

  /* Matched on a phone number and the product text, neither of which is a
     secret, so the row's key goes back only to somebody it already belongs
     to — see `statusKeyFor`. */
  const recent = await prisma.sourcingRequest.findFirst({
    where: {
      contactPhone: input.contactPhone,
      product: input.product,
      channel: "WEBSITE",
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { reference: true, publicKey: true, customerId: true },
  });
  if (recent) {
    const key = statusKeyFor(recent, customerId);
    return {
      ok: `We already have this request. Your reference is ${recent.reference}.`,
      reference: recent.reference,
      ...(key ? { statusHref: statusHref(recent.reference, key) } : {}),
    };
  }

  /* Files first, outside the transaction: a failed upload should say so
     before anything is written, and a stored file with no row is invisible
     (lib/file-access.ts opens nothing no record claims). */
  let urls: string[];
  try {
    urls = await Promise.all(photos.map((photo) => store(photo, "sourcing")));
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "That photo could not be uploaded." };
  }

  const filed = await filePublicly(prisma.$transaction(async (tx) => {
    const reference = await nextSourcingReference(tx);
    const row = await tx.sourcingRequest.create({
      data: {
        reference,
        publicKey: generatePublicKey(),
        channel: "WEBSITE",
        customerId,
        contactName: input.contactName,
        contactPhone: input.contactPhone,
        whatsapp: input.whatsapp,
        contactEmail: input.contactEmail || null,
        service,
        product: input.product,
        category: input.category,
        details: input.details,
        quantity: input.quantity,
        budget: input.budget,
        specifications: input.specifications,
        preferredCity: input.preferredCity,
        market: input.preferredCity,
        supplierNeeds: input.supplierNeeds,
        documents: { create: urls.map((url, i) => ({ kind: "PHOTO", label: `Reference photo ${i + 1}`, url })) },
      },
      select: { id: true, reference: true, publicKey: true },
    });
    await recordAudit(
      {
        actor: null,
        action: "sourcing.request",
        entity: "SourcingRequest",
        entityId: row.id,
        summary: `${SOURCING_SERVICES[service].label} ${reference} requested on the website: ${input.product}`,
      },
      tx
    );
    await notifyStaff(
      await staffInDepartment("CUSTOMER_SUPPORT", tx),
      {
        kind: "request.sourcing",
        title: `Sourcing request ${reference}`,
        body: `${input.contactName} · ${input.product}`,
        href: `/app/support/sourcing/${row.id}`,
      },
      tx
    );
    return row;
  }), "We could not file that request. Please try again, or call us.");
  if ("error" in filed) return { error: filed.error };
  const created = filed.filed;

  revalidatePath("/app/support/sourcing");
  return {
    ok: `Request received. Your reference is ${created.reference}.`,
    reference: created.reference,
    statusHref: statusHref(created.reference, created.publicKey!),
  };
}
