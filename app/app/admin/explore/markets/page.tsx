import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";

import { ExploreMarketPlaces, type MarketPlaceRow } from "@/components/app/explore-market-place";
import { ExploreTabs } from "@/components/app/explore-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { primeLocale, T } from "@/lib/server-t";
import { requirePermission } from "@/lib/session";

import { libraryPhotos } from "../photos";

export const metadata: Metadata = { title: "Markets on the guide" };

export default async function ExploreMarketsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  await primeLocale();
  await requirePermission("content.manage");
  const params = await searchParams;

  const [markets, cities, categories, photos] = await Promise.all([
    prisma.marketInformation.findMany({
      orderBy: [{ published: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { cityRef: { select: { name: true } }, categories: { select: { id: true } } },
    }),
    prisma.chinaCity.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    libraryPhotos(),
  ]);

  const rows: MarketPlaceRow[] = markets.map((m) => ({
    id: m.id,
    slug: m.slug,
    name: m.name,
    city: m.city,
    summary: m.summary,
    published: m.published,
    cityId: m.cityId,
    cityName: m.cityRef?.name ?? null,
    address: m.address,
    visitDuration: m.visitDuration,
    imageUrl: m.imageUrl,
    gallery: m.gallery,
    latitude: m.latitude,
    longitude: m.longitude,
    categoryIds: m.categories.map((c) => c.id),
    featured: m.featured,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={T("Markets on the guide")}
        description={T("Place each market in a guide city, tag its product categories, and add its address, pictures and map position.")}
        back={{ href: "/app/admin/explore", label: "China guide" }}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/app/admin/markets">
              <Store />
              {T("Edit market descriptions")}
            </Link>
          </Button>
        }
      />
      <ExploreTabs />
      <ExploreMarketPlaces
        markets={rows}
        cities={cities}
        categories={categories}
        photos={photos}
        editId={params.edit}
      />
    </div>
  );
}
