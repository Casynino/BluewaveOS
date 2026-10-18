import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * THE AUTOMATIC JOBS, AND WHETHER THEY RAN.
 *
 * Each scheduled job writes one line per run to SystemEvent, so the developer's
 * home can say "ran on schedule", "failed on its last run" or "has not run" —
 * a job that silently stops is otherwise invisible until a customer is billed
 * the wrong storage. Writing the line must never be what breaks the job, so
 * nothing here throws.
 */
export const JOBS = [
  { route: "/api/cron/storage-charge", title: "Nightly storage charge", runsAt: "00:05" },
  { route: "/api/cron/storage", title: "Morning storage notice", runsAt: "08:00" },
] as const;

export async function recordJobRun(route: string, ok: boolean, message: string) {
  try {
    await prisma.systemEvent.create({
      data: { kind: ok ? "JOB_OK" : "JOB_FAILED", message: message.slice(0, 400), route, path: route },
    });
  } catch {
    /* never the thing that breaks the job */
  }
}

/** The newest run of each job, or null where none has been recorded. */
export async function lastJobRuns() {
  const rows = await Promise.all(
    JOBS.map((j) =>
      prisma.systemEvent.findFirst({
        where: { route: j.route, kind: { in: ["JOB_OK", "JOB_FAILED"] } },
        orderBy: { createdAt: "desc" },
        select: { kind: true, createdAt: true },
      })
    )
  );
  return JOBS.map((j, i) => ({ ...j, last: rows[i] ? { ok: rows[i]!.kind === "JOB_OK", at: rows[i]!.createdAt } : null }));
}
