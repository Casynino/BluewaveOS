import Link from "next/link";
import { Bell } from "lucide-react";

import { BannerTheme } from "@/components/app/banner-theme";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer-locale";

/**
 * The bell and the night / day switch, small at the left of a home banner on a
 * computer. A phone has them in its own bar and menu, so both hide below lg.
 */
export async function BannerTools() {
  const [user, locale] = await Promise.all([requireUser(), viewerLocale()]);
  const unread = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return (
    <>
      <Link
        href="/app/notifications"
        title={t(locale, "Notifications")}
        className="focus-ring relative hidden size-8 place-items-center rounded-full text-white/65 transition hover:text-white lg:inline-grid"
      >
        <Bell className="size-[15px]" />
        <span className="sr-only">{t(locale, "Notifications")}</span>
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
      <BannerTheme />
    </>
  );
}
