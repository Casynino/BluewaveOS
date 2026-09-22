/**
 * The China guide's opening content: product categories, guide cities, and the
 * links between the seeded markets and both.
 *
 * Fills gaps only, like prisma/data/markets.ts: once a row exists it belongs to
 * whoever edits it at /app/admin/explore, and a re-run never puts back text they
 * changed. General knowledge only — what a city is known for, where a market is —
 * and nothing that says BlueWave runs or vouches for any of it.
 *
 * NO FACTORIES ARE SEEDED. A factory listing is a claim about a real business;
 * the directory starts empty and staff add the ones they know.
 */
import type { PrismaClient } from "@prisma/client";

import { parseMarketBody } from "../../lib/markets";

export const CATEGORIES: [slug: string, name: string, summary: string, image: string][] = [
  ["clothing", "Clothing & textiles", "Garments, fabric and fashion, wholesale by the dozen or the bale.", "/photos/cn-clothing.jpg"],
  ["shoes-bags", "Shoes & bags", "Footwear, handbags, luggage and leather goods.", "/photos/cn-shoes.jpg"],
  ["electronics", "Electronics", "Phones, accessories, components, LED and solar.", "/photos/cn-electronics.jpg"],
  ["furniture", "Furniture & home", "Sofas, beds, office furniture and fittings.", "/photos/cn-furniture.jpg"],
  ["beauty", "Beauty & cosmetics", "Hair, skin care, make-up and salon supplies.", "/photos/cn-cosmetics.jpg"],
  ["home-kitchen", "Home & kitchen", "Kitchenware, household goods and small appliances.", "/photos/cn-market-street.jpg"],
  ["toys-stationery", "Toys & stationery", "Toys, school supplies and party goods.", "/photos/cn-toys.jpg"],
  ["accessories", "Jewellery & accessories", "Jewellery, hair accessories and small fashion goods.", "/photos/cn-bags.jpg"],
  ["auto-parts", "Auto parts", "Spare parts, tyres, filters and accessories.", "/photos/cn-auto-parts.jpg"],
  ["building", "Building materials", "Tiles, sanitary ware, aluminium and fittings.", "/photos/cn-tiles.jpg"],
  ["lighting", "Lighting", "Lamps, LED fittings and outdoor lighting.", "/photos/cn-lighting.jpg"],
  ["machinery", "Machinery", "Machines and equipment for workshops and small factories.", "/photos/cn-factory-line.jpg"],
  ["packaging", "Packaging", "Boxes, bags, labels and packing materials.", "/photos/parcels.jpg"],
];

type SeedCity = {
  slug: string;
  name: string;
  nameZh: string;
  province: string;
  tagline: string;
  summary: string;
  knownFor: string[];
  whatToSource: string[];
  businessDistricts: string[];
  travelNote: string;
  heroImage: string;
  gallery: string[];
  services: string[];
  featured: boolean;
  published: boolean;
};

/*
  Guangzhou, Foshan, Shenzhen and Yiwu open published: they are where BlueWave's
  customers buy most, and Foshan is where the warehouse is. The others are in the
  table unpublished, ready for the office to switch on.
*/
export const CITIES: SeedCity[] = [
  {
    slug: "guangzhou",
    name: "Guangzhou",
    nameZh: "广州",
    province: "Guangdong",
    tagline: "The trading capital of South China",
    summary:
      "Home of the Canton Fair and of wholesale markets for almost everything a shop in Tanzania sells — clothing, fabric, leather, beauty, auto parts. Our Foshan warehouse is next door, so what you buy in the city comes straight to us.",
    knownFor: ["Wholesale markets", "Canton Fair", "Clothing and fabric", "Leather goods", "Beauty products", "Auto parts"],
    whatToSource: ["Clothing", "Fabric", "Shoes and bags", "Cosmetics", "Auto parts", "Packaging"],
    businessDistricts: ["Baiyun", "Yuexiu", "Haizhu (Pazhou, Zhongda)", "Liwan"],
    travelNote: "Under an hour from our Foshan warehouse.",
    heroImage: "/photos/guangzhou-night.jpg",
    gallery: ["/photos/cn-canton-tower.jpg", "/photos/guangzhou-dusk.jpg", "/photos/cn-wholesale-hall.jpg", "/photos/cn-clothing.jpg"],
    services: ["SOURCING", "VISITS", "PICKUP"],
    featured: true,
    published: true,
  },
  {
    slug: "foshan",
    name: "Foshan",
    nameZh: "佛山",
    province: "Guangdong",
    tagline: "Furniture, tiles — and our warehouse",
    summary:
      "Next door to Guangzhou. Lecong's furniture showrooms run for kilometres, and the city is a centre for ceramic tiles, sanitary ware and aluminium. BlueWave's China warehouse is in Nanhai, Foshan: every consignment starts here.",
    knownFor: ["Furniture", "Ceramic tiles", "Sanitary ware", "Aluminium", "BlueWave warehouse"],
    whatToSource: ["Furniture", "Tiles", "Sanitary ware", "Aluminium profiles", "Lighting"],
    businessDistricts: ["Lecong (furniture)", "Nanzhuang (ceramics)", "Nanhai (BlueWave warehouse)"],
    travelNote: "BlueWave's warehouse is here, in Nanhai.",
    heroImage: "/photos/cn-furniture.jpg",
    gallery: ["/photos/cn-furniture.jpg", "/photos/cn-tiles.jpg", "/photos/warehouse-racks.jpg"],
    services: ["SOURCING", "VISITS", "PICKUP"],
    featured: true,
    published: true,
  },
  {
    slug: "shenzhen",
    name: "Shenzhen",
    nameZh: "深圳",
    province: "Guangdong",
    tagline: "Electronics, from parts to phones",
    summary:
      "China's electronics city. Huaqiangbei sells components, phones, accessories, LED and solar products, and the factories that make them are a short drive away.",
    knownFor: ["Electronics", "Phones and accessories", "LED and solar", "Components"],
    whatToSource: ["Phone accessories", "Small appliances", "LED lighting", "Solar products", "Components"],
    businessDistricts: ["Futian (Huaqiangbei)", "Bao'an", "Longgang"],
    travelNote: "About 1 hour from Guangzhou by train.",
    heroImage: "/photos/cn-shenzhen.jpg",
    gallery: ["/photos/cn-shenzhen.jpg", "/photos/cn-electronics.jpg"],
    services: ["SOURCING", "VISITS", "PICKUP"],
    featured: true,
    published: true,
  },
  {
    slug: "yiwu",
    name: "Yiwu",
    nameZh: "义乌",
    province: "Zhejiang",
    tagline: "The world's small-goods market",
    summary:
      "Yiwu International Trade City is one of the largest wholesale markets anywhere — floor after floor of small commodities sold by the carton, from hair accessories to kitchenware.",
    knownFor: ["Small commodities", "Household goods", "Jewellery and accessories", "Toys", "Festival goods"],
    whatToSource: ["Household goods", "Accessories", "Stationery", "Toys", "Party goods"],
    businessDistricts: ["International Trade City (Districts 1–5)", "Huangyuan clothing market"],
    travelNote: "About 7 hours from Guangzhou by fast train.",
    heroImage: "/photos/cn-wholesale-hall.jpg",
    gallery: ["/photos/cn-wholesale-hall.jpg", "/photos/cn-market-street.jpg"],
    services: ["SOURCING", "VISITS"],
    featured: true,
    published: true,
  },
  {
    slug: "dongguan",
    name: "Dongguan",
    nameZh: "东莞",
    province: "Guangdong",
    tagline: "The factory city",
    summary:
      "Between Guangzhou and Shenzhen, and full of factories — shoes, garments, bags, toys, furniture and electronics — which makes it the place to meet a manufacturer rather than a trader.",
    knownFor: ["Manufacturing", "Shoes", "Garments", "Electronics"],
    whatToSource: ["Shoes", "Garments", "Bags", "Electronics"],
    businessDistricts: ["Houjie (furniture)", "Humen (garments)"],
    travelNote: "About 1 hour from Guangzhou.",
    heroImage: "/photos/cn-dongguan.jpg",
    gallery: ["/photos/cn-factory-line.jpg", "/photos/cn-textile-factory.jpg"],
    services: ["SOURCING", "VISITS", "PICKUP"],
    featured: false,
    published: false,
  },
  {
    slug: "zhongshan",
    name: "Zhongshan",
    nameZh: "中山",
    province: "Guangdong",
    tagline: "The lighting town",
    summary:
      "Guzhen, in Zhongshan, is known across the trade as China's lighting capital: chandeliers, LED fittings, street lights and lamps, sold from showrooms and straight from factories.",
    knownFor: ["Lighting", "LED fittings", "Chandeliers"],
    whatToSource: ["Lamps", "LED fittings", "Outdoor lighting"],
    businessDistricts: ["Guzhen"],
    travelNote: "About 1½ hours from Guangzhou.",
    heroImage: "/photos/cn-lighting.jpg",
    gallery: ["/photos/cn-lighting.jpg"],
    services: ["SOURCING", "PICKUP"],
    featured: false,
    published: false,
  },
  {
    slug: "shantou",
    name: "Shantou",
    nameZh: "汕头",
    province: "Guangdong",
    tagline: "Toys by the container",
    summary:
      "Chenghai, in Shantou, is one of the biggest toy-making districts in the world — plastic toys, remote-control cars, dolls and educational toys, made and sold in bulk.",
    knownFor: ["Toys", "Remote-control toys", "Educational toys"],
    whatToSource: ["Toys", "Party goods"],
    businessDistricts: ["Chenghai"],
    travelNote: "About 5 hours from Guangzhou.",
    heroImage: "/photos/cn-shantou.jpg",
    gallery: ["/photos/cn-toys.jpg"],
    services: ["SOURCING"],
    featured: false,
    published: false,
  },
];

/* Where each seeded market sits, and what it sells, by category slug. */
const MARKET_PLACES: Record<string, { city: string; categories: string[]; image: string; duration: string }> = {
  "yiwu-international-trade-city": { city: "yiwu", categories: ["home-kitchen", "accessories", "toys-stationery"], image: "/photos/cn-wholesale-hall.jpg", duration: "Two days or more" },
  "guangzhou-wholesale-markets": { city: "guangzhou", categories: ["clothing"], image: "/photos/cn-clothing.jpg", duration: "A full day" },
  "shenzhen-electronics-markets": { city: "shenzhen", categories: ["electronics"], image: "/photos/cn-electronics.jpg", duration: "A full day" },
  "foshan-furniture-markets": { city: "foshan", categories: ["furniture"], image: "/photos/cn-furniture.jpg", duration: "A full day" },
  "zhongda-fabric-market": { city: "guangzhou", categories: ["clothing"], image: "/photos/cn-textile-factory.jpg", duration: "Half a day" },
  "baima-clothing-market": { city: "guangzhou", categories: ["clothing"], image: "/photos/cn-clothing.jpg", duration: "Half a day" },
  "huaqiangbei-electronics": { city: "shenzhen", categories: ["electronics"], image: "/photos/cn-electronics.jpg", duration: "A full day" },
  "guangzhou-shoe-markets": { city: "guangzhou", categories: ["shoes-bags"], image: "/photos/cn-shoes.jpg", duration: "Half a day" },
  "guangzhou-auto-parts": { city: "guangzhou", categories: ["auto-parts"], image: "/photos/cn-auto-parts.jpg", duration: "Half a day" },
  "guzhen-lighting-market": { city: "zhongshan", categories: ["lighting"], image: "/photos/cn-lighting.jpg", duration: "A full day" },
  "chenghai-toy-market": { city: "shantou", categories: ["toys-stationery"], image: "/photos/cn-toys.jpg", duration: "A full day" },
  "packaging-materials-market": { city: "guangzhou", categories: ["packaging"], image: "/photos/parcels.jpg", duration: "Half a day" },
  "keqiao-textile-market": { city: "", categories: ["clothing"], image: "/photos/cn-textile-factory.jpg", duration: "A full day" },
};

export async function seedChina(prisma: PrismaClient) {
  let categories = 0;
  for (const [index, [slug, name, summary, image]] of CATEGORIES.entries()) {
    if (await prisma.productCategory.findUnique({ where: { slug }, select: { id: true } })) continue;
    await prisma.productCategory.create({ data: { slug, name, summary, image, sortOrder: index } });
    categories++;
  }

  let cities = 0;
  for (const [index, city] of CITIES.entries()) {
    if (await prisma.chinaCity.findUnique({ where: { slug: city.slug }, select: { id: true } })) continue;
    await prisma.chinaCity.create({ data: { ...city, sortOrder: index } });
    cities++;
  }

  /* Place the seeded markets, once. A market already placed in a city has
     been looked at by somebody and is left as they left it. */
  let placed = 0;
  for (const [slug, place] of Object.entries(MARKET_PLACES)) {
    const market = await prisma.marketInformation.findUnique({
      where: { slug },
      select: { id: true, cityId: true, body: true, imageUrl: true, district: true, products: true, tips: true },
    });
    if (!market || market.cityId) continue;
    const city = place.city ? await prisma.chinaCity.findUnique({ where: { slug: place.city }, select: { id: true } }) : null;
    const parsed = parseMarketBody(market.body ?? "");
    await prisma.marketInformation.update({
      where: { id: market.id },
      data: {
        cityId: city?.id ?? null,
        imageUrl: market.imageUrl ?? place.image,
        visitDuration: place.duration,
        district: market.district ?? (parsed.district || null),
        hours: parsed.hours || null,
        products: market.products.length ? market.products : parsed.products,
        tips: market.tips.length ? market.tips : parsed.tips,
        categories: { connect: place.categories.map((c) => ({ slug: c })) },
        featured: ["yiwu-international-trade-city", "guangzhou-wholesale-markets", "shenzhen-electronics-markets", "foshan-furniture-markets"].includes(slug),
      },
    });
    placed++;
  }

  return { categories, cities, placed };
}
