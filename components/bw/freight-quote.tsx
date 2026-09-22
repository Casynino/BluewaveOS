"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Minus, Plus, X } from "lucide-react";

import { estimateFreight, type EstimateState } from "@/lib/actions/estimate";
import { cbmNumber } from "@/lib/cbm";
import { ESTIMATE_CAVEAT, FX_CAVEAT } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type ContainerPrice = { cargoType: string; price: string };
type BoxLine = { id: number; length: string; width: string; height: string; boxes: string };

/**
 * THE FREIGHT QUOTATION.
 *
 * A form on the left, a quotation sheet on the right that fills in as the
 * figures are typed. The volume is worked out here with lib/cbm.ts — the same
 * function the warehouse counter uses — so a customer with a tape measure sees
 * cubic metres move as they type. The MONEY is never worked out here: every
 * figure on the sheet comes back from the server (lib/actions/estimate.ts →
 * lib/public-estimate.ts), priced in Decimal from the rate book, minimum, VAT
 * and exchange rate the invoice uses. The rate book itself is never listed; a
 * rate appears only as the answer for the goods chosen.
 */
export function FreightQuote({ cargoTypes, containers = [] }: { cargoTypes: string[]; containers?: ContainerPrice[] }) {
  /* One calculator per page, so fixed ids; useId can differ between server and browser. */
  const ids = { type: "bw-quote-type", cbm: "bw-quote-cbm" };
  const [service, setService] = useState<"LCL" | "FCL">(cargoTypes.length === 0 && containers.length > 0 ? "FCL" : "LCL");
  const [how, setHow] = useState<"cbm" | "boxes">("cbm");
  const [cargoType, setCargoType] = useState("");
  const [cbmTyped, setCbmTyped] = useState("1");
  const [lines, setLines] = useState<BoxLine[]>([{ id: 1, length: "", width: "", height: "", boxes: "1" }]);
  const [result, setResult] = useState<{ key: string; state: EstimateState } | null>(null);
  const [pending, start] = useTransition();
  const nextId = useRef(2);

  const boxCbm = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const value = cbmNumber({
          length: line.length || null,
          width: line.width || null,
          height: line.height || null,
          quantity: Math.max(0, Math.floor(Number(line.boxes) || 0)),
          unit: "CM",
        });
        return sum + (value && value > 0 ? value : 0);
      }, 0),
    [lines]
  );
  const cbm = how === "cbm" ? Math.max(0, Number(cbmTyped) || 0) : boxCbm;
  const key = `${cargoType}:${cbm.toFixed(3)}`;

  /* Priced a moment after the typing stops: the answer moves with the figures
     without every keystroke becoming a request. */
  useEffect(() => {
    if (service !== "LCL" || !cargoType || cbm <= 0) return;
    const timer = setTimeout(() => {
      const form = new FormData();
      form.set("cargoType", cargoType);
      form.set("cbm", cbm.toFixed(3));
      start(async () => {
        const state = await estimateFreight({}, form);
        setResult({ key, state });
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [key, cargoType, cbm, service]);

  const answer = result?.key === key ? result.state : undefined;
  const priced = answer?.estimate?.kind === "priced" ? answer.estimate : null;
  const unpriced = answer?.estimate?.kind === "quote-required" ? answer.estimate : null;
  const bump = (delta: number) =>
    setCbmTyped((v) => String(Math.max(0, Math.round(((Number(v) || 0) + delta) * 10) / 10)));

  return (
    <div className="grid overflow-hidden rounded-[4px] border border-bw-line bg-bw-panel lg:grid-cols-12">
      {/* ---------------------------------------------------- The shipment */}
      <div className="min-w-0 p-5 sm:p-8 lg:col-span-7">
        <p className="bw-label text-bw-muted">Shipment details</p>

        {containers.length > 0 && cargoTypes.length > 0 ? (
          <div role="tablist" aria-label="Service" className="mt-6 grid grid-cols-2 border border-bw-line">
            {(
              [
                ["LCL", "Loose cargo"],
                ["FCL", "Full container"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={service === value}
                onClick={() => setService(value)}
                className={cn(
                  "h-12 font-bw-display text-lg font-semibold uppercase tracking-[0.05em] transition-colors",
                  service === value ? "bg-bw-ink text-white" : "text-bw-muted hover:text-bw-fg"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {service === "LCL" ? (
          <div className="mt-8 space-y-8">
            <Field n="01" label="Cargo type" htmlFor={ids.type}>
              <select
                id={ids.type}
                value={cargoType}
                onChange={(e) => setCargoType(e.target.value)}
                className="h-12 w-full rounded-[2px] border border-bw-line bg-bw-panel px-3 text-bw-fg outline-none focus:border-bw-fg"
              >
                <option value="">Choose your goods…</option>
                {cargoTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field n="02" label="Volume">
              <div className="grid grid-cols-2 border border-bw-line text-sm">
                {(
                  [
                    ["cbm", "I know the CBM"],
                    ["boxes", "Measure my boxes"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={how === value}
                    onClick={() => setHow(value)}
                    className={cn(
                      "h-10 font-medium transition-colors",
                      how === value ? "bg-bw-ground text-bw-fg" : "text-bw-muted hover:text-bw-fg"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {how === "cbm" ? (
                <div className="mt-4 flex items-stretch">
                  <button
                    type="button"
                    onClick={() => bump(-0.5)}
                    aria-label="Less"
                    className="grid w-12 place-items-center border border-r-0 border-bw-line text-bw-fg hover:bg-bw-ground"
                  >
                    <Minus className="size-4" />
                  </button>
                  <label htmlFor={ids.cbm} className="sr-only">
                    Volume in cubic metres
                  </label>
                  <input
                    id={ids.cbm}
                    inputMode="decimal"
                    value={cbmTyped}
                    onChange={(e) => setCbmTyped(e.target.value.replace(/[^\d.]/g, ""))}
                    className="bw-mono h-14 min-w-0 flex-1 border border-bw-line px-4 text-center text-2xl text-bw-fg outline-none focus:border-bw-fg"
                  />
                  <span className="bw-mono grid place-items-center border border-l-0 border-bw-line px-3 text-xs uppercase tracking-[0.14em] text-bw-muted">
                    CBM
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(0.5)}
                    aria-label="More"
                    className="grid w-12 place-items-center border border-l-0 border-bw-line text-bw-fg hover:bg-bw-ground"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <div className="bw-mono hidden grid-cols-[repeat(4,minmax(0,1fr))_2.5rem] gap-2 text-[0.68rem] uppercase tracking-[0.14em] text-bw-muted sm:grid">
                    <span>Length cm</span>
                    <span>Width cm</span>
                    <span>Height cm</span>
                    <span>Boxes</span>
                  </div>
                  {lines.map((line, index) => (
                    <div key={line.id} className="grid grid-cols-[repeat(4,minmax(0,1fr))_2.5rem] gap-2">
                      {(["length", "width", "height", "boxes"] as const).map((dim) => (
                        <input
                          key={dim}
                          aria-label={`Box ${index + 1} ${dim}${dim === "boxes" ? "" : " in centimetres"}`}
                          placeholder={dim === "boxes" ? "Qty" : dim[0].toUpperCase()}
                          inputMode="decimal"
                          value={line[dim]}
                          onChange={(e) =>
                            setLines((all) =>
                              all.map((l) => (l.id === line.id ? { ...l, [dim]: e.target.value.replace(/[^\d.]/g, "") } : l))
                            )
                          }
                          className="bw-mono h-11 min-w-0 border border-bw-line px-2 text-center text-bw-fg outline-none focus:border-bw-fg"
                        />
                      ))}
                      <button
                        type="button"
                        aria-label={`Remove box line ${index + 1}`}
                        disabled={lines.length === 1}
                        onClick={() => setLines((all) => all.filter((l) => l.id !== line.id))}
                        className="grid place-items-center border border-bw-line text-bw-muted hover:text-bw-coral disabled:opacity-30"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setLines((all) => [...all, { id: nextId.current++, length: "", width: "", height: "", boxes: "1" }])
                    }
                    className="bw-mono inline-flex h-10 items-center gap-2 text-xs uppercase tracking-[0.14em] text-bw-harbour hover:text-bw-fg"
                  >
                    <Plus className="size-4" /> Another box size
                  </button>
                  <p className="bw-mono border-t border-bw-line pt-3 text-sm text-bw-fg">
                    Total volume: <span className="font-semibold">{boxCbm.toFixed(3)} CBM</span>
                  </p>
                </div>
              )}
            </Field>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-bw-muted">Your own container, loaded in Foshan and delivered to Dar es Salaam.</p>
            <ul className="mt-6 divide-y divide-bw-line border-y border-bw-line">
              {containers.map((c) => (
                <li key={c.cargoType} className="flex items-center justify-between gap-4 py-4">
                  <span className="font-bw-display text-2xl font-semibold uppercase text-bw-fg">{c.cargoType}</span>
                  <span className="bw-mono text-lg text-bw-fg">{c.price}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/book?service=FULL_CONTAINER"
              className="mt-6 inline-flex h-12 items-center gap-3 rounded-[2px] bg-bw-coral px-5 font-bw-display text-base font-semibold uppercase tracking-[0.06em] text-white hover:bg-bw-coral-dark"
            >
              Book a container <ArrowRight className="size-4" />
            </Link>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- The quotation */}
      <aside aria-live="polite" className="relative min-w-0 bg-bw-night p-5 text-white sm:p-8 lg:col-span-5">
        <div aria-hidden className="bw-ribs absolute inset-0" />
        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <p className="bw-label text-white/70">Estimated quotation</p>
            {pending ? <Loader2 className="size-4 animate-spin text-white/60" aria-label="Pricing" /> : null}
          </div>

          <dl className="bw-mono mt-6 divide-y divide-white/10 border-y border-white/10 text-sm">
            <Row label="Cargo type" value={service === "FCL" ? "Full container" : cargoType || "—"} />
            <Row
              label="Volume"
              value={
                service === "FCL"
                  ? "Whole container"
                  : priced
                    ? `${priced.billableCbm ?? priced.measuredCbm} CBM`
                    : cbm > 0
                      ? `${cbm.toFixed(3)} CBM`
                      : "—"
              }
              note={priced?.minimumApplied ? `Measured ${priced.measuredCbm} CBM — minimum applies` : null}
            />
            <Row label="Rate" value={priced ? `${priced.currency} ${priced.rate} / CBM` : "—"} />
            {priced && Number(priced.vatPercent) > 0 ? <Row label={`VAT ${priced.vatPercent}%`} value={priced.vat} /> : null}
            <Row label="Exchange rate" value={priced?.exchangeRate ? `1 USD = ${grouped(priced.exchangeRate)} TZS` : "—"} />
          </dl>

          <div className="mt-6">
            <p className="bw-mono text-[0.66rem] uppercase tracking-[0.16em] text-white/55">Estimated freight</p>
            <p className="bw-display mt-2 break-words text-[clamp(2.6rem,6vw,3.8rem)]">
              {priced ? priced.total : service === "FCL" ? "See prices" : "—"}
            </p>
            <p className="bw-mono mt-3 text-[0.66rem] uppercase tracking-[0.16em] text-white/55">TZS equivalent</p>
            <p className="bw-display mt-1 break-words text-3xl text-bw-coral-bright">{priced?.totalTzs ?? "—"}</p>
          </div>

          {answer?.error ? <p className="mt-5 text-sm text-amber-300">{answer.error}</p> : null}
          {unpriced ? (
            <p className="mt-5 text-sm text-white/75">
              {unpriced.reason}{" "}
              <Link href="/quote" className="underline underline-offset-4">
                Ask for a quote
              </Link>
              .
            </p>
          ) : null}
          {service === "LCL" && !cargoType ? (
            <p className="mt-5 text-sm text-white/60">Choose your goods and a volume to see the price.</p>
          ) : null}

          {priced ? (
            <Link
              href={`/book?service=SHARED_CARGO&commodity=${encodeURIComponent(cargoType)}&cbm=${encodeURIComponent(priced.measuredCbm)}`}
              className="mt-7 flex h-12 items-center justify-between gap-3 rounded-[2px] bg-bw-coral px-5 font-bw-display text-base font-semibold uppercase tracking-[0.06em] hover:bg-bw-coral-dark"
            >
              Book this shipment <ArrowRight className="size-4" />
            </Link>
          ) : null}

          <p className="mt-6 text-xs leading-relaxed text-white/50">
            {ESTIMATE_CAVEAT} {FX_CAVEAT}
          </p>
        </div>
      </aside>
    </div>
  );
}

/** "2,700" — digits grouped for reading; the figure itself is the server's. */
function grouped(value: string) {
  const [whole, frac] = value.split(".");
  const tail = frac && Number(frac) !== 0 ? `.${frac.replace(/0+$/, "")}` : "";
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${tail}`;
}

function Field({ n, label, htmlFor, children }: { n: string; label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex items-baseline gap-3">
        <span className="bw-mono text-xs text-bw-harbour">{n}</span>
        <span className="font-bw-display text-2xl font-semibold uppercase text-bw-fg">{label}</span>
      </label>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-[0.7rem] uppercase tracking-[0.14em] text-white/55">{label}</dt>
      <dd className="min-w-0 text-right">
        <span className="break-words">{value}</span>
        {note ? <span className="block text-[0.7rem] text-white/50">{note}</span> : null}
      </dd>
    </div>
  );
}
