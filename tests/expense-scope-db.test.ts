import assert from "node:assert/strict";
import { mkdirSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  WHOSE MONEY A COST IS, AND WHAT THE PICKER OFFERS FOR EACH ANSWER.

  Four kinds of spending, and the two that carry a name must carry the right
  one: a sailing's cost names its container, an executive's draw names the
  person it was taken by. The rules are the action's, not the screen's — a
  control that is merely unrendered is not a permission — so they are proved
  against the action itself, and then the picker is read back to show each
  answer lands on the list it belongs to.

  Rows are committed and taken out again, like the other database tests here.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

process.env.AUTH_SECRET ||= "test-secret-for-expense-scope";
const uploads = path.join(os.tmpdir(), `bluewave-expense-scope-${Date.now()}`);
mkdirSync(uploads, { recursive: true });
process.env.UPLOAD_DIR = uploads;
process.env.BLOB_READ_WRITE_TOKEN = "";
/** Every file under the upload folder, however deep the store nests them. */
const stored = () => readdirSync(uploads, { recursive: true }).length;

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;
after(() => prisma.$disconnect());

const expenseActions = load("@/lib/actions/expenses") as typeof import("@/lib/actions/expenses");
const picker = load("@/lib/expense-picker") as typeof import("@/lib/expense-picker");

const seat = () => globalThis as { __TEST_ACTOR?: unknown };
const RUN = Date.now().toString(36).toUpperCase();

type Person = { id: string; name: string; email: string; role: string; department: string | null };
async function person(email: string): Promise<Person> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department };
}

function form(fields: Record<string, string | Blob>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const receipt = () => new File([PNG], "receipt.png", { type: "image/png" });

const s = {
  finance: null as Person | null,
  owner: null as Person | null,
  manager: null as Person | null,
  containerId: "",
  sailingType: "",
  officeType: "",
  drawType: "",
  accountId: "",
};

before(async () => {
  s.finance = await person("finance@bluewavecargo.co.tz");
  s.owner = await person("admin@bluewavecargo.co.tz");
  s.manager = await person("manager@bluewavecargo.co.tz");
  seat().__TEST_ACTOR = s.finance;

  const box = await prisma.container.create({
    data: { reference: `TEST-BOX-XP-${RUN}`, status: "ARRIVED" },
  });
  s.containerId = box.id;
  s.sailingType = (
    await prisma.expenseType.create({ data: { name: `Wharfage ${RUN}`, forContainer: true } })
  ).id;
  s.officeType = (
    await prisma.expenseType.create({ data: { name: `Office travel ${RUN}`, forContainer: false } })
  ).id;
  s.drawType = (
    await prisma.expenseType.create({ data: { name: `Personal travel ${RUN}`, forExecutive: true } })
  ).id;
  const account = await prisma.bankAccount.findFirst({ where: { active: true, currency: "USD" } });
  assert.ok(account, "needs a live USD account to pay a draw from");
  s.accountId = account.id;
});

after(async () => {
  await prisma.containerExpense.deleteMany({
    where: { OR: [{ description: { contains: RUN } }, { containerId: s.containerId }] },
  });
  await prisma.expenseType.deleteMany({
    where: { id: { in: [s.sailingType, s.officeType, s.drawType] } },
  });
  await prisma.container.deleteMany({ where: { id: s.containerId } });
  seat().__TEST_ACTOR = undefined;
});

describe("an executive's draw names the person it was taken by", () => {
  test("a draw in the owner's name is recorded against the owner", async () => {
    const done = await expenseActions.recordExpense(
      {},
      form({
        scope: "EXECUTIVE",
        executiveId: s.owner!.id,
        expenseTypeId: s.drawType,
        /* Sent on purpose: a draw must never land on a sailing, whatever the
           form carries. */
        containerId: s.containerId,
        accountId: s.accountId,
        amount: "250",
        currency: "USD",
        description: `Flight to Guangzhou ${RUN}`,
      })
    );
    assert.ok(done.ok, done.error);

    const row = await prisma.containerExpense.findFirstOrThrow({
      where: { description: `Flight to Guangzhou ${RUN}` },
    });
    assert.equal(row.scope, "EXECUTIVE");
    assert.equal(row.executiveId, s.owner!.id, "whose draw");
    assert.equal(row.containerId, null, "a draw is never a sailing's");

    /* And the trail says whose, by name and by id. */
    const trail = await prisma.auditLog.findFirstOrThrow({
      where: { action: "expense.record", actorId: s.finance!.id, summary: { contains: "draw by" } },
      orderBy: { createdAt: "desc" },
    });
    assert.match(trail.summary, new RegExp(`a draw by ${s.owner!.name}`));
    assert.equal((trail.metadata as { executiveId?: string }).executiveId, s.owner!.id);
  });

  test("a name from outside the Management desk is refused", async () => {
    assert.notEqual(s.finance!.department, "MANAGEMENT", "the fixture needs a non-management desk");
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "EXECUTIVE",
        executiveId: s.finance!.id,
        amount: "80",
        currency: "USD",
        description: `Not an executive ${RUN}`,
      })
    );
    assert.match(tried.error ?? "", /not on the Management desk/);
    assert.equal(
      await prisma.containerExpense.count({ where: { description: `Not an executive ${RUN}` } }),
      0,
      "and nothing was written"
    );
  });

  test("no kind of spending but a draw may carry a name", async () => {
    for (const [scope, extra] of [
      ["SPECIAL", { expenseTypeId: s.officeType }],
      ["CONTAINER", { expenseTypeId: s.sailingType, containerId: s.containerId }],
    ] as const) {
      const before = stored();
      const tried = await expenseActions.recordExpense(
        {},
        form({
          scope,
          executiveId: s.owner!.id,
          ...extra,
          amount: "30",
          currency: "USD",
          description: `Named ${scope} ${RUN}`,
          receipt: receipt(),
        })
      );
      assert.match(tried.error ?? "", /Only an executive cost/, scope);
      assert.equal(await prisma.containerExpense.count({ where: { description: `Named ${scope} ${RUN}` } }), 0);
      assert.equal(stored(), before, `${scope}: no receipt stored`);
    }
  });

  test("the office's rent cannot be filed as somebody's draw", async () => {
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "OFFICE",
        executiveId: s.owner!.id,
        amount: "80",
        currency: "USD",
        description: `Rent with a name ${RUN}`,
        receipt: receipt(),
      })
    );
    assert.match(tried.error ?? "", /Only an executive cost/);
    assert.equal(
      await prisma.containerExpense.count({ where: { description: `Rent with a name ${RUN}` } }),
      0
    );
  });

  test("a draw in nobody's name is refused", async () => {
    const before = stored();
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "EXECUTIVE",
        expenseTypeId: s.drawType,
        amount: "40",
        currency: "USD",
        description: `Nobody's draw ${RUN}`,
        receipt: receipt(),
      })
    );
    assert.match(tried.error ?? "", /Whose draw is it/);
    assert.equal(await prisma.containerExpense.count({ where: { description: `Nobody's draw ${RUN}` } }), 0);
    assert.equal(stored(), before, "and its receipt was never stored");
  });

  test("a suspended executive can no longer be named", async () => {
    await prisma.user.update({ where: { id: s.manager!.id }, data: { status: "SUSPENDED" } });
    try {
      const tried = await expenseActions.recordExpense(
        {},
        form({
          scope: "EXECUTIVE",
          executiveId: s.manager!.id,
          expenseTypeId: s.drawType,
          amount: "40",
          currency: "USD",
          description: `Suspended draw ${RUN}`,
        })
      );
      assert.match(tried.error ?? "", /not on the Management desk/);
      assert.equal(await prisma.containerExpense.count({ where: { description: `Suspended draw ${RUN}` } }), 0);
    } finally {
      await prisma.user.update({ where: { id: s.manager!.id }, data: { status: "ACTIVE" } });
    }
  });

  test("the three lists do not cross, in either direction", async () => {
    const officeKindAsDraw = await expenseActions.recordExpense(
      {},
      form({
        scope: "EXECUTIVE",
        executiveId: s.owner!.id,
        expenseTypeId: s.officeType,
        amount: "40",
        currency: "USD",
        description: `Office kind as a draw ${RUN}`,
      })
    );
    assert.match(officeKindAsDraw.error ?? "", /not an executive's draw/);

    const drawKindForOffice = await expenseActions.recordExpense(
      {},
      form({
        scope: "OFFICE",
        expenseTypeId: s.drawType,
        amount: "40",
        currency: "USD",
        description: `School fees as rent ${RUN}`,
      })
    );
    assert.match(drawKindForOffice.error ?? "", /is an executive's draw/);
  });

  test("a kind that does not exist is refused in words, not by the database", async () => {
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "OFFICE",
        expenseTypeId: "unfiled-office",
        amount: "40",
        currency: "USD",
        description: `Made-up kind ${RUN}`,
        receipt: receipt(),
      })
    );
    assert.match(tried.error ?? "", /no longer exists/);
  });

  test("correcting a paid draw keeps it in the same person's name", async () => {
    const draw = await prisma.containerExpense.findFirstOrThrow({
      where: { description: `Flight to Guangzhou ${RUN}`, cancelledAt: null },
    });
    assert.ok(draw.accountId, "the fixture draw was paid, so a correction reposts it");
    const done = await expenseActions.correctExpense(
      {},
      form({ expenseId: draw.id, amount: "275", reason: `Receipt showed 275 ${RUN}` })
    );
    assert.ok(done.ok, done.error);

    const replacement = await prisma.containerExpense.findFirstOrThrow({
      where: { description: `Flight to Guangzhou ${RUN}`, cancelledAt: null },
    });
    assert.notEqual(replacement.id, draw.id, "a paid cost is reposted, not edited");
    assert.equal(replacement.executiveId, s.owner!.id, "and the repost is still the owner's draw");
  });
});

describe("a sailing's cost names its container, and only a sailing's kind", () => {
  test("wharfage on the box is recorded against the box", async () => {
    const before = stored();
    const done = await expenseActions.recordExpense(
      {},
      form({
        scope: "CONTAINER",
        containerId: s.containerId,
        expenseTypeId: s.sailingType,
        amount: "120",
        currency: "USD",
        description: `Wharfage ${RUN}`,
        receipt: receipt(),
      })
    );
    assert.ok(done.ok, done.error);
    /* The control for every "no receipt stored" check above: an accepted cost
       does store its receipt in this folder, so an unchanged count after a
       refusal means the refusal stored nothing — not that it looked elsewhere. */
    assert.ok(stored() > before, "an accepted cost stores its receipt where the refusals are counted");
    const row = await prisma.containerExpense.findFirstOrThrow({
      where: { description: `Wharfage ${RUN}` },
    });
    assert.equal(row.containerId, s.containerId);
    assert.equal(row.executiveId, null);
  });

  test("a sailing's kind of cost is refused for the office", async () => {
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "OFFICE",
        expenseTypeId: s.sailingType,
        amount: "120",
        currency: "USD",
        description: `Wharfage for the office ${RUN}`,
      })
    );
    assert.match(tried.error ?? "", /container cost/);
  });
});

describe("what the boss takes out is filed as a draw, not a running cost", () => {
  test("profit, business and personal draw kinds are all on the executive's list", async () => {
    const kinds = await prisma.expenseType.findMany({
      where: {
        name: {
          in: [
            "Profit withdrawal",
            "Dividend",
            "Sourcing trip to China",
            "Business float — to account for",
            "School fees",
          ],
        },
      },
      select: { name: true, forExecutive: true, forContainer: true },
    });
    assert.equal(kinds.length, 5, "every one of them exists");
    for (const kind of kinds) {
      assert.equal(kind.forExecutive, true, `${kind.name} is a draw`);
      assert.equal(kind.forContainer, false, `${kind.name} is never a sailing's`);
    }
  });

  test("a profit withdrawal cannot be filed as the office's cost", async () => {
    const profit = await prisma.expenseType.findUniqueOrThrow({ where: { name: "Profit withdrawal" } });
    const tried = await expenseActions.recordExpense(
      {},
      form({
        scope: "OFFICE",
        expenseTypeId: profit.id,
        amount: "1000",
        currency: "USD",
        description: `Profit as a running cost ${RUN}`,
      })
    );
    assert.match(tried.error ?? "", /is an executive's draw/);
  });
});

describe("the picker offers each answer its own list", () => {
  test("the box shows what is on it, and the owner shows their draw", async () => {
    const choices = await picker.expenseChoices(undefined, { executives: true });

    const box = choices.containers.find((c) => c.id === s.containerId);
    assert.ok(box, "an open container is on the sailing list");
    assert.ok(
      box.costs.some((c) => c.label === `Wharfage ${RUN}`),
      "with the cost already recorded on it, so nobody records it twice"
    );
    assert.ok(box.recordedKinds.includes(`Wharfage ${RUN}`));

    const owner = choices.executives.find((e) => e.id === s.owner!.id);
    assert.ok(owner, "the owner is on the executive list");
    assert.ok(
      owner.draws.some((d) => d.label === `Flight to Guangzhou ${RUN}`),
      "with the draw taken in their name"
    );
    assert.ok(
      !choices.executives.some((e) => e.id === s.finance!.id),
      "and a desk outside Management is not offered as an executive"
    );

    /* The three lists do not cross. */
    const listOf = (id: string) => choices.groups.find((g) => g.id === id)?.family;
    assert.equal(listOf(s.sailingType), "SAILING");
    assert.equal(listOf(s.officeType), "OFFICE");
    assert.equal(listOf(s.drawType), "EXECUTIVE");

    /* The owner's draw is in the executive chip's own history, however many
       sailing costs the register holds. */
    assert.ok(
      choices.history.EXECUTIVE.some((i) => i.label === `Flight to Guangzhou ${RUN}`),
      "each chip's history is cut on its own, never from a top eight across all four"
    );
    assert.ok(!choices.history.OFFICE.some((i) => i.label === `Flight to Guangzhou ${RUN}`));
  });

  test("a box's costs are read in full, words or none", async () => {
    await prisma.containerExpense.create({
      data: {
        reference: `EXP-XP-${RUN}`,
        scope: "CONTAINER",
        containerId: s.containerId,
        expenseTypeId: s.sailingType,
        amount: 55,
        currency: "USD",
        description: null,
        notes: RUN,
      },
    });
    try {
      const choices = await picker.expenseChoices();
      const box = choices.containers.find((c) => c.id === s.containerId);
      assert.ok(box);
      assert.equal(box.costs.length, 2, "the cost with no words is on the box too");
      assert.ok(box.costs.some((c) => c.label === `Wharfage ${RUN}` && c.amount === "55"), "named by its kind");
      assert.ok(
        box.recordedLabels.includes(`wharfage ${RUN}`.toLowerCase()),
        "and counted as recorded under that same name, so the row is not marked missing"
      );
    } finally {
      await prisma.containerExpense.deleteMany({ where: { reference: `EXP-XP-${RUN}` } });
    }
  });

  test("a draw stays on the list when its taker leaves the desk", async () => {
    const draw = await prisma.containerExpense.create({
      data: {
        reference: `EXP-XP-MGR-${RUN}`,
        scope: "EXECUTIVE",
        executiveId: s.manager!.id,
        amount: 500,
        currency: "USD",
        description: `Manager's advance ${RUN}`,
      },
    });
    await prisma.user.update({ where: { id: s.manager!.id }, data: { status: "SUSPENDED" } });
    try {
      const choices = await picker.expenseChoices(undefined, { executives: true });
      const row = choices.executives.find((e) => e.id === s.manager!.id);
      assert.ok(row, "the suspended manager still has a row");
      assert.equal(row.recordable, false, "which takes no new draw");
      assert.ok(row.draws.some((d) => d.id === draw.id), "and still shows what they drew");
      assert.ok(row.totals.some((t) => t.currency === "USD" && Number(t.amount) >= 500));
    } finally {
      await prisma.user.update({ where: { id: s.manager!.id }, data: { status: "ACTIVE" } });
      await prisma.containerExpense.deleteMany({ where: { id: draw.id } });
    }
  });

  test("the container page is sent nothing about anybody's draws", async () => {
    const choices = await picker.expenseChoices(s.containerId, { scopes: ["CONTAINER"] });
    assert.equal(choices.executives.length, 0, "no executive, no draw");
    assert.equal(choices.history.EXECUTIVE.length, 0);
    assert.equal(choices.history.OFFICE.length, 0);
  });

  test("a draw from before names were kept is shown, never lost", async () => {
    await prisma.containerExpense.create({
      data: {
        reference: `EXP-XP-OLD-${RUN}`,
        scope: "EXECUTIVE",
        amount: 90,
        currency: "USD",
        description: `Old draw ${RUN}`,
      },
    });
    try {
      const choices = await picker.expenseChoices(undefined, { executives: true });
      const unnamed = choices.executives.find((e) => !e.named);
      assert.ok(unnamed, "there is a row for unnamed draws");
      assert.ok(unnamed.draws.some((d) => d.label === `Old draw ${RUN}`));
    } finally {
      await prisma.containerExpense.deleteMany({ where: { reference: `EXP-XP-OLD-${RUN}` } });
    }
  });

  test("a closed box is still offered on its own page", async () => {
    await prisma.container.update({ where: { id: s.containerId }, data: { status: "CLOSED" } });
    try {
      const everywhere = await picker.expenseChoices();
      assert.ok(
        !everywhere.containers.some((c) => c.id === s.containerId),
        "a closed box is off the general list — its margin is settled"
      );
      const onItsPage = await picker.expenseChoices(s.containerId);
      assert.ok(
        onItsPage.containers.some((c) => c.id === s.containerId),
        "but its own page still finds it"
      );
    } finally {
      await prisma.container.update({ where: { id: s.containerId }, data: { status: "ARRIVED" } });
    }
  });
});
