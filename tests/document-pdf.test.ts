import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { renderDeliveryNotePdf } from "@/lib/delivery-note-pdf";
import { renderLabelsPdf } from "@/lib/label-pdf";
import { packingListPdfInput, renderPackingListPdf } from "@/lib/packing-list-pdf";
import type { PackingSnapshot } from "@/lib/packing-list";
import { renderPickupNotePdf } from "@/lib/pickup-note-pdf";

/**
 * EVERY DOCUMENT THE OFFICE HANDS OUT COMES OUT AS A FILE.
 *
 * The owner asked for print and download on each of them, and download means a
 * real PDF — not a print dialog wearing the word. A renderer that throws, or
 * that quietly returns nothing, is a download button that produces a broken
 * attachment on somebody's phone, which is worse than no button at all.
 *
 * So: a representative record through each renderer, and the first four bytes
 * checked. `%PDF` is the whole of what a viewer looks for, and nothing else
 * here can produce it by accident.
 */

const PDF = "%PDF";

/** A 1×1 PNG, standing in for the logo and the codes the routes hand in. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function isPdf(bytes: Uint8Array) {
  return Buffer.from(bytes.slice(0, 4)).toString("latin1");
}

const company = {
  name: "BlueWave Cargo",
  addressLines: ["Tabata Matumbi, Dar es Salaam", "P. O. Box 12345"],
  contact: "+255 700 000 000  |  +255 711 000 000",
  email: "hello@bluewavecargo.co.tz",
  tagline: "From sourcing to delivery",
};

describe("the pickup note as a file", () => {
  const note = {
    logo: PNG,
    qr: PNG,
    company,
    reference: "PN-2026-000001",
    issuedOn: "03 Sep 2026, 14:20",
    stamp: { label: "Paid in full", swahili: "Imelipwa yote", tone: "green" as const },
    collector: { name: "Amina Hassan", code: "CUS-000012", phone: "+255 712 345 678", sentBy: "Li Wei" },
    details: [
      ["Tracking no.", "BW0125"],
      ["Container", "CNT-2026-0007"],
      ["Boxes to collect", "5"],
      ["Settled", "$1,240.00"],
      ["In shillings", "TSh 3,348,000"],
      ["Goods", "Shoes and handbags"],
    ] as [string, string][],
    collectFrom: "BlueWave Cargo, Tabata Matumbi, Dar es Salaam",
    credit: null,
    boxes: Array.from({ length: 5 }, (_, i) => ({
      sequence: `${i + 1}/5`,
      description: i === 0 ? "Ladies shoes" : "Handbags",
      collected: i < 2,
    })),
    notes: [
      { heading: "This note releases the cargo above", body: "Our warehouse checks every box against it." },
      { heading: "Hati hii ni idhini ya kuchukua mzigo", body: "Ghala letu litakagua kila mzigo." },
    ],
    issuedBy: "Neema Mushi",
  };

  test("renders a real PDF", () => {
    const pdf = renderPickupNotePdf(note);
    assert.ok(pdf.byteLength > 0, "an empty buffer is a broken attachment");
    assert.equal(isPdf(pdf), PDF);
  });

  test("renders without a code once the note is spent", () => {
    /* A used note still downloads — it is the record of a handover — and the
       card says so where the code was. */
    const pdf = renderPickupNotePdf({
      ...note,
      qr: null,
      stamp: { label: "Collected", swahili: "Imechukuliwa", tone: "grey" },
    });
    assert.equal(isPdf(pdf), PDF);
  });

  test("survives a consignment described only in Chinese", () => {
    /* Helvetica draws no Chinese. Every character being dropped must leave a
       document, not a blank row where the goods were. */
    const pdf = renderPickupNotePdf({
      ...note,
      details: [["Goods", "女装鞋"]],
      boxes: [{ sequence: "1/1", description: "女装鞋", collected: false }],
    });
    assert.equal(isPdf(pdf), PDF);
  });

  test("breaks onto more pages rather than running off the first", () => {
    const many = renderPickupNotePdf({
      ...note,
      boxes: Array.from({ length: 240 }, (_, i) => ({
        sequence: `${i + 1}/240`,
        description: "Assorted goods",
        collected: false,
      })),
    });
    assert.equal(isPdf(many), PDF);
    assert.ok(many.byteLength > renderPickupNotePdf(note).byteLength);
  });
});

describe("the packing list as a file", () => {
  const line = (reference: string, code: string, customer: string) => ({
    cargoReference: reference,
    shippingMark: `${customer} MARK`,
    customer,
    customerCode: code,
    phone: "+255 712 000 111",
    description: "Ladies shoes",
    paperReceiptNo: "A-1204",
    packages: 12,
    pieces: 240,
    weightKg: "310.50",
    cbm: "2.480",
    notes: null,
    items: [
      {
        reference: `${reference}-01`,
        paperReceiptNo: "A-1204",
        description: "Ladies shoes",
        descriptionZh: "女装鞋",
        cargoType: "SHOES",
        packageType: "CARTON",
        quantity: 12,
        pieces: 240,
        cbm: "2.480",
        weightKg: "310.50",
        balerNumber: "B-7",
        netWeightKg: "295.00",
        modelNo: "SH-9921",
        unitValue: "4.50",
        amount: "1080.00",
      },
    ],
  });

  const snap: PackingSnapshot = {
    container: "MSKU7654321",
    reference: "CNT-2026-0007",
    sealNumber: "SL-99871",
    vessel: "MSC Kalamata",
    voyage: "V-214E",
    shippingLine: "MSC",
    originPort: "Nansha",
    destinationPort: "Dar es Salaam",
    originWarehouse: "Foshan",
    packedAt: "2026-08-02T09:00:00.000Z",
    shippedAt: "2026-08-04T09:00:00.000Z",
    eta: "2026-09-01T09:00:00.000Z",
    issuedBy: "Chen Hao",
    issuedAt: "2026-08-02T10:00:00.000Z",
    totalCbm: "4.960",
    totalPackages: 24,
    totalPieces: 480,
    totalWeightKg: "621.00",
    totalCargo: 2,
    totalCustomers: 2,
    version: 2,
    lines: [line("BW0125", "CUS-000012", "Amina Hassan"), line("BW0126", "CUS-000013", "Joseph Mrema")],
  };

  const settings = {
    name: "BlueWave Cargo",
    tagline: "From sourcing to delivery",
    chinaEntity: "BlueWave Cargo (Foshan)",
    darEntity: "BlueWave Cargo Tanzania Ltd",
    chinaAddress: "Foshan, Guangdong, China",
    darAddress: "Tabata Matumbi, Dar es Salaam",
    phone: "+255 700 000 000",
    altPhone: "+255 711 000 000",
    email: "hello@bluewavecargo.co.tz",
  };

  test("renders a real PDF once the list is issued", () => {
    const input = packingListPdfInput(
      snap,
      { number: "PL-2026-000001", issuedAt: new Date("2026-08-02T10:00:00.000Z"), issuedBy: "Chen Hao" },
      settings
    );
    assert.equal(input.title.number, "PL-2026-000001");
    const pdf = renderPackingListPdf({ ...input, logo: PNG });
    assert.ok(pdf.byteLength > 0);
    assert.equal(isPdf(pdf), PDF);
  });

  test("says PROVISIONAL while the container is still open", () => {
    /* A list drawn before the seal is not withheld; it has to say which drawing
       it is, because the paper at a port cannot be rewritten. */
    const input = packingListPdfInput({ ...snap, version: 0, issuedBy: null, issuedAt: null }, null, settings);
    assert.equal(input.title.number, "PROVISIONAL");
    assert.match(input.footnote, /Not yet issued/);
    assert.equal(isPdf(renderPackingListPdf({ ...input, logo: PNG })), PDF);
  });

  test("totals the rows it prints and nothing else", () => {
    const input = packingListPdfInput(snap, null, settings);
    assert.equal(input.totals.qty, "24");
    assert.equal(input.totals.cbm, "4.960");
    assert.equal(input.totals.amount, "2,160.00");
    assert.equal(input.groups.length, 2);
    assert.equal(input.groups[0].subtotal.qty, "12");
  });

  test("turns a long manifest onto further pages", () => {
    const long: PackingSnapshot = {
      ...snap,
      lines: Array.from({ length: 60 }, (_, i) =>
        line(`BW${2000 + i}`, `CUS-${String(i).padStart(6, "0")}`, `Customer ${i}`)
      ),
    };
    const pdf = renderPackingListPdf({ ...packingListPdfInput(long, null, settings), logo: PNG });
    assert.equal(isPdf(pdf), PDF);
  });

  test("renders with no company row at all", () => {
    /* Settings can be missing on a fresh database; the sheet still has to draw. */
    const pdf = renderPackingListPdf({ ...packingListPdfInput(snap, null, null), logo: null });
    assert.equal(isPdf(pdf), PDF);
  });
});

describe("the delivery note as a file", () => {
  const note = {
    logo: PNG,
    qr: PNG,
    company: {
      name: company.name,
      addressLines: company.addressLines,
      contact: company.contact,
      tagline: company.tagline,
    },
    reference: "DN-2026-000044",
    issuedOn: "02 Aug 2026, 09:10",
    stamp: "Received · good",
    customer: { name: "Amina Hassan", code: "CUS-000012", phone: "+255 712 345 678", mark: "AMINA H" },
    details: [
      ["Tracking no.", "BW0125"],
      ["Received", "02 Aug 2026, 09:10"],
      ["At", "Foshan"],
      ["Container", "CNT-2026-0007"],
      ["Packages", "12"],
      ["Pieces", "240"],
      ["Weight", "310.50 kg"],
      ["Volume", "2.480 CBM"],
    ] as [string, string][],
    goods: "Ladies shoes",
    lines: Array.from({ length: 3 }, (_, i) => ({
      reference: `BW0125-0${i + 1}`,
      goods: "Ladies shoes",
      packedAs: "Carton",
      bale: i === 0 ? "B-7" : null,
      quantity: "4",
      dimensions: "60 × 40 × 35 cm",
      cbm: "0.840",
      weight: "103.50 kg",
    })),
    totals: { quantity: "12", cbm: "2.480", weight: "310.50 kg" },
    notes: [
      { heading: "What we received", body: "This note records the goods received for you in Foshan." },
      { heading: "Tulichopokea", body: "Hati hii inaonyesha mzigo tuliopokea kwa ajili yako." },
    ],
    receivedBy: "Chen Hao",
  };

  test("renders a real PDF", () => {
    const pdf = renderDeliveryNotePdf(note);
    assert.ok(pdf.byteLength > 0);
    assert.equal(isPdf(pdf), PDF);
  });

  test("renders a consignment whose lines were never broken out", () => {
    assert.equal(isPdf(renderDeliveryNotePdf({ ...note, lines: [], qr: null })), PDF);
  });

  test("breaks a long measured consignment onto further pages", () => {
    const long = {
      ...note,
      lines: Array.from({ length: 80 }, (_, i) => ({ ...note.lines[0], reference: `BW0125-${i}` })),
    };
    assert.equal(isPdf(renderDeliveryNotePdf(long)), PDF);
  });
});

describe("the box labels as a file", () => {
  const sticker = (sequence: number, total: number) => ({
    reference: "BW0125",
    shippingMark: "AMINA H",
    customerName: "Amina Hassan",
    customerPhone: "+255 712 345 678",
    description: "Ladies shoes",
    cargoType: "SHOES",
    sequence,
    total,
    packageRef: `BW0125-0${sequence}`,
    packagesLabel: "carton · 20 pcs on line",
    weightLabel: "25.50 kg",
    cbmLabel: "0.840 CBM",
    receivedOn: "02 Aug 2026",
    qr: PNG,
    receiptNo: "A-1204",
  });

  test("renders one page per physical box", () => {
    const one = renderLabelsPdf({
      company: "BlueWave Cargo",
      tagline: "From sourcing to delivery",
      logo: PNG,
      stickers: [sticker(1, 1)],
    });
    const five = renderLabelsPdf({
      company: "BlueWave Cargo",
      tagline: "From sourcing to delivery",
      logo: PNG,
      stickers: Array.from({ length: 5 }, (_, i) => sticker(i + 1, 5)),
    });
    assert.equal(isPdf(one), PDF);
    assert.equal(isPdf(five), PDF);
    /* Five boxes is five labels. One label photocopied five times is exactly
       what makes a missing box invisible until the customer is at the counter. */
    assert.ok(five.byteLength > one.byteLength);
  });

  test("survives a box described only in Chinese and no mark", () => {
    const pdf = renderLabelsPdf({
      company: "BlueWave Cargo",
      tagline: "From sourcing to delivery",
      logo: null,
      stickers: [{ ...sticker(1, 1), shippingMark: null, description: "女装鞋", receiptNo: null }],
    });
    assert.equal(isPdf(pdf), PDF);
  });
});

/**
 * NO DOCUMENT LEAVES THE BUILDING THROUGH AN UNGUARDED ROUTE.
 *
 * Read off the source rather than run against a database, because the thing
 * worth catching is a new download route landing with no gate at all — and a
 * file route is a public endpoint whether or not a button renders for it.
 *
 * Deliberately crude: a handler that serves a PDF must ask one of the session
 * helpers who is at the screen, and a portal one must scope by the session's
 * own customer id rather than by anything in the address.
 */
describe("every route that hands out a document", () => {
  const routes: { path: string; src: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (entry.name !== "route.ts") continue;
      const src = readFileSync(path, "utf8");
      /* A route that DRAWS one of our documents. Not app/api/files, which hands
         back whatever somebody uploaded and answers to lib/file-access.ts. */
      if (/render\w*Pdf\(/.test(src)) routes.push({ path: path.replace(process.cwd(), ""), src });
    }
  };
  walk(join(process.cwd(), "app"));

  test("there are documents to guard", () => {
    assert.ok(routes.length >= 8, `found only ${routes.length} PDF routes`);
  });

  for (const route of routes) {
    test(`${route.path} asks who is reading`, () => {
      assert.match(
        route.src,
        /* The public tracking link has no session to ask: the customer tapped a
           WhatsApp message and may never have had an account. The signed key in
           that link stands in for one — see lib/track-key.ts. */
        /requirePermission\(|authorizeAny\(|authorize\(|requireCustomer\(|requireStaff\(|trackKeyValid\(/,
        "a file route is a public endpoint whether or not a button renders for it"
      );
    });

    test(`${route.path} runs on Node with room to draw`, () => {
      /* jsPDF and Prisma need Node, never the edge, and a thick document can
         outrun a short default function timeout. */
      assert.match(route.src, /runtime = "nodejs"/);
      assert.match(route.src, /maxDuration = \d+/);
    });

    test(`${route.path} hands over a file rather than another tab`, () => {
      assert.match(route.src, /Content-Disposition/);
    });

    if (route.path.includes("/portal/")) {
      test(`${route.path} is scoped by the session's own customer`, () => {
        /* Changing a number in an address bar is the whole attack, and the only
           defence that works is never reading the number. */
        assert.match(route.src, /requireCustomer\(/);
        assert.match(route.src, /customerId: user\.customerId/);
      });
    }

    /**
     * THE FILE ASKS FOR NOTHING THE SCREEN DOES NOT.
     *
     * Every desk that may read a document may download it, and no desk gains
     * anything by asking for the file instead of the page. The screen may check
     * more — it carries controls the document does not — but a permission the
     * route names and the page never mentions is a gate that drifted.
     */
    /* Only where the route sits under the sheet it draws — `…/pdf/route.ts`.
       The reports export is reached from a different screen than the one it
       sits beside, and pairing it with that one proves nothing. */
    const page = join(process.cwd(), route.path, "..", "..", "page.tsx");
    if (route.path.endsWith("/pdf/route.ts") && existsSync(page)) {
      test(`${route.path} asks for nothing its screen does not`, () => {
        const permissions = (src: string) =>
          new Set([...src.matchAll(/"([a-z][A-Za-z]*\.[A-Za-z]+)"/g)].map((m) => m[1]));
        const onScreen = permissions(readFileSync(page, "utf8"));
        for (const needed of permissions(route.src)) {
          assert.ok(onScreen.has(needed), `${needed} is asked for by the file and not by the page`);
        }
      });
    }

    if (/requireStaff\(/.test(route.src) && !/requirePermission\(/.test(route.src)) {
      test(`${route.path} narrows a staff session to a permission`, () => {
        /* requireStaff on its own is "anybody with a desk", which is not a gate
           on a document. */
        assert.match(route.src, /can\(|canAny\(/);
      });
    }
  }
});
