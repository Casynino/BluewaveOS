/**
 * BILLS AND MONEY ON THE DEMO CONTAINER, THROUGH THE REAL ACTIONS.
 *
 *   npx tsx prisma/dev/seed-demo-billing.ts   (after seed-demo-cargo and seed-demo)
 *
 * DEVELOPMENT ONLY. Takes the demo container that is at sea, lands it in Dar,
 * checks each consignment in, confirms the prices and records a spread of
 * payments — paid in shillings, paid in dollars, part-paid, unpaid — so the
 * finance screens have something to show. Every step is the server action a
 * desk's form calls, run as that desk, so the permission checks, the pinned
 * exchange rate, the account snapshot and the arithmetic are the real ones.
 */
import { createRequire } from "node:module";

import { PrismaClient } from "@prisma/client";

import { refuseProductionDatabase } from "./guard";

refuseProductionDatabase("prisma/dev/seed-demo-billing.ts");

const load = createRequire(__filename);
load("../../tests/stubs/hook.cjs");

const containerActions = load("@/lib/actions/containers") as typeof import("@/lib/actions/containers");
const darActions = load("@/lib/actions/dar") as typeof import("@/lib/actions/dar");
const priceActions = load("@/lib/actions/price-list") as typeof import("@/lib/actions/price-list");
const paymentActions = load("@/lib/actions/payments") as typeof import("@/lib/actions/payments");

const prisma = new PrismaClient();

function form(fields: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const v of value) data.append(key, v);
    else data.append(key, value);
  }
  return data;
}

async function as(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  (globalThis as { __TEST_ACTOR?: unknown }).__TEST_ACTOR = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    warehouseId: user.warehouseId,
    customerId: null,
  };
}

function must(step: string, result: { ok?: unknown; error?: string }) {
  if (result.error) throw new Error(`${step}: ${result.error}`);
}

async function main() {
  const container = await prisma.container.findFirst({ where: { status: "IN_TRANSIT" } });
  if (!container) {
    console.log("no demo container at sea — nothing to do");
    return;
  }
  const dar = await prisma.warehouse.findUniqueOrThrow({ where: { code: "DAR" } });

  await as("dar@bluewavecargo.co.tz");
  must("arrive", await containerActions.advanceContainer({}, form({ containerId: container.id, to: "ARRIVED" })));
  console.log(`${container.reference} arrived in Dar`);

  const lines = await prisma.containerCargo.findMany({
    where: { containerId: container.id },
    include: { cargo: { include: { chinaReceiving: true } } },
  });
  for (const { cargo } of lines) {
    must(
      `check in ${cargo.reference}`,
      await darActions.receiveInDar(
        {},
        form({
          cargoId: cargo.id,
          warehouseId: dar.id,
          packagesCount: String(cargo.chinaReceiving?.packagesCount ?? 1),
          cbm: cargo.chinaReceiving?.cbm?.toString() ?? "1",
          condition: "GOOD",
        })
      )
    );
    must(`verify ${cargo.reference}`, await darActions.verifyCargo({}, form({ cargoId: cargo.id })));
  }
  console.log(`${lines.length} consignments checked in`);

  await as("finance@bluewavecargo.co.tz");
  const confirmed = await priceActions.confirmPrices(
    {},
    form({ containerId: container.id, cargoIds: lines.map((l) => l.cargoId) })
  );
  must("confirm prices", confirmed);
  console.log(confirmed.ok);

  const invoices = await prisma.invoice.findMany({
    where: { cargoId: { in: lines.map((l) => l.cargoId) }, status: { not: "DRAFT" } },
    orderBy: { number: "asc" },
  });
  const [paidTzs, paidUsd, partPaid] = invoices;
  if (paidTzs?.totalTzs) {
    must("pay in TZS", await paymentActions.recordPayment({}, form({ invoiceId: paidTzs.id, amount: paidTzs.totalTzs.toFixed(0), currency: "TZS", method: "BANK_TRANSFER" })));
  }
  if (paidUsd) {
    must("pay in USD", await paymentActions.recordPayment({}, form({ invoiceId: paidUsd.id, amount: paidUsd.total.toFixed(2), currency: "USD", method: "BANK_TRANSFER" })));
  }
  if (partPaid?.totalTzs) {
    must("part-pay", await paymentActions.recordPayment({}, form({ invoiceId: partPaid.id, amount: partPaid.totalTzs.div(2).toFixed(0), currency: "TZS", method: "MOBILE_MONEY" })));
  }

  const after = await prisma.invoice.findMany({
    where: { id: { in: invoices.map((i) => i.id) } },
    orderBy: { number: "asc" },
    include: { cargo: { select: { reference: true } } },
  });
  for (const i of after) {
    console.log(`${i.number}  ${i.cargo?.reference}  USD ${i.total.toFixed(2)}  TZS ${i.totalTzs?.toFixed(0)}  ${i.status}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
