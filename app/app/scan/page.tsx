import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, QrCode, Search } from "lucide-react";

import { CounterScanner } from "@/components/app/counter-scanner";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { counterLookup } from "@/lib/counter";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Scan & release" };

/**
 * THE DAR COUNTER, FROM THE TOP.
 *
 * A customer arrives with a box number, a printed note, or nothing at all, and
 * the clerk has one screen to start from. Scanning any code this business
 * prints — the sticker on the carton, the QR on the pickup note, the older
 * consignment codes — opens the same handover screen, and so does typing a
 * tracking number or a name.
 *
 * THE LOOKUP IS NOT A SECOND WAY IN. It finds the consignment and nothing
 * more; whether those boxes may leave is computed on the screen it opens, and
 * again inside the release transaction. Nothing on this page can grant it, and
 * nothing on this page shows a figure — the warehouse never sees a price.
 */
export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await primeLocale();
  await requirePermission("cargo.scan");

  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const matches = query ? await counterLookup(query) : [];

  return (
    <div className="mx-auto max-w-xl space-y-6 pb-16">
      <PageHeader
        title={T("Scan & release")}
        description={T("Scan the box. Everything you need to hand it over is on this screen.")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-4" />
            {T("Scan the box")}
          </CardTitle>
          <CardDescription>
            {T("The sticker on the carton, or the code on the customer's printed pickup note — either one opens their cargo.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CounterScanner />
        </CardContent>
      </Card>

      {/*
        NO NOTE, NO LABEL, STILL A CUSTOMER.

        They lost the paper, or nobody printed one, or they are holding a photo
        of a WhatsApp message. Turning them away because the counter has no way
        to look them up is how a warehouse learns to release on a customer's
        word. So: find the cargo by anything they can say, and let the handover
        screen state plainly what is missing and who fixes it.
      */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" />
            {T("No pickup note?")}
          </CardTitle>
          <CardDescription>
            {T("Look the cargo up by tracking number, shipping mark, customer name or phone. The screen it opens says what is missing and what may be done about it.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex gap-2">
            <Input
              name="q"
              defaultValue={query}
              placeholder={T("BW0125, a mark, a name or 0712…")}
              aria-label={T("Find the customer's cargo")}
              className="h-14 text-base"
            />
            <Button type="submit" size="lg" className="h-14 px-6 text-base">
              <Search />
              {T("Look up")}
            </Button>
          </form>

          {query && matches.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {T("Nothing here matches that. Try the tracking number, the shipping mark, the name or the phone.")}
            </p>
          ) : null}

          {matches.length > 0 ? (
            <ul className="space-y-2">
              {matches.map((match) => (
                <li key={match.cargoId}>
                  <Link
                    href={`/app/scan/${match.cargoId}`}
                    className="flex items-center gap-3 rounded-xl border p-4 hover:bg-secondary"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{match.receiver}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="tnum">{match.reference}</span>
                        {match.shippingMark ? ` · ${match.shippingMark}` : ""}
                        {` · ${match.boxes} `}
                        {match.boxes === 1 ? T("box") : T("boxes")}
                      </p>
                      {/* The refusal, in lib/release.ts's own words, so the
                          clerk has the sentence before the customer has
                          finished walking to the counter. */}
                      {!match.ready && match.blockedBy ? (
                        <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          {T(match.blockedBy)}
                        </p>
                      ) : null}
                    </div>
                    <Badge tone={match.ready ? "good" : "warn"}>
                      {match.ready ? T("may go") : T("not ready")}
                    </Badge>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
