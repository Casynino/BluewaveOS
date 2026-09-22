import type { MetadataRoute } from "next";

import { listCities, listFactories, listMarkets } from "@/lib/explore";
import { publicSiteUrl } from "@/lib/site-url";

/**
 * The pages a stranger should land on, and nothing behind a sign-in or a
 * tracking reference.
 */
const PAGES: [path: string, priority: number, frequency: MetadataRoute.Sitemap[number]["changeFrequency"]][] = [
  ["", 1, "weekly"],
  ["/track", 0.9, "monthly"],
  ["/quote", 0.8, "monthly"],
  ["/schedule", 0.8, "daily"],
  ["/services", 0.8, "monthly"],
  ["/calculator", 0.9, "weekly"],
  ["/how-it-works", 0.8, "monthly"],
  ["/explore", 0.8, "weekly"],
  ["/markets", 0.7, "weekly"],
  ["/factories", 0.7, "weekly"],
  ["/sourcing", 0.8, "monthly"],
  ["/visit", 0.7, "monthly"],
  ["/book", 0.7, "monthly"],
  ["/pickup", 0.6, "monthly"],
  ["/about", 0.6, "monthly"],
  ["/contact", 0.6, "monthly"],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await publicSiteUrl();
  /* Published guide rows only — the readers never return a draft. */
  const [cities, markets, factories] = await Promise.all([listCities(), listMarkets(), listFactories()]);
  const guide: [path: string, priority: number][] = [
    ...cities.map((c) => [`/cities/${c.slug}`, 0.7] as [string, number]),
    ...markets.map((m) => [`/markets/${m.slug}`, 0.6] as [string, number]),
    ...factories.map((f) => [`/factories/${f.slug}`, 0.5] as [string, number]),
  ];
  return [
    ...PAGES.map(([path, priority, changeFrequency]) => ({
      url: `${base}${path}`,
      changeFrequency,
      priority,
    })),
    ...guide.map(([path, priority]) => ({
      url: `${base}${path}`,
      changeFrequency: "monthly" as const,
      priority,
    })),
  ];
}
