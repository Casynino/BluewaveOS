import Link from "next/link";
import { SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { primeLocale, T } from "@/lib/server-t";

/**
 * A record that does not exist, or an address that never did — inside the
 * shell, so the reader keeps the menu and the search rather than a dead end.
 */
export default async function AppNotFound() {
  await primeLocale();
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <SearchX className="size-7" />
      </span>
      <p className="mt-5 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {T("We could not find that")}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {T(
          "The link may be old, the record may have been removed, or the reference was mistyped."
        )}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/app/search">{T("Search")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/app/dashboard">{T("Home")}</Link>
        </Button>
      </div>
    </div>
  );
}
