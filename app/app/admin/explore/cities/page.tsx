import type { Metadata } from "next";

import { ExploreCities, type CityRow } from "@/components/app/explore-cities";
import { ExploreTabs } from "@/components/app/explore-tabs";
import { PageHeader } from "@/components/app/page-header";
import { prisma } from "@/lib/prisma";
import { primeLocale, T } from "@/lib/server-t";
import { requirePermission } from "@/lib/session";

import { libraryPhotos } from "../photos";

export const metadata: Metadata = { title: "Guide cities" };

export default async function ExploreCitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  await primeLocale();
  await requirePermission("content.manage");
  const params = await searchParams;

  const [cities, photos] = await Promise.all([
    prisma.chinaCity.findMany({
      orderBy: [{ published: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { markets: true, factories: true } } },
    }),
    libraryPhotos(),
  ]);

  const rows: CityRow[] = cities.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    nameZh: c.nameZh,
    province: c.province,
    tagline: c.tagline,
    summary: c.summary,
    body: c.body,
    knownFor: c.knownFor,
    whatToSource: c.whatToSource,
    businessDistricts: c.businessDistricts,
    travelNote: c.travelNote,
    heroImage: c.heroImage,
    gallery: c.gallery,
    services: c.services,
    featured: c.featured,
    published: c.published,
    sortOrder: c.sortOrder,
    markets: c._count.markets,
    factories: c._count.factories,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={T("Guide cities")}
        description={T("The Chinese cities the website describes: what each is known for, what to buy there, and what BlueWave can do from it.")}
        back={{ href: "/app/admin/explore", label: "China guide" }}
      />
      <ExploreTabs />
      <ExploreCities
        cities={rows}
        photos={photos}
        startNew={params.new === "1"}
        editId={params.edit}
      />
    </div>
  );
}
