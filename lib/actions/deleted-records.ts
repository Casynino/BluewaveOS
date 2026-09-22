"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canAmendCargo } from "@/lib/rbac";
import { authorize } from "@/lib/session";

export type RestoreState = { error?: string; ok?: string };

/**
 * Put a deleted consignment back into the working system.
 *
 * Held to the same authority as deleting it — `cargo.delete` and custody of the
 * cargo where it now sits — because a restore that anybody may press turns
 * every deletion into a suggestion. There is deliberately no counterpart that
 * erases a record for good: the deleted list is where a removed consignment's
 * photos and history are still asked about, and a purge would end that.
 */
export async function restoreCargo(
  _prev: RestoreState,
  formData: FormData
): Promise<RestoreState> {
  const actor = await authorize("cargo.delete");

  const cargoId = String(formData.get("cargoId") ?? "");
  const cargo = await prisma.cargo.findFirst({
    where: { id: cargoId, deletedAt: { not: null } },
    select: { id: true, reference: true, status: true },
  });
  if (!cargo) return { error: "That cargo is not in the deleted list." };
  if (!canAmendCargo(actor.role, cargo.status)) {
    return { error: "This cargo is not in your custody." };
  }

  const restored = await prisma.$transaction(async (tx) => {
    /* Conditional, so two people pressing Restore at once write one restore
       and one audit line, not two. */
    const { count } = await tx.cargo.updateMany({
      where: { id: cargo.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (count === 0) return false;

    await recordAudit(
      {
        actor,
        action: "cargo.restore",
        entity: "Cargo",
        entityId: cargo.id,
        summary: `Restored ${cargo.reference} from deleted records`,
      },
      tx
    );
    return true;
  });
  if (!restored) return { error: "Somebody restored it first." };

  revalidatePath("/app/admin/deleted");
  revalidatePath(`/app/cargo/${cargo.id}`);
  revalidatePath("/app/cargo");
  return { ok: `${cargo.reference} restored.` };
}

/**
 * Put a deleted customer back on the working lists, and their sign-in with
 * them. Held to `customer.delete`, the authority it took to remove them.
 * Refused if somebody else has taken their phone number since — the counter's
 * phone lookup must never find two people for one call.
 */
export async function restoreCustomer(_prev: RestoreState, formData: FormData): Promise<RestoreState> {
  const actor = await authorize("customer.delete");

  const id = String(formData.get("customerId") ?? "");
  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { id: true, fullName: true, code: true, phone: true },
  });
  if (!customer) return { error: "That customer is not in the deleted list." };

  const clash = await prisma.customer.findFirst({
    where: { phone: customer.phone, deletedAt: null, id: { not: id } },
    select: { fullName: true, code: true },
  });
  if (clash) return { error: `${clash.fullName} (${clash.code}) now uses ${customer.phone}. Change one number first.` };

  const restored = await prisma.$transaction(async (tx) => {
    const { count } = await tx.customer.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (count === 0) return false;
    await tx.user.updateMany({ where: { customerId: id, active: false }, data: { active: true } });
    await recordAudit(
      {
        actor,
        action: "customer.restore",
        entity: "Customer",
        entityId: id,
        summary: `Restored ${customer.fullName} (${customer.code}) from deleted records`,
      },
      tx
    );
    return true;
  });
  if (!restored) return { error: "Somebody restored them first." };

  revalidatePath("/app/admin/deleted");
  revalidatePath("/app/customers");
  revalidatePath(`/app/customers/${id}`);
  return { ok: `${customer.fullName} restored.` };
}
