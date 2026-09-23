"use server";

import { counterLookup } from "@/lib/counter";
import { parseScan } from "@/lib/qr";
import { recordScan, resolveScanToken } from "@/lib/scan";
import { authorize } from "@/lib/session";

export type OpenScanState = {
  error?: string;
  /** Where the counter should go next. */
  href?: string;
  /** What was read, so the clerk can see the camera got the right label. */
  read?: string;
  at?: number;
};

/**
 * WHAT THE COUNTER JUST SCANNED, AND WHERE IT GOES.
 *
 * One door for three codes and a typed reference. A box sticker, the old
 * per-line and consignment codes, and the code printed on the customer's
 * pickup note all name the same consignment, and all four land on the same
 * handover screen — which is the point of the screen. A camera and a keyboard
 * reach this the same way, so the phone without a BarcodeDetector is not on a
 * lesser path, only a slower one.
 *
 * It opens a screen and nothing else. The decision whether those boxes may
 * leave is computed on the screen it opens and again inside the release
 * transaction; a code is how the counter finds a consignment, never permission
 * to hand it over.
 */
export async function openScan(
  _prev: OpenScanState,
  formData: FormData
): Promise<OpenScanState> {
  const actor = await authorize("cargo.scan");
  const raw = String(formData.get("code") ?? "").trim();
  const at = Date.now();
  if (!raw) return { error: "Scan a code, or type a reference.", at };

  const parsed = parseScan(raw);

  /* Typed rather than scanned: a tracking number, a shipping mark, a name, a
     phone. It goes through the same lookup the no-note path uses, and lands on
     the consignment when it names exactly one. */
  if (!("token" in parsed)) {
    const matches = await counterLookup(parsed.text);
    await recordScan({
      token: parsed.text,
      user: actor,
      workflow: "counter",
      action: "typed",
      result: matches.length ? "ok" : "unknown",
      detail: `${matches.length} match(es)`,
      cargoId: matches.length === 1 ? matches[0].cargoId : null,
    });
    if (matches.length === 1) {
      return { href: `/app/scan/${matches[0].cargoId}`, read: matches[0].reference, at };
    }
    if (matches.length === 0) {
      return { error: "Nothing here matches that. Try the tracking number, the shipping mark, the name or the phone.", at };
    }
    return { href: `/app/scan?q=${encodeURIComponent(parsed.text)}`, read: parsed.text, at };
  }

  const scanned = await resolveScanToken(parsed.token);
  if (!scanned) {
    await recordScan({
      token: parsed.token,
      user: actor,
      workflow: "counter",
      action: "not-found",
      result: "unknown",
      detail: "No box, consignment or pickup note has this code.",
    });
    return { error: "That code is not a BlueWave Cargo label. Check the sticker, or type the tracking number.", at };
  }

  await recordScan({
    token: parsed.token,
    user: actor,
    workflow: "counter",
    action: scanned.box ? "opened-box" : scanned.pickupNote ? "opened-pickup-note" : "opened-consignment",
    result: "ok",
    detail: scanned.box ? `Box ${scanned.box.sequence} of ${scanned.box.of}` : null,
    boxId: scanned.box?.id ?? null,
    cargoId: scanned.cargoId,
  });

  /* The box a clerk is holding is picked out on the screen it opens, so a
     pallet of forty cartons does not become a page of forty identical rows. */
  const href = scanned.box
    ? `/app/scan/${scanned.cargoId}?box=${encodeURIComponent(scanned.box.id)}`
    : `/app/scan/${scanned.cargoId}`;
  return { href, read: scanned.reference, at };
}
