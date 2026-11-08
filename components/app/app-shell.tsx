"use client";

import { useEffect, useRef, useState, useTransition, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as Icons from "lucide-react";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Globe, Languages, LogOut, Menu, Moon, Search, Sun, UserRound, X } from "lucide-react";
import { useTheme } from "next-themes";
import type { Role } from "@prisma/client";

import { MobileTabbar } from "@/components/app/mobile-tabbar";
import { NavTrail } from "@/components/app/nav-trail";
import { NewVersionNotice } from "@/components/app/new-version-notice";
import { RecordPaymentDialog } from "@/components/app/record-payment-dialog";
import { MobileBack } from "@/components/app/smart-back";
import { NavProvider } from "@/components/app/section-tabs";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";
import { BUILD_ID } from "@/lib/build-id";
import { type NavItem, type NavSection } from "@/lib/nav";
import { setLanguage } from "@/lib/actions/profile";
import { LocaleProvider } from "@/components/app/locale-provider";
import { t } from "@/lib/i18n";
import { LOCALE_LABELS, type Locale } from "@/lib/locale";
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
  /* Today, short, for the phone bar. Filled in after load so the server and the
     browser never disagree about what day it is. */
  const [today, setToday] = useState("");
  useEffect(() => {
    /* In the reader's language and on the desk's own clock — Foshan's day,
       for Foshan — so the bar never disagrees with the banner under it. */
    setToday(
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: user.role === "CHINA_WAREHOUSE" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam",
      }).format(new Date())
    );
  }, [locale, user.role]);
  /* A move to another page closes the phone's menu, whichever link moved it —
     the person menu's Profile and Notifications included. */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
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

  /* WHICH SECTIONS ARE UNFOLDED.

     The one holding the page you are on opens by itself, and opens again when
     you move to another; the rest stay folded until pressed, so a desk with
     five departments shows five lines, not thirty. What was pressed is
     remembered for as long as the page is open. On Home, the first section is
     the one shown.

     A short menu is not folded at all: a floor clerk with ten rows in all
     should see every one of them without pressing anything, because the row
     they need ten times an hour — Receive cargo — must never be behind a fold. */
  const [pressed, setPressed] = useState<Record<string, boolean>>({});
  const labelled = sections.filter((s) => s.label);
  const shortMenu = sections.reduce((n, s) => n + s.items.length, 0) <= 14;
  const here = sections.find((s) => s.label && s.items.some((i) => i.href === current))?.label;
  /* On a phone or tablet the menu is opened because somebody wants to GO
     somewhere, so every group starts open and the list fills the drawer and
     scrolls; folded, the headings left most of a full-height panel empty.
     Folding one by hand still sticks. A computer keeps the one group open. */
  const [handheld, setHandheld] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setHandheld(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const isOpen = (s: NavSection) =>
    s.label in pressed ? pressed[s.label] : handheld || shortMenu || s.label === (here ?? labelled[0]?.label);
  const toggle = (s: NavSection) => setPressed((p) => ({ ...p, [s.label]: !isOpen(s) }));
  useEffect(() => {
    if (here) setPressed((p) => (p[here] === true ? p : { ...p, [here]: true }));
  }, [here]);

  /* THE RAIL CAN SHRINK TO ICONS. What was chosen is kept in this browser; the
     first paint is the rail on server and browser alike, so they agree. */
  /* The menu starts as the slim icon rail on a computer, on every desk, and
     stays wide only once somebody has opened it — the choice is kept in this
     browser. */
  const [collapsed, setCollapsed] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("bw.sidebar") === "wide") setCollapsed(false);
    } catch {
      /* private window or blocked storage: it simply starts slim */
    }
  }, []);
  const setRail = (next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem("bw.sidebar", next ? "collapsed" : "wide");
    } catch {
      /* same */
    }
  };

  /* SEARCH THE MENU. Every row this person may open, found by what it is called
     — in their own language or in English. Enter goes to the first one; Ctrl or
     Cmd + K gets to the box from anywhere on a computer. */
  const router = useRouter();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const every = [
    { item: home as { href: string; icon: string; label: string }, where: "" },
    ...sections.flatMap((s) => s.items.map((item) => ({ item, where: s.label }))),
  ];
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? every.filter(({ item }) => tr(item.label).toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
    : [];
  const focusSearch = () => {
    if (collapsed) setRail(false);
    setTimeout(() => searchRef.current?.focus(), 60);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && window.matchMedia("(min-width: 1024px)").matches) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  const go = (href: string) => {
    setQ("");
    setOpen(false);
    router.push(href);
  };

  /* TE's rows: no box at all — the open page is a thin gold bar and a gold icon;
     a row under the pointer only gets brighter. 44px on a phone. */
  const row = (item: { href: string; icon: string; label: string }, child = false) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded-lg px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60 max-lg:gap-2.5 max-lg:px-2.5 max-lg:text-[12.5px]",
          child ? "py-1.5 max-lg:min-h-7 max-lg:py-1" : "py-2 max-lg:min-h-8 max-lg:py-1.5",
          active ? "glass-active g-strong font-medium" : "glass-row g-text g-hover"
        )}
      >
        <Glyph name={item.icon} className={cn("shrink-0", child ? "size-4 max-lg:size-[15px]" : "size-[18px] max-lg:size-4", active && "g-gold")} />
        <span className="min-w-0 flex-1 truncate">{tr(item.label)}</span>
      </Link>
    );
  };

  /* The box at the top of the menu. */
  const searchBox = (ref?: React.Ref<HTMLInputElement>, hint = false) => (
    <div className="px-3 pb-1.5">
      <label className="glass-field flex items-center gap-2.5 px-3.5 py-2 text-sm g-soft max-lg:px-2.5 max-lg:py-1.5 max-lg:text-[13px]">
        <Search className="size-4 shrink-0" />
        <input
          ref={ref}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) go(hits[0].item.href);
            if (e.key === "Escape") setQ("");
          }}
          placeholder={tr("Search pages")}
          className="g-input g-strong min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
        {hint ? (
          <kbd className="glass-kbd g-soft hidden shrink-0 rounded-md px-1.5 py-0.5 font-sans text-[10px] font-semibold lg:block">⌘K</kbd>
        ) : null}
      </label>
    </div>
  );

  const searchResults = (
    <ul className="space-y-0.5">
      {hits.length === 0 ? (
        <li className="g-soft px-4 py-6 text-center text-sm">{tr("Nothing found")}</li>
      ) : (
        hits.map(({ item, where }) => (
          <li key={`${where}-${item.href}-${item.label}`}>
            <button
              type="button"
              onClick={() => go(item.href)}
              className="glass-row g-text g-hover flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] max-lg:min-h-8 max-lg:gap-2.5 max-lg:px-2.5 max-lg:py-1.5 max-lg:text-[12.5px]"
            >
              <Glyph name={item.icon} className="size-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{tr(item.label)}</span>
              {where ? <span className="g-soft shrink-0 text-[11px]">{tr(where)}</span> : null}
            </button>
          </li>
        ))
      )}
    </ul>
  );

  const LABEL = "px-4 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] g-dim";
  const nav = (
    <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 [scrollbar-width:thin]">
      {needle ? (
        <div className="mt-2">{searchResults}</div>
      ) : (
        <>
          {/* Home stands on its own above everything, because every desk starts and
              returns here and it belongs to no department. A section with no
              heading is the desk's own top rows and stands with it. */}
          <p className={cn(LABEL, "pt-3")}>{tr("Main")}</p>
          <ul className="space-y-0.5">
            <li>{row(home)}</li>
            {sections
              .filter((section) => !section.label)
              .flatMap((section) => section.items)
              .map((item) => (
                <li key={item.href}>{row(item)}</li>
              ))}
          </ul>

          {labelled.length > 0 ? <p className={cn(LABEL, "pt-4")}>{tr("Workspace")}</p> : null}
          {labelled.map((section) => {
            const shown = isOpen(section);
            const lit = section.label === here;
            return (
              <div key={section.label} className="mt-0.5">
                <button
                  type="button"
                  onClick={() => toggle(section)}
                  aria-expanded={shown}
                  className={cn(
                    "glass-row g-hover flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60 max-lg:min-h-8 max-lg:gap-2.5 max-lg:px-2.5 max-lg:py-1.5 max-lg:text-[12.5px]",
                    lit ? "g-strong" : "g-text"
                  )}
                >
                  <Glyph name={section.icon} className={cn("size-[18px] shrink-0 max-lg:size-4", lit ? "g-gold" : "g-icon")} />
                  <span className="min-w-0 flex-1 truncate">{tr(section.label)}</span>
                  <ChevronDown className={cn("g-icon size-[15px] shrink-0 transition-transform duration-200", shown && "rotate-180")} />
                </button>
                {/* A group's pages hang off a thin line with a curved elbow at
                    each one, like branches — what makes it read as one group. */}
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                    shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <div className="overflow-hidden" inert={!shown}>
                    <ul className="glass-tree ml-[1.7rem] mt-1 space-y-0.5 pb-1 pl-3.5">
                      {section.items.map((item) => (
                        <li key={item.href}>{row(item, true)}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </nav>
  );

  /* The company in a white disc ringed in gold, its name and line beside it. */
  const brand = (compact: boolean) => (
    <Link
      href={home.href}
      onClick={() => setOpen(false)}
      title="BlueWave Cargo"
      className="flex min-w-0 items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white ring-2 ring-[#fdc400]/45 max-lg:size-9">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/bluewave-mark.png" alt="" className="h-[18px] w-auto" />
      </span>
      {compact ? null : (
        <span className="min-w-0 leading-tight">
          <span className="g-strong block truncate text-sm font-semibold tracking-tight max-lg:text-[13px]">BlueWave Cargo</span>
          <span className="g-soft mt-0.5 block truncate text-xs">{tr("Sea Cargo")}</span>
        </span>
      )}
    </Link>
  );

  /* The narrow rail: only icons, a thin line between the sets, and the person.
     Every page is its own icon, a plain link; its name shows on hover. */
  const railRow = (item: { href: string; icon: string; label: string }) => {
    const active = isActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={tr(item.label)}
        aria-label={tr(item.label)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative mb-0.5 grid size-10 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60",
          active ? "glass-active g-strong" : "glass-row g-soft g-hover"
        )}
      >
        <Glyph name={item.icon} className={cn("size-[17px]", active && "g-gold")} />
      </Link>
    );
  };
  const rail = (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <div className="pb-2 pt-4">{brand(true)}</div>
      <button
        type="button"
        onClick={focusSearch}
        title={`${tr("Search pages")}  (Ctrl K)`}
        aria-label={tr("Search pages")}
        className="glass-row g-text g-hover mb-1 grid size-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60"
      >
        <Search className="size-[18px]" />
      </button>
      <nav className="flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-full flex-col items-center">
          <div aria-hidden className="glass-divider my-1.5 w-7" />
          {railRow(home)}
          {sections.filter((s) => !s.label).flatMap((s) => s.items).map(railRow)}
        </div>
        {labelled.map((section) => (
          <div key={section.label} className="flex w-full flex-col items-center">
            <div aria-hidden className="glass-divider my-1.5 w-7" />
            {section.items.map(railRow)}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <LocaleProvider locale={locale}>
    <div
      className="flex min-h-dvh max-w-full overflow-x-clip bg-surface-2 print:max-w-none print:overflow-visible"
      style={{ backgroundImage: "radial-gradient(48rem 36rem at 0% 0%, rgba(54, 96, 200, 0.14), transparent 70%), radial-gradient(40rem 30rem at 100% 100%, rgba(54, 96, 200, 0.08), transparent 70%)" }}
    >
      {/* Desktop menu: a floating glass panel that can fold to a rail of icons. */}
      <aside
        className={cn(
          "sticky top-0 z-40 hidden h-dvh shrink-0 p-3 transition-[width] duration-300 ease-out lg:block print:!hidden",
          collapsed ? "w-[5.9rem]" : "w-[15.5rem]"
        )}
      >
        <div className={cn("glass-panel flex flex-col", collapsed ? "max-h-[calc(100dvh-1.5rem)]" : "h-full")}>
          {collapsed ? rail : (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center justify-between gap-2 px-4 pb-3 pr-7 pt-4">{brand(false)}</div>
              {searchBox(searchRef, true)}
              {nav}
            </div>
          )}
          <UserFooter user={user} locale={locale} unread={unread} compact={collapsed} />
        </div>
        {/* Fold and unfold, on the panel's own edge. */}
        <button
          type="button"
          onClick={() => setRail(!collapsed)}
          aria-label={collapsed ? tr("Expand menu") : tr("Collapse menu")}
          title={collapsed ? tr("Expand menu") : tr("Collapse menu")}
          className="glass-chip absolute -right-0.5 top-[2.4rem] z-10 grid size-7 place-items-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.4)] ring-1 ring-black/10 outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-[#fdc400] dark:ring-white/10"
        >
          {collapsed ? <ChevronRight className="size-[15px]" strokeWidth={2.5} /> : <ChevronLeft className="size-[15px]" strokeWidth={2.5} />}
        </button>
      </aside>

      {/* Mobile drawer: the same glass panel, floating off the edge. */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label={tr("Close menu")}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          {/* The glass is on an inner layer: .glass-panel sets position: relative,
              which on this element would undo the absolute top and bottom that
              hold the drawer to the screen's height — the menu then grew past
              the bottom of the phone and its list could not scroll. */}
          <aside className="drawer-in absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 top-[max(0.75rem,env(safe-area-inset-top))] w-[14.75rem] max-w-[78vw]">
            <div className="glass-panel glass-drawer flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
              {brand(false)}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tr("Close menu")}
                className="glass-row g-text grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60"
              >
                <X className="size-[17px]" />
              </button>
            </div>
            {searchBox()}
            {nav}
            <UserFooter user={user} locale={locale} unread={unread} />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* On a phone the bar floats as a rounded card — menu, today's date, the
            bell. A computer has no bar at all: the banner carries the bell and
            the night switch, and the person's menu the rest. */}
        <header className="sticky top-0 z-30 px-3 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden print:hidden">
          <div className="glass flex h-14 items-center gap-2 rounded-2xl border border-border/60 px-2 shadow-sm lg:h-16 lg:gap-3 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:px-8 lg:shadow-none">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label={tr("Open menu")}
            >
              <Menu />
            </Button>
            {pathname === home.href ? (
              <span className="min-w-0 truncate text-sm font-medium text-foreground/80 lg:hidden">{today}</span>
            ) : null}
            <div className="min-w-0 lg:hidden">
              <MobileBack />
            </div>
            <div className="ml-auto flex items-center gap-1 lg:gap-3">
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {tr(user.departmentLabel ?? user.roleLabel)}
              </span>

              {/* THE WAY OUT TO THE PUBLIC SITE, from every desk. An ordinary
                  in-tab link: same origin, so the session stays and coming back
                  lands on the desk they left. On a phone it is in the user menu. */}
              <Link
                href="/"
                title={tr("Open the public website — you stay signed in")}
                className="hidden h-9 items-center gap-1.5 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:inline-flex"
              >
                <Globe className="size-[18px]" />
                <span>{tr("Main site")}</span>
              </Link>

              {/* THE BELL BELONGS WHERE PEOPLE LOOK FOR IT: the count is visible
                  from every screen, which is the only reason to keep a count. */}
              <Link
                href="/app/notifications"
                aria-label={unread > 0 ? `${tr("Notifications")}, ${unread}` : tr("Notifications")}
                className="relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:size-9"
              >
                <Bell className="size-[18px]" />
                {unread > 0 ? (
                  <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-signal px-1 text-[10px] font-semibold leading-[18px] text-white">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : null}
              </Link>

              <span className="hidden size-9 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-foreground lg:grid">
                {initials(user.name)}
              </span>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-6 print:p-0">
          {/* Records where the reader walked, for every back control. */}
          <Suspense fallback={null}>
            <NavTrail />
          </Suspense>
          {/* A way back on a computer too, for a page whose header has none. */}
          <MobileBack desktop />
          {/* Offered, never forced: a clerk half-way through a consignment must
              not have the form pulled out from under them. */}
          <NewVersionNotice build={BUILD_ID} />
          {/* A ceiling on the reading width. On a 2560 screen a table stretched
              edge to edge puts a name and its balance a head-turn apart. */}
          <div className="mx-auto w-full max-w-[1920px]">
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
  compact = false,
}: {
  user: { name: string; email: string; role: Role; roleLabel: string };
  locale: Locale;
  unread?: number;
  compact?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  /* The glass panel is a containing block for anything fixed inside it, so a
     full-screen catcher in here would only cover the panel. Listen on the
     document instead: a press outside the menu, or Escape, closes it. */
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);
  const tr = (text: string) => t(locale, text);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === "dark";
  /* One row switches to the other language, named in its own script. */
  const other: Locale = locale === "zh" ? "en" : "zh";
  const [switching, startSwitch] = useTransition();
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  const item = "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-foreground/5 dark:hover:bg-white/[0.06]";
  return (
    <div ref={wrapper} className={cn("relative shrink-0", compact ? "flex flex-col items-center pb-3" : "px-3 pb-3 max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>
      <div aria-hidden className="glass-divider mb-2 w-full" />
      {menu ? (
        <>
          {/* Everything that is not a page lives here, so the menu itself stays
              a list of pages: the profile, the bell, the theme, the language, the
              public site and the way out. Navy like the menu it opens from. */}
          <div
            className={cn(
              "absolute z-50 w-44 rounded-2xl border border-border/70 bg-popover p-1.5 text-popover-foreground shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)] dark:border-white/10 dark:bg-[linear-gradient(180deg,#13234b,#0c1838)] dark:text-white",
              compact ? "bottom-2 left-full ml-3" : "bottom-full left-3 mb-2"
            )}
          >
            <p className="px-2.5 pb-1.5 pt-1.5">
              <span className="block break-words text-[13px] font-semibold leading-snug">{user.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground dark:text-white/55">{tr(user.roleLabel)}</span>
            </p>
            <Link href="/app/profile" onClick={() => setMenu(false)} className={item}>
              <UserRound className="size-3.5 opacity-70" />
              {tr("Profile")}
            </Link>
            <Link href="/app/notifications" onClick={() => setMenu(false)} className={item}>
              <Bell className="size-3.5 opacity-70" />
              <span className="flex-1">{tr("Notifications")}</span>
              {unread > 0 ? (
                <span className="rounded-full bg-signal px-1.5 text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>
              ) : null}
            </Link>
            {/* One row each, an icon and one word: the look to switch to, and
                the other language. */}
            <button type="button" onClick={() => setTheme(dark ? "light" : "dark")} className={cn(item, "w-full text-left")}>
              {dark ? <Sun className="size-3.5 opacity-70" /> : <Moon className="size-3.5 opacity-70" />}
              {dark ? tr("Light") : tr("Dark")}
            </button>
            <button
              type="button"
              disabled={switching}
              onClick={() =>
                startSwitch(async () => {
                  await setLanguage(other);
                  setMenu(false);
                  router.refresh();
                })
              }
              className={cn(item, "w-full text-left disabled:opacity-60")}
            >
              <Languages className="size-3.5 opacity-70" />
              {LOCALE_LABELS[other]}
            </button>
            <Link href="/" onClick={() => setMenu(false)} className={item}>
              <Globe className="size-3.5 opacity-70" />
              {tr("Website")}
            </Link>
            <div className="mx-1 my-1 h-px bg-border dark:bg-white/10" />
            <form action={logout}>
              <button type="submit" className={cn(item, "w-full text-rose-600 hover:bg-rose-500/10 dark:text-rose-400")}>
                <LogOut className="size-3.5" />
                {tr("Logout")}
              </button>
            </form>
          </div>
        </>
      ) : null}
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        title={user.name}
        className={cn(
          "glass-row flex w-full items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[#fdc400]/60",
          compact ? "justify-center p-1" : "px-2 py-2"
        )}
      >
        <span className="relative grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1f4e8c] to-[#0e2a52] text-xs font-semibold text-white ring-1 ring-white/25">
          {initials(user.name)}
          {unread > 0 ? <span aria-hidden className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-signal ring-2 ring-[#0a1a33]" /> : null}
        </span>
        {compact ? <span className="sr-only">{user.name}</span> : <span className="g-strong min-w-0 flex-1 truncate text-sm font-semibold">{firstName}</span>}
      </button>
    </div>
  );
}
