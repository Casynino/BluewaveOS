"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { recordAudit } from "@/lib/audit";
import { CITY_SERVICES } from "@/lib/china-content";
import { slugifyMarket, splitLines } from "@/lib/markets";
import { prisma } from "@/lib/prisma";
import { authorize, type SessionUser } from "@/lib/session";
import { store, UploadError } from "@/lib/storage";

export type ContentState = { error?: string; ok?: string; id?: string; url?: string };

/*
  THE CHINA GUIDE'S CONTENT, EDITED BY STAFF.

  content.manage, like the markets directory and the sailing schedule: what is
  saved here is read to strangers as advice. Lists are typed one per line.
  Slugs are minted once and never change, so a link sent to a customer keeps
  working after a rename.
*/

async function editor(): Promise<SessionUser | ContentState> {
  try {
    return await authorize("content.manage");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Not permitted." };
  }
}
const isActor = (v: SessionUser | ContentState): v is SessionUser => "role" in v;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));
const lines = z
  .string()
  .optional()
  .transform((v) => splitLines(v, 40));
const order = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? Number(v) : 0))
  .refine((v) => Number.isInteger(v), "Position must be a whole number.");
const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max), "Check the map position.");
/* An image is a site path (/photos/…) or a file this system stored (/uploads/…). */
const imagePath = z
  .string()
  .trim()
  .max(400)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\/(photos|uploads)\/[\w./-]+$/.test(v), "Pick an image from the library or upload one.");
const imageLines = z
  .string()
  .optional()
  .transform((v) => splitLines(v, 24))
  .refine((all) => all.every((v) => /^\/(photos|uploads)\/[\w./-]+$/.test(v)), "Each gallery line must be an image path.");

async function uniqueSlug(model: "chinaCity" | "productCategory" | "factory", base: string) {
  const root = base || "item";
  let candidate = root;
  let n = 2;
  const exists = async (slug: string) =>
    model === "chinaCity"
      ? prisma.chinaCity.findUnique({ where: { slug }, select: { id: true } })
      : model === "productCategory"
        ? prisma.productCategory.findUnique({ where: { slug }, select: { id: true } })
        : prisma.factory.findUnique({ where: { slug }, select: { id: true } });
  while (await exists(candidate)) candidate = `${root}-${n++}`;
  return candidate;
}

function refresh() {
  revalidatePath("/app/admin/explore", "layout");
  revalidatePath("/explore");
  revalidatePath("/markets", "layout");
  revalidatePath("/factories", "layout");
  revalidatePath("/cities", "layout");
  revalidatePath("/");
}

/* ------------------------------------------------------------ images */

/** Upload one picture for the guide; the caller puts the returned path in a field. */
export async function uploadContentImage(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image." };
  if (!file.type.startsWith("image/")) return { error: "Only images can be used here." };
  try {
    const url = await store(file, "content");
    await recordAudit({ actor, action: "content.image", entity: "Upload", entityId: url, summary: `Uploaded a guide image ${url}` });
    return { ok: "Uploaded. Paste the path where you want it.", url };
  } catch (error) {
    return { error: error instanceof UploadError ? error.message : "That image could not be uploaded." };
  }
}

/* ------------------------------------------------------------ cities */

const citySchema = z.object({
  id: text(64),
  name: z.string().trim().min(2, "Name the city.").max(80),
  nameZh: text(40),
  province: text(80),
  tagline: text(160),
  summary: text(1200),
  body: text(8000),
  knownFor: lines,
  whatToSource: lines,
  businessDistricts: lines,
  travelNote: text(200),
  heroImage: imagePath,
  gallery: imageLines,
  services: z.array(z.enum(Object.keys(CITY_SERVICES) as [keyof typeof CITY_SERVICES])).default([]),
  featured: z.boolean(),
  published: z.boolean(),
  sortOrder: order,
});

export async function saveCity(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const parsed = citySchema.safeParse({
    ...Object.fromEntries(formData),
    services: formData.getAll("services").map(String),
    featured: formData.get("featured") === "on",
    published: formData.get("published") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the city." };
  const { id, ...data } = parsed.data;
  const row = id
    ? await prisma.chinaCity.update({ where: { id }, data, select: { id: true, name: true } })
    : await prisma.chinaCity.create({
        data: { ...data, slug: await uniqueSlug("chinaCity", slugifyMarket(data.name)) },
        select: { id: true, name: true },
      });
  await recordAudit({
    actor,
    action: id ? "city.update" : "city.create",
    entity: "ChinaCity",
    entityId: row.id,
    summary: `${id ? "Updated" : "Added"} guide city "${row.name}"${data.published ? "" : " (unpublished)"}`,
  });
  refresh();
  return { ok: id ? "City saved." : "City added.", id: row.id };
}

/* ------------------------------------------------------------ categories */

const categorySchema = z.object({
  id: text(64),
  name: z.string().trim().min(2, "Name the category.").max(80),
  summary: text(300),
  image: imagePath,
  published: z.boolean(),
  sortOrder: order,
});

export async function saveCategory(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const parsed = categorySchema.safeParse({ ...Object.fromEntries(formData), published: formData.get("published") === "on" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the category." };
  const { id, ...data } = parsed.data;
  const row = id
    ? await prisma.productCategory.update({ where: { id }, data, select: { id: true, name: true } })
    : await prisma.productCategory.create({
        data: { ...data, slug: await uniqueSlug("productCategory", slugifyMarket(data.name)) },
        select: { id: true, name: true },
      });
  await recordAudit({
    actor,
    action: id ? "category.update" : "category.create",
    entity: "ProductCategory",
    entityId: row.id,
    summary: `${id ? "Updated" : "Added"} product category "${row.name}"`,
  });
  refresh();
  return { ok: id ? "Category saved." : "Category added.", id: row.id };
}

/* ------------------------------------------------------------ factories */

const factorySchema = z.object({
  id: text(64),
  name: z.string().trim().min(2, "Name the factory.").max(160),
  cityId: text(64),
  district: text(120),
  industry: text(120),
  summary: text(400),
  body: text(8000),
  products: lines,
  production: text(2000),
  moq: text(200),
  exportExperience: text(400),
  listing: z.enum(["LISTING", "PARTNER"]),
  visitsAvailable: z.boolean(),
  heroImage: imagePath,
  gallery: imageLines,
  imagesIllustrative: z.boolean(),
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  categoryIds: z.array(z.string().trim().min(1)).max(20),
  featured: z.boolean(),
  published: z.boolean(),
  sortOrder: order,
});

/**
 * A factory listing.
 *
 * PARTNER is a statement about a real relationship and is printed on the
 * public page as "BlueWave sourcing partner" — it is a separate, deliberate
 * choice on the form, never a default.
 */
export async function saveFactory(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const parsed = factorySchema.safeParse({
    ...Object.fromEntries(formData),
    visitsAvailable: formData.get("visitsAvailable") === "on",
    imagesIllustrative: formData.get("imagesIllustrative") === "on",
    featured: formData.get("featured") === "on",
    published: formData.get("published") === "on",
    categoryIds: formData.getAll("categoryIds").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the factory." };
  const { id, categoryIds, ...data } = parsed.data;
  const categories = categoryIds.map((cid) => ({ id: cid }));
  const before = id ? await prisma.factory.findUnique({ where: { id }, select: { listing: true } }) : null;
  const row = id
    ? await prisma.factory.update({
        where: { id },
        data: { ...data, categories: { set: categories } },
        select: { id: true, name: true },
      })
    : await prisma.factory.create({
        data: { ...data, slug: await uniqueSlug("factory", slugifyMarket(data.name)), categories: { connect: categories } },
        select: { id: true, name: true },
      });
  await recordAudit({
    actor,
    action: id ? "factory.update" : "factory.create",
    entity: "Factory",
    entityId: row.id,
    summary: `${id ? "Updated" : "Added"} factory "${row.name}"${
      before && before.listing !== data.listing ? ` — listing ${before.listing} → ${data.listing}` : ""
    }`,
  });
  refresh();
  return { ok: id ? "Factory saved." : "Factory added.", id: row.id };
}

/* ------------------------------------------------------------ markets */

const marketPlaceSchema = z.object({
  id: z.string().trim().min(1),
  cityId: text(64),
  address: text(300),
  visitDuration: text(80),
  imageUrl: imagePath,
  gallery: imageLines,
  latitude: coordinate(-90, 90),
  longitude: coordinate(-180, 180),
  categoryIds: z.array(z.string().trim().min(1)).max(20),
  featured: z.boolean(),
});

/**
 * Where a market is, what it is for, and its pictures — the part of a market
 * the guide pages need beyond what saveMarket (lib/actions/markets.ts) keeps.
 */
export async function saveMarketPlace(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const parsed = marketPlaceSchema.safeParse({
    ...Object.fromEntries(formData),
    featured: formData.get("featured") === "on",
    categoryIds: formData.getAll("categoryIds").map(String),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the market." };
  const { id, categoryIds, ...data } = parsed.data;
  const row = await prisma.marketInformation.update({
    where: { id },
    data: { ...data, categories: { set: categoryIds.map((cid) => ({ id: cid })) } },
    select: { id: true, name: true },
  });
  await recordAudit({
    actor,
    action: "market.place",
    entity: "MarketInformation",
    entityId: row.id,
    summary: `Updated the guide details of market "${row.name}"`,
  });
  refresh();
  revalidatePath("/app/admin/markets");
  return { ok: "Market details saved.", id: row.id };
}

/* ------------------------------------------------------------ what the site offers */

const offerSchema = z.object({
  sourcingServices: z.array(z.enum(["PRODUCT", "SUPPLIER", "FACTORY", "PRICE_RESEARCH", "SAMPLES", "COMPARISON"])),
  visitsEnabled: z.boolean(),
});

export async function saveChinaOffer(_prev: ContentState, formData: FormData): Promise<ContentState> {
  const actor = await editor();
  if (!isActor(actor)) return actor;
  const parsed = offerSchema.safeParse({
    sourcingServices: formData.getAll("sourcingServices").map(String),
    visitsEnabled: formData.get("visitsEnabled") === "on",
  });
  if (!parsed.success) return { error: "Check the services." };
  const before = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { sourcingServices: true, visitsEnabled: true },
  });
  await prisma.companySetting.update({ where: { id: "singleton" }, data: parsed.data });
  await recordAudit({
    actor,
    action: "settings.china",
    entity: "CompanySetting",
    entityId: "singleton",
    summary: `Website China services: sourcing [${parsed.data.sourcingServices.join(", ")}], visits ${parsed.data.visitsEnabled ? "on" : "off"}`,
    metadata: { before, after: parsed.data },
  });
  refresh();
  revalidatePath("/sourcing");
  revalidatePath("/visit");
  return { ok: "Saved." };
}
