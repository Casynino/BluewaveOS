/**
 * Gives an existing account a new password, from the command line — for the
 * owner locked out of the only administrator account, where there is nobody
 * left to reset it from /app/admin/users.
 *
 *   EMAIL=owner@example.com PASSWORD='…' npx tsx scripts/set-password.ts
 *
 * The password itself is never written anywhere but the hash; the audit line
 * records only that it changed.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  const password = process.env.PASSWORD ?? "";
  if (!email) throw new Error("EMAIL is required.");
  if (password.length < 8) throw new Error("PASSWORD must be at least 8 characters.");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true } });
  if (!user) throw new Error(`No account with the email ${email}.`);

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await prisma.auditLog.create({
    data: {
      actorEmail: "system:set-password",
      action: "user.passwordReset",
      entity: "User",
      entityId: user.id,
      summary: `Reset the password for ${user.name} from the command line`,
    },
  });
  console.log(`Password changed for ${email}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
