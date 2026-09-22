/*
  The tests that commit what they write need a database nobody minds losing.

  The name is the whole guard: a throwaway carries `_test` or `_audit` in it,
  the development database (`bluewave`) and anything hosted do not, so a run
  pointed at real records stops before it opens a transaction.
*/
export function requireScratchDatabase(): string {
  const url = process.env.DATABASE_URL ?? "";
  const name = /\/([^/?#]+)(\?|#|$)/.exec(url)?.[1] ?? "";
  if (!/_(test|audit)/.test(name)) {
    throw new Error(
      `Refusing to run: DATABASE_URL must name a throwaway database — one with _test or _audit in its name (got ${url || "nothing"}).`
    );
  }
  return url;
}
