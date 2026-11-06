"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronDown, Globe, LogOut, Menu, X } from "lucide-react";
import type { Role } from "@prisma/client";

import { MobileTabbar } from "@/components/app/mobile-tabbar";
import { NavTrail } from "@/components/app/nav-trail";
import { NewVersionNotice } from "@/components/app/new-version-notice";
import { RecordPaymentDialog } from "@/components/app/record-payment-dialog";
import { MobileBack } from "@/components/app/smart-back";
import { NavProvider } from "@/components/app/section-tabs";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { logout } from "@/lib/actions/auth";
import { BUILD_ID } from "@/lib/build-id";
import { type NavItem, type NavSection } from "@/lib/nav";
import { LanguageSwitch } from "@/components/app/language-switch";
import { LocaleProvider } from "@/components/app/locale-provider";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

function Glyph({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[
    name
  ];
  return Icon ? <Icon className={className} /> : null;
}

export function AppShell({
  sections,
  home,
  user,
  unread,
  canRecordPayment = false,
  canClearShortfall = false,
  locale = "en",
  children,
}: {
  /** The language this person reads the system in. */
  locale?: Locale;
  canRecordPayment?: boolean;
  canClearShortfall?: boolean;
  sections: NavSection[];
  /** Where this desk's Home row goes. */
  home: NavItem;
  user: { name: string; email: string; role: Role; roleLabel: string; departmentLabel: string | null };
  unread: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const tr = (text: string) => t(locale, text);

  /* The drawer covers the page, so Escape has to take it away again — a
     keyboard user otherwise has no way out but tabbing through every row. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* LONGEST MATCH WINS, AND ONLY ONE ITEM IS CURRENT.

     Every finance address starts with /app/finance, so a plain prefix test lit
     Overview on every finance screen, Collections beside Verify payments, and
     the Pickup list beside Collected cargo — two departments looking current
     at once. The single item whose address is the closest match is the one
     the reader is on. */
  const matches = (href: string) =>
    !href.startsWith("#") &&
    (pathname === href || pathname.startsWith(`${href}/`));
  const current = [home, ...sections.flatMap((s) => s.items)]
    .map((item) => item.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === current;

  /* FOLDED SECTIONS. A desk with five departments was one long column; now
     each department folds under its name, and only the one holding the
     current page starts open. What the reader opens or closes is remembered
     on this device; moving to a page always opens the section it lives in. */
  const FOLD_KEY = "bw.nav.open";
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FOLD_KEY) ?? "{}") as Record<string, boolean>;
      setOpened((now) => ({ ...saved, ...now }));
    } catch {
      /* no storage — every section simply follows the page */
    }
  }, []);
  const hereSection = sections.find((s) => s.items.some((i) => i.href === current))?.label;
  useEffect(() => {
    if (hereSection) setOpened((now) => (now[hereSection] ? now : { ...now, [hereSection]: true }));
  }, [hereSection]);
  const isOpen = (label: string) => opened[label] ?? label === hereSection;
  const toggle = (label: string) =>
    setOpened((now) => {
      const next = { ...now, [label]: !isOpen(label) };
      try {
        window.localStorage.setItem(FOLD_KEY, JSON.stringify(next));
      } catch {
        /* remembered for this visit only */
      }
      return next;
    });

  /* As on Target Express: the page you are on in the brand colour, the rest
     quiet. min-h-11 on a phone — 36px rows are a miss-tap apart one-handed;
     the computer keeps the tighter rhythm. */
  const row = (item: { href: string; icon: string; label: string }, inGroup = false) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-11 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors lg:min-h-0",
          active ? "bg-brand/10 font-medium text-brand" : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {/* The page you are on, marked on the hairline too. */}
        {active && inGroup ? <span aria-hidden className="absolute inset-y-1.5 -left-[9px] w-[3px] rounded-r bg-brand" /> : null}
        <Glyph name={item.icon} className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{tr(item.label)}</span>
      </Link>
    );
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
      {/* Home stands on its own above everything, because every desk starts and
          returns here and it belongs to no department. */}
      <div className="mb-4">{row(home)}</div>

      {sections.map((section) => {
        /* A section with no heading is the desk's own top rows, standing with
           Home rather than grouped under a name — never folded. */
        if (!section.label) {
          return (
            <ul key="top" className="mb-4 space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>{row(item)}</li>
              ))}
            </ul>
          );
        }
        const shown = isOpen(section.label);
        const holdsCurrent = section.label === hereSection;
        return (
          <div key={section.label} className="mb-1.5 last:mb-0">
            <button
              type="button"
              onClick={() => toggle(section.label)}
              aria-expanded={shown}
              className={cn(
                "focus-ring flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-muted/60 hover:text-foreground lg:min-h-0",
                holdsCurrent ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Glyph name={section.icon} className={cn("size-4 shrink-0", holdsCurrent ? "text-brand" : "text-muted-foreground/80")} />
              <span className="min-w-0 flex-1 truncate">{tr(section.label)}</span>
              <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200", !shown && "-rotate-90")} />
            </button>
            {/* Indented against a hairline: the pages read as belonging to the
                heading rather than as more top-level rows under it. */}
            {shown ? (
              <ul className="mb-2 ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-border/60 pl-2">
                {section.items.map((item) => (
                  <li key={item.href}>{row(item, true)}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-dvh bg-surface-2">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex print:!hidden">
        <div className="flex h-16 items-center border-b px-4">
          <Link href={home.href}>
            <BrandMark size={32} />
          </Link>
        </div>
        {nav}
        <UserFooter user={user} locale={locale} unread={unread} />
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={tr("Close menu")}
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="drawer-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <BrandMark size={32} />
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={tr("Close menu")}>
                <X />
              </Button>
            </div>
            {nav}
            <UserFooter user={user} locale={locale} unread={unread} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-3 border-b px-4 pt-[env(safe-area-inset-top)] lg:px-8 print:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label={tr("Open menu")}
          >
            <Menu />
          </Button>
          <Link href={home.href} className="lg:hidden">
            <BrandMark size={28} showWordmark={false} />
          </Link>
          <div className="min-w-0 lg:hidden">
            <MobileBack />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {tr(user.departmentLabel ?? user.roleLabel)}
            </span>

            {/* THE WAY OUT TO THE PUBLIC SITE, from every desk. Without it the
                only door out of the app was Sign out. An ordinary in-tab link:
                same origin, so the session stays and coming back lands on the
                desk they left. */}
            <Link
              href="/"
              title={tr("Open the public website — you stay signed in")}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:px-2.5"
            >
              <Globe className="size-[18px]" />
              <span className="hidden sm:inline">{tr("Main site")}</span>
              <span className="sr-only sm:hidden">{tr("Main site")}</span>
            </Link>

            {/* THE BELL BELONGS WHERE PEOPLE LOOK FOR IT. Buried in the menu it
                was a row you scrolled past; up here the count is visible from
                every screen, which is the only reason to keep a count at all. */}
            <Link
              href="/app/notifications"
              aria-label={
                unread > 0
                  ? `${tr("Notifications")}, ${unread}`
                  : tr("Notifications")
              }
              className="relative grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Bell className="size-[18px]" />
              {unread > 0 ? (
                <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-[18px] text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>

            <span className="grid size-9 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
              {initials(user.name)}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8 print:p-0">
          {/* Records where the reader walked, for every back control. */}
          <Suspense fallback={null}>
            <NavTrail />
          </Suspense>
          {/* Offered, never forced: a clerk half-way through a consignment must
              not have the form pulled out from under them. */}
          <NewVersionNotice build={BUILD_ID} />
          {/* A ceiling on the reading width. On a 2560 screen a table stretched
              edge to edge puts a name and its balance a head-turn apart. */}
          <div className="mx-auto w-full max-w-[1600px]">
            <NavProvider sections={sections}>{children}</NavProvider>
          </div>
        </main>
        {/* The room the bottom bar stands in, so the last row of a list is
            never under it. */}
        <div aria-hidden className="h-[calc(3.5rem_+_env(safe-area-inset-bottom))] lg:hidden print:hidden" />
        <MobileTabbar sections={sections} home={home} role={user.role} onMore={() => setOpen(true)} />
        {/* One dialog for the whole app, opened from any button or any link
            to #record-payment, over whatever screen the desk is on. */}
        {canRecordPayment ? <RecordPaymentDialog canClear={canClearShortfall} /> : null}
      </div>
    </div>
    </LocaleProvider>
  );
}

function UserFooter({
  user,
  locale,
  unread = 0,
}: {
  user: { name: string; email: string; role: Role; roleLabel: string };
  locale: Locale;
  unread?: number;
}) {
  return (
    /* Never scrolls away, and never sits under a phone's home bar: shrink-0
       keeps Sign out on screen under a long menu, and the safe-area padding
       keeps it pressable above the gesture bar. */
    <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {/* Your own name is where everybody looks for their own settings, so it
          is the way in rather than a menu item somebody has to find. */}
      <Link href="/app/profile" className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent">
        <span className="relative shrink-0">
          <span className="grid size-9 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
            {initials(user.name)}
          </span>
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{t(locale, user.roleLabel)}</span>
        </span>
      </Link>
      {/* How this person reads the screen: English or 中文, and light or dark. */}
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <LanguageSwitch current={locale} />
        <ThemeToggle />
      </div>
      <Separator className="my-2" />
      {/* Outlined, full width: the one control people go looking for should not
          be the hardest to find. */}
      <form action={logout}>
        <Button type="submit" variant="outline" className="h-11 w-full justify-start gap-2">
          <LogOut />
          {t(locale, "Sign out")}
        </Button>
      </form>
    </div>
  );
}
