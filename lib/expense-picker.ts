import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * WHAT THIS BUSINESS ACTUALLY PAYS FOR, READ OFF WHAT IT HAS PAID.
 *
 * Recording a cost used to start with an empty form and a list of categories,
 * which asks the desk to describe the same twelve things over and over and to
 * file each one under whichever category came to mind that day. The same fee
 * then appears three times in the books under three names, and the cost report
 * is a list of near-duplicates nobody can add up.
 *
 * So the picker is built from the register itself: every distinct thing this
 * company has paid for, grouped by the kind of cost it was filed under, most
 * used first. Choosing one fills the name AND the kind together, which is what
 * stops the near-duplicates. Anything genuinely new is typed once and is on the
 * list from then on, because the list is only ever a reading of the register.
 *
 * NOTHING HERE IS A SETTING TO MAINTAIN. There is no list of costs for an
 * administrator to curate and let go stale: pay for something new and it
 * appears; stop paying for it and it falls down the list on its own.
 */

export type ExpenseChoice = {
  /** What was paid for, in the words the desk used: "Port charges", "Ice". */
  label: string;
  typeId: string | null;
  typeName: string | null;
  /** Who it was paid to, when the register agrees on one. */
  vendor: string | null;
  /**
   * Paid in three or more separate months. The desk reads it as "this is one of
   * the standing bills", which is the difference between a fee somebody forgot
   * and a fee nobody owes this month.
   */
  monthly: boolean;
  /** Container cost, or one of the business's own. Chosen with the item. */
  scope: "CONTAINER" | "OFFICE" | "SPECIAL" | "EXECUTIVE";
  /** How many times it has been paid. Orders the list; never shown as a figure. */
  times: number;
};

export type ExpenseGroup = {
  id: string;
  name: string;
  /** A lucide name the picker maps to an icon. */
  icon: string;
  items: ExpenseChoice[];
};

/** How far back the register is read. A year covers every annual bill once. */
const WINDOW_DAYS = 400;
const MOST_USED = 8;

/**
 * The icon for a kind of cost, by what the company called it.
 *
 * Matched on words rather than on a fixed list, so a category the office adds
 * next month still arrives with something better than a blank circle.
 */
const ICONS: [RegExp, string][] = [
  [/freight|ocean|sea|shipping/i, "Ship"],
  [/clear|forward|customs|duty|declaration/i, "FileCheck"],
  [/port|wharf|terminal|thc/i, "Anchor"],
  [/demurrage|detention|storage/i, "AlarmClock"],
  [/transport|truck|lorry|deliver/i, "Truck"],
  [/fuel|diesel|petrol/i, "Fuel"],
  [/handl|labour|labor|loading|packing/i, "PackageOpen"],
  [/document|paper|stamp|permit|licen/i, "FileText"],
  [/salary|salaries|payroll|staff|wage/i, "Users"],
  [/rent|office|premises/i, "Building2"],
  [/electric|water|power|utility|utilities/i, "Zap"],
  [/internet|airtime|phone|sms|subscription|software/i, "Wifi"],
  [/bank|charge|fee|commission/i, "Landmark"],
  [/repair|maintenance|service/i, "Wrench"],
  [/insur/i, "ShieldCheck"],
  [/tax|tra|vat|levy/i, "Receipt"],
  [/travel|flight|hotel|visit/i, "Plane"],
  [/market|advert|promo/i, "Megaphone"],
];

export function iconFor(name: string | null | undefined) {
  if (!name) return "Coins";
  return ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? "Coins";
}

const SCOPES = ["CONTAINER", "OFFICE", "SPECIAL", "EXECUTIVE"] as const;
type Scope = (typeof SCOPES)[number];

/**
 * The groups and their items, ready for the picker.
 *
 * One read of the register and one of the kinds of cost — a cost that has
 * never been paid still offers its category to press, so a fresh system is not
 * an empty screen.
 */
export async function expenseChoices(): Promise<{
  usedMost: ExpenseChoice[];
  groups: ExpenseGroup[];
}> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [paid, types] = await Promise.all([
    prisma.containerExpense.findMany({
      where: {
        deletedAt: null,
        cancelledAt: null,
        description: { not: null },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 1500,
      select: {
        description: true,
        scope: true,
        expenseDate: true,
        createdAt: true,
        expenseTypeId: true,
        expenseType: { select: { name: true } },
        vendor: { select: { name: true } },
      },
    }),
    prisma.expenseType.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, forContainer: true },
    }),
  ]);

  /* One entry per thing paid for, counted by name so the same fee under two
     spellings of the same words is one row. The kind, the vendor and the scope
     are taken from the most recent time it was paid: the newest filing is the
     one the office has settled on. */
  type Tally = ExpenseChoice & { months: Set<string> };
  const byLabel = new Map<string, Tally>();
  for (const row of paid) {
    const label = (row.description ?? "").trim();
    if (!label || label.length > 60) continue;
    const key = label.toLowerCase();
    const when = row.expenseDate ?? row.createdAt;
    const month = `${when.getUTCFullYear()}-${when.getUTCMonth()}`;

    const found = byLabel.get(key);
    if (found) {
      found.times += 1;
      found.months.add(month);
      continue;
    }
    byLabel.set(key, {
      label,
      typeId: row.expenseTypeId,
      typeName: row.expenseType?.name ?? null,
      vendor: row.vendor?.name ?? null,
      monthly: false,
      scope: row.scope as Scope,
      times: 1,
      months: new Set([month]),
    });
  }

  const items: ExpenseChoice[] = [...byLabel.values()]
    .map(({ months, ...item }) => ({ ...item, monthly: months.size >= 3 }))
    .sort((a, b) => b.times - a.times || a.label.localeCompare(b.label));

  /* Every kind of cost the company has named, each holding what has been paid
     under it. A kind nobody has used yet offers itself, so pressing it is how
     the first one gets recorded. */
  const groups: ExpenseGroup[] = types.map((type) => {
    const mine = items.filter((item) => item.typeId === type.id);
    return {
      id: type.id,
      name: type.name,
      icon: iconFor(type.name),
      items:
        mine.length > 0
          ? mine
          : [
              {
                label: type.name,
                typeId: type.id,
                typeName: type.name,
                vendor: null,
                monthly: false,
                scope: type.forContainer ? "CONTAINER" : "OFFICE",
                times: 0,
              },
            ],
    };
  });

  /* Paid for, but under no kind at all. Named rather than hidden: these are
     exactly the rows the cost report cannot explain, and the desk that meets
     one here is the desk that can file it. */
  const loose = items.filter((item) => !item.typeId);
  if (loose.length > 0) {
    groups.push({ id: "uncategorised", name: "Not filed under a kind", icon: "CircleHelp", items: loose });
  }

  return { usedMost: items.slice(0, MOST_USED), groups };
}
