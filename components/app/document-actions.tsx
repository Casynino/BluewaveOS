import { Download } from "lucide-react";

import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PRINT AND DOWNLOAD, SIDE BY SIDE, ON EVERY DOCUMENT.
 *
 * One control that said "Download / print" did neither thing plainly: it raised
 * a print dialog, and the clerk who wanted a file to send got a dialog they had
 * to know to redirect at a PDF writer. These are two buttons, the same size,
 * wrapping onto two lines on a phone rather than shrinking.
 *
 *  - PRINT raises the browser's own print dialog on the sheet on screen. A web
 *    page cannot put paper through a printer without that dialog; what it can
 *    do is open it on the right sheet with nothing else to press.
 *  - DOWNLOAD PDF goes to a route that renders the document properly — the same
 *    file the office sends a customer, a shipping line or a clearing agent.
 *
 * `href` is null where there is nothing to download yet, and then the print
 * control stands alone rather than a dead button being offered.
 */
export function DocumentActions({
  href,
  printLabel,
  downloadLabel,
  size,
  primaryPrint,
  className,
}: {
  href: string | null;
  printLabel: string;
  downloadLabel: string;
  size?: "default" | "sm" | "lg";
  /** The floor's print button leads on the screens where printing is the job. */
  primaryPrint?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 print:hidden", className)}>
      <PrintButton label={printLabel} size={size} primary={primaryPrint} />
      {href ? (
        <Button asChild variant="outline" size={size}>
          <a href={href} download>
            <Download />
            {downloadLabel}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
