"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  Anchor,
  Building2,
  ChevronRight,
  CircleHelp,
  Coins,
  FileCheck,
  FileText,
  Fuel,
  Landmark,
  Megaphone,
  PackageOpen,
  Plane,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Ship,
  ShieldCheck,
  Sparkles,
  Truck,
  Users,
  Wifi,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { useEscape } from "@/components/app/use-escape";
import { recordExpense, type ActionState } from "@/lib/actions/expenses";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";

export type PickerItem = {
  label: string;
  typeId: string | null;
  typeName: string | null;
  vendor: string | null;
  monthly: boolean;
  scope: "CONTAINER" | "OFFICE" | "SPECIAL" | "EXECUTIVE";
  times: number;
};
export type PickerGroup = {
  id: string;
  name: string;
  icon: string;
  items: PickerItem[];
};

const ICONS: Record<string, LucideIcon> = {
  Ship,
  FileCheck,
  Anchor,
  AlarmClock,
  Truck,
  Fuel,
  PackageOpen,
  FileText,
  Users,
  Building2,
  Zap,
  Wifi,
  Landmark,
  Wrench,
  ShieldCheck,
  Receipt,
  Plane,
  Megaphone,
  CircleHelp,
  Coins,
};
const Glyph = ({ name, className }: { name: string; className?: string }) => {
  const Icon = ICONS[name] ?? Coins;
  return <Icon className={className} />;
};

/**
 * RECORDING A COST, IN THE ORDER SOMEBODY ACTUALLY PAYS ONE.
 *
 * What it was for, then how much. That is the order the question is asked in
 * at the counter and the order a receipt is read in, and splitting it in two
 * is what lets the first half be a list to point at rather than a box to type
 * in. A form of eleven fields asks the desk to describe the same dozen costs
 * over and over; this asks them to find one.
 *
 * The list is the register read back — see lib/expense-picker.ts — so choosing
 * an item fills what it was for AND the kind of cost together. That pairing is
 * the whole point: it is what stops one fee being filed under three kinds by
 * three people and the cost report turning into a list of near-duplicates.
 *
 * Something genuinely new is typed once, on the same screen, and is on the
 * list the next time by virtue of having been paid.
 */
export function RecordExpense({
  usedMost,
  groups,
  accounts,
  containers,
  defaultCurrency = "TZS",
  label,
  containerId,
  missing,
  triggerClassName,
}: {
  usedMost: PickerItem[];
  groups: PickerGroup[];
  accounts: { id: string; label: string }[];
  containers: { id: string; label: string }[];
  defaultCurrency?: string;
  label?: string;
  /**
   * Opened from a sailing's own page: every cost recorded here is that
   * sailing's, so the second half never asks which container and the scope is
   * not a choice somebody can get wrong.
   */
  containerId?: string;
  /** Usual costs nothing has been recorded against on this sailing yet. */
  missing?: string[];
  triggerClassName?: string;
}) {
  const tx = useT();
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(recordExpense, {});

  /* Which half of the job is on screen, and what the first half answered. */
  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<PickerItem | null>(null);
  const [groupId, setGroupId] = useState<string>("used-most");
  const [query, setQuery] = useState("");
  const amountRef = useRef<HTMLInputElement>(null);

  useEscape(open, () => setOpen(false));
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setStep(1);
      setChosen(null);
      setQuery("");
    }
  }, [state]);
  /* The figure is the only thing left to type, so the cursor is already in it. */
  useEffect(() => {
    if (step === 2) amountRef.current?.focus();
  }, [step]);

  /* Searching is across everything, not inside the group on screen: somebody
     who types "fuel" wants the fuel, wherever it was filed. */
  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    const needle = query.trim().toLowerCase();
    const seen = new Set<string>();
    return groups
      .flatMap((g) => g.items)
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        if (!key.includes(needle) && !(item.typeName ?? "").toLowerCase().includes(needle)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 24);
  }, [groups, query, searching]);

  const group = groups.find((g) => g.id === groupId) ?? null;
  const shown = searching ? results : groupId === "used-most" ? usedMost : (group?.items ?? []);
  const heading = searching
    ? `${results.length} ${results.length === 1 ? tx("match") : tx("matches")}`
    : groupId === "used-most"
      ? tx("Used most")
      : (group?.name ?? "");

  const pick = (item: PickerItem) => {
    setChosen(item);
    setStep(2);
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className={triggerClassName}>
        <Plus />
        {label ?? tx("Record a cost")}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 text-left backdrop-blur-sm sm:p-8">
      <button
        type="button"
        aria-label={tx("Close")}
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tx("Record a cost")}
        className="relative w-full max-w-[46rem] overflow-hidden rounded-2xl border bg-card shadow-lg"
      >
        {/* The two halves, named, with the one on screen lit. A desk that can
            see there is a second half does not go looking for the amount. */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <Step n={1} name={tx("What")} active={step === 1} onClick={() => setStep(1)} />
            <span className="h-px w-5 bg-border" />
            <Step n={2} name={tx("How much")} active={step === 2} onClick={undefined} />
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={tx("Close")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {step === 1 ? (
          <div className="px-6 pb-5 pt-4">
            <h2 className="text-xl font-semibold tracking-tight">{tx("What did you pay for?")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx("Search, or pick from a group. Anything new is saved for next time.")}
            </p>

            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tx("Search — port charges, fuel, salaries, rent…")}
                className="focus-ring h-12 w-full rounded-xl border bg-background pl-10 pr-4 text-sm"
              />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[15rem_1fr]">
              {/* The kinds of cost, with how many things sit under each. */}
              <div className="max-h-[19rem] overflow-y-auto rounded-xl border p-1.5">
                <GroupRow
                  icon="Sparkles"
                  name={tx("Used most")}
                  count={usedMost.length}
                  active={!searching && groupId === "used-most"}
                  onClick={() => {
                    setQuery("");
                    setGroupId("used-most");
                  }}
                />
                {groups.map((g) => (
                  <GroupRow
                    key={g.id}
                    icon={g.icon}
                    name={g.name}
                    count={g.items.length}
                    active={!searching && groupId === g.id}
                    onClick={() => {
                      setQuery("");
                      setGroupId(g.id);
                    }}
                  />
                ))}
              </div>

              <div className="flex max-h-[19rem] flex-col overflow-hidden rounded-xl border">
                <p className="border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {heading}
                </p>
                <div className="flex-1 overflow-y-auto">
                  {shown.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      {tx("Nothing here yet — add it below.")}
                    </p>
                  ) : (
                    shown.map((item) => (
                      <button
                        key={`${item.typeId ?? "none"}-${item.label}`}
                        type="button"
                        onClick={() => pick(item)}
                        className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-secondary/60"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                          <Glyph name={iconOf(item)} className="size-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{item.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {subtitleOf(item, tx, missing)}
                          </span>
                        </span>
                        {/* Paid in three separate months or more: one of the
                            standing bills, not a one-off somebody repeated. */}
                        {item.monthly ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                            <RefreshCw className="size-3" />
                            {tx("Monthly")}
                          </span>
                        ) : null}
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    pick({
                      label: query.trim(),
                      typeId: null,
                      typeName: null,
                      vendor: null,
                      monthly: false,
                      scope: containerId ? "CONTAINER" : "OFFICE",
                      times: 0,
                    })
                  }
                  className="flex items-center gap-2 border-t px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-secondary/60"
                >
                  <Plus className="size-4" />
                  {searching
                    ? `${tx("Add")} “${query.trim()}” — ${tx("a cost we have not paid before")}`
                    : tx("Something else — add a new cost")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form action={action} className="px-6 pb-6 pt-4">
            {/* What the first half answered, and the way back to change it. */}
            <div className="flex items-center gap-3 rounded-xl border bg-secondary/30 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary">
                <Glyph name={iconOf(chosen)} className="size-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {chosen?.label || tx("A new cost")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {chosen ? subtitleOf(chosen, tx, missing) : tx("Not filed under a kind")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="shrink-0 text-xs font-medium text-brand hover:underline"
              >
                {tx("Change")}
              </button>
            </div>

            <h2 className="mt-4 text-xl font-semibold tracking-tight">{tx("How much was it?")}</h2>

            <input type="hidden" name="expenseTypeId" value={chosen?.typeId ?? ""} />
            <input
              type="hidden"
              name="scope"
              value={containerId ? "CONTAINER" : (chosen?.scope ?? "OFFICE")}
            />
            {containerId ? <input type="hidden" name="containerId" value={containerId} /> : null}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Typed for a cost nobody has paid before, and offered for
                  correction on one that has: the words on the row are the words
                  that go in the register. */}
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">{tx("What it was for")}</Label>
                <Input
                  id="description"
                  name="description"
                  required
                  defaultValue={chosen?.label ?? ""}
                  placeholder={tx("Port charges, fuel, rent…")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">{tx("Amount")}</Label>
                <Input
                  ref={amountRef}
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min={0}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">{tx("Currency")}</Label>
                <NativeSelect id="currency" name="currency" defaultValue={defaultCurrency}>
                  <option value="TZS">TZS</option>
                  <option value="USD">USD</option>
                </NativeSelect>
              </div>
              {/* WHICH ACCOUNT THE MONEY LEFT. Without it the cost is real and
                  the balances cannot account for it, so the tin reads richer
                  than it is. */}
              <div className="space-y-2">
                <Label htmlFor="accountId">{tx("Paid from")}</Label>
                <NativeSelect id="accountId" name="accountId" defaultValue="">
                  <option value="">{tx("Nobody said yet")}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-2">
                <Label htmlFor="expenseDate">{tx("Date")}</Label>
                <Input
                  id="expenseDate"
                  name="expenseDate"
                  type="date"
                  min="2000-01-01"
                  max="2099-12-31"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vendorName">{tx("Paid to")}</Label>
                <Input
                  id="vendorName"
                  name="vendorName"
                  defaultValue={chosen?.vendor ?? ""}
                  placeholder={tx("Shipping line, clearing agent…")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="referenceNumber">{tx("Their reference")}</Label>
                <Input id="referenceNumber" name="referenceNumber" />
              </div>
              {/* Naming a sailing is what makes this that sailing's cost, and
                  nothing else does. */}
              {!containerId && chosen?.scope === "CONTAINER" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="containerId">{tx("Which container")}</Label>
                  <NativeSelect id="containerId" name="containerId" required defaultValue="">
                    <option value="" disabled>
                      {tx("Choose…")}
                    </option>
                    {containers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>

            <FormMessage error={state.error} ok={state.ok} />
            <div className="mt-4 flex flex-wrap gap-2">
              <SubmitButton pendingLabel={tx("Recording…")}>{tx("Record the cost")}</SubmitButton>
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                {tx("Back")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * The line under the name — never the name a second time.
 *
 * A cost nobody has paid yet is its category standing in for itself, and
 * printing "Wharfage / Wharfage" tells the desk nothing while looking like a
 * mistake. What is useful instead is that it has not been paid for yet, and on
 * a sailing's own page, that this sailing has not been charged it.
 */
function subtitleOf(
  item: PickerItem,
  tx: (s: string) => string,
  missing?: string[]
) {
  const said: string[] = [];
  if (item.typeName && item.typeName.toLowerCase() !== item.label.toLowerCase()) {
    said.push(item.typeName);
  }
  if (item.vendor) said.push(`${tx("to")} ${item.vendor}`);
  if (said.length > 0) return said.join(" · ");
  if (missing?.some((m) => m.toLowerCase() === item.label.toLowerCase())) {
    return tx("Not recorded on this container yet");
  }
  if (item.times === 0) return tx("Never recorded yet");
  return tx("Recorded before");
}

function iconOf(item: PickerItem | null) {
  const name = item?.typeName ?? item?.label ?? "";
  if (/freight|ocean|sea|shipping/i.test(name)) return "Ship";
  if (/clear|forward|customs|duty/i.test(name)) return "FileCheck";
  if (/port|wharf|terminal/i.test(name)) return "Anchor";
  if (/demurrage|detention|storage/i.test(name)) return "AlarmClock";
  if (/transport|truck|lorry/i.test(name)) return "Truck";
  if (/fuel|diesel|petrol/i.test(name)) return "Fuel";
  if (/handl|labour|labor|loading/i.test(name)) return "PackageOpen";
  if (/document|paper|stamp|permit/i.test(name)) return "FileText";
  if (/salary|salaries|payroll|staff/i.test(name)) return "Users";
  if (/rent|office|premises/i.test(name)) return "Building2";
  if (/electric|water|power|utilit/i.test(name)) return "Zap";
  if (/internet|airtime|phone|subscription/i.test(name)) return "Wifi";
  if (/bank|charge|fee|commission/i.test(name)) return "Landmark";
  if (/repair|maintenance/i.test(name)) return "Wrench";
  if (/insur/i.test(name)) return "ShieldCheck";
  if (/tax|vat|levy/i.test(name)) return "Receipt";
  if (/travel|flight|hotel/i.test(name)) return "Plane";
  if (/market|advert/i.test(name)) return "Megaphone";
  return "Coins";
}

function Step({
  n,
  name,
  active,
  onClick,
}: {
  n: number;
  name: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground",
        onClick ? "hover:text-foreground" : "cursor-default"
      )}
    >
      <span className={cn(active ? "text-brand" : "")}>{n}</span>
      {name}
    </button>
  );
}

function GroupRow({
  icon,
  name,
  count,
  active,
  onClick,
}: {
  icon: string;
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
        active ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/50"
      )}
    >
      {icon === "Sparkles" ? (
        <Sparkles className="size-4 shrink-0" />
      ) : (
        <Glyph name={icon} className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="tnum shrink-0 text-xs text-muted-foreground">{count}</span>
    </button>
  );
}
