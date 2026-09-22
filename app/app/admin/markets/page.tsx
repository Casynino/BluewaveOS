import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { MarketsAdmin, type MarketRow } from "@/components/app/markets-admin";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "China markets" };

export default async function MarketsAdminPage() {
  await primeLocale();
  const user = await requirePermission("content.manage");

  const [locale, markets] = await Promise.all([
    localeOf(user.id),
    prisma.marketInformation.findMany({
      orderBy: [{ published: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: MarketRow[] = markets.map((market) => ({
    id: market.id,
    slug: market.slug,
    name: market.name,
    city: market.city,
    category: market.category,
    summary: market.summary,
    body: market.body,
    sortOrder: market.sortOrder,
    published: market.published,
  }));

  const categories = [
    ...new Set(markets.map((m) => m.category?.trim()).filter((c): c is string => Boolean(c))),
  ].sort();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t(locale, "China markets")}
        description={t(
          locale,
          "What the support desk recommends when a customer asks where to buy."
        )}
        back={{ href: "/app/support/markets", label: "China markets" }}
        actions={
          /* City, categories, address, pictures and map pin for the public
             China guide are kept on their own screen. */
          <Button asChild variant="outline" size="sm">
            <Link href="/app/admin/explore/markets">
              <MapPin />
              {t(locale, "Guide details")}
            </Link>
          </Button>
        }
      />
      <MarketsAdmin markets={rows} categories={categories} locale={locale} />
    </div>
  );
}
