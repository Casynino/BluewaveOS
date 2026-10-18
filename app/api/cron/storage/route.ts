import { NextResponse } from "next/server";

import { cronPermitted } from "@/lib/cron-door";
import { sendStorageNotices } from "@/lib/storage-notices";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

/**
 * THE MORNING RUN THAT TELLS CUSTOMERS THEIR FREE STORAGE HAS ENDED.
 *
 * Scheduled in vercel.json for 05:00 UTC — 08:00 in Dar, before the counter
 * opens, so a customer reads it with the day in front of them. Every
 * consignment still on the floor past its free days, whose customer has not
 * been told, is told once; lib/storage-notices.ts claims the row before it
 * writes the message, so two runs at the same moment cannot tell anybody
 * twice.
 *
 * The charging is the other job, just after Dar midnight — see
 * /api/cron/storage-charge. Told in the morning, charged from the night the
 * free days ran out, and never a message about each day that follows.
 */
export async function GET(req: Request) {
  /* No detail: a caller who is not the scheduler learns nothing about which
     half of the door it failed. */
  if (!cronPermitted(req)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  try {
    const result = await sendStorageNotices();
    return NextResponse.json(
      { ok: true, ...result, ranAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    /* A failed run is a run nobody heard about otherwise: the schedule has no
       screen. It goes to the platform log with the status, so a day the
       customers were not told is a day somebody can find. */
    console.error("[cron/storage] the daily storage notices did not run", error);
    return NextResponse.json(
      { ok: false, error: "The run failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
