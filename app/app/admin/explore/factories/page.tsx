import type { Metadata } from "next";

import { ExploreFactories, type FactoryRow } from "@/components/app/explore-factories";
import { ExploreTabs } from "@/components/app/explore-tabs";
import { PageHeader } from "@/components/app/page-header";
import { prisma } from "@/lib/prisma";
import { primeLocale, T } from "@/lib/server-t";
import { requirePermission } from "@/lib/session";

import { libraryPhotos } from "../photos";

export const metadata: Metadata = { title: "Factories" };

export default async function ExploreFactoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  await primeLocale();
  await requirePermission("content.manage");
  const params = await searchParams;

  const [factories, cities, categories, photos] = await Promise.all([
    prisma.factory.findMany({
      orderBy: [{ published: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { city: { select: { name: true } }, categories: { select: { id: true } } },
    }),
    prisma.chinaCity.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    libraryPhotos(),
  ]);

  const rows: FactoryRow[] = factories.map((f) => ({
    id: f.id,
    slug: f.slug,
    name: f.name,
    cityId: f.cityId,
    cityName: f.city?.name ?? null,
    district: f.district,
    industry: f.industry,
    summary: f.summary,
    body: f.body,
    products: f.products,
    production: f.production,
    moq: f.moq,
    exportExperience: f.exportExperience,
    listing: f.listing,
    visitsAvailable: f.visitsAvailable,
    heroImage: f.heroImage,
    gallery: f.gallery,
    imagesIllustrative: f.imagesIllustrative,
    latitude: f.latitude,
    longitude: f.longitude,
    categoryIds: f.categories.map((c) => c.id),
    featured: f.featured,
    published: f.published,
    sortOrder: f.sortOrder,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={T("Factories")}
        description={T("Factories the website lists. Add only real factories, and publish one only after its details have been checked.")}
        back={{ href: "/app/admin/explore", label: "China guide" }}
      />
      <ExploreTabs />
      <ExploreFactories
        factories={rows}
        cities={cities}
        categories={categories}
        photos={photos}
        startNew={params.new === "1"}
        editId={params.edit}
      />
    </div>
  );
}
