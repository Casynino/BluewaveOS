import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Factory, MapPin, Store, Tags } from "lucide-react";

import { ExploreImages } from "@/components/app/explore-images";
import { ExploreOfferForm } from "@/components/app/explore-offer";
import { ExploreTabs } from "@/components/app/explore-tabs";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { primeLocale, T } from "@/lib/server-t";
import { requirePermission } from "@/lib/session";

import { libraryPhotos } from "./photos";

export const metadata: Metadata = { title: "China guide" };

/**
 * THE CHINA GUIDE, FROM THE STAFF SIDE.
 *
 * Everything on the public explore pages — cities, product categories,
 * markets, factories — is kept on the screens tabbed from here. This page
 * shows how much of it is live, and holds the two switches that decide what
 * the website may offer a visitor at all.
 */
export default async function ExploreAdminPage() {
  await primeLocale();
  await requirePermission("content.manage");

  const count = async (
    query: (published: boolean) => Promise<number>
  ): Promise<{ live: number; draft: number }> => {
    const [live, draft] = await Promise.all([query(true), query(false)]);
    return { live, draft };
  };

  const [cities, categories, markets, factories, partners, company, photos] = await Promise.all([
    count((published) => prisma.chinaCity.count({ where: { published } })),
    count((published) => prisma.productCategory.count({ where: { published } })),
    count((published) => prisma.marketInformation.count({ where: { published } })),
    count((published) => prisma.factory.count({ where: { published } })),
    prisma.factory.count({ where: { listing: "PARTNER" } }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { sourcingServices: true, visitsEnabled: true },
    }),
    libraryPhotos(),
  ]);

  const tiles = [
    { href: "/app/admin/explore/cities", label: "Cities", icon: Building2, ...cities },
    { href: "/app/admin/explore/categories", label: "Product categories", icon: Tags, ...categories },
    { href: "/app/admin/explore/markets", label: "Markets", icon: Store, ...markets },
    { href: "/app/admin/explore/factories", label: "Factories", icon: Factory, ...factories },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={T("China guide")}
        description={T(
          "The cities, markets, factories and product categories on the public website, and what visitors may ask BlueWave for. Only published items appear on the website."
        )}
      />
      <ExploreTabs />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="group">
            <Card className="h-full p-4 transition-colors group-hover:bg-secondary/50">
              <div className="flex items-center justify-between text-muted-foreground">
                <tile.icon className="size-4" />
                <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-3 text-sm font-medium">{T(tile.label)}</p>
              <p className="tnum mt-1 text-2xl font-semibold">{tile.live}</p>
              <p className="tnum text-xs text-muted-foreground">
                {T("published")} · {tile.draft} {T("draft")}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <p className="text-sm font-medium">{T("Quick links")}</p>
        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <QuickLink href="/app/admin/explore/cities?new=1" icon={<Building2 className="size-4" />}>
            {T("Add a city")}
          </QuickLink>
          <QuickLink href="/app/admin/explore/categories?new=1" icon={<Tags className="size-4" />}>
            {T("Add a product category")}
          </QuickLink>
          <QuickLink href="/app/admin/explore/factories?new=1" icon={<Factory className="size-4" />}>
            {T("Add a factory")}
          </QuickLink>
          <QuickLink href="/app/admin/explore/markets" icon={<MapPin className="size-4" />}>
            {T("Place markets on the guide")}
          </QuickLink>
          <QuickLink href="/app/admin/markets" icon={<Store className="size-4" />}>
            {T("Edit market descriptions")}
          </QuickLink>
          <QuickLink href="/explore" icon={<ArrowRight className="size-4" />}>
            {T("Open the public guide")}
          </QuickLink>
        </ul>
        {partners > 0 ? (
          <p className="tnum mt-4 text-xs text-muted-foreground">
            {partners} {T("factories are shown as “BlueWave sourcing partner”. Check that each is a real, current relationship.")}
          </p>
        ) : null}
      </Card>

      <ExploreOfferForm
        sourcingServices={company?.sourcingServices ?? []}
        visitsEnabled={company?.visitsEnabled ?? false}
      />

      <ExploreImages photos={photos} />
    </div>
  );
}

function QuickLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-foreground hover:bg-secondary"
      >
        <span className="text-muted-foreground">{icon}</span>
        {children}
      </Link>
    </li>
  );
}
