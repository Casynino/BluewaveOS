/**
 * THE FOOT OF EVERY BILL, WRITTEN TO THE DATABASE IT IS RUN AGAINST.
 *
 * The terms the company prints and the storage policy beside them live on
 * CompanySetting, not in the invoice's code — a term changes by the owner's
 * word, not by a deploy. Seeds write them for a new database; this writes them
 * to one that already exists, and to nothing else.
 *
 * Idempotent: settings that already read this are left alone. Every change is
 * written to FieldChange and AuditLog with the old value first.
 *
 *   DATABASE_URL=... npx tsx scripts/set-invoice-terms.ts
 */
import { PrismaClient } from "@prisma/client";

import { COMPANY } from "../prisma/data/company";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.companySetting.findUnique({
    where: { id: "singleton" },
    select: { invoiceTerms: true, storagePerDay: true, storageCurrency: true, freeStorageDays: true },
  });
  if (!company) throw new Error("This database has no company settings yet — run the production seed first.");

  const wanted = {
    invoiceTerms: COMPANY.invoiceTerms,
    storagePerDay: COMPANY.storagePerDay,
    storageCurrency: COMPANY.storageCurrency,
    freeStorageDays: COMPANY.freeStorageDays,
  };

  const moved = (
    [
      ["invoiceTerms", company.invoiceTerms ?? null, wanted.invoiceTerms],
      ["storagePerDay", company.storagePerDay?.toString() ?? null, String(wanted.storagePerDay)],
      ["storageCurrency", company.storageCurrency ?? null, wanted.storageCurrency],
      ["freeStorageDays", String(company.freeStorageDays), String(wanted.freeStorageDays)],
    ] as const
  ).filter(([, was, now]) => was !== now);

  if (moved.length === 0) {
    console.log("The terms and the storage policy already read as the company prints them.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const [field, was, now] of moved) {
      await tx.fieldChange.create({
        data: {
          entity: "CompanySetting",
          entityId: "singleton",
          field,
          oldValue: was,
          newValue: now,
          reason: "The terms and storage policy printed on every invoice",
        },
      });
    }
    await tx.companySetting.update({ where: { id: "singleton" }, data: wanted });
    await tx.auditLog.create({
      data: {
        action: "settings.update",
        entity: "CompanySetting",
        entityId: "singleton",
        summary: `Invoice terms and storage policy set (${moved.map(([f]) => f).join(", ")})`,
        metadata: { by: "scripts/set-invoice-terms.ts" },
      },
    });
  });

  for (const [field, was, now] of moved) console.log(`${field}: ${was ?? "—"} → ${now}`);
  console.log("Every bill raised from now on prints them.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
