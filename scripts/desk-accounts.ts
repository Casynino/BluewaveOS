/**
 * One login per department, all with the password given — so the owner can
 * try every desk before real staff are added at /app/admin/users.
 *
 *   PASSWORD='…' npx tsx scripts/desk-accounts.ts
 *
 * Creates any desk account that is missing and gives existing ones the
 * password. Nothing else about an existing account is touched. These are
 * shared test logins: replace them with named people, one account each,
 * before the business runs on the system — an audit trail that says
 * "finance@" did something says nothing about who.
 */
import { PrismaClient, type Department, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DESKS: { email: string; name: string; role: Role; department: Department; warehouse?: string }[] = [
  { email: "admin@bluewavecargo.co.tz", name: "System Administrator", role: "ADMIN", department: "MANAGEMENT" },
  { email: "manager@bluewavecargo.co.tz", name: "Operations Manager", role: "MANAGER", department: "MANAGEMENT" },
  { email: "support@bluewavecargo.co.tz", name: "Customer Support", role: "CUSTOMER_SUPPORT", department: "CUSTOMER_SUPPORT" },
  { email: "china@bluewavecargo.co.tz", name: "Foshan Warehouse", role: "CHINA_WAREHOUSE", department: "CHINA_WAREHOUSE", warehouse: "FS" },
  { email: "dar@bluewavecargo.co.tz", name: "Dar Warehouse", role: "DAR_WAREHOUSE", department: "DAR_WAREHOUSE", warehouse: "DAR" },
  { email: "finance@bluewavecargo.co.tz", name: "Finance Officer", role: "FINANCE", department: "FINANCE" },
];

async function main() {
  const password = process.env.PASSWORD ?? "";
  if (password.length < 8) throw new Error("PASSWORD must be at least 8 characters.");
  const passwordHash = await bcrypt.hash(password, 12);

  for (const desk of DESKS) {
    const warehouseId = desk.warehouse
      ? ((await prisma.warehouse.findFirst({ where: { code: desk.warehouse }, select: { id: true } }))?.id ?? null)
      : null;
    const existing = await prisma.user.findUnique({ where: { email: desk.email }, select: { id: true } });
    const user = existing
      ? await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, active: true, status: "ACTIVE" } })
      : await prisma.user.create({
          data: {
            email: desk.email,
            name: desk.name,
            role: desk.role,
            department: desk.department,
            warehouseId,
            passwordHash,
            locale: desk.role === "CHINA_WAREHOUSE" ? "zh" : "en",
          },
        });
    await prisma.auditLog.create({
      data: {
        actorEmail: "system:desk-accounts",
        action: existing ? "user.passwordReset" : "user.create",
        entity: "User",
        entityId: user.id,
        summary: existing ? `Reset the password for ${user.name}` : `Opened the ${desk.name} desk account`,
      },
    });
    console.log(`${existing ? "updated" : "created"}  ${desk.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
