import "server-only";

import QRCode from "qrcode";

import { labelSiteUrl } from "@/lib/site-url";

/**
 * WHAT A LABEL'S CODE ACTUALLY SAYS.
 *
 * Every code is a URL, because the commonest scanner this business has is the
 * phone in a customer's hand. A plain-text payload like `BWC:P:<token>` makes a
 * camera answer "no usable data found" and leaves the person holding the box
 * none the wiser. A URL opens the right page with no app and no account.
 *
 * It carries a random token, never the tracking number. Tracking numbers run in
 * sequence — BW0042 tells you BW0043 exists — and this same code is what the
 * Dar counter scans to identify a box before handing it over. A guessable code
 * is a way to walk in and claim somebody else's cargo.
 *
 * The number and "3 of 5" print in large type beside the code. Nobody reads a
 * QR by eye; they read the label and scan the code.
 */
export function qrPayload(token: string) {
  return `${labelSiteUrl()}/t/${encodeURIComponent(token)}`;
}

export async function qrDataUrl(payload: string, size = 240) {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    /*
      Four modules of quiet zone, which is what the QR spec requires. One is
      enough on a screen with white space round it and not enough on a sticker
      where a printed border runs along the edge of the code — a decoder that
      cannot find clean margin may never lock on.
    */
    margin: 4,
    width: size,
    color: { dark: "#0f172aff", light: "#ffffffff" },
  });
}

export async function packageQrDataUrl(token: string, size = 500) {
  return qrDataUrl(qrPayload(token), size);
}

/**
 * THE SAME CODE, DRAWN RATHER THAN PHOTOGRAPHED.
 *
 * Encoding one 520-pixel PNG costs about twenty-five milliseconds — nothing on
 * a delivery note, and minutes of a blank screen on a container of two
 * thousand boxes, which is what a full sailing's labels are. The same code as
 * vector geometry is under a millisecond and a third of the bytes, and a
 * printer lays it down at its own resolution instead of scaling a bitmap.
 *
 * PNG stays where it is needed: jsPDF places raster images, so every document
 * this system draws still asks for `packageQrDataUrl`.
 */
export async function packageQrSvgDataUrl(token: string, size = 500) {
  const svg = await QRCode.toString(qrPayload(token), {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
    width: size,
    color: { dark: "#0f172aff", light: "#ffffffff" },
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * Read a scanned string.
 *
 * A warehouse scanner emulates a keyboard, so what lands in the box is whatever
 * the label said: our URL, a bare token, or — when somebody types instead of
 * scans — a tracking number or a shipping mark. All four have to work, because
 * the alternative is a clerk holding a box that the screen refuses to find.
 */
export function parseScan(raw: string): { token: string } | { text: string } {
  const value = raw.trim();

  const link = value.match(/\/t\/([A-Za-z0-9_\-%]+)\/?$/);
  if (link) return { token: decodeURIComponent(link[1]) };

  const query = value.match(/[?&]t=([^&]+)/);
  if (query) return { token: decodeURIComponent(query[1]) };

  /* The token is base64url, so a typed one carries "-" and "_" as often as not;
     leaving them out refused roughly a third of all box codes typed by hand. */
  if (/^bwq[a-z0-9_-]{12,}$/i.test(value)) return { token: value };

  return { text: value };
}
