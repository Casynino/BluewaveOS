import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

/*
  THE CHINA GUIDE'S STAFF FORMS, AGAINST THE REAL DATABASE.

  Each save below is sent exactly the FormData the staff screens under
  /app/admin/explore post: blank inputs as empty strings, lists as one
  textarea with a line each, ticked boxes as "on", and several ticks under one
  name as repeated values. What this proves is that the field names on those
  forms are the names the actions read.

  Writes, then removes what it wrote and puts back what it changed. Run only
  against bluewave_test.
*/
const url = process.env.DATABASE_URL ?? "";
if (!/\/bluewave_test(\?|$)/.test(url)) {
  throw new Error(`Refusing to run: DATABASE_URL must point at bluewave_test (got ${url || "nothing"}).`);
}

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const content = load("@/lib/actions/explore-content") as typeof import("@/lib/actions/explore-content");

const prisma = new PrismaClient();

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value);
  }
  return data;
}

const tag = `t${Date.now()}`;
const made = { cities: [] as string[], categories: [] as string[], factories: [] as string[] };
let market: Awaited<ReturnType<typeof prisma.marketInformation.findFirstOrThrow>> & { categories: { id: string }[] };
let offerBefore: { sourcingServices: string[]; visitsEnabled: boolean } | null = null;

before(async () => {
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@bluewavecargo.co.tz" } });
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    department: admin.department,
    warehouseId: admin.warehouseId,
    customerId: null,
  };
  market = await prisma.marketInformation.findFirstOrThrow({ include: { categories: { select: { id: true } } } });
  offerBefore = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { sourcingServices: true, visitsEnabled: true },
  });
});

after(async () => {
  await prisma.factory.deleteMany({ where: { id: { in: made.factories } } });
  await prisma.marketInformation.update({
    where: { id: market.id },
    data: {
      cityId: market.cityId,
      address: market.address,
      visitDuration: market.visitDuration,
      imageUrl: market.imageUrl,
      gallery: market.gallery,
      latitude: market.latitude,
      longitude: market.longitude,
      featured: market.featured,
      categories: { set: market.categories },
    },
  });
  await prisma.chinaCity.deleteMany({ where: { id: { in: made.cities } } });
  await prisma.productCategory.deleteMany({ where: { id: { in: made.categories } } });
  if (offerBefore) await prisma.companySetting.update({ where: { id: "singleton" }, data: offerBefore });
  await prisma.$disconnect();
});

describe("China guide admin forms", () => {
  test("a city, added and then edited", async () => {
    const added = await content.saveCity(
      {},
      form({
        name: `Yiwu ${tag}`,
        nameZh: "义乌",
        province: "Zhejiang",
        tagline: "Small commodities",
        summary: "",
        body: "",
        knownFor: "Futian market\nToys",
        whatToSource: "Toys\n\nStationery\n",
        businessDistricts: "",
        travelNote: "",
        heroImage: "/photos/cn-wholesale-hall.jpg",
        gallery: "/photos/cn-toys.jpg\n/photos/cn-market-street.jpg",
        services: ["SOURCING", "PICKUP"],
        published: "on",
        sortOrder: "3",
      })
    );
    assert.equal(added.error, undefined, added.error);
    assert.ok(added.id);
    made.cities.push(added.id!);
    const row = await prisma.chinaCity.findUniqueOrThrow({ where: { id: added.id } });
    assert.deepEqual(row.whatToSource, ["Toys", "Stationery"]);
    assert.deepEqual(row.services, ["SOURCING", "PICKUP"]);
    assert.deepEqual(row.gallery, ["/photos/cn-toys.jpg", "/photos/cn-market-street.jpg"]);
    assert.equal(row.published, true);
    assert.equal(row.featured, false);
    assert.equal(row.summary, null);
    assert.equal(row.sortOrder, 3);

    const edited = await content.saveCity({}, form({ id: row.id, name: row.name, heroImage: "", sortOrder: "" }));
    assert.equal(edited.error, undefined, edited.error);
    const again = await prisma.chinaCity.findUniqueOrThrow({ where: { id: row.id } });
    assert.equal(again.published, false, "an unticked box is absent from the post and means off");
    assert.equal(again.heroImage, null);
    assert.equal(again.slug, row.slug, "the slug never changes on edit");
  });

  test("a bad image path is refused", async () => {
    const result = await content.saveCity({}, form({ name: `Bad ${tag}`, heroImage: "https://example.com/x.jpg" }));
    assert.ok(result.error);
  });

  test("a category", async () => {
    const result = await content.saveCategory(
      {},
      form({ name: `Toys ${tag}`, summary: "Plastic and plush", image: "/photos/cn-toys.jpg", published: "on", sortOrder: "" })
    );
    assert.equal(result.error, undefined, result.error);
    made.categories.push(result.id!);
  });

  test("a factory: a listing by default, unpublished, with its categories", async () => {
    const city = made.cities[0];
    const categoryId = made.categories[0];
    const result = await content.saveFactory(
      {},
      form({
        name: `Lighting works ${tag}`,
        cityId: city,
        district: "Guzhen",
        industry: "LED lighting",
        summary: "",
        body: "",
        products: "Panel lights\nDownlights",
        production: "",
        moq: "500 pieces",
        exportExperience: "",
        listing: "LISTING",
        heroImage: "/photos/cn-lighting.jpg",
        gallery: "",
        imagesIllustrative: "on",
        latitude: "22.61",
        longitude: "113.2",
        categoryIds: [categoryId],
        sortOrder: "0",
      })
    );
    assert.equal(result.error, undefined, result.error);
    made.factories.push(result.id!);
    const row = await prisma.factory.findUniqueOrThrow({
      where: { id: result.id },
      include: { categories: { select: { id: true } } },
    });
    assert.equal(row.listing, "LISTING");
    assert.equal(row.published, false);
    assert.equal(row.visitsAvailable, false);
    assert.equal(row.imagesIllustrative, true);
    assert.equal(row.cityId, city);
    assert.equal(row.latitude, 22.61);
    assert.deepEqual(row.products, ["Panel lights", "Downlights"]);
    assert.deepEqual(row.categories.map((c) => c.id), [categoryId]);

    const cleared = await content.saveFactory(
      {},
      form({ id: row.id, name: row.name, cityId: "", listing: "PARTNER", latitude: "", longitude: "", published: "on" })
    );
    assert.equal(cleared.error, undefined, cleared.error);
    const again = await prisma.factory.findUniqueOrThrow({
      where: { id: row.id },
      include: { categories: { select: { id: true } } },
    });
    assert.equal(again.cityId, null);
    assert.equal(again.listing, "PARTNER");
    assert.equal(again.latitude, null);
    assert.equal(again.categories.length, 0, "no ticked categories clears them");
  });

  test("a market's guide details", async () => {
    const result = await content.saveMarketPlace(
      {},
      form({
        id: market.id,
        cityId: made.cities[0],
        address: "1 Market Road",
        visitDuration: "Half a day",
        imageUrl: "/photos/cn-market-street.jpg",
        gallery: "/photos/cn-wholesale-hall.jpg",
        latitude: "23.02",
        longitude: "113.12",
        categoryIds: [made.categories[0]],
        featured: "on",
      })
    );
    assert.equal(result.error, undefined, result.error);
    const row = await prisma.marketInformation.findUniqueOrThrow({
      where: { id: market.id },
      include: { categories: { select: { id: true } } },
    });
    assert.equal(row.cityId, made.cities[0]);
    assert.equal(row.visitDuration, "Half a day");
    assert.equal(row.featured, true);
    assert.deepEqual(row.gallery, ["/photos/cn-wholesale-hall.jpg"]);
    assert.deepEqual(row.categories.map((c) => c.id), [made.categories[0]]);
    assert.equal(row.name, market.name, "the directory's own fields are untouched");
  });

  test("what the website offers", async () => {
    const result = await content.saveChinaOffer({}, form({ sourcingServices: ["PRODUCT", "SAMPLES"] }));
    assert.equal(result.error, undefined, result.error);
    const row = await prisma.companySetting.findUniqueOrThrow({ where: { id: "singleton" } });
    assert.deepEqual(row.sourcingServices, ["PRODUCT", "SAMPLES"]);
    assert.equal(row.visitsEnabled, false);
  });
});
