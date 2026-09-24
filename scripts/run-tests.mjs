/**
 * Run the suite against the scratch database.
 *
 * The test guard (tests/scratch-db.ts) refuses any database whose name does
 * not carry _test or _audit, so the suite can never be pointed at real data.
 * This reads the local DATABASE_URL, swaps the database name for the scratch
 * one, and hands it to the runner — the value is never printed.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => /^\s*[A-Z_]+\s*=/.test(l))
    .map((l) => {
      const at = l.indexOf("=");
      return [l.slice(0, at).trim(), l.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    })
);

const scratch = (url) => url.replace(/\/([^/?]+)(\?|$)/, "/bluewave_test$2");
const url = scratch(env.DATABASE_URL ?? "");
if (!/_test/.test(url)) throw new Error("Could not point the suite at a scratch database.");

const child = spawn("npx", ["tsx", "--test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ...env, DATABASE_URL: url, DIRECT_URL: url },
});
child.on("exit", (code) => process.exit(code ?? 1));
