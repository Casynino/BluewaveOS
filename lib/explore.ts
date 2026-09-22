import "server-only";

import { cache } from "react";

import { parseMarketBody } from "@/lib/markets";
import { prisma } from "@/lib/prisma";

/*
  THE PUBLIC CHINA GUIDE, READ.

  Published rows only, everywhere: an unpublished city, market or factory is a
  draft somebody on the staff has not finished checking, and a draft does not
  reach a stranger. Every reader here is the only way the public pages get at
  these tables, so that rule lives in one place.
*/

const CITY_CARD = {
  id: true,
  slug: true,
  name: true,
  nameZh: true,
  province: true,
  tagline: true,
  summary: true,
  knownFor: true,
  heroImage: true,
  services: true,
  travelNote: true,
  featured: true,
} as const;

const MARKET_CARD = {
  id: true,
  slug: true,
  name: true,
  city: true,
  category: true,
  summary: true,
  imageUrl: true,
  visitDuration: true,
  district: true,
  featured: true,
  cityRef: { select: { slug: true, name: true, published: true } },
  categories: { where: { published: true }, select: { slug: true, name: true } },
} as const;

const FACTORY_CARD = {
  id: true,
  slug: true,
  name: true,
  industry: true,
  summary: true,
  heroImage: true,
  imagesIllustrative: true,
  listing: true,
  visitsAvailable: true,
  moq: true,
  featured: true,
  city: { select: { slug: true, name: true } },
  categories: { where: { published: true }, select: { slug: true, name: true } },
} as const;

export const listCities = cache(() =>
  prisma.chinaCity.findMany({
    where: { published: true },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      ...CITY_CARD,
      _count: {
        select: {
          markets: { where: { published: true } },
          factories: { where: { published: true } },
        },
      },
    },
  })
);

export const listCategories = cache(() =>
  prisma.productCategory.findMany({
    where: { published: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      summary: true,
      image: true,
      _count: {
        select: {
          markets: { where: { published: true } },
          factories: { where: { published: true } },
        },
      },
    },
  })
);

export const listMarkets = cache((filter: { city?: string; category?: string } = {}) =>
  prisma.marketInformation.findMany({
    where: {
      published: true,
      ...(filter.city ? { cityRef: { slug: filter.city, published: true } } : {}),
      ...(filter.category ? { categories: { some: { slug: filter.category } } } : {}),
    },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: MARKET_CARD,
  })
);

export const listFactories = cache((filter: { city?: string; category?: string } = {}) =>
  prisma.factory.findMany({
    where: {
      published: true,
      ...(filter.city ? { city: { slug: filter.city, published: true } } : {}),
      ...(filter.category ? { categories: { some: { slug: filter.category } } } : {}),
    },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: FACTORY_CARD,
  })
);

export const cityBySlug = cache(async (slug: string) => {
  const city = await prisma.chinaCity.findFirst({ where: { slug, published: true } });
  if (!city) return null;
  const [markets, factories] = await Promise.all([
    listMarkets({ city: slug }),
    listFactories({ city: slug }),
  ]);
  return { ...city, markets, factories };
});

/**
 * One market, laid out for its page.
 *
 * Structured columns win; a market typed before they existed still has its
 * sections in the body under fixed headings, and those fill any gap.
 */
export const marketBySlug = cache(async (slug: string) => {
  const market = await prisma.marketInformation.findFirst({
    where: { slug, published: true },
    select: {
      ...MARKET_CARD,
      body: true,
      address: true,
      hours: true,
      products: true,
      tips: true,
      gallery: true,
      latitude: true,
      longitude: true,
      cityId: true,
    },
  });
  if (!market) return null;
  const parsed = parseMarketBody(market.body);
  const categorySlugs = market.categories.map((c) => c.slug);

  const [nearby, factories] = await Promise.all([
    market.cityId
      ? prisma.marketInformation.findMany({
          where: { published: true, cityId: market.cityId, id: { not: market.id } },
          orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
          take: 4,
          select: MARKET_CARD,
        })
      : Promise.resolve([]),
    categorySlugs.length
      ? prisma.factory.findMany({
          where: { published: true, categories: { some: { slug: { in: categorySlugs } } } },
          orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
          take: 4,
          select: FACTORY_CARD,
        })
      : Promise.resolve([]),
  ]);

  return {
    ...market,
    description: parsed.description,
    district: market.district ?? (parsed.district || null),
    hours: market.hours ?? (parsed.hours || null),
    products: market.products.length ? market.products : parsed.products,
    tips: market.tips.length ? market.tips : parsed.tips,
    verify: parsed.verify || null,
    nearby,
    factories,
  };
});

export const factoryBySlug = cache(async (slug: string) => {
  const factory = await prisma.factory.findFirst({
    where: { slug, published: true },
    include: {
      city: { select: { slug: true, name: true, published: true } },
      categories: { where: { published: true }, select: { slug: true, name: true } },
    },
  });
  if (!factory) return null;
  const categorySlugs = factory.categories.map((c) => c.slug);
  const markets = categorySlugs.length
    ? await prisma.marketInformation.findMany({
        where: { published: true, categories: { some: { slug: { in: categorySlugs } } } },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
        take: 3,
        select: MARKET_CARD,
      })
    : [];
  return { ...factory, city: factory.city?.published ? factory.city : null, markets };
});

/**
 * "WHERE DOES MY PRODUCT LIVE?"
 *
 * A category in; the cities, markets and factories that carry it out. Cities
 * are the ones its markets and factories are in — never a guess from the
 * category's name.
 */
export const discover = cache(async (categorySlug: string) => {
  const category = await prisma.productCategory.findFirst({
    where: { slug: categorySlug, published: true },
    select: { slug: true, name: true, summary: true, image: true },
  });
  if (!category) return null;
  const [markets, factories] = await Promise.all([
    listMarkets({ category: categorySlug }),
    listFactories({ category: categorySlug }),
  ]);
  const citySlugs = new Set(
    [...markets.map((m) => m.cityRef?.slug), ...factories.map((f) => f.city?.slug)].filter(Boolean) as string[]
  );
  const cities = citySlugs.size
    ? await prisma.chinaCity.findMany({
        where: { published: true, slug: { in: [...citySlugs] } },
        orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
        select: CITY_CARD,
      })
    : [];
  return { category, cities, markets, factories };
});

/** What the public site offers, from settings — the forms ask this. */
export const chinaSettings = cache(async () => {
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { sourcingServices: true, visitsEnabled: true },
  });
  return {
    sourcingServices: company?.sourcingServices ?? ["PRODUCT", "SUPPLIER", "FACTORY"],
    visitsEnabled: company?.visitsEnabled ?? true,
  };
});

export type MarketCard = Awaited<ReturnType<typeof listMarkets>>[number];
export type FactoryCard = Awaited<ReturnType<typeof listFactories>>[number];
export type CityCard = Awaited<ReturnType<typeof listCities>>[number];
