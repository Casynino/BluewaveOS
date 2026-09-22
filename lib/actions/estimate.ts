"use server";

import { z } from "zod";

import { DEFAULT_LOCALE, t } from "@/lib/i18n";
import { estimate, type Estimate } from "@/lib/public-estimate";
import { clientAddress, hit } from "@/lib/rate-limit";

export type EstimateState = {
  error?: string;
  estimate?: Estimate;
};

/**
 * THE PUBLIC CALCULATOR ASKS THE SERVER WHAT A SHIPMENT COSTS.
 *
 * The volume itself is worked out in the browser, because somebody standing
 * over a pile of boxes with a tape measure needs the cubic metres to change as
 * they type. The MONEY is not: rates, minimums, VAT and the exchange rate are
 * read from the same rows the invoice is raised from, in Decimal, on the
 * server. A price computed in a browser is a price that can disagree with the
 * bill, and the number the customer remembers is the one the website gave them.
 *
 * It writes nothing. The limit is here because it reads the rate book and the
 * exchange rate on every press, and a script holding the button down is a
 * script holding a database connection.
 */

const L = (english: string) => t(DEFAULT_LOCALE, english);

const PER_ADDRESS = 60;
const WINDOW_MS = 10 * 60 * 1000;

/*
  ONE FIGURE, IN THE UNIT THE GOODS ARE CHARGED BY. Phones are asked for in
  pieces, bales in bales, heavy goods in kilos and the rest in cubic metres; the
  browser sends whichever the chosen type needs and the rate book decides which
  one is multiplied. Absent is not zero.
*/
const optional = (max: number, message: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    z.coerce.number().min(0.0001, L("Measure something first.")).max(max, L(message)).optional()
  );
const whole = (max: number, message: string) =>
  z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    z.coerce.number().int(L(message)).min(1, L("Measure something first.")).max(max, L(message)).optional()
  );

const schema = z
  .object({
    cargoType: z.string().trim().max(120).optional(),
    cbm: optional(10_000, "Check the volume."),
    kg: optional(10_000_000, "Check the weight."),
    pieces: whole(10_000_000, "Check the number of pieces."),
    bales: whole(100_000, "Check the number of bales."),
  })
  .refine((d) => d.cbm !== undefined || d.kg !== undefined || d.pieces !== undefined || d.bales !== undefined, {
    message: L("Measure something first."),
  });

export async function estimateFreight(
  _prev: EstimateState,
  formData: FormData
): Promise<EstimateState> {
  const address = await clientAddress();
  if (!hit(`estimate:${address}`, PER_ADDRESS, WINDOW_MS).ok) {
    return { error: L("Give us a moment — try that again shortly.") };
  }

  const parsed = schema.safeParse({
    cargoType: formData.get("cargoType") || undefined,
    cbm: formData.get("cbm"),
    kg: formData.get("kg"),
    pieces: formData.get("pieces"),
    bales: formData.get("bales"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? L("Check the figures.") };
  }

  return {
    estimate: await estimate({
      cargoType: parsed.data.cargoType ?? null,
      cbm: parsed.data.cbm ?? null,
      kg: parsed.data.kg ?? null,
      pieces: parsed.data.pieces ?? null,
      bales: parsed.data.bales ?? null,
    }),
  };
}
