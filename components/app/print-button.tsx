"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * PRINT IS PRINTING. IT IS NEVER ALSO A DOWNLOAD.
 *
 * This raises the clerk's own print dialog on the sheet in front of them, with
 * nothing in between. A web page cannot reach the printer past that dialog —
 * no page can — so the most a control like this can promise is that the dialog
 * opens by itself on the right sheet. Everything that produces a file is a
 * separate button beside it, going to a route that renders a real PDF.
 */
export function PrintButton({
  label = "Print",
  className,
  primary,
  size,
}: {
  label?: string;
  className?: string;
  primary?: boolean;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      size={size}
      onClick={() => window.print()}
      className={cn("print:hidden", className)}
    >
      <Printer />
      {label}
    </Button>
  );
}

/**
 * Opens the print dialog on arrival when the page was asked for as a print
 * view, so the clerk lands on their own printer's dialog with nothing to click.
 *
 * Waits for the page to finish loading, or the logo prints as an empty box.
 */
export function AutoPrint() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") !== "1") return;
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
  }, []);
  return null;
}
