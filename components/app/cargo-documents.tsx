import Link from "next/link";
import { Download, FileText, Layers, Printer, QrCode } from "lucide-react";

import { LABEL_MM } from "@/components/app/cargo-sticker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

import { T } from "@/lib/server-t";

/**
 * EVERY DOCUMENT THIS CONSIGNMENT PRINTS, IN ONE PLACE, FOR GOOD.
 *
 * Both papers are made the moment Foshan takes the boxes in — the label that
 * goes on the carton and the note that goes to the person who brought it — and
 * both have to be reproducible months later, from the same screen, without
 * anything being issued again. A clerk who cannot find the note reprints it by
 * creating a second one, and then two papers claim to be the same receipt.
 *
 * PRINT AND DOWNLOAD ARE TWO BUTTONS, NEVER ONE. Print opens the sheet with the
 * clerk's own print dialog already up (`?print=1`); Download fetches the PDF —
 * the file the office sends a customer or a supplier. One control doing both
 * did neither plainly.
 *
 * The label and the note are separate documents and stay separate files. "Print
 * both" is one print job in the order the counter uses them — the note first,
 * then a page of labels — and never one merged PDF.
 */
export async function CargoDocuments({
  cargoId,
  note,
  canLabel,
  canNote,
  canIssueNote,
  issueControl,
}: {
  cargoId: string;
  /** The note issued when the boxes were taken in, when there is one. */
  note: { number: string } | null;
  /** A desk that handles boxes may print what goes on them. */
  canLabel: boolean;
  canNote: boolean;
  canIssueNote: boolean;
  /** The "Issue delivery note" form, for the rare consignment without one. */
  issueControl?: React.ReactNode;
}) {
  const boxes = canLabel
    ? await prisma.cargoBox.count({ where: { cargoId, voidedAt: null } })
    : 0;

  if (!canLabel && !canNote) return null;

  const showLabel = canLabel && boxes > 0;
  const showNote = canNote && Boolean(note);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{T("Documents")}</CardTitle>
        <CardDescription>
          {T("Made when the boxes were received, and kept here for good — from the Foshan floor to the day the cargo is collected.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {showLabel ? (
          <Row
            icon={<QrCode className="size-4" />}
            title={T("QR label")}
            detail={`${boxes} ${boxes === 1 ? T("box") : T("boxes")} · ${LABEL_MM.width} × ${LABEL_MM.height} mm · ${T("one code per carton, stuck on the box")}`}
            printHref={`/app/cargo/${cargoId}/label?print=1`}
            openHref={`/app/cargo/${cargoId}/label`}
            downloadHref={`/app/cargo/${cargoId}/label/pdf`}
          />
        ) : null}

        {showNote ? (
          <Row
            icon={<FileText className="size-4" />}
            title={`${T("Delivery note")} · ${note!.number}`}
            detail={T("Proof we took the boxes in — handed to the customer or the supplier before they leave.")}
            printHref={`/app/cargo/${cargoId}/delivery-note?print=1`}
            openHref={`/app/cargo/${cargoId}/delivery-note`}
            downloadHref={`/app/cargo/${cargoId}/delivery-note/pdf`}
          />
        ) : null}

        {/* One print job, two documents, each on its own page. */}
        {showLabel && showNote ? (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href={`/app/cargo/${cargoId}/documents?print=1`}>
              <Layers />
              {T("Print both")}
            </Link>
          </Button>
        ) : null}

        {canNote && !note ? (
          <div className="rounded-lg border border-dashed p-3">
            <p className="text-sm text-muted-foreground">
              {canIssueNote
                ? T("No delivery note has been issued for this consignment yet.")
                : T("No delivery note was issued for this consignment. The Foshan counter issues it when the boxes are received.")}
            </p>
            {issueControl ? <div className="mt-2">{issueControl}</div> : null}
          </div>
        ) : null}

        {canLabel && boxes === 0 ? (
          <p className="text-xs text-muted-foreground">
            {T("No box labels on this consignment yet — they are made when the packages are recorded.")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One document: what it is, what it is for, and the two ways to have it. */
function Row({
  icon,
  title,
  detail,
  printHref,
  openHref,
  downloadHref,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  printHref: string;
  openHref: string;
  downloadHref: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
      <div className="flex min-w-[12rem] flex-1 items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          {/* The document opens on its own page from its name, for the clerk
              who wants to read it before deciding to print anything. */}
          <Link href={openHref} className="text-sm font-semibold hover:underline">
            {title}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <Link href={printHref}>
            <Printer />
            {T("Print")}
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={downloadHref} download>
            <Download />
            {T("Download")}
          </a>
        </Button>
      </div>
    </div>
  );
}
