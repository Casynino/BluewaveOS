import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * WHO MAY RUN A SCHEDULED JOB.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is set,
 * and that is the door this prefers. Where it is not set the request must at
 * least carry Vercel's own `x-vercel-cron` header, which their edge strips
 * from anything arriving off the internet.
 *
 * Nothing else reaches a job: these write to customers' bills, and a URL
 * anybody could curl is a URL somebody will.
 */
export function cronPermitted(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const given = header.startsWith("Bearer ") ? header.slice(7) : "";
    return Boolean(given) && sameSecret(given, secret);
  }
  return req.headers.get("x-vercel-cron") !== null;
}

/** Constant-time, and false rather than throwing on a length mismatch. */
function sameSecret(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
