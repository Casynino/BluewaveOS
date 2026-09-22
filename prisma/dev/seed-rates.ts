import { PrismaClient } from "@prisma/client";

import { RATE_BOOK, rateRow } from "../data/rate-book";
import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-rates.ts");
const prisma = new PrismaClient();

/* Brings a development database's live rates into line with the book,
   editing rows in place. Production never does that: a price change there is a
   new row published by Finance, so the old bills keep the rate they were
   priced under. */

async function main() {
  let added = 0;
  let updated = 0;

  for (const entry of RATE_BOOK) {
    const { cargoType, basis, rate, notes } = rateRow(entry);
    const existing = await prisma.shippingRate.findFirst({
      where: { service: "LCL", cargoType, active: true },
    });

    if (existing) {
      if (Number(existing.rate) !== rate || existing.basis !== basis) {
        await prisma.shippingRate.update({
          where: { id: existing.id },
          data: { rate, basis, notes },
        });
        updated++;
      }
      continue;
    }

    await prisma.shippingRate.create({
      data: {
        origin: "China",
        destination: "Tanzania",
        service: "LCL",
        cargoType,
        basis,
        rate,
        currency: "USD",
        published: true,
        /* No minimum on the real book. A floor nobody agreed to is a floor that
           produces an invoice nobody can explain. */
        minimumCbm: null,
        notes,
      },
    });
    added++;
  }

  /* Types the company no longer lists stop being offered. */
  const retired = await prisma.shippingRate.updateMany({
    where: { service: "LCL", active: true, cargoType: { notIn: RATE_BOOK.map((r) => r[0]) } },
    data: { active: false, effectiveTo: new Date() },
  });
  console.log(`retired ${retired.count}`);

  const live = await prisma.shippingRate.count({ where: { active: true } });
  console.log(`added ${added}, updated ${updated}; ${live} live rates`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
