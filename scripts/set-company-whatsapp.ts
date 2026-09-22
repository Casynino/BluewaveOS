/**
 * THE NUMBER "WHATSAPP US" OPENS, WRITTEN TO THE DATABASE IT IS RUN AGAINST.
 *
 * Seeds write it for a new database; this writes it to one that already
 * exists. Idempotent: a row that already says this is left alone. A change
 * writes the old value to FieldChange and a line to AuditLog before it lands,
 * like any other edit to a company fact.
 *
 *   DATABASE_URL=... npx tsx scripts/set-company-whatsapp.ts
 *   DATABASE_URL=... npx tsx scripts/set-company-whatsapp.ts 255712345678
 */
import { PrismaClient } from "@prisma/client";

import { COMPANY } from "../prisma/data/company";

const prisma = new PrismaClient();

async function main() {
  /* WhatsApp wants digits with the country code and no plus. */
  const whatsapp = (process.argv[2] ?? COMPANY.whatsapp).replace(/[^\d]/g, "");
  if (whatsapp.length < 9) throw new Error("That is not a full number with its country code.");

  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { whatsapp: true },
  });
  if (!company) throw new Error("This database has no company settings yet — run the production seed first.");
  if (company.whatsapp === whatsapp) {
    console.log(`WhatsApp already reads ${whatsapp}. Nothing to do.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.fieldChange.create({
      data: {
        entity: "CompanySetting",
        entityId: "singleton",
        field: "whatsapp",
        oldValue: company.whatsapp ?? null,
        newValue: whatsapp,
        reason: "The line the company answers on WhatsApp",
      },
    });
    await tx.companySetting.update({ where: { id: "singleton" }, data: { whatsapp } });
    await tx.auditLog.create({
      data: {
        action: "settings.update",
        entity: "CompanySetting",
        entityId: "singleton",
        summary: `WhatsApp ${company.whatsapp ?? "—"} → ${whatsapp}`,
        metadata: { by: "scripts/set-company-whatsapp.ts" },
      },
    });
  });
  console.log(`WhatsApp is now ${whatsapp}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
