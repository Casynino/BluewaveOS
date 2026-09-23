import { Prisma } from "@prisma/client";

import { mergedBillFor, type MergedBill } from "@/lib/combined-bill";
import { formatCurrency, formatRate } from "@/lib/currency";
import { formatDate } from "@/lib/format";
import type { CombinedBillPdfInput } from "@/lib/combined-bill-pdf";
import type { PdfTone } from "@/lib/invoice-pdf";
import { prisma } from "@/lib/prisma";

/**
 * What the combined bill prints, read from the same rows the merge screen
 * reads.
 *
 * Kept apart from the route in the way lib/invoice-pdf-data.ts is: every figure
 * is derived once — through `lib/combined-bill.ts`, which derives it through
 * `balanceOf` — and formatted here, so the renderer only places text and the
 * file a customer is sent cannot disagree with the screen the money was agreed
 * on by a shilling.
 */
const money = (n: unknown, dp = 2) =>
  Number(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** The document is the customer's whole group, or there is no document. */
export async function loadCombinedBillPdf(reference: string) {
  const merged = await mergedBillFor(reference);
  /* One bill is not a merge. Saying "merged invoice" over a single consignment
     would tell the customer their other cargo is covered when it is not. */
  if (!merged || merged.rows.length < 2) return null;

  const company = await prisma.companySetting.findUnique({ where: { id: "singleton" } });
  return {
    input: combinedBillPdfInput(merged, company),
    fileName: combinedBillFileName(merged.customerName),
  };
}

type Company = Awaited<ReturnType<typeof prisma.companySetting.findUnique>>;

export function combinedBillPdfInput(merged: MergedBill, company: Company): CombinedBillPdfInput {
  const totals = merged.totals;
  const settled = merged.status === "PAID";

  const stamp: { label: string; tone: PdfTone } =
    settled
      ? { label: "Paid", tone: "green" }
      : merged.status === "PART_PAID"
        ? { label: "Part paid", tone: "amber" }
        : { label: "Unpaid", tone: "red" };

  const contact = [company?.phone, company?.altPhone].filter(Boolean).join("  |  ");
  const addressLines = (company?.darAddress ?? "")
    .split(/,\s*(?=P\.?\s*O\.?\s*Box)/i)
    .map((line) => line.trim())
    .filter(Boolean);
  const terms = (company?.invoiceTerms ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = merged.rows.map((row) => ({
    reference: row.reference,
    goods: row.description || "Goods",
    container: row.container ?? "—",
    invoiceNumber: row.invoiceNumber,
    issuedOn: formatDate(row.issuedAt),
    /* THIS BILL'S OWN PINNED RATE. A bill agreed at 2,650 is still 2,650
       after the board moves, and a bill with none says so. */
    rate: row.rate ? money(row.rate, 0) : "—",
    /* What is still owed, until the group is settled — the figure the customer
       is being asked for. Once it is all paid nothing is owed and the line
       states what the bill was, which is what a settled document is for. */
    amount: `${row.currency} ${money(settled ? row.total : row.outstanding)}`,
    amountTzs: shillings(settled ? row.totalTzs : row.outstandingTzs),
  }));

  /* What was billed and what has landed, and only once money has: on a bill
     nobody has paid yet the two would repeat the figure under them. */
  const totalRows: [string, string][] = [];
  if (totals.billedTzs && totals.paidTzs && totals.paidTzs.greaterThan(0)) {
    totalRows.push(["Billed", formatCurrency(totals.billedTzs, "TZS")]);
    totalRows.push(["Paid", formatCurrency(totals.paidTzs, "TZS")]);
  }

  const headlineTzs = settled ? totals.billedTzs : totals.outstandingTzs;
  const headlineUsd = settled ? totals.billedUsd : totals.outstandingUsd;

  return {
    stamp,
    company: {
      name: company?.name ?? "BlueWave Cargo",
      addressLines,
      taxLine: company?.tin ? `TIN: ${company.tin}${company.vrn ? ` · VRN: ${company.vrn}` : ""}` : null,
      email: company?.email ?? null,
      contact: contact || null,
      tagline: company?.tagline ?? "From sourcing to delivery",
    },
    customer: {
      headline: merged.customerName,
      phone: merged.phone ?? "—",
      address: merged.address || "—",
      code: merged.customerCode,
    },
    countLine: `${merged.rows.length} consignments`,
    issuedOn: formatDate(new Date()),
    details: [
      ["Date", formatDate(new Date())],
      /* The invoice numbers are on the lines below, one to a row. Listing them
         here as well runs a paragraph through a field meant for a figure. */
      ["Consignments", String(merged.rows.length)],
      ...((merged.mergeRef ? [["Payment reference", merged.mergeRef]] : []) as [string, string][]),
      /* One rate only where every bill in the group was pinned at the same one;
         printing one rate over bills issued months apart would be wrong for
         half the money. */
      ...((merged.sharedRate ? [["Exchange rate", formatRate(merged.sharedRate)]] : []) as [string, string][]),
      ["Payment status", stamp.label],
    ],
    rows,
    totals: {
      rows: totalRows,
      headline: headlineTzs
        ? formatCurrency(headlineTzs, "TZS")
        : formatCurrency(totals.unconvertedOutstanding, "USD"),
      sub: headlineTzs && headlineUsd ? `≈ ${formatCurrency(headlineUsd, "USD")}` : null,
      settled,
      apart:
        headlineTzs && totals.unconvertedOutstanding.greaterThan(0)
          ? `Plus ${formatCurrency(totals.unconvertedOutstanding, "USD")} on a bill with no rate`
          : null,
    },
    payments: merged.payments.map((payment) => ({
      date: formatDate(payment.paidAt),
      reference: payment.reference,
      invoiceNumber: payment.invoiceNumber,
      amount: formatCurrency(payment.amount, payment.currency),
    })),
    banks: merged.accounts
      .filter((a) => a.kind === "BANK")
      .map((bank) => ({
        number: bank.accountNumber,
        name: bank.accountName,
        institution: `${bank.bankName} (${bank.currency})`,
        branch: bank.branch ? `Branch: ${bank.branch}` : null,
      })),
    mobile: merged.accounts
      .filter((a) => a.kind === "MOBILE_MONEY")
      .map((line) => ({
        number: line.accountNumber,
        name: line.accountName,
        institution: line.bankName,
        branch: null,
      })),
    terms,
    /* The same two paragraphs the office copy carries, in the same order. */
    notes: [
      {
        heading: "One payment, every bill",
        body:
          "Each bill is at the exchange rate fixed on it when it was issued. Send the total in one transfer and " +
          "share the proof with us; every consignment keeps its own invoice, tracking number and pickup note.",
      },
      {
        heading: "Malipo moja, bili zote",
        body:
          "Kila bili iko kwenye exchange rate iliyowekwa ilipotolewa. Tuma jumla kwa muamala mmoja na utume " +
          "uthibitisho; kila mzigo unabaki na bili, namba ya kufuatilia na pickup note yake.",
      },
    ],
    reference: merged.mergeRef ?? merged.customerCode,
  };
}

/** A bill with no rate cannot be stated in shillings, and no rate is invented. */
function shillings(value: Prisma.Decimal | null) {
  return value ? money(value, 0) : "—";
}

/**
 * What the file is called once it lands on somebody's phone.
 *
 * The same reasoning as lib/invoice-pdf-data.ts: a filing-cabinet name is
 * useless in a WhatsApp thread. This one says what it is, because the customer
 * is holding the single invoices too and has to tell them apart.
 */
export function combinedBillFileName(customerName: string) {
  const first = customerName.trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}\p{N}]/gu, "");
  const name = clean.length > 0 ? clean : "Customer";
  const full = `${name} merged invoice.pdf`;
  return {
    full,
    ascii: full.replace(/[^\x20-\x7E]/g, "").replace(/"/g, "").trim() || "merged invoice.pdf",
  };
}
