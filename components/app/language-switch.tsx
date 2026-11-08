"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { setLanguage } from "@/lib/actions/profile";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * English or 中文, for the desk that needs it.
 *
 * Two buttons rather than a dropdown. There are exactly two languages and the
 * switch is pressed by somebody who cannot currently read the interface — a
 * closed menu labelled in the language they do not speak is the one control
 * that must never hide behind another one.
 *
 * Each label is written in its own language, for the same reason: "中文" is
 * legible to the person who needs it whatever the interface is currently set
 * to, which "Chinese" would not be.
 */
export function LanguageSwitch({
  current,
  className,
  compact = false,
}: {
  current: Locale;
  className?: string;
  /** A small "EN | 中文" pill, for a row in a menu. */
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("Language")}
      className={cn(
        compact
          ? "inline-flex rounded-full border border-border/70 bg-foreground/[0.04] p-0.5 dark:border-white/10 dark:bg-white/5"
          : "inline-flex rounded-lg border p-0.5",
        className
      )}
    >
      {LOCALES.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            disabled={pending || active}
            aria-current={active ? "true" : undefined}
            onClick={() => start(async () => { await setLanguage(locale); router.refresh(); })}
            className={cn(
              compact
                ? "focus-ring inline-flex h-6 min-w-9 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-colors disabled:cursor-default"
                : "focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors disabled:cursor-default",
              compact
                ? active
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:text-foreground"
                : active
                  ? "bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {locale === "en" && !compact ? <Languages className="h-3.5 w-3.5" /> : null}
            {compact && locale === "en" ? "EN" : LOCALE_LABELS[locale]}
          </button>
        );
      })}
    </div>
  );
}
