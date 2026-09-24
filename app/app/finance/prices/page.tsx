import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PriceList } from "@/components/app/price-list";
import { Card } from "@/components/ui/card";
import { priceListForChinaFloor } from "@/lib/price-list";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoTypeOptions } from "@/lib/valuation";

import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Confirm prices" };

/**
 * THE PRICES WAITING ON THIS DESK, ON A SCREEN OF THEIR OWN.
 *
 * Confirming a price is a job somebody sits down to do: read down a column of
 * figures, correct the two that are wrong, press once. Squeezed onto the floor
 * list it was a long table about money above a longer table about boxes, and
 * whichever one you came for you scrolled past the other.
 *
 * Only what Foshan has measured and nobody has sailed. A consignment already
 * on a container is priced from that container's own list, where its sailing
 * and its manifest are — see /app/containers/arrived.
 */
export default async function ConfirmPricesPage() {
  await primeLocale();
  const user = await requirePermission("invoice.priceConfirm");

  const [list, cargoTypes] = await Promise.all([
    priceListForChinaFloor(),
    cargoTypeOptions(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Confirm prices")}
        description={T("What Foshan has measured and nobody has billed. The rate book has already worked each one out; correct anything wrong on its row, then confirm the rest in one press.")}
      />

      {list.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="ClipboardCheck"
            title={T("Nothing is waiting for a price")}
            description={T("A consignment appears here as soon as Foshan measures it. Cargo already on a sailing is priced from its own container.")}
          />
        </Card>
      ) : (
        <PriceList
          heading={
            <span className="font-medium text-foreground">
              {T("Still in China, not yet on a container")}
            </span>
          }
          containerId={null}
          scope="china"
          list={list}
          cargoTypes={cargoTypes}
          canConfirm
          locale={await primeLocale()}
        />
      )}

      {/* The other half of the same job, where its sailing is. */}
      {can(user.role, "container.view") ? (
        <p className="text-sm text-muted-foreground">
          {T("Cargo already on a container is priced from")}{" "}
          <Link
            href="/app/containers/arrived?view=pricing"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {T("Arrived containers")}
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
