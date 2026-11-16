import Link from "next/link";
import { Search, type LucideIcon } from "lucide-react";

import { BannerTools } from "@/components/app/banner-tools";
import { GreetingBanner } from "@/components/app/greeting-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { t } from "@/lib/i18n";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer-locale";

/**
 * The banner at the top of a desk's home screen.
 *
 * It does three jobs at once: says whose desk this is, says what today is, and
 * puts the search box where the eye lands first — because the single most
 * common thing anybody does on arriving is look something up, and making them
 * find a search field in a sidebar first is a tax on every visit.
 *
 * The gradient is the brand's own three colours over a grid, dark in both
 * themes. It reads as a printed cover rather than as a piece of the interface,
 * which is what stops a bright panel from competing with the data below it.
 */
export async function DeskHero({
  greeting,
  name,
  department,
  subtitle,
  searchAction = "/app/search",
  searchPlaceholder = "Search cargo, customer or phone",
  title,
  kicker,
  search = true,
  action,
  actions,
}: {
  greeting: string;
  name: string;
  department: string;
  subtitle: string;
  searchAction?: string;
  searchPlaceholder?: string;
  /** The banner's heading when it should not be the person's own first name. */
  title?: string;
  /** The small line under the name; the desk by default. The owner reads "Director (MD)", the manager "Director". */
  kicker?: string;
  /** Management watches rather than looks things up: no search box under the banner. */
  search?: boolean;
  /** The one thing this desk does most, offered where they land. */
  action?: { href: string; label: string };
  /** A desk that starts more than one kind of job offers each, in order of use. */
  actions?: { href: string; label: string; icon?: LucideIcon }[];
}) {
  const locale = await viewerLocale();
  const tr = (text: string) => t(locale, text);
  const user = await requireUser();
  /* The day where this desk stands: Foshan reads its own date, everyone else Dar's. */
  const today = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: user.role === "CHINA_WAREHOUSE" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam",
  }).format(new Date());

  /* `action` (the one thing a desk does most) is already the first coloured
     shortcut under the banner, so it is not offered a second time here. */
  void action;
  const buttons = actions ?? [];

  /* The greeting every home opens on (owner, 16 Nov 2026, as on his ZELab
     system): "Mambo vipi?", the first name and one line — the same for every
     desk, no job title. The day is in the phone's top bar and on the computer's
     bell side; the search box, when a desk has one, sits on its own line below. */
  void greeting;
  void kicker;
  void department;
  void today;
  return (
    <div className="space-y-4">
      <GreetingBanner
        hello={tr("Mambo vipi?")}
        name={title ?? name}
        line={tr("Keep the cargo moving.")}
        tools={<BannerTools />}
      />
      {/* One slim rounded field with a magnifier; Enter searches. */}
      {search ? (
        <form action={searchAction} className="max-w-2xl">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              placeholder={tr(searchPlaceholder)}
              aria-label={tr("Search")}
              className="h-10 rounded-full pl-11 text-sm"
            />
          </label>
        </form>
      ) : null}
      {buttons.length ? (
        <div className="flex flex-wrap gap-2">
          {buttons.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button key={item.href} asChild size="sm" variant={index === 0 ? "default" : "outline"} className="h-8 rounded-full px-3.5 text-xs">
                <Link href={item.href}>
                  {Icon ? <Icon className="size-3.5" /> : null}
                  {tr(item.label)}
                </Link>
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
