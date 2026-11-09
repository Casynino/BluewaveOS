import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { Role } from "@prisma/client";

import { t } from "@/lib/i18n";
import { navigationFor } from "@/lib/nav";

/**
 * THE SIDEBAR SPEAKS IN ONE WORD (owner, 9 Nov 2026).
 *
 * Every page in every desk's menu, and every tab under a department's title,
 * is named with one simple word — "Arrived", not "Arrived containers"; the
 * section heading above it says what it belongs to. The page's full name is
 * kept beside it for the menu's search and the tooltip. Two rows in one
 * person's menu never share a word, or the word stops telling them apart.
 */
const ROLES: Role[] = ["ADMIN", "MANAGER", "CUSTOMER_SUPPORT", "CHINA_WAREHOUSE", "DAR_WAREHOUSE", "FINANCE", "DEVELOPER"];

describe("the sidebar's names", () => {
  for (const role of ROLES) {
    const items = navigationFor(role).flatMap((section) => section.items);

    test(`${role}: every row is one word`, () => {
      const long = items.filter((item) => /\s/.test(item.label)).map((item) => item.label);
      assert.deepEqual(long, []);
    });

    test(`${role}: no two rows share a word`, () => {
      const words = items.map((item) => item.label);
      const twice = words.filter((word, i) => words.indexOf(word) !== i);
      assert.deepEqual(twice, []);
    });

    test(`${role}: the Foshan floor can read every row`, () => {
      const untranslated = items.filter((item) => t("zh", item.label) === item.label).map((item) => item.label);
      assert.deepEqual(untranslated, []);
    });
  }
});
