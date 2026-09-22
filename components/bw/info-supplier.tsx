import { CopyText } from "@/components/bw/info-copy";
import type { SupplierAddress } from "@/lib/supplier-address";
import { cn } from "@/lib/utils";

/* What each Chinese line is, for the customer reading it before forwarding. */
const GLOSS: Record<string, string> = {
  仓库地址: "Warehouse address",
  联系人: "Receiver",
  联系电话号码: "Phone",
  唛头: "Your shipping mark",
};

/**
 * THE FOSHAN ADDRESS AS THE SUPPLIER WILL RECEIVE IT.
 *
 * The same message `supplierAddress()` builds — in Chinese, one fact per line,
 * the mark last — laid out like a waybill, with the English gloss beside each
 * line so the customer knows what they are forwarding, and one press to copy.
 */
export function SupplierPlate({ address, dark = false, className }: { address: SupplierAddress; dark?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-[3px]",
        dark ? "bg-bw-panel text-bw-fg ring-1 ring-white/15" : "border border-bw-line bg-bw-panel text-bw-fg",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 bg-bw-ink px-4 py-3 text-white sm:px-5">
        <div className="min-w-0">
          <p className="bw-mono text-[0.68rem] uppercase tracking-[0.18em] text-white/55">For your supplier · 发给供应商</p>
          <p className="mt-1 break-words text-base font-semibold" lang="zh-CN">
            【BlueWave Cargo 佛山仓库】
          </p>
        </div>
        <CopyText text={address.text} />
      </div>
      <dl className="divide-y divide-bw-line">
        {address.lines.map((line) => {
          const isMark = line.label === "唛头";
          return (
            <div key={line.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
              <dt className="min-w-0">
                <span className="block text-sm font-semibold text-bw-fg" lang="zh-CN">
                  {line.label}
                </span>
                <span className="bw-mono block text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted">
                  {GLOSS[line.label] ?? line.label}
                </span>
              </dt>
              <dd
                className={cn("min-w-0 break-words leading-relaxed", isMark ? "font-semibold text-bw-coral" : "text-bw-fg")}
                lang="zh-CN"
              >
                {line.value}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="border-t border-bw-line bg-bw-ground px-4 py-3 text-sm text-bw-muted sm:px-5">
        <p lang="zh-CN">温馨提示：请在每一箱货物的外箱上写清楚唛头，送货前请先电话联系仓库。</p>
        <p className="mt-1">Mark every carton with your shipping mark, and ask the supplier to phone the warehouse before delivering.</p>
        {address.english ? (
          <p className="mt-2 break-words">
            <span className="bw-mono mr-2 text-[0.68rem] uppercase tracking-[0.14em]">English</span>
            {address.english}
          </p>
        ) : null}
      </div>
    </div>
  );
}
