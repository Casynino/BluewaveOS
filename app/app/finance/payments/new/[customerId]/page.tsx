import Link from "next/link";
import { bookCategories, categoryOfCargo } from "@/lib/rate-categories";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import {
  MergePaymentForm,
  type MergeBill,
  type WaitingBill,
} from "@/components/app/merge-payment-form";
import { PageHeader } from "@/components/app/page-header";
import { WhatsAppButton } from "@/components/app/whatsapp-button";
import { formatMoney } from "@/lib/format";
import { Prisma } from "@prisma/client";

import { billChangesFor } from "@/lib/bill-changes";
import { mergeLetterContextFor, mergedBillFor } from "@/lib/combined-bill";
import { formatCurrency } from "@/lib/currency";
import { balanceOf, outstandingOf } from "@/lib/invoice-balance";
import { composeMessage, mergeBillLetter, whatsappNumber } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { storagePosition } from "@/lib/storage-fee";
import { SmartBack } from "@/components/app/smart-back";
import { storageStart } from "@/lib/storage-clock";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Merge Payment" };

/**
 * ONE PAYMENT, AGAINST AS MANY OF THIS CUSTOMER'S BILLS AS IT COVERS.
 *
 * The customer is in front of the clerk and the cargo is not — they have rung,
 * or walked in with money for three consignments on two containers. Tick what
 * the money covers on the left, say what arrived and where it landed on the
 * right. Each consignment keeps its own invoice, container and pickup note.
 */
export default async function MergePaymentForCustomer({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await primeLocale();
  const user = await requirePermission("payment.submit");
  const { customerId } = await params;

  const [customer, accounts, settings] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        fullName: true,
        businessName: true,
        phone: true,
        invoices: {
          where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
          orderBy: { issuedAt: "asc" },
          include: {
            payments: true,
            items: { select: { category: true, amount: true, unit: true } },
            cargo: {
              select: {
                reference: true,
                description: true,
                commodity: true,
                status: true,
                packages: { where: { deletedAt: null }, select: { cargoType: true } },
                darArrivedAt: true,
                darReceiving: { select: { receivedAt: true, cbm: true, packagesCount: true } },
                chinaReceiving: { select: { cbm: true, packagesCount: true } },
                containerLines: {
                  take: 1,
                  orderBy: { createdAt: "desc" },
                  select: { container: { select: { reference: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { bankName: "asc" }],
      select: { id: true, bankName: true, currency: true, kind: true },
    }),
    prisma.companySetting.findUnique({
      where: { id: "singleton" },
      select: { freeStorageDays: true, storagePerDay: true, storageCurrency: true },
    }),
  ]);
  if (!customer) notFound();

  /* Open is derived — verified payments have not covered the bill. */
  const open = customer.invoices.filter((i) => outstandingOf(i).greaterThan(0));

  const name = customer.businessName || customer.fullName;

  /* Every bill on the screen in one question, not one per row: the same
     derivation the verify list reads, so a bill somebody moved says so
     wherever money is being taken against it. */
  const changes = await billChangesFor(open.map((i) => i.id));

  const bills: MergeBill[] = [];
  const waiting: WaitingBill[] = [];

  for (const invoice of open) {
    const claim = invoice.payments.find((p) => p.status === "PENDING");
    const description = invoice.cargo.description ?? "";
    if (claim) {
      waiting.push({
        invoiceId: invoice.id,
        cargo: invoice.cargo.reference,
        description,
        claim: `${formatMoney(claim.amount, claim.currency)} · ${claim.reference}`,
      });
      continue;
    }

    /* Storage accrued against what is already on the bill. The difference is
       named on the row rather than folded in: folding it in would promise a
       total the payment would then be refused for. */
    const accrued = storagePosition({
      receivedAt: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.darArrivedAt),
      collectedAt: null,
      freeDays: settings?.freeStorageDays ?? 0,
      perDay: settings?.storagePerDay ?? 0,
      currency: settings?.storageCurrency ?? "USD",
    });
    const onBill = invoice.items
      .filter((i) => i.category === "Storage")
      .reduce((s, i) => s + Number(i.amount), 0);
    const rate = Number(invoice.fxRate) > 1 ? Number(invoice.fxRate) : null;
    let accruedInBill = Number(accrued.amount);
    if (accrued.currency !== invoice.currency && rate) {
      accruedInBill =
        accrued.currency === "TZS" ? accruedInBill / rate : accruedInBill * rate;
    }

    bills.push({
      invoiceId: invoice.id,
      number: invoice.number,
      cargoId: invoice.cargoId,
      total: Number(invoice.total),
      cargo: invoice.cargo.reference,
      description,
      container: invoice.cargo.containerLines[0]?.container.reference ?? null,
      currency: invoice.currency,
      outstanding: Number(outstandingOf(invoice)),
      outstandingTzs: balanceOf(invoice).outstandingTzs?.toNumber() ?? null,
      rate,
      storageUncharged: Math.max(0, accruedInBill - onBill),
      standardRate: invoice.standardRate ? Number(invoice.standardRate) : null,
      appliedRate: invoice.appliedRate ? Number(invoice.appliedRate) : null,
      cbm: invoice.billableCbm ? Number(invoice.billableCbm) : null,
      category: categoryOfCargo({ commodity: invoice.cargo.commodity, packages: invoice.cargo.packages }),
      priced: invoice.items.some((i) => i.unit === "CBM"),
      changes: changes.get(invoice.id) ?? [],
    });
  }

  /* Summed in shillings; a bill with no rate cannot join that sum and is named
     in its own currency instead of being added to it. */
  const balances = open.map(balanceOf);
  const owedTzs = balances.reduce((s, b) => (b.outstandingTzs ? s.add(b.outstandingTzs) : s), new Prisma.Decimal(0));
  const rateless = balances.filter((b) => !b.outstandingTzs);
  const owedLine = [
    owedTzs.greaterThan(0) ? formatCurrency(owedTzs, "TZS") : null,
    ...rateless.map((b) => formatCurrency(b.outstanding, b.currency)),
  ].filter(Boolean).join(" + ");

  /*
    WHAT THE CUSTOMER IS SENT.

    One payment across several consignments gets the merged letter: every
    reference with what its own bill owes, the goods added up, the one figure
    to send, and two links — where the cargo is, and the document to pay from.
    It is written from `mergedBillFor`, which is what the customer's own link
    opens, so the letter and the page they land on cannot disagree.

    One bill is not a merge and keeps the letter every other BlueWave notice
    uses. Nothing about the single-consignment notices changes here.
  */
  const digits = (value: Prisma.Decimal | null, currency: string) =>
    value ? formatCurrency(value, currency).replace(`${currency} `, "") : null;

  /** One consignment, in the letter every other BlueWave notice is written in. */
  const oneBillLetter = (invoice: (typeof open)[number]) => {
    const balance = balanceOf(invoice);
    const counted = invoice.cargo.darReceiving ?? invoice.cargo.chinaReceiving;
    return composeMessage("payment.reminder", {
      customerName: name,
      reference: invoice.cargo.reference,
      status: invoice.cargo.status,
      description: invoice.cargo.description,
      cbm: counted?.cbm ? Number(counted.cbm).toFixed(3) : null,
      packages: counted?.packagesCount ?? null,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amount: digits(balance.outstanding, invoice.currency),
      currency: invoice.currency,
      amountTzs: digits(balance.outstandingTzs, "TZS"),
      fxRate: balance.rate ? digits(balance.rate.toDecimalPlaces(0), "TZS") : null,
      paid: false,
      freeStorageDays: settings?.freeStorageDays ?? null,
      storagePerDay: settings?.storagePerDay ? String(settings.storagePerDay) : null,
      storageCurrency: settings?.storageCurrency ?? null,
      storageFrom: storageStart(invoice.cargo.darReceiving?.receivedAt, invoice.cargo.darArrivedAt),
    });
  };

  const merged = open.length > 1 ? await mergedBillFor(open[0].cargo.reference) : null;
  const message =
    merged && merged.rows.length > 1
      ? mergeBillLetter(mergeLetterContextFor(merged))
      : open.length === 1
        ? oneBillLetter(open[0])
        : `Habari ${name}, una bili ${open.length} zinazodaiwa BlueWave Cargo, jumla ${owedLine}.`;

  return (
    <div className="space-y-5">
      <SmartBack fallbackHref="/app/finance/payments/new" fallbackLabel={T("Another customer")} />

      <PageHeader
        title={name}
        description={T("One payment, against as many of their bills as it covers. The account moves once.")}
        actions={
          customer.phone ? (
            <WhatsAppButton
              phone={whatsappNumber(customer.phone)}
              kind="payment.reminder"
              label={T("Notify on WhatsApp")}
              message={message}
            />
          ) : null
        }
      />

      {open.length === 0 ? (
        <div className="rounded-xl border bg-card px-5 py-12 text-center">
          <p className="font-medium">{T("Every bill is settled")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {T("Nothing on this customer is waiting to be paid.")}
          </p>
        </div>
      ) : (
        <MergePaymentForm
          canClear={can(user.role, "payment.verify")}
          canChangeBill={can(user.role, "invoice.discount")}
          canChangeRate={can(user.role, "invoice.edit")}
          categories={can(user.role, "invoice.discount") ? await bookCategories() : []}
          customerId={customer.id}
          customerName={name}
          bills={bills}
          waiting={waiting}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: `${a.bankName} (${a.currency})`,
            currency: a.currency,
            kind: a.kind,
          }))}
          combinedBillHref={
            open.length > 1
              ? `/app/finance/payments/new/${customer.id}/bill`
              : null
          }
        />
      )}
    </div>
  );
}
