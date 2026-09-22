/**
 * THE LIVE DATABASE'S FIRST DAY, AND NOTHING ELSE.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='…' npx tsx prisma/seed.production.ts
 *
 * Writes only what the business cannot operate without and has no screen to
 * create: the company settings row, the two warehouses, the collection accounts
 * printed on every invoice, the opening exchange rate, the expense categories,
 * the markets directory and one administrator.
 * Every other person is added by that administrator at /app/admin/users, so
 * each account has an owner and an audit line from its first minute.
 *
 * No customer, cargo, bill or payment is ever written here, and no Counter is
 * touched: the first invoice on the live system is INV-…-000001 because nothing
 * before it was invented.
 *
 * Idempotent. Every step fills a gap and leaves a present row alone — settings
 * and prices belong to whoever edited them after the first run, and running
 * this again must not put back what they changed.
 *
 * Optional:
 *   ADMIN_NAME           the administrator's display name
 *   SEED_RATE_BOOK=true  also publish prisma/data/rate-book.ts, once Finance has
 *                        written the company's confirmed rates into it
 *   SEED_MARKETS=false   skip the public markets directory
 *   COMPANY_EMAIL, COMPANY_PHONE, COMPANY_WHATSAPP, COMPANY_TIN, COMPANY_VRN
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { CHINA_WAREHOUSE, COLLECTION_ACCOUNTS, COMPANY, DAR_WAREHOUSE, OPENING_USD_TZS } from "./data/company";
import { seedChina } from "./data/china";
import { seedMarkets } from "./data/markets";
import { RATE_BOOK, rateRow } from "./data/rate-book";

const prisma = new PrismaClient();

const SEED_ACTOR = "seed.production";

/** The company default, the rate on its printed invoice. */
const DEFAULT_USD_TZS = new Prisma.Decimal(OPENING_USD_TZS);

/* Container costs first, then the office's own. There is no screen that adds a
   category, so a missing one is a cost nobody can record. Salaries is created
   by the payroll run itself. */
const EXPENSE_TYPES = [
  "Ocean freight",
  "Clearing & forwarding",
  "Port charges",
  "Customs duty",
  "Transport to warehouse",
  "Handling & labour",
  "Documentation",
  "Demurrage",
  "Rent",
  "Utilities",
  "Office supplies",
  "Maintenance",
  "Transport",
  "Allowance",
  "Internet & phone",
  "Miscellaneous",
];

/* Passwords the development seed and the examples have ever printed. Somebody
   copying .env.example into production is the likeliest way one reaches it. */
const KNOWN_PASSWORDS = ["changeme123!", "password123!", "admin123456!", "bluewave123!"];

function flag(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Administrator";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail("ADMIN_EMAIL is required and must be an email address.");
  }

  /* The administrator can change who may do what, so this account is the whole
     system. A short or guessable password here is not a user's choice to make. */
  const problems: string[] = [];
  if (password.length < 12) problems.push("at least 12 characters");
  if (!/[a-z]/.test(password)) problems.push("a lower-case letter");
  if (!/[A-Z]/.test(password)) problems.push("an upper-case letter");
  if (!/[0-9]/.test(password)) problems.push("a digit");
  if (!/[^A-Za-z0-9]/.test(password)) problems.push("a symbol");
  if (problems.length) fail(`ADMIN_PASSWORD is too weak: it needs ${problems.join(", ")}.`);

  const lowered = password.toLowerCase();
  const local = email.split("@")[0];
  if (
    KNOWN_PASSWORDS.includes(lowered) ||
    lowered.includes("password") ||
    lowered.includes("bluewave") ||
    (local.length >= 4 && lowered.includes(local))
  ) {
    fail("ADMIN_PASSWORD is a known or guessable password. Choose another.");
  }

  return { email, password, name };
}

async function audit(action: string, entity: string, entityId: string, summary: string, metadata?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({
    data: { actorEmail: SEED_ACTOR, action, entity, entityId, summary, metadata },
  });
}

async function main() {
  const admin = requireAdmin();

  // --- Company -------------------------------------------------------------
  const company = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
  if (!company) {
    await prisma.companySetting.create({
      data: {
        id: "singleton",
        name: COMPANY.name,
        tagline: COMPANY.tagline,
        email: process.env.COMPANY_EMAIL?.trim() || COMPANY.email,
        phone: process.env.COMPANY_PHONE?.trim() || COMPANY.phone,
        altPhone: COMPANY.altPhone,
        whatsapp: process.env.COMPANY_WHATSAPP?.trim() || COMPANY.whatsapp,
        darAddress: COMPANY.darAddress,
        chinaAddress: COMPANY.chinaAddress,
        chinaEntity: COMPANY.chinaEntity,
        darEntity: COMPANY.darEntity,
        darPostal: COMPANY.darPostal,
        tin: process.env.COMPANY_TIN?.trim() || COMPANY.tin,
        vrn: process.env.COMPANY_VRN?.trim() || COMPANY.vrn,
        vatPercent: COMPANY.vatPercent,
        freeStorageDays: COMPANY.freeStorageDays,
        instagram: COMPANY.instagram,
        invoiceTerms: COMPANY.invoiceTerms,
      },
    });
    console.log("Company settings created. Review them at /app/admin/settings.");
  } else {
    console.log("Company settings already present; left as they are.");
  }

  // --- Warehouses ----------------------------------------------------------
  const warehouses = [CHINA_WAREHOUSE, DAR_WAREHOUSE];
  for (const warehouse of warehouses) {
    const existing = await prisma.warehouse.findUnique({ where: { code: warehouse.code } });
    if (existing) continue;
    const row = await prisma.warehouse.create({ data: warehouse });
    await audit("warehouse.create", "Warehouse", row.id, `Opened ${row.name} (${row.code})`);
    console.log(`Warehouse ${row.code} created.`);
  }

  // --- Collection accounts ------------------------------------------------
  /* The accounts the company's invoice already prints. Issuing a bill copies
     the live ones onto it, so a live system with none issues bills that tell
     the customer nowhere to pay. */
  for (const [index, account] of COLLECTION_ACCOUNTS.entries()) {
    const existing = await prisma.bankAccount.findFirst({ where: { accountNumber: account.accountNumber } });
    if (existing) continue;
    const row = await prisma.bankAccount.create({ data: { ...account, sortOrder: index } });
    await audit("account.create", "BankAccount", row.id, `Added ${row.bankName} ${row.currency} ${row.accountNumber}`);
    console.log(`Account ${row.bankName} ${row.currency} added.`);
  }

  // --- Administrator -------------------------------------------------------
  let adminRow = await prisma.user.findUnique({ where: { email: admin.email } });
  if (!adminRow) {
    adminRow = await prisma.user.create({
      data: {
        email: admin.email,
        name: admin.name,
        role: "ADMIN",
        department: "MANAGEMENT",
        passwordHash: await bcrypt.hash(admin.password, 12),
      },
    });
    await audit("user.create", "User", adminRow.id, `Created the first administrator, ${admin.email}`, {
      role: "ADMIN",
    });
    console.log(`Administrator ${admin.email} created.`);
  } else {
    /* An existing account keeps its password. A seed that resets the owner's
       password every deploy is a back door with a deploy button. */
    console.log(`${admin.email} already exists (${adminRow.role}); password left unchanged.`);
  }

  // --- Exchange rate -------------------------------------------------------
  /* Only when nothing is live. Once Finance has published a rate, a re-run
     publishing the default over it would re-price every bill raised afterwards. */
  const live = await prisma.exchangeRate.findFirst({
    where: { fromCurrency: "USD", toCurrency: "TZS", active: true },
    orderBy: { effectiveFrom: "desc" },
  });
  if (!live) {
    const row = await prisma.exchangeRate.create({
      data: {
        fromCurrency: "USD",
        toCurrency: "TZS",
        rate: DEFAULT_USD_TZS,
        effectiveFrom: new Date(),
        notes: "Company default rate",
        createdById: adminRow.id,
      },
    });
    await audit("fx.set", "ExchangeRate", row.id, `USD → TZS ${OPENING_USD_TZS} — Company default rate`, {
      oldValue: null,
      newValue: String(OPENING_USD_TZS),
      previousRateId: null,
      reason: "Company default rate",
    });
    console.log(`Published 1 USD = ${OPENING_USD_TZS} TZS.`);
  } else {
    console.log(`Live rate already 1 USD = ${live.rate.toString()} TZS; left as it is.`);
  }

  // --- Expense categories --------------------------------------------------
  let categories = 0;
  for (const name of EXPENSE_TYPES) {
    const existing = await prisma.expenseType.findUnique({ where: { name } });
    if (existing) continue;
    await prisma.expenseType.create({ data: { name } });
    categories++;
  }
  console.log(`Expense categories: ${categories} added.`);

  // --- Rate book (opt-in) --------------------------------------------------
  if (flag("SEED_RATE_BOOK", false)) {
    let published = 0;
    for (const entry of RATE_BOOK) {
      const { cargoType, basis, rate, notes } = rateRow(entry);
      const existing = await prisma.shippingRate.findFirst({
        where: { service: "LCL", cargoType, active: true },
        select: { id: true },
      });
      if (existing) continue;
      const row = await prisma.shippingRate.create({
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
      await audit("rate.publish", "ShippingRate", row.id, `LCL ${cargoType}: USD ${rate} ${basis}`);
      published++;
    }
    console.log(`Rate book: ${published} rate(s) published. Finance should confirm every figure before the first receiving.`);
  }

  // --- Markets directory ---------------------------------------------------
  if (flag("SEED_MARKETS", true)) {
    const { added, total } = await seedMarkets(prisma);
    console.log(`Markets: ${total} published (${added} added this run).`);
    const china = await seedChina(prisma);
    console.log(`China guide: ${china.cities} cities, ${china.categories} categories added; ${china.placed} markets placed.`);
  }

  console.log("Production seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
