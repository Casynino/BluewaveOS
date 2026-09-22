"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One press to copy the supplier message for WhatsApp or WeChat. When the
 * clipboard is refused the text stays selectable on the page, which always
 * works.
 */
export function CopyText({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* Selectable text below is the fallback. */
        }
      }}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-[2px] bg-bw-coral px-4 font-bw-display text-sm font-semibold uppercase tracking-[0.08em] text-white transition-colors hover:bg-bw-coral-dark",
        className
      )}
    >
      {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite">{copied ? "Copied · 已复制" : "Copy for supplier"}</span>
    </button>
  );
}
