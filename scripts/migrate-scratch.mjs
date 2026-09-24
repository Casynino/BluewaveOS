/**
 * Bring the scratch test database up to the schema.
 *
 * The suite runs against bluewave_test; a migration added to the project has
 * to reach it too, or every query touching the new column fails and reads as
 * a hundred broken tests. Same reading as scripts/run-tests.mjs: the URL is
 * taken from .env, the database name swapped, and never printed.
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
if (!/_test/.test(url)) throw new Error("Refusing: that is not a scratch database.");

const child = spawn("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
});
child.on("exit", (code) => process.exit(code ?? 1));
