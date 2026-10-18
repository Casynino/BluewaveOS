"use client";

import { useState } from "react";
import { BadgeDollarSign, Headset, Lock, LogIn, Search, ShieldCheck, Warehouse, type LucideIcon } from "lucide-react";

import { DeleteForm, ReactivateForm, SuspendForm } from "@/components/app/access-actions";
import { useT } from "@/components/app/locale-provider";
import { startWorkAs } from "@/lib/actions/developer";
import { cn } from "@/lib/utils";

export type AccessPerson = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleLabel: string;
  suspended: boolean;
  lastSeen: string;
  canWork: boolean;
  /** Suspended by this developer, so it may be re-activated here. */
  reactivatable: boolean;
  /** The last owner who can sign in — never suspended or deleted. */
  lastOwner: boolean;
};

const GROUPS: { title: string; body: string; icon: LucideIcon; roles: string[] }[] = [
  { title: "Owner", body: "The business owner's account. Full control of money, staff and reports.", icon: ShieldCheck, roles: ["ADMIN"] },
  { title: "Manager", body: "Runs the operation day to day and approves what needs a second signature.", icon: ShieldCheck, roles: ["MANAGER"] },
  { title: "Finance", body: "Confirms prices, takes and checks payments and follows up debts.", icon: BadgeDollarSign, roles: ["FINANCE"] },
  { title: "Warehouse", body: "Receives, loads, checks in and hands out cargo — Foshan and Dar. No money powers.", icon: Warehouse, roles: ["CHINA_WAREHOUSE", "DAR_WAREHOUSE"] },
  { title: "Customer Support", body: "Talks to customers and chases answers. Never verifies a payment or releases cargo.", icon: Headset, roles: ["CUSTOMER_SUPPORT"] },
  { title: "Other developer accounts", body: "Technical accounts besides yours. They look and work as others; they do not operate.", icon: ShieldCheck, roles: ["DEVELOPER"] },
];

/**
 * EVERY ACCOUNT, BY ROLE, WITH A SEARCH OVER THEM.
 *
 * As the Vegas console has it: a search by name, email or role narrows the
 * list as it is typed; each group says what that role does; each person shows
 * their role, when they last signed in, and Work as, Suspend and Delete. The
 * one owner who cannot be removed says so in place of the buttons.
 */
export function AccessPeople({ people }: { people: AccessPerson[] }) {
  const tx = useT();
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const match = (p: AccessPerson) =>
    !term || [p.name, p.email, p.roleLabel].some((v) => v.toLowerCase().includes(term));
  const shown = people.filter(match);

  return (
    <div className="space-y-6">
      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tx("Search by name, email or role")}
          aria-label={tx("Search by name, email or role")}
          className="focus-ring h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm"
        />
      </label>

      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{tx("Nobody matches that.")}</p> : null}

      {GROUPS.map((g) => {
        const list = shown.filter((p) => g.roles.includes(p.role));
        if (list.length === 0) return null;
        return (
          <section key={g.title} className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                <g.icon className="size-5" />
              </span>
              <div>
                <h2 className="font-semibold">
                  {tx(g.title)} <span className="font-normal text-muted-foreground">· {list.length}</span>
                </h2>
                <p className="text-sm text-muted-foreground">{tx(g.body)}</p>
              </div>
            </div>
            <div className="divide-y rounded-2xl border bg-card">
              {list.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                    {p.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {p.name}
                      <span className={cn("text-xs font-medium", p.suspended ? "text-destructive" : "text-success")}>
                        {p.suspended ? tx("Suspended") : tx("Active")}
                      </span>
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">{tx(p.roleLabel)}</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                    <p className="text-xs text-muted-foreground">{p.lastSeen}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={startWorkAs}>
                      <input type="hidden" name="userId" value={p.id} />
                      <button
                        type="submit"
                        disabled={!p.canWork}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <LogIn className="size-4" />
                        {tx("Work as")}
                      </button>
                    </form>
                    {p.lastOwner ? (
                      <span className="inline-flex items-center gap-1.5 px-2 text-xs text-muted-foreground">
                        <Lock className="size-3.5" />
                        {tx("Last owner: can't be suspended or deleted")}
                      </span>
                    ) : (
                      <>
                        {p.suspended ? (
                          p.reactivatable ? (
                            <ReactivateForm userId={p.id} />
                          ) : (
                            <span className="text-xs text-muted-foreground">{tx("Suspended by someone else")}</span>
                          )
                        ) : (
                          <SuspendForm userId={p.id} name={p.name} />
                        )}
                        <DeleteForm userId={p.id} name={p.name} />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
