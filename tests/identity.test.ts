import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";

import { t } from "@/lib/i18n";
import { LOCALES } from "@/lib/locale";

/**
 * THE IDENTITY ON THE SCREEN IS BLUEWAVE'S, AND THE LANGUAGE IS THE READER'S.
 *
 * This system was rebuilt from a working one, so the failures worth guarding
 * are the ones that come back by copying: a name from the system it came from,
 * a Chinese sentence typed into a component where only the Foshan floor was in
 * mind, an air-freight word in a dictionary entry a ship's screen now renders.
 *
 * Read off the source, like tests/audit-coverage.ts, because what is being
 * caught is a new file arriving with the old wording in it — something you see
 * by reading the tree, not by remembering to write a fixture.
 */

const ROOT = process.cwd();
/* `.claude` holds the worktrees other sessions work in — copies of this same
   tree. Reading them means this suite fails for a line somebody else has not
   finished writing yet. */
const SKIP = new Set([
  "node_modules", ".git", ".claude", ".next", ".next-prod", ".next-check", ".next-verify", "storage", "public",
]);

function tree(dir: string, keep: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...tree(path, keep));
    else if (keep.test(name)) out.push(path);
  }
  return out;
}

/* This file spells out the words it is looking for, so it reads everything but
   itself. */
const SOURCE = tree(ROOT, /\.(tsx?|mjs|prisma|md|json|css)$/).filter(
  (f) => !f.endsWith("package-lock.json") && f !== __filename
);

describe("nothing of the system this one was rebuilt from", () => {
  /* Word boundaries on both sides: "swiftly" in a sentence is English, and a
     test that cries at it is a test somebody switches off. */
  const FOREIGN = [
    /\bswift\s*cargo\b/i,
    /\bswiftcargo\b/i,
    /\btarget\s*express\b/i,
    /\btargetexpress\b/i,
    /\bswift\b(?!\s*(?:ly|er|ness))/i,
  ];

  test("no file names another company", () => {
    const found: string[] = [];
    for (const file of SOURCE) {
      const src = readFileSync(file, "utf8");
      for (const pattern of FOREIGN) {
        const hit = pattern.exec(src);
        if (hit) found.push(`${relative(ROOT, file)}: ${hit[0]}`);
      }
    }
    assert.deepEqual(found, [], `another company's name is in the tree:\n${found.join("\n")}`);
  });

  test("the China warehouse is Foshan — Guangzhou is only ever a place to shop", () => {
    const found: string[] = [];
    for (const file of SOURCE) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (/guangzhou[^.\n]{0,20}\bwarehouse\b|\bwarehouse\b[^.\n]{0,20}guangzhou/i.test(line)) {
          found.push(`${relative(ROOT, file)}: ${line.trim()}`);
        }
      }
    }
    assert.deepEqual(found, [], `the warehouse is in Foshan (Nanhai):\n${found.join("\n")}`);
  });
});

describe("the Chinese the Foshan floor reads", () => {
  const CJK = /[一-鿿]/;

  /* A screen that is bilingual on purpose: a card the customer forwards to a
     Chinese supplier, a note printed in both languages, a language switch that
     must name itself in its own language, or a comment quoting what a clerk
     types. Anything not on this list belongs in the dictionary. */
  const BILINGUAL_BY_DESIGN = new Set(
    [
      /* A comment quoting what the Foshan counter types into the box. */
      "app/app/scan/[cargoId]/page.tsx",
      "components/app/app-shell.tsx",
      /* A language names itself in its own language, or nobody who needs the
         switch can find it. */
      "components/app/language-switch.tsx",
      /* The example value inside a Chinese-name field. */
      "components/app/explore-cities.tsx",
      /* Printed paper that crosses the border and is read at both ends. */
      "components/app/delivery-note-sheet.tsx",
      "components/app/packing-list-sheet.tsx",
      /* The Foshan counter's own screen, and the card a customer forwards
         to a Chinese factory. */
      "components/app/intake-form.tsx",
      "components/app/supplier-address-card.tsx",
    ].map((p) => join(ROOT, p))
  );

  test("no screen is excused that stopped being bilingual", () => {
    const stale = [...BILINGUAL_BY_DESIGN]
      .filter((file) => !CJK.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file));
    assert.deepEqual(stale, [], `drop these, or the list stops guarding:\n${stale.join("\n")}`);
  });

  test("a staff screen carries no Chinese of its own", () => {
    const leaks: string[] = [];
    for (const file of tree(join(ROOT, "app", "app"), /\.tsx?$/).concat(
      tree(join(ROOT, "components", "app"), /\.tsx?$/)
    )) {
      if (BILINGUAL_BY_DESIGN.has(file)) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (CJK.test(line)) leaks.push(`${relative(ROOT, file)}:${i + 1} ${line.trim()}`);
        });
    }
    assert.deepEqual(
      leaks,
      [],
      `Chinese hard-coded into a component reaches the English and Swahili readers too:\n${leaks.join("\n")}`
    );
  });

  test("no live translation speaks of aeroplanes", () => {
    /* The dictionary was started from the air side's, which is why so much of
       it was already right. What it also carried is a vocabulary of flights and
       airports, and a key a sea screen renders must not take it. */
    const AIR = /航班|机场|空运|航空|起飞|落地|装机/;
    const AIR_EN = /flight|airport|airline|air ?freight|air ?cargo|air ?waybill|\bawb\b|aircraft|by air/i;
    const dictionary = readFileSync(join(ROOT, "lib", "i18n.ts"), "utf8");
    const zh = dictionary.slice(
      dictionary.indexOf("const ZH: Record<string, string> = {"),
      dictionary.indexOf("\nconst DICTIONARIES")
    );
    const rendered = tree(join(ROOT, "app"), /\.tsx?$/)
      .concat(tree(join(ROOT, "components"), /\.tsx?$/), tree(join(ROOT, "lib"), /\.tsx?$/))
      .filter((f) => !f.endsWith(join("lib", "i18n.ts")))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");

    const wrong: string[] = [];
    for (const m of zh.matchAll(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*\n?\s*("(?:[^"\\]|\\.)*")\s*,/gm)) {
      const english = JSON.parse(m[1]) as string;
      const chinese = JSON.parse(m[2]) as string;
      if (!AIR.test(chinese) || AIR_EN.test(english)) continue;
      if (rendered.includes(`"${english}"`)) wrong.push(`${english}  →  ${chinese}`);
    }
    assert.deepEqual(wrong, [], `a sea screen would read this as air freight:\n${wrong.join("\n")}`);
  });
});

describe("the language a person may choose", () => {
  test("the profile offers exactly the languages the screens are written in", () => {
    const form = readFileSync(join(ROOT, "components", "app", "profile-forms.tsx"), "utf8");
    const offered = [...form.matchAll(/<option value="(\w+)"/g)].map((m) => m[1]);
    assert.deepEqual(
      offered,
      [],
      "the language list is built from LOCALES; a typed-in <option> is one the server will refuse"
    );
    assert.deepEqual([...LOCALES], ["en", "zh"]);
  });

  test("every locale has a name a reader of that locale can read", () => {
    for (const locale of LOCALES) {
      assert.equal(t(locale, "Language") !== "", true);
    }
  });
});
