import { NextResponse } from "next/server";

import { cronPermitted } from "@/lib/cron-door";
import { runJob } from "@/lib/jobs";
import { accrueStorage } from "@/lib/storage-charge";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * Called by the Vercel scheduler just after midnight in Dar es Salaam
 * (vercel.json), when a new storage day begins, so every bill carries today's
 * storage before the first customer walks in. Same door as the notice job.
 * Safe to repeat: a bill already at today's figure is left alone.
 */
export async function GET(req: Request) {
  if (!cronPermitted(req)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  try {
    const result = await runJob("storage-charge", async () => {
      const r = await accrueStorage();
      return { checked: r.checked, charged: r.charged.length };
    });
    return NextResponse.json(
      { ok: true, ...result, ranAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[cron/storage-charge] the nightly storage charge did not run", error);
    return NextResponse.json(
      { ok: false, error: "The run failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
