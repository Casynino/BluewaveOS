"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isLastOwner, removeAccount } from "@/lib/account-removal";
import { recordAudit } from "@/lib/audit";
import { startWorkingAs, stopWorkingAs, workingAs } from "@/lib/developer";
import { prisma } from "@/lib/prisma";
import { realDeveloper } from "@/lib/session";

/**
 * WORK AS A STAFF MEMBER.
 *
 * Only a developer in developer mode can start it — the server reads that from
 * the session row, never from the request. While it lasts the session is that
 * person: their menu, their permissions, their refusals. Everything done is
 * recorded under the developer, with the person's name beside it, and it ends
 * by Stop, by four hours, or by the person becoming ineligible.
 */
export async function startWorkAs(formData: FormData) {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const targetId = String(formData.get("userId") ?? "");
  const target = await startWorkingAs(dev.user.id, dev.sid, targetId);
  if (!target) redirect("/app/developer/users?refused=1");
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.start",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} started working as ${target.name} (${target.role})`,
    metadata: { target: { id: target.id, name: target.name, role: target.role } },
  });
  /* Straight to the thing that needed doing, when asked — only ever a page in
     the app, never a link to somewhere else. */
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/app/") && !next.startsWith("//") ? next : "/app/dashboard");
}

export async function stopWorkAs() {
  const dev = await realDeveloper();
  if (!dev) redirect("/login");
  const target = await workingAs(dev.user.id, dev.sid);
  await stopWorkingAs(dev.user.id, dev.sid);
  await recordAudit({
    actor: dev.user,
    action: "developer.work_as.stop",
    entity: "User",
    entityId: target?.id ?? null,
    summary: `${dev.user.name} stopped working as ${target?.name ?? "a staff member"}`,
  });
  redirect("/app/developer/users");
}

export type AccessState = { error?: string; ok?: string };

/**
 * SUSPEND AN ACCOUNT, AND ONLY WITH A REASON AND A CONFIRMATION.
 *
 * Blocks the account at once — every request re-reads it, so an open session
 * stops with the next click. By the owner's decision the developer may
 * suspend any staff or developer account — never its own, never the last
 * owner who can still sign in (nobody would be left to run the business), and
 * never while working as somebody. Customers are managed from Customers.
 * Recorded under the developer.
 */
export async function suspendAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (String(formData.get("confirm") ?? "").trim() !== "CONFIRM") return { error: "Type CONFIRM to suspend." };
  if (reason.length < 3) return { error: "Say why." };
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, status: true } });
  if (!target || target.role === "CUSTOMER" || target.id === dev.user.id) {
    return { error: "That account cannot be suspended here." };
  }
  if (target.status !== "ACTIVE") return { error: "It is not active." };
  if (await isLastOwner(target.id)) return { error: "This is the last owner who can sign in. Add another owner first." };
  await prisma.user.update({ where: { id: target.id }, data: { status: "SUSPENDED" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.suspend",
    entity: "User",
    entityId: target.id,
    summary: `${dev.user.name} suspended ${target.name} — ${reason}`,
    metadata: { reason },
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} is suspended.` };
}

/** Re-activate — only an account this developer suspended and nobody has touched since. */
export async function reactivateAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!target || target.status !== "SUSPENDED") return { error: "It is not suspended." };
  const last = await prisma.auditLog.findFirst({
    where: { entityId: id, action: { in: ["developer.suspend", "developer.reactivate"] }, actorId: dev.user.id },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  if (last?.action !== "developer.suspend") return { error: "You can only re-activate accounts you suspended yourself." };
  await prisma.user.update({ where: { id }, data: { status: "ACTIVE" } });
  await recordAudit({
    actor: dev.user,
    action: "developer.reactivate",
    entity: "User",
    entityId: id,
    summary: `${dev.user.name} re-activated ${target.name}`,
  });
  revalidatePath("/app/developer/users");
  return { ok: `${target.name} can sign in again.` };
}

/**
 * DELETE AN ACCOUNT — WITH A REASON AND THE WORD DELETE.
 *
 * Any staff or developer account but one's own, never the last owner who can
 * still sign in, and never while working as somebody. An account nothing names
 * is deleted completely; one with history is closed and keeps its name on
 * what it did (lib/account-removal.ts). Either way it can never sign in again,
 * and the line recording it — old email, role, reason — is the developer's,
 * which nobody can edit or delete.
 */
export async function deleteAccount(_prev: AccessState, formData: FormData): Promise<AccessState> {
  const dev = await realDeveloper();
  if (!dev) return { error: "Not allowed." };
  if (await workingAs(dev.user.id, dev.sid)) return { error: "Stop working as someone first." };
  const id = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") return { error: "Type DELETE to delete." };
  if (reason.length < 3) return { error: "Say why." };
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
  if (!target || target.role === "CUSTOMER" || target.id === dev.user.id || target.status === "INACTIVE") {
    return { error: "That account cannot be deleted here." };
  }
  if (await isLastOwner(target.id)) return { error: "This is the last owner who can sign in. Add another owner first." };
  const done = await removeAccount(target.id);
  if (!done) return { error: "That account no longer exists." };
  await recordAudit({
    actor: dev.user,
    action: done.outcome === "deleted" ? "developer.account.delete" : "developer.account.close",
    entity: "User",
    entityId: target.id,
    summary:
      done.outcome === "deleted"
        ? `${dev.user.name} deleted the account of ${done.name} (${done.email}) — ${reason}`
        : `${dev.user.name} closed the account of ${done.name} (${done.email}); their name stays on ${done.history} record(s) — ${reason}`,
    metadata: { reason, outcome: done.outcome, email: done.email, role: done.role, history: done.history },
  });
  revalidatePath("/app/developer/users");
  return {
    ok:
      done.outcome === "deleted"
        ? `${done.name}'s account is deleted.`
        : `${done.name}'s account is closed. Their name stays on what they did.`,
  };
}

