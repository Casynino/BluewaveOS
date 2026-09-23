import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  BadgeCheck,
  Boxes,
  CircleAlert,
  DoorOpen,
  MessageSquare,
  PhoneCall,
  Ticket,
  User,
} from "lucide-react";

import { BoxScanner } from "@/components/app/box-scanner";
import { PageHeader } from "@/components/app/page-header";
import { ReleaseChecklist, ReleaseForm } from "@/components/app/release-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { counterHandover, deskLabel, type CounterBox } from "@/lib/counter";
import { formatDateTime } from "@/lib/format";
import { formatTzPhone } from "@/lib/phone";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

import { primeLocale, P, T } from "@/lib/server-t";

export const metadata: Metadata = { title: "Handover" };

/**
 * ONE SCREEN THE CLERK HANDS THE CARGO OVER FROM.
 *
 * Whatever was scanned — a box sticker, a pickup note, the consignment's own
 * code — lands here, and everything the handover needs is on it: who the
 * customer is and their phone, what the goods are, how many boxes and which of
 * them have been scanned out, what the release check says in its own words, the
 * state of the paper, and the handover itself. The screen this replaces made a
 * clerk open three others, which is how a counter ends up working from memory.
 *
 * WHAT IT CANNOT DO IS ARGUE WITH THE CHECK. `checkRelease` is run here to
 * decide what to draw and again inside the release transaction to decide what
 * happens; drawing a button is not a permission and never was. A refusal is
 * shown in the check's own sentences, with the desk that can put it right and a
 * number to ring — and no figure anywhere, because this is a warehouse screen.
 */
const BOX_STATE: Record<CounterBox["state"], { label: string; className: string }> = {
  collected: { label: "Handed over", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  "at-dar": { label: "On the floor", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  missing: { label: "Missing", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
  "in-container": { label: "In the container", className: "bg-brand/10 text-brand" },
  "in-china": { label: "In China", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  void: { label: "Taken off", className: "bg-secondary text-muted-foreground" },
};

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

  /* Opening the screen is `cargo.scan`; handing the boxes over is a second
     authority, and both server actions check it themselves. */
  const mayRelease = can(actor.role, "release.execute");
  const goods = P(handover.description, handover.descriptionZh);

  return (
    <div className="mx-auto max-w-xl space-y-5 pb-24">
      <PageHeader
        title={T("Handover")}
        description={T("Everything needed to hand these boxes over, on one screen.")}
        back={{ href: "/app/scan", label: "Scan & release" }}
      />

      {/*
        "CLEARED" WITH A DEAD BUTTON IS WORSE THAN A PLAIN REFUSAL.

        Cargo opened from the pickup list is genuinely clear — the check below
        says so — but the box has not been read yet, and the check knows
        nothing about that. A clerk who reads GO, fills the form in and finds
        the button dead has been walked into it. So the outstanding thing is
        said at the top, where the answer to "may I hand this over" lives.
      */}
      {!handover.released && handover.check.ok && handover.expected > 0 && handover.scannedOut === 0 ? (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-base font-semibold text-amber-900 dark:text-amber-200">
                {T("Cleared — now scan the box")}
              </p>
              <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-200/80">
                {T("Payment and paperwork are in order. Read the QR on the carton to confirm you have the right one, then hand it over.")}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* WHO IS STANDING THERE. First, and largest: a counter reads a name. */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
              <User className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{handover.receiver.fullName}</p>
              <p className="tnum mt-0.5 text-sm text-muted-foreground">
                {formatTzPhone(handover.receiver.phone)}
              </p>
              {/* Sender ≠ receiver. Releasing to the sender is releasing to the
                  wrong person, so the other name is shown and labelled. */}
              {handover.sender ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {T("Sent by")} {handover.sender.fullName} — {T("only the receiver may collect")}
                </p>
              ) : null}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${handover.receiver.phone}`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-secondary"
            >
              <PhoneCall className="size-4" />
              {T("Call")}
            </a>
            <a
              href={`sms:${handover.receiver.phone}`}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border text-sm font-medium hover:bg-secondary"
            >
              <MessageSquare className="size-4" />
              {T("Message")}
            </a>
          </div>
        </CardContent>
      </Card>

      {/* WHAT THEY CAME FOR. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" />
            <Link href={`/app/cargo/${handover.cargoId}`} className="tnum hover:underline">
              {handover.reference}
            </Link>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{goods}</p>
          {handover.shippingMark ? (
            <p className="text-xs text-muted-foreground">
              {T("Shipping mark")}: <span className="font-medium text-foreground">{handover.shippingMark}</span>
            </p>
          ) : null}

          <div className="flex items-baseline justify-between rounded-xl bg-secondary/60 px-4 py-3">
            <span className="text-sm text-muted-foreground">{T("Boxes scanned out")}</span>
            <span className="tnum text-lg font-semibold">
              {handover.scannedOut} / {handover.expected}
            </span>
          </div>

          {handover.boxes.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {handover.boxes.map((box) => {
                const state = BOX_STATE[box.state];
                return (
                  <li
                    key={box.id}
                    className={cn(
                      "tnum rounded-lg px-2.5 py-1.5 text-xs font-medium",
                      state.className,
                      /* The carton actually in the clerk's hands. */
                      box.id === scannedBoxId && "ring-2 ring-brand ring-offset-1"
                    )}
                    title={`${T(state.label)}${box.damaged ? ` · ${T("damaged")}` : ""}`}
                  >
                    {box.sequence}
                    {box.damaged ? " ⚠" : ""}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {T("This consignment has no box labels — hand it over by the package count.")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ALREADY GONE. Nothing below this is worth drawing. */}
      {handover.released ? (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="space-y-1 pt-6 text-sm">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">
              {T("These goods have already left the warehouse.")}
            </p>
            <p className="tnum text-muted-foreground">
              {handover.released.number} · {formatDateTime(handover.released.releasedAt)}
            </p>
            {handover.released.collectedByName ? (
              <p className="text-muted-foreground">
                {T("Taken by")} {handover.released.collectedByName}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* MAY THESE BOXES LEAVE — computed, in the check's own words. */}
          <Card className={handover.check.ok ? "border-emerald-500/40" : "border-amber-500/50"}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {handover.check.ok ? (
                  <BadgeCheck className="size-4 text-emerald-600" />
                ) : (
                  <CircleAlert className="size-4 text-amber-600" />
                )}
                {handover.check.ok ? T("These boxes may go") : T("These boxes may not go")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!handover.check.ok && handover.check.blockedBy ? (
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm font-medium text-amber-900 dark:text-amber-200">
                  {T(handover.check.blockedBy)}
                </p>
              ) : null}
              <ReleaseChecklist conditions={handover.check.conditions} />
            </CardContent>
          </Card>

          {/* THE PAPER. Its state, never its figures. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Ticket className="size-4" />
                {T("Pickup note")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {handover.note ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="tnum font-semibold">{handover.note.noteNumber}</span>
                    <Badge
                      tone={
                        handover.note.status === "ACTIVE"
                          ? "good"
                          : handover.note.status === "USED"
                            ? "neutral"
                            : "bad"
                      }
                    >
                      {handover.note.status === "ACTIVE"
                        ? T("live")
                        : handover.note.status === "USED"
                          ? T("already used")
                          : T("withdrawn")}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {T("Issued")} {formatDateTime(handover.note.issuedAt)}
                  </p>
                  {handover.note.onCredit ? (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
                      {T("Written on credit — the customer still owes on this consignment.")}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground">
                  {T("No pickup note has been issued for this consignment.")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* WHOSE JOB IT IS. A clerk who cannot name a department is a clerk
              who decides it is easier to hand the boxes over anyway. */}
          {!handover.check.ok && handover.remedies.length > 0 ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{T("Who can put this right")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {handover.remedies.map((remedy) => (
                  <div key={`${remedy.desk}-${remedy.what}`} className="rounded-xl border p-4">
                    <p className="text-sm font-semibold">{T(deskLabel(remedy.desk))}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{T(remedy.what)}</p>
                    {remedy.staff.filter((s) => s.phone).length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {remedy.staff
                          .filter((s) => s.phone)
                          .map((person) => (
                            <li key={person.phone} className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                              <a
                                href={`tel:${person.phone}`}
                                className="inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
                              >
                                <PhoneCall className="size-4" />
                                {T("Call")}
                              </a>
                              <a
                                href={`sms:${person.phone}?body=${encodeURIComponent(
                                  `${handover.reference}: ${handover.check.blockedBy ?? ""}`
                                )}`}
                                className="inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-secondary"
                              >
                                <MessageSquare className="size-4" />
                                {T("Message")}
                              </a>
                            </li>
                          ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {T("No phone number on file for that desk — use the staff list.")}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* THE HANDOVER ITSELF, and only when the check says so. Both actions
              underneath re-run it server-side, so this is what the counter is
              shown rather than what it is allowed. */}
          {mayRelease && handover.check.ok ? (
            <Card className="border-brand/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <DoorOpen className="size-4" />
                  {T("Hand it over")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {handover.expected > 0 ? (
                  <BoxScanner
                    mode="release"
                    cargoId={handover.cargoId}
                    initial={{ done: handover.scannedOut, total: handover.expected }}
                  />
                ) : null}
                <ReleaseForm
                  cargoId={handover.cargoId}
                  packages={handover.expected || handover.darPackages || 1}
                  receiverName={handover.receiver.fullName}
                  receiverPhone={handover.receiver.phone}
                  noteNumber={handover.note?.noteNumber ?? null}
                  askAboutNote
                  defaultOpen
                  boxesScannedOut={handover.scannedOut}
                  boxesExpected={handover.expected}
                />
              </CardContent>
            </Card>
          ) : null}

          {!mayRelease ? (
            <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              {T("You may open this screen but not hand cargo over. Ask the Dar counter.")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
