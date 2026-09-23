import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/page-header";
import { ReleaseWorkbench } from "@/components/app/release-workbench";
import { counterHandover } from "@/lib/counter";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

import { primeLocale, P, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Handover" };

/**
 * ONE SCREEN THE CLERK HANDS THE CARGO OVER FROM.
 *
 * Whatever was scanned — a box sticker, a pickup note, the consignment's own
 * code — lands here, and everything the handover needs is on it: the verdict,
 * who the customer is and their phone, what the goods are, how many boxes are
 * on the floor, the state of the paper, the receiver, the photograph and the
 * release. The screen this replaces made a clerk open three others, which is
 * how a counter ends up working from memory.
 *
 * THE PAGE READS AND NOTHING MORE. `counterHandover` runs `checkRelease` to
 * decide what is drawn, and every action under it runs the same check again
 * against the live rows; drawing a button is not a permission and never was.
 * Nothing here carries a figure, because this is a warehouse screen.
 */
export default async function HandoverPage({
  params,
  searchParams,
}: {
  params: Promise<{ cargoId: string }>;
  searchParams: Promise<{ box?: string }>;
}) {
  await primeLocale();
  const actor = await requirePermission("cargo.scan");
  const { cargoId } = await params;
  const { box: scannedBoxId } = await searchParams;

  const handover = await counterHandover(cargoId);
  if (!handover) notFound();

  return (
    <div className="pb-24">
      <PageHeader
        title={T("Handover")}
        description={T("Everything needed to hand these boxes over, on one screen.")}
        back={{ href: "/app/scan", label: "Scan & release" }}
      />

      <ReleaseWorkbench
        handover={handover}
        /* Foshan types 配件; a Dar clerk holding the box reads Accessories.
           The original is untouched on the row — this only chooses which of
           the two renderings beside it the reader is shown. */
        goods={P(handover.description, handover.descriptionZh)}
        /* Opening this screen is `cargo.scan`; handing the boxes over is a
           second authority, and both server actions check it themselves. */
        mayRelease={can(actor.role, "release.execute")}
        scannedBoxId={scannedBoxId}
      />
    </div>
  );
}
