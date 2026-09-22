/**
 * THE DAR PICKUP WAREHOUSE'S ADDRESS, WRITTEN TO THE DATABASE IT IS RUN AGAINST.
 *
 * Customers collect at the warehouse, not at the office: the office stays on
 * CompanySetting (Kariakoo); the pickup address lives on the Warehouse row with
 * code DAR, and every arrival, ready and pickup message, the pickup note and
 * the tracking page read it from there. Seeds write it for a new database;
 * this writes it to one that already exists.
 *
 * Idempotent: a row that already says this is left alone and nothing is
 * logged. A change writes the old value to FieldChange and a line to AuditLog
 * before it lands, like any other edit to a company fact.
 *
 *   DATABASE_URL=... npx tsx scripts/set-dar-warehouse-address.ts
 *   DATABASE_URL=... npx tsx scripts/set-dar-warehouse-address.ts "Another address"
 */
import { PrismaClient } from "@prisma/client";

import { DAR_WAREHOUSE } from "../prisma/data/company";

const prisma = new PrismaClient();

async function main() {
  const address = (process.argv[2] ?? DAR_WAREHOUSE.addressEnglish).trim();
  if (!address) throw new Error("No address given.");

  const row = await prisma.warehouse.findUnique({
    where: { code: DAR_WAREHOUSE.code },
    select: { id: true, name: true, addressEnglish: true },
  });

  if (!row) {
    const created = await prisma.$transaction(async (tx) => {
      const made = await tx.warehouse.create({ data: { ...DAR_WAREHOUSE, addressEnglish: address } });
      await tx.auditLog.create({
        data: {
          action: "warehouse.create",
          entity: "Warehouse",
          entityId: made.id,
          summary: `Opened ${made.name} (${made.code}) at ${address}`,
          metadata: { by: "scripts/set-dar-warehouse-address.ts" },
        },
      });
      return made;
    });
    console.log(`Warehouse ${created.code} created: ${address}`);
    return;
  }

  if (row.addressEnglish === address) {
    console.log(`Warehouse ${DAR_WAREHOUSE.code} already reads: ${address}. Nothing to do.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.fieldChange.create({
      data: {
        entity: "Warehouse",
        entityId: row.id,
        field: "addressEnglish",
        oldValue: row.addressEnglish,
        newValue: address,
        reason: "Pickup warehouse moved; the office address is unchanged",
      },
    });
    await tx.warehouse.update({ where: { id: row.id }, data: { addressEnglish: address } });
    await tx.auditLog.create({
      data: {
        action: "warehouse.update",
        entity: "Warehouse",
        entityId: row.id,
        summary: `${row.name} pickup address set to ${address}`,
        metadata: { oldValue: row.addressEnglish, newValue: address, by: "scripts/set-dar-warehouse-address.ts" },
      },
    });
  });
  console.log(`Warehouse ${DAR_WAREHOUSE.code}: "${row.addressEnglish ?? "—"}" → "${address}"`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
