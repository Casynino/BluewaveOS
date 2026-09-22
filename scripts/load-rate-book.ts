/**
 * Publish prisma/data/rate-book.ts into the live rate book — and nothing else.
 *
 *   npx tsx scripts/load-rate-book.ts          # show what would change
 *   npx tsx scripts/load-rate-book.ts --apply  # publish it
 *
 * The production seed can do this too, but it also wants the administrator's
 * password; the rate book is Finance's and is loaded on its own. A cargo type
 * that already has a live LCL rate is left as it is — a price somebody changed
 * on the rates page is never overwritten from this file. Every row published
 * writes its AuditLog entry.
 */
import { PrismaClient } from "@prisma/client";

import { RATE_BOOK, rateRow } from "../prisma/data/rate-book";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const now = new Date();
  let added = 0;
  let kept = 0;
  for (const entry of RATE_BOOK) {
    const { cargoType, basis, rate, notes } = rateRow(entry);
    const existing = await prisma.shippingRate.findFirst({
      where: {
        service: "LCL",
        cargoType,
        active: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { rate: true, basis: true },
    });
    if (existing) {
      kept++;
      if (Number(existing.rate) !== rate || existing.basis !== basis) {
        console.log(`  kept   ${cargoType}: live ${existing.rate} ${existing.basis}, file says ${rate} ${basis}`);
      }
      continue;
    }
    console.log(`  ${apply ? "added" : "would add"}  ${cargoType}: USD ${rate} ${basis}`);
    added++;
    if (!apply) continue;
    await prisma.$transaction(async (tx) => {
      const row = await tx.shippingRate.create({
        data: {
          origin: "China",
          destination: "Tanzania",
          service: "LCL",
          cargoType,
          basis,
          rate,
          currency: "USD",
          published: true,
          minimumCbm: null,
          notes,
        },
      });
      await tx.auditLog.create({
        data: {
          actorEmail: "scripts/load-rate-book",
          action: "rate.publish",
          entity: "ShippingRate",
          entityId: row.id,
          summary: `LCL ${cargoType}: USD ${rate} ${basis}`,
        },
      });
    });
  }
  console.log(`\n${RATE_BOOK.length} in the file · ${added} ${apply ? "published" : "to publish"} · ${kept} already live.`);
  if (!apply && added) console.log("Run again with --apply to publish.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
