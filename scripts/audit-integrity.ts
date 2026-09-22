/**
 * READS THE DATABASE AND ASKS IT THE QUESTIONS THE SCREENS ASSUME.
 *
 * Every check is a claim the system makes somewhere: an invoice equals its
 * lines, a balance is its payments, a QR names one cargo, a container's totals
 * are its contents. Read-only — it writes nothing and changes nothing.
 *
 * `npx tsx scripts/audit-integrity.ts`
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const D = (v: unknown) => new Prisma.Decimal((v ?? 0) as never);
let bad = 0;

function check(name: string, rows: unknown[], detail?: (row: never) => string) {
  if (rows.length === 0) {
    console.log(`  ok   ${name}`);
    return;
  }
  bad += rows.length;
  console.log(`  FAIL ${name} — ${rows.length}`);
  for (const row of rows.slice(0, 5)) {
    console.log(`       ${detail ? detail(row as never) : JSON.stringify(row)}`);
  }
}

async function main() {
  console.log("\nINVOICES");
  const invoices = await prisma.invoice.findMany({
    include: { items: true, payments: true },
  });
  check(
    "subtotal = sum of its lines",
    invoices.filter((i) => {
      const lines = i.items.reduce((s, it) => s.add(D(it.amount)), D(0));
      return !lines.sub(D(i.subtotal)).abs().lessThanOrEqualTo(0.005);
    }),
    (i: (typeof invoices)[number]) =>
      `${i.number}: lines ${i.items.reduce((s, it) => s.add(D(it.amount)), D(0))} vs subtotal ${i.subtotal}`
  );
  /*
    A BILL ADDS UP THE WAY IT WAS ISSUED.

    `vatInclusive` is pinned on the row: true and the total IS the subtotal,
    with VAT the part of it the tax office is owed (380 × 18 / 118 = 57.97);
    false and VAT was added on top. Checked against that column rather than
    against one of the two shapes, because BlueWave's prices include VAT and
    reading every bill as though they did not reported the whole book as wrong
    — which is a check nobody can act on and so a check nobody reads.
    The arithmetic is applyVat's in lib/pricing.ts, restated here on purpose:
    a test that imports the function it is testing proves only that it is
    consistent with itself.
  */
  const restated = (i: { subtotal: unknown; vatPercent: unknown; vatInclusive: boolean }) => {
    const subtotal = D(i.subtotal);
    const vatPercent = D(i.vatPercent);
    if (i.vatInclusive) {
      const total = subtotal.toDecimalPlaces(2);
      const vatAmount = vatPercent.greaterThan(0)
        ? total.mul(vatPercent).div(vatPercent.add(100)).toDecimalPlaces(2)
        : D(0);
      return { vatAmount, total };
    }
    const vatAmount = subtotal.mul(vatPercent).div(100).toDecimalPlaces(2);
    return { vatAmount, total: subtotal.add(vatAmount).toDecimalPlaces(2) };
  };
  check(
    "total is the subtotal and the VAT, as that bill was issued",
    invoices.filter((i) => !restated(i).total.sub(D(i.total)).abs().lessThanOrEqualTo(0.005)),
    (i: (typeof invoices)[number]) =>
      `${i.number}: ${i.subtotal} ${i.vatInclusive ? "including" : "plus"} ${i.vatPercent}% ≠ ${i.total}`
  );
  check(
    "VAT is that percentage of that bill",
    invoices.filter((i) => !restated(i).vatAmount.sub(D(i.vatAmount)).abs().lessThanOrEqualTo(0.02)),
    (i: (typeof invoices)[number]) =>
      `${i.number}: ${i.vatPercent}% of ${i.subtotal} (${i.vatInclusive ? "inclusive" : "on top"}) ≠ ${i.vatAmount}`
  );
  check(
    "totalTzs = total × pinned rate",
    invoices.filter((i) => {
      if (i.totalTzs === null || i.fxRate === null) return false;
      const expect = D(i.total).mul(D(i.fxRate)).toDecimalPlaces(0);
      return !expect.sub(D(i.totalTzs)).abs().lessThanOrEqualTo(1);
    }),
    (i: (typeof invoices)[number]) => `${i.number}: ${i.total} × ${i.fxRate} ≠ ${i.totalTzs}`
  );
  check("issued bill with no pinned rate", invoices.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED" && i.currency === "USD" && !i.fxRate),
    (i: (typeof invoices)[number]) => `${i.number}`);
  check("negative line, subtotal or total", invoices.filter((i) => D(i.total).lessThan(0) || i.items.some((it) => D(it.amount).lessThan(0) && it.category !== "Discount")),
    (i: (typeof invoices)[number]) => `${i.number}`);
  check(
    "two live bills on one consignment",
    Object.entries(
      invoices
        .filter((i) => i.status !== "CANCELLED")
        .reduce<Record<string, number>>((m, i) => ({ ...m, [i.cargoId]: (m[i.cargoId] ?? 0) + 1 }), {})
    ).filter(([, n]) => n > 1),
    ([cargoId, n]: [string, number]) => `cargo ${cargoId}: ${n} bills`
  );

  console.log("\nPAYMENTS");
  const payments = await prisma.payment.findMany({ include: { invoice: true } });
  check(
    "baseCurrencyAmount = amount at its own rate",
    payments.filter((p) => {
      if (p.baseCurrencyAmount === null) return false;
      const rate = p.fxRate ?? p.invoice.fxRate;
      const expect = p.currency === "TZS" ? D(p.amount) : rate ? D(p.amount).mul(D(rate)).toDecimalPlaces(0) : null;
      return expect !== null && !expect.sub(D(p.baseCurrencyAmount)).abs().lessThanOrEqualTo(1);
    }),
    (p: (typeof payments)[number]) => `${p.reference}: ${p.amount} ${p.currency} @ ${p.fxRate ?? p.invoice.fxRate} ≠ ${p.baseCurrencyAmount}`
  );
  check("zero or negative payment", payments.filter((p) => D(p.amount).lessThanOrEqualTo(0)), (p: (typeof payments)[number]) => p.reference);
  check("verified payment on a cancelled bill", payments.filter((p) => p.status === "VERIFIED" && p.invoice.status === "CANCELLED"), (p: (typeof payments)[number]) => p.reference);
  const dupes = await prisma.$queryRaw<{ invoiceid: string; amount: string; n: bigint }[]>`
    SELECT "invoiceId" AS invoiceid, amount::text, count(*) AS n
    FROM "Payment"
    WHERE status = 'VERIFIED'
    GROUP BY "invoiceId", amount, "paidAt", currency
    HAVING count(*) > 1`;
  check("same amount verified twice on one bill, same instant", dupes, (d: (typeof dupes)[number]) => `invoice ${d.invoiceid} × ${d.n}`);

  console.log("\nRECEIPTS");
  const receipts = await prisma.receipt.findMany({ include: { payment: true } });
  /* A reversal keeps its receipt on purpose: the customer is holding a piece
     of paper, and a receipt pointing at nothing is worse than one pointing at
     a payment marked reversed. Anything else is wrong. */
  check(
    "receipt against a payment that was never verified",
    receipts.filter((r) => r.payment.status !== "VERIFIED" && r.payment.status !== "REVERSED"),
    (r: (typeof receipts)[number]) => r.number
  );

  console.log("\nCARGO AND CONTAINERS");
  const cargo = await prisma.cargo.findMany({
    where: { deletedAt: null },
    include: { packages: { where: { deletedAt: null } }, chinaReceiving: true, darReceiving: true, containerLines: { include: { container: true } } },
  });
  check(
    "China receiving volume = its own lines",
    cargo.filter((c) => {
      if (!c.chinaReceiving || c.packages.length === 0) return false;
      const lines = c.packages.reduce((s, p) => s.add(D(p.cbm)), D(0));
      return !lines.sub(D(c.chinaReceiving.cbm)).abs().lessThanOrEqualTo(0.005);
    }),
    (c: (typeof cargo)[number]) => `${c.reference}: lines ${c.packages.reduce((s, p) => s.add(D(p.cbm)), D(0))} vs china ${c.chinaReceiving?.cbm}`
  );
  check("negative measurement", cargo.filter((c) => c.packages.some((p) => D(p.cbm).lessThan(0) || p.quantity < 0)), (c: (typeof cargo)[number]) => c.reference);
  check(
    "on two containers that are both still going somewhere",
    cargo.filter((c) => c.containerLines.filter((l) => !["CLOSED"].includes(l.container.status) && !l.container.deletedAt).length > 1),
    (c: (typeof cargo)[number]) => c.reference
  );
  check("cargo with no sender or receiver", cargo.filter((c) => !c.senderId || !c.receiverId), (c: (typeof cargo)[number]) => c.reference);

  const containers = await prisma.container.findMany({
    where: { deletedAt: null },
    include: { cargoLines: { include: { cargo: { include: { packages: { where: { deletedAt: null } } } } } } },
  });
  check(
    "container line volume = that cargo's own packages in it",
    containers.flatMap((box) =>
      box.cargoLines.filter((line) => {
        const inBox = line.cargo.packages.filter((p) => p.containerId === box.id);
        if (inBox.length === 0) return false;
        const sum = inBox.reduce((s, p) => s.add(D(p.cbm)), D(0));
        return !sum.sub(D(line.cbm)).abs().lessThanOrEqualTo(0.005);
      }).map((line) => ({ box: box.reference, cargo: line.cargoId, line: line.cbm.toString() }))
    ),
    (r: { box: string; cargo: string; line: string }) => `${r.box} / ${r.cargo}: line ${r.line}`
  );

  console.log("\nIDENTITY");
  /*
    A single-carton line and its one box share a code on purpose (migration
    0007): the sticker already printed for the line is that box's sticker, and
    reissuing it would strand paper in Foshan. Every other sharing is two
    different things answering to one code, which is what this looks for.
  */
  const qrDupes = await prisma.$queryRaw<{ token: string; n: bigint }[]>`
    SELECT token, count(*) AS n FROM (
      SELECT "qrToken" AS token FROM "Cargo" WHERE "qrToken" IS NOT NULL
      UNION ALL SELECT "qrToken" FROM "CargoPackage" WHERE "qrToken" IS NOT NULL
      UNION ALL SELECT b."qrToken" FROM "CargoBox" b
        WHERE b."qrToken" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM "CargoPackage" p
            WHERE p.id = b."packageId" AND p."qrToken" = b."qrToken"
          )
      UNION ALL SELECT "qrToken" FROM "PickupNote" WHERE "qrToken" IS NOT NULL
    ) t GROUP BY token HAVING count(*) > 1`;
  check("one code, one thing", qrDupes, (q: (typeof qrDupes)[number]) => `${q.token} × ${q.n}`);
  const phoneDupes = await prisma.$queryRaw<{ phone: string; n: bigint }[]>`
    SELECT phone, count(*) AS n FROM "Customer" WHERE "deletedAt" IS NULL GROUP BY phone HAVING count(*) > 1`;
  check("one customer per phone", phoneDupes, (p: (typeof phoneDupes)[number]) => `${p.phone} × ${p.n}`);
  const markDupes = await prisma.$queryRaw<{ mark: string; n: bigint }[]>`
    SELECT "shippingMark" AS mark, count(*) AS n FROM "Customer"
    WHERE "deletedAt" IS NULL AND "shippingMark" IS NOT NULL GROUP BY "shippingMark" HAVING count(*) > 1`;
  check("one mark, one customer", markDupes, (m: (typeof markDupes)[number]) => `${m.mark} × ${m.n}`);

  console.log("\nRELEASE");
  /* A note may be written while the ship is at sea; it may only be spent on
     goods Dar has confirmed on its floor. */
  const notes = await prisma.pickupNote.findMany({ where: { status: "USED" }, include: { cargo: { include: { darReceiving: { select: { id: true } } } } } });
  check("pickup note used on cargo that was never checked in at Dar", notes.filter((n) => !n.cargo.darReceiving), (n: (typeof notes)[number]) => n.noteNumber);
  /* A note is written so somebody can come and collect. Once they have, it is
     spent — one left ACTIVE against collected goods is a second claim on boxes
     that have already left the warehouse. */
  const spent = await prisma.$queryRaw<{ note: string; reference: string }[]>`
    SELECT n."noteNumber" AS note, c.reference
    FROM "PickupNote" n JOIN "Cargo" c ON c.id = n."cargoId"
    WHERE n.status = 'ACTIVE' AND c.status IN ('COLLECTED', 'DELIVERED')`;
  check("a live pickup note on cargo that has already gone", spent,
    (r: (typeof spent)[number]) => `${r.note} on ${r.reference}`);

  console.log("\nNOTHING POINTING AT NOTHING");
  /*
    THE ROWS A FOREIGN KEY CANNOT CATCH.

    Every one of these columns IS a foreign key, so a row pointing at an id
    that was never there cannot exist. What can is a row pointing at a parent
    that has been SOFT-deleted — `deletedAt` set, the row still present, and
    the constraint satisfied. Those are the orphans in a system whose deletes
    are all soft, and the screens that join through them show a bill against a
    consignment nobody can open.
  */
  const orphans: [string, string][] = [
    ["cargo whose sender or receiver is a deleted customer", `
      SELECT c.reference AS id FROM "Cargo" c
      JOIN "Customer" s ON s.id = c."senderId"
      JOIN "Customer" r ON r.id = c."receiverId"
      WHERE c."deletedAt" IS NULL AND (s."deletedAt" IS NOT NULL OR r."deletedAt" IS NOT NULL)`],
    ["a live bill against a deleted consignment", `
      SELECT i.number AS id FROM "Invoice" i
      JOIN "Cargo" c ON c.id = i."cargoId"
      WHERE i.status <> 'CANCELLED' AND c."deletedAt" IS NOT NULL`],
    ["a live bill against a deleted customer", `
      SELECT i.number AS id FROM "Invoice" i
      JOIN "Customer" cu ON cu.id = i."customerId"
      WHERE i.status <> 'CANCELLED' AND cu."deletedAt" IS NOT NULL`],
    ["a verified payment against a cancelled or deleted bill's consignment", `
      SELECT p.reference AS id FROM "Payment" p
      JOIN "Invoice" i ON i.id = p."invoiceId"
      JOIN "Cargo" c ON c.id = i."cargoId"
      WHERE p.status = 'VERIFIED' AND c."deletedAt" IS NOT NULL`],
    ["a payment whose customer is not the customer on its bill", `
      SELECT p.reference AS id FROM "Payment" p
      JOIN "Invoice" i ON i.id = p."invoiceId"
      WHERE p."customerId" <> i."customerId"`],
    ["a container line for a deleted consignment", `
      SELECT co.reference || ' / ' || c.reference AS id
      FROM "ContainerCargo" l
      JOIN "Cargo" c ON c.id = l."cargoId"
      JOIN "Container" co ON co.id = l."containerId"
      WHERE c."deletedAt" IS NOT NULL AND co."deletedAt" IS NULL`],
    ["a package loaded into a deleted container", `
      SELECT p.reference AS id FROM "CargoPackage" p
      JOIN "Container" co ON co.id = p."containerId"
      WHERE p."deletedAt" IS NULL AND co."deletedAt" IS NOT NULL`],
    ["a package on a container its consignment has no line on", `
      SELECT p.reference AS id FROM "CargoPackage" p
      WHERE p."deletedAt" IS NULL AND p."containerId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "ContainerCargo" l
          WHERE l."cargoId" = p."cargoId" AND l."containerId" = p."containerId")`],
    ["a notice for a customer who is no longer on the books", `
      SELECT n.id FROM "Notification" n
      JOIN "Customer" cu ON cu.id = n."customerId"
      WHERE cu."deletedAt" IS NOT NULL`],
    ["a notice for a staff account that has been closed", `
      SELECT n.id FROM "Notification" n
      JOIN "User" u ON u.id = n."userId"
      WHERE u.active = false`],
    ["a receipt whose payment is no longer verified", `
      SELECT r.number AS id FROM "Receipt" r
      JOIN "Payment" p ON p.id = r."paymentId"
      WHERE p.status NOT IN ('VERIFIED', 'REVERSED')`],
    ["a release against a deleted consignment", `
      SELECT r.number AS id FROM "Release" r
      JOIN "Cargo" c ON c.id = r."cargoId"
      WHERE c."deletedAt" IS NOT NULL`],
  ];
  for (const [name, sql] of orphans) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(sql);
    check(name, rows, (r: { id: string }) => r.id);
  }

  console.log("\nCHARGED TWICE");
  /* Storage is a judgement somebody makes once. Two lines for it on one bill
     is the same rent charged twice, and the customer has no way to see that
     from the total. */
  const twice = await prisma.$queryRaw<{ number: string; n: bigint }[]>`
    SELECT i.number, count(*) AS n
    FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
    WHERE it.category = 'Storage'
    GROUP BY i.number HAVING count(*) > 1`;
  check("storage charged more than once on one bill", twice,
    (r: (typeof twice)[number]) => `${r.number} × ${r.n}`);
  /* Freight is the consignment itself. A second freight line on one bill is
     the same cubic metres billed twice over. */
  const freightTwice = await prisma.$queryRaw<{ number: string; n: bigint }[]>`
    SELECT i.number, count(*) AS n
    FROM "InvoiceItem" it JOIN "Invoice" i ON i.id = it."invoiceId"
    WHERE it.category = 'Freight' AND it.description LIKE 'Sea freight — %'
    GROUP BY i.number HAVING count(*) > 1`;
  check("one consignment's freight on one bill more than once", freightTwice,
    (r: (typeof freightTwice)[number]) => `${r.number} × ${r.n}`);

  console.log(bad === 0 ? "\nEverything the screens assume holds.\n" : `\n${bad} row(s) to look at.\n`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
