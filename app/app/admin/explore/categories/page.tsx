import type { Metadata } from "next";

import { ExploreCategories, type CategoryRow } from "@/components/app/explore-categories";
import { ExploreTabs } from "@/components/app/explore-tabs";
import { PageHeader } from "@/components/app/page-header";
import { prisma } from "@/lib/prisma";
import { primeLocale, T } from "@/lib/server-t";
import { requirePermission } from "@/lib/session";

import { libraryPhotos } from "../photos";

export const metadata: Metadata = { title: "Product categories" };

export default async function ExploreCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; edit?: string }>;
}) {
  await primeLocale();
  await requirePermission("content.manage");
  const params = await searchParams;

  const [categories, photos] = await Promise.all([
    prisma.productCategory.findMany({
      orderBy: [{ published: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { markets: true, factories: true } } },
    }),
    libraryPhotos(),
  ]);

  const rows: CategoryRow[] = categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    summary: c.summary,
    image: c.image,
    published: c.published,
    sortOrder: c.sortOrder,
    markets: c._count.markets,
    factories: c._count.factories,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={T("Product categories")}
        description={T("The kinds of goods visitors look for. Markets and factories are tagged with them so a visitor can find where a product is made or sold.")}
        back={{ href: "/app/admin/explore", label: "China guide" }}
      />
      <ExploreTabs />
      <ExploreCategories
        categories={rows}
        photos={photos}
        startNew={params.new === "1"}
        editId={params.edit}
      />
    </div>
  );
}
