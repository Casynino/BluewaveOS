/**
 * RETRY A QUERY THAT NEVER REACHED THE DATABASE.
 *
 * Neon puts an idle database to sleep and wakes it on the first connection,
 * which takes a few seconds; until it is awake that first request fails with
 * P1001 "Can't reach database server" and the visitor sees an error page.
 * P1001 means the connection was never made, so nothing ran and asking again
 * cannot do anything twice — which is why this retries that code and no other.
 *
 * Prisma 6 raises a failed first connect as a PrismaClientInitializationError
 * that can arrive with no code at all; only its message says the server was
 * never reached. That message is the same P1001, so it is matched with the
 * class name as well — a dropped connection mid-query says something else
 * ("Server has closed the connection") and is never repeated.
 */
const WAITS_MS = [700, 1500, 3000];

export function isUnreachable(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; errorCode?: unknown; name?: unknown; message?: unknown };
  if (e.code === "P1001" || e.errorCode === "P1001") return true;
  return (
    e.name === "PrismaClientInitializationError" &&
    typeof e.message === "string" &&
    e.message.includes("Can't reach database server")
  );
}

export async function withRetry<T>(run: () => Promise<T>, waits: number[] = WAITS_MS): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isUnreachable(error) || attempt >= waits.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
    }
  }
}
