import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import { CHINA_WAREHOUSE, COLLECTION_ACCOUNTS, COMPANY, DAR_WAREHOUSE, OPENING_USD_TZS } from "./data/company";
import { seedChina } from "./data/china";
import { seedMarkets } from "./data/markets";
import { refuseProductionDatabase } from "./dev/guard";

refuseProductionDatabase("prisma/seed.ts");

const prisma = new PrismaClient();

/**
 * Enough of a company to sign in to and drive.
 *
 * DEVELOPMENT ONLY. Six desks share one password from the environment and the
 * rate book carries placeholder prices; neither belongs on a live database,
 * which is seeded by prisma/seed.production.ts instead.
 *
 * Real details where they are real — the Foshan warehouse address and the
 * Dar office are the company's actual ones, because the whole China flow starts
 * with a customer handing that address to their supplier and a placeholder
 * there is a placeholder in the most important string in the system.
 *
 * Idempotent throughout: every write is an upsert on a natural key, so running
 * it twice changes nothing and running it against a database with data in it
 * adds the missing rows rather than trampling the present ones.
 */

/* The fallback is printed in .env.example, so on a live database it is a
   password the whole internet knows. Production must say what it wants. */
if (process.env.NODE_ENV === "production" && !process.env.SEED_ADMIN_PASSWORD) {
  throw new Error("Set SEED_ADMIN_PASSWORD before seeding a production database.");
}
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Company -------------------------------------------------------------
  await prisma.companySetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      name: COMPANY.name,
      tagline: COMPANY.tagline,
      email: COMPANY.email,
      phone: COMPANY.phone,
      altPhone: COMPANY.altPhone,
      whatsapp: COMPANY.whatsapp,
      darAddress: COMPANY.darAddress,
      chinaAddress: COMPANY.chinaAddress,
      chinaEntity: COMPANY.chinaEntity,
      darEntity: COMPANY.darEntity,
      darPostal: COMPANY.darPostal,
      tin: COMPANY.tin,
      vrn: COMPANY.vrn,
      vatPercent: COMPANY.vatPercent,
      freeStorageDays: COMPANY.freeStorageDays,
      storagePerDay: COMPANY.storagePerDay,
      storageCurrency: COMPANY.storageCurrency,
      instagram: COMPANY.instagram,
      invoiceTerms: COMPANY.invoiceTerms,
    },
  });

  /* The accounts printed at the foot of every invoice. Upserted on the account
     number so re-seeding cannot double them. */
  for (const [index, account] of COLLECTION_ACCOUNTS.entries()) {
    const existing = await prisma.bankAccount.findFirst({
      where: { accountNumber: account.accountNumber },
    });
    if (existing) continue;
    await prisma.bankAccount.create({ data: { ...account, sortOrder: index } });
  }

  // --- Warehouses ----------------------------------------------------------
  const china = await prisma.warehouse.upsert({
    where: { code: CHINA_WAREHOUSE.code },
    update: {},
    create: CHINA_WAREHOUSE,
  });

  const dar = await prisma.warehouse.upsert({
    where: { code: DAR_WAREHOUSE.code },
    update: {},
    create: DAR_WAREHOUSE,
  });

  // --- Staff ---------------------------------------------------------------
  const staff: {
    email: string;
    name: string;
    role: Role;
    department: "MANAGEMENT" | "CUSTOMER_SUPPORT" | "CHINA_WAREHOUSE" | "DAR_WAREHOUSE" | "FINANCE";
    warehouseId?: string;
  }[] = [
    { email: "admin@bluewavecargo.co.tz", name: "System Administrator", role: "ADMIN", department: "MANAGEMENT" },
    { email: "manager@bluewavecargo.co.tz", name: "Operations Manager", role: "MANAGER", department: "MANAGEMENT" },
    { email: "support@bluewavecargo.co.tz", name: "Customer Support", role: "CUSTOMER_SUPPORT", department: "CUSTOMER_SUPPORT" },
    { email: "china@bluewavecargo.co.tz", name: "Foshan Warehouse", role: "CHINA_WAREHOUSE", department: "CHINA_WAREHOUSE", warehouseId: china.id },
    { email: "dar@bluewavecargo.co.tz", name: "Dar Warehouse", role: "DAR_WAREHOUSE", department: "DAR_WAREHOUSE", warehouseId: dar.id },
    { email: "finance@bluewavecargo.co.tz", name: "Finance Officer", role: "FINANCE", department: "FINANCE" },
  ];

  for (const person of staff) {
    await prisma.user.upsert({
      where: { email: person.email },
      update: { role: person.role, department: person.department },
      create: {
        email: person.email,
        name: person.name,
        role: person.role,
        department: person.department,
        warehouseId: person.warehouseId ?? null,
        passwordHash,
      },
    });
  }

  // --- Exchange rate -------------------------------------------------------
  const existingFx = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
  });
  if (!existingFx) {
    await prisma.exchangeRate.create({
      data: {
        fromCurrency: "USD",
        toCurrency: "TZS",
        rate: OPENING_USD_TZS,
        notes: "Opening rate. Finance publishes the next one from the Rate book.",
      },
    });
  }

  // --- Rate book -----------------------------------------------------------
  // Rates live here, never in a React component. These are placeholders with a
  // shape, not the company's real commercial terms — Finance sets those.
  const rates = [
    { service: "LCL" as const, cargoType: null, basis: "PER_CBM" as const, rate: 250, minimumCbm: 0.5 },
    { service: "LCL" as const, cargoType: "Electronics", basis: "PER_CBM" as const, rate: 320, minimumCbm: 0.5 },
    { service: "FCL" as const, cargoType: "20GP", basis: "FLAT" as const, rate: 2800, minimumCbm: null },
    { service: "FCL" as const, cargoType: "40HQ", basis: "FLAT" as const, rate: 4200, minimumCbm: null },
  ];

  for (const rate of rates) {
    const found = await prisma.shippingRate.findFirst({
      where: { service: rate.service, cargoType: rate.cargoType, active: true },
    });
    if (!found) {
      await prisma.shippingRate.create({
        data: {
          origin: "China",
          destination: "Tanzania",
          service: rate.service,
          cargoType: rate.cargoType,
          basis: rate.basis,
          rate: rate.rate,
          minimumCbm: rate.minimumCbm,
          currency: "USD",
          published: true,
        },
      });
    }
  }

  // --- Container cost categories ------------------------------------------
  const expenseTypes = [
    "Ocean freight",
    "Clearing & forwarding",
    "Port charges",
    "Customs duty",
    "Transport to warehouse",
    "Handling & labour",
    "Documentation",
    "Demurrage",
  ];
  for (const name of expenseTypes) {
    await prisma.expenseType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // --- The China guide -----------------------------------------------------
  await seedMarkets(prisma);
  await seedChina(prisma);

  console.log("Seeded. Staff sign in with the address above and SEED_ADMIN_PASSWORD.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
