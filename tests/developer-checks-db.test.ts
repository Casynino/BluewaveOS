import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, describe, test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { requireScratchDatabase } from "./scratch-db";

/*
  WHAT WAS CHECKED, CHECK BY CHECK.

  The developer's home lists every check it made, passing or not. Each one
  comes back with a status the screen knows how to draw, a job that has never
  run is "not checked yet" rather than a false alarm or a false all-clear, and
  a job's recorded run is what turns it to fine.
*/
requireScratchDatabase();

const load = createRequire(import.meta.url);
load("./stubs/hook.cjs");

const prisma = new PrismaClient();
(globalThis as unknown as { prisma?: PrismaClient }).prisma = prisma;

const checks = load("@/lib/developer-checks") as typeof import("@/lib/developer-checks");
const jobs = load("@/lib/job-runs") as typeof import("@/lib/job-runs");

const ROUTE = "/api/cron/storage-charge";
const LABEL = "Nightly storage charge runs on time";

after(async () => {
  await prisma.systemEvent.deleteMany({ where: { route: ROUTE, kind: { in: ["JOB_OK", "JOB_FAILED"] } } });
  await prisma.$disconnect();
});

describe("the checked list", () => {
  test("every check comes back with a label, a known status and a detail", async () => {
    await prisma.systemEvent.deleteMany({ where: { route: ROUTE, kind: { in: ["JOB_OK", "JOB_FAILED"] } } });
    const { list } = await checks.runSystemChecks();
    assert.ok(list.length >= 14, "the platform, the data and both jobs");
    for (const c of list) {
      assert.ok(c.label.length > 0);
      assert.ok(["ok", "look", "fix", "unknown"].includes(c.status), `${c.label}: ${c.status}`);
      assert.ok(c.detail.length > 0, `${c.label} says why`);
    }
    assert.equal(new Set(list.map((c) => c.label)).size, list.length, "no check listed twice");
    assert.equal(list.find((c) => c.label === "The database can be reached")?.status, "ok");
  });

  test("a job with no run recorded is not checked yet, never fine", async () => {
    const { list } = await checks.runSystemChecks();
    const job = list.find((c) => c.label === LABEL);
    assert.equal(job?.status, "unknown");
    assert.equal(job?.detail, "No run recorded yet.");
  });

  test("a recorded run turns the job fine; a failed one asks for a fix", async () => {
    await jobs.recordJobRun(ROUTE, true, "checked 0, charged 0");
    let job = (await checks.runSystemChecks()).list.find((c) => c.label === LABEL);
    assert.equal(job?.status, "ok");

    await jobs.recordJobRun(ROUTE, false, "the run failed");
    const after = await checks.runSystemChecks();
    job = after.list.find((c) => c.label === LABEL);
    assert.equal(job?.status, "fix");
    assert.ok(after.findings.some((f) => f.title === "Nightly storage charge failed on its last run"));
  });
});
