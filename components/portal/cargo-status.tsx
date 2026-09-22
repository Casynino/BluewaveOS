import { Banknote, Hourglass, MapPin, PackageCheck } from "lucide-react";

import { formatDate } from "@/lib/format";
import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import type { StorageState } from "@/lib/storage-clock";
import type { Journey, StageCode } from "@/lib/tracking-stage";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "progress" | "good" | "warn" | "bad";

/* The BlueWave stage first, then what is happening inside it. */
const WHERE: Record<StageCode, [string, string | null]> = {
  AWAITING_CHINA: ["Waiting for your goods", "Foshan"],
  RECEIVED_CHINA: ["Received in China", "Foshan warehouse"],
  ASSIGNED: ["Stored in China", "Assigned to a container"],
  PACKED: ["Stored in China", "Container packed and sealed"],
  SHIPPED: ["In transit", "Left China"],
  AT_SEA: ["In transit", "At sea"],
  AT_DAR_PORT: ["Arrived in Dar es Salaam", "Being checked in at our warehouse"],
  DAR_VERIFICATION: ["Arrived in Dar es Salaam", "Being checked in"],
  RECEIVED_DAR: ["Arrived in Dar es Salaam", "Invoice being prepared"],
  PRICING: ["Arrived in Dar es Salaam", "Price being confirmed"],
  PAYMENT_PENDING: ["Arrived in Dar es Salaam", "Payment required before pickup"],
  CONFIRMING_PAYMENT: ["Arrived in Dar es Salaam", "Confirming your payment"],
  PART_PAID: ["Arrived in Dar es Salaam", "Balance due before pickup"],
  PAID: ["Arrived in Dar es Salaam", "Paid — pickup note being prepared"],
  READY: ["Ready for pickup", "Dar warehouse"],
  COLLECTED: ["Collected", null],
  DELIVERED: ["Delivered", null],
  CANCELLED: ["Cancelled", null],
};

const MONEY: Record<Journey["payment"], [string, Tone]> = {
  NOT_BILLED: ["Invoice not issued yet", "neutral"],
  PENDING: ["Payment due", "warn"],
  PART_PAID: ["Part paid — balance due", "warn"],
  CONFIRMING: ["Confirming your payment", "progress"],
  PAID: ["Paid", "good"],
};

const TONE: Record<Tone, string> = {
  neutral: "text-foreground",
  progress: "text-brand",
  good: "text-success",
  warn: "text-warning",
  bad: "text-destructive",
};

/**
 * THREE QUESTIONS, THREE ANSWERS.
 *
 * Where are my goods, have I paid, and can I collect — answered side by side
 * and never folded into one word, because "paid" says nothing about where the
 * boxes are and "arrived" says nothing about the gate.
 */
export function CargoStatusStrip({ journey }: { journey: Journey }) {
  const locale = DEFAULT_LOCALE;
  const [where, sub] = WHERE[journey.stage];
  const [money, moneyTone] = MONEY[journey.payment];
  const handedOver = journey.stage === "COLLECTED" || journey.stage === "DELIVERED";
  const pickup: [string, string | null, Tone] = handedOver
    ? ["Collected", null, "good"]
    : journey.ready
      ? ["Ready for pickup", "Bring your pickup note and ID", "good"]
      : journey.stage === "AT_DAR_PORT" || journey.stage === "DAR_VERIFICATION"
        ? ["Not ready", "Being checked in at our warehouse", "neutral"]
        : journey.payment !== "PAID" && ["RECEIVED_DAR", "PRICING", "PAYMENT_PENDING", "CONFIRMING_PAYMENT", "PART_PAID"].includes(journey.stage)
          ? ["Not ready", "Payment required first", "warn"]
          : ["Not ready", null, "neutral"];
  const whereTone: Tone =
    journey.stage === "READY" || handedOver ? "good" : journey.stage === "CANCELLED" ? "bad" : "progress";

  const cells: { icon: typeof MapPin; label: string; value: string; sub: string | null; tone: Tone }[] = [
    { icon: MapPin, label: "Cargo", value: where, sub, tone: whereTone },
    { icon: Banknote, label: "Payment", value: money, sub: null, tone: moneyTone },
    { icon: PackageCheck, label: "Pickup", value: pickup[0], sub: pickup[1], tone: pickup[2] },
  ];

  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {cells.map((cell) => (
        <div key={cell.label} className="min-w-0 rounded-xl border bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <cell.icon className="size-3.5" />
            {t(locale, cell.label)}
          </dt>
          <dd className={cn("mt-1.5 font-semibold", TONE[cell.tone])}>{t(locale, cell.value)}</dd>
          {cell.sub ? <dd className="text-xs text-muted-foreground">{t(locale, cell.sub)}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** The storage clock, once Dar has the boxes. */
export function StorageCard({ storage, className }: { storage: StorageState; className?: string }) {
  const locale = DEFAULT_LOCALE;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        storage.expired ? "border-warning/40 bg-warning/5" : "bg-card",
        className
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Hourglass className="size-3.5" />
        {t(locale, "Storage")}
      </p>
      {storage.expired ? (
        <>
          <p className="mt-1.5 font-semibold text-warning">{t(locale, "Free storage period ended")}</p>
          <p className="text-sm text-muted-foreground">
            {storage.perDay
              ? `${t(locale, "Storage fee")}: ${storage.currency} ${storage.perDay} / ${t(locale, "day")}`
              : t(locale, "Storage charges may now apply.")}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 font-semibold">
            {storage.freeDays} {t(locale, "days free")} ·{" "}
            <span className="text-brand">
              {storage.daysRemaining} {t(locale, storage.daysRemaining === 1 ? "day remaining" : "days remaining")}
            </span>
          </p>
          <p className="tnum text-sm text-muted-foreground">
            {t(locale, "Last free day")}: {formatDate(storage.lastFreeDay)}
            {storage.perDay ? ` · ${t(locale, "then")} ${storage.currency} ${storage.perDay} / ${t(locale, "day")}` : ""}
          </p>
        </>
      )}
      <p className="tnum mt-1 text-xs text-muted-foreground">
        {t(locale, "Counted from")} {formatDate(storage.arrivedAt)}, {t(locale, "the day it arrived at our Dar warehouse")}
      </p>
    </div>
  );
}
