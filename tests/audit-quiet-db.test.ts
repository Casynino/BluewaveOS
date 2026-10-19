import assert from "node:assert/strict";
import { after, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DEVELOPER_CHANGES_ONLY } from "@/lib/audit-quiet";

import { requireScratchDatabase } from "./scratch-db";

/*
  THE OWNER SEES THE DEVELOPER ONLY WHERE SOMETHING CHANGED.

  Written inside a transaction that is then undone: a developer's audit line
  can never be deleted, so a test that left one behind would leave it for good.
*/
requireScratchDatabase();
const prisma = new PrismaClient();
after(() => prisma.$disconnect());

test("sign-ins, page views and Work as are hidden; changes, and everyone else, are not", async () => {
  const RUN = `quiet-${Date.now().toString(36)}`;
  const ROLLBACK = new Error("rollback");
  let seen: string[] = [];
  await prisma
    .$transaction(async (tx) => {
      const line = (actorType: string, action: string) =>
        tx.auditLog.create({ data: { actorType, action, entity: "Test", entityId: RUN, summary: action } });
      await line("DEVELOPER", "auth.login");
      await line("DEVELOPER", "auth.logout");
      await line("DEVELOPER", "developer.activity.viewed");
      await line("DEVELOPER", "developer.work_as.start");
      await line("DEVELOPER", "developer.suspend");
      await line("DEVELOPER", "payment.verify");
      await line("STAFF", "auth.login");
      seen = (
        await tx.auditLog.findMany({ where: { AND: [{ entityId: RUN }, DEVELOPER_CHANGES_ONLY] }, select: { actorType: true, action: true } })
      ).map((r) => `${r.actorType} ${r.action}`);
      throw ROLLBACK;
    })
    .catch((e) => {
      if (e !== ROLLBACK) throw e;
    });
  assert.deepEqual(seen.sort(), ["DEVELOPER developer.suspend", "DEVELOPER payment.verify", "STAFF auth.login"]);
});
