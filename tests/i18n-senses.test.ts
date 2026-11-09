import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

import { t } from "@/lib/i18n";

/**
 * ONE ENGLISH WORD, TWO CHINESE ONES.
 *
 * "Collected" is cargo picked up at the counter (提货) and money received (收款).
 * The money screens ask for "Collected|money"; the translation call shows the
 * word before the bar in English and the right sense in Chinese. A tag must
 * never travel in shared data (lib/), because that data also feeds PDFs, CSV
 * exports and WhatsApp messages that print it untranslated.
 */
const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".git", ".claude", ".next", "public", "storage"]);
function tree(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...tree(path));
    else if (/\.(tsx?|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe("a word with two meanings", () => {
  test("English shows the word alone; Chinese shows the meaning", () => {
    assert.equal(t("en", "Collected|money"), "Collected");
    assert.equal(t("en", "Collected"), "Collected");
    assert.equal(t("zh", "Collected|money"), "已收款");
    assert.equal(t("zh", "Collected"), "已提货");
  });

  test("ordinary text with a bar in it is left alone", () => {
    assert.equal(t("en", "Foshan | Dar"), "Foshan | Dar");
    assert.equal(t("en", "x|moneyy"), "x|moneyy");
  });

  test("a sense tag is only ever written on a screen, never in shared data", () => {
    const found: string[] = [];
    for (const file of tree(join(ROOT, "lib"))) {
      if (file.endsWith(join("lib", "i18n.ts"))) continue;
      const src = readFileSync(file, "utf8");
      if (/"[^"\n]*\|(?:money|cargo)"/.test(src)) found.push(relative(ROOT, file));
    }
    assert.deepEqual(found, []);
  });

  test("every tagged word a screen asks for has its Chinese", () => {
    const missing = new Set<string>();
    for (const dir of ["app", "components"]) {
      for (const file of tree(join(ROOT, dir))) {
        for (const m of readFileSync(file, "utf8").matchAll(/"([^"\n]*\|(?:money|cargo))"/g)) {
          const word = m[1].replace(/\|(?:money|cargo)$/, "");
          if (t("zh", m[1]) === word) missing.add(m[1]);
        }
      }
    }
    assert.deepEqual([...missing], []);
  });
});
