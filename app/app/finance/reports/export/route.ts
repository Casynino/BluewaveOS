import { NextResponse, type NextRequest } from "next/server";

import { loadBooks } from "@/lib/finance-report";
import { invoiceLogo } from "@/lib/invoice-pdf-data";
import { companySettings } from "@/lib/pricing";
import { renderReportPdf } from "@/lib/report-pdf";
import { readReportParams } from "@/lib/report-params";
import { buildReport } from "@/lib/report-tables";
import { authorize } from "@/lib/session";

/* Prisma needs Node, never the edge; a whole period of books can outrun a
   short default function timeout. */
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * THE SPREADSHEET — AND, WHEN ASKED, THE DOCUMENT.
 *
 * CSV by default, because every spreadsheet opens it and an accountant's own
 * template can import it. Numbers stay numbers — nothing is formatted into text
 * — so the columns can be summed where they land.
 *
 * `?format=pdf` is the same table set on paper, for the reader who is filing it
 * or sending it rather than summing it: printing the screen and downloading a
 * file are two different acts, and the report offers both.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await authorize("accounting.view");
  } catch {
    return new NextResponse("Not permitted.", { status: 403 });
  }

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const p = readReportParams(sp);
  const books = await loadBooks();
  const table = buildReport(p.report, books, p.reportRange, p.cur, p.container);

  const named = `${table.title} ${p.reportRange.label}`
    .replace(/[^\w\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-");

  if (sp.format === "pdf") {
    const [company, logo] = await Promise.all([companySettings(), invoiceLogo()]);
    const pdf = renderReportPdf(table, {
      company: company?.name ?? "BlueWave Cargo",
      period: p.reportRange.label,
      preparedBy: user.name,
      logo,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="BlueWave-Cargo-${named}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    table.columns.map((c) => escape(c.label)).join(","),
    ...table.rows.map((row) => row.map(escape).join(",")),
    ...(table.total ? [table.total.map(escape).join(",")] : []),
  ];

  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="BlueWave-Cargo-${named}.csv"`,
    },
  });
}
