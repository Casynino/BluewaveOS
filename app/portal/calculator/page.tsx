import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PriceCalculator } from "@/components/site/price-calculator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { publicRateBook } from "@/lib/public-estimate";
import { requireCustomer } from "@/lib/session";

export const metadata: Metadata = { title: "Shipping calculator" };

/**
 * The same calculator as the public site, priced by the server from the live
 * rate book and exchange rate — nothing here is a copy of a rate. "Book"
 * stays inside the portal, where the request is already the customer's.
 */
export default async function PortalCalculatorPage() {
  const locale = DEFAULT_LOCALE;
  await requireCustomer();
  const rates = await publicRateBook("LCL");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t(locale, "Shipping calculator")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Estimated shipping cost. Final price is confirmed by BlueWave Cargo after cargo verification.")}
        </p>
      </header>
      {/* With no published rate the calculator is a select with nothing in it
          and a price that never arrives. Say so and offer the way round it,
          as the public page does. */}
      {rates.length ? (
        <PriceCalculator
          cargoTypes={rates.map((r) => r.cargoType)}
          units={Object.fromEntries(rates.map((r) => [r.cargoType, r.unit]))}
          bookPath="/portal/book"
        />
      ) : (
        <Card>
          <EmptyState
            icon="Calculator"
            title="Our rate card is being updated"
            description="Tell us what you are shipping and the office will come back with a price."
            action={
              <Button asChild size="sm">
                <Link href="/portal/book">{t(locale, "Book a shipment")}</Link>
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
}
