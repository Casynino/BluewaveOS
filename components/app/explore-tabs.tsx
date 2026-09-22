"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/app/admin/explore", label: "Overview" },
  { href: "/app/admin/explore/cities", label: "Cities" },
  { href: "/app/admin/explore/categories", label: "Product categories" },
  { href: "/app/admin/explore/factories", label: "Factories" },
  { href: "/app/admin/explore/markets", label: "Markets" },
] as const;

/** The China guide's own screens, one row of pills like SectionTabs. */
export function ExploreTabs() {
  const t = useT();
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/app/admin/explore" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t("China guide")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={active(tab.href) ? "page" : undefined}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
            active(tab.href)
              ? "border-brand bg-brand text-brand-foreground"
              : "bg-card text-foreground hover:bg-secondary"
          )}
        >
          {t(tab.label)}
        </Link>
      ))}
    </nav>
  );
}
