"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, PackageCheck, PhoneCall, TriangleAlert } from "lucide-react";

import { scanBoxForRelease } from "@/lib/actions/boxes";
import { raiseException, type ActionState as ExceptionState } from "@/lib/actions/exceptions";
import { releaseCargo, type ActionState } from "@/lib/actions/release";
import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { UnableToLocateForm } from "@/components/app/missing-cargo-report";
import { PhotoCapture } from "@/components/app/photo-capture";
import { QrScanner } from "@/components/app/qr-scanner";
import { ReleaseChecklist } from "@/components/app/release-panel";
import { ScanVerdict } from "@/components/app/scan-verdict";
import { CargoStatusBadge } from "@/components/app/status-badge";
import { SubmitButton } from "@/components/app/submit-button";
import { Tm, Tx } from "@/components/app/tx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { CounterHandover } from "@/lib/counter";
import { formatDate, formatWeight } from "@/lib/format";
import { formatTzPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import type { CargoStatus } from "@prisma/client";

/**
 * THE DAR COUNTER, ON ONE SCREEN.
 *
 * A clerk scans the sticker on a carton with the customer in front of them.
 * From that single scan they can finish the handover or see exactly why they
 * cannot — there is no detail page in between and nothing to navigate to
 * afterwards. Everything below is ordered for that moment on a phone held in
 * one hand:
 *
 *   1. the verdict — may I hand this over, answered before any scrolling
 *   2. who and what — the facts the clerk reads back to the customer
 *   3. the handover itself — receiver, photograph, release
 *
 * WHAT IT CANNOT DO IS ARGUE WITH THE CHECK. `lib/release.ts` is run on the
 * server to decide what is drawn and again inside the release transaction to
 * decide what happens; drawing a button is not a permission and never was. A
 * refusal is shown in the check's own sentences, with the desk that can put it
 * right and a number to ring — and no figure anywhere, because this is a
 * warehouse screen.
 */
export function ReleaseWorkbench({
  handover,
  goods,
  mayRelease,
  scannedBoxId,
}: {
  handover: CounterHandover;
  /** The description in the reader's language; the server picks it. */
  goods: string;
  /** Opening this screen is `cargo.scan`; handing boxes over is a second authority. */
  mayRelease: boolean;
  /** The carton actually in the clerk's hands, when a sticker opened this. */
  scannedBoxId?: string;
}) {
  const t = useT();
  /* The boxes read since this screen was drawn. Kept here as well as on the
     record so the verdict and the button answer the scan the clerk has just
     made, rather than the state the page was rendered in. */
  const [scannedOut, setScannedOut] = useState(handover.scannedOut);

  /*
    THE HANDOVER'S ANSWER IS HELD ABOVE THE FORM THAT ASKED FOR IT.

    Releasing revalidates this route, so the server tree comes back in the same
    commit as the action's reply — with the check now refusing a consignment
    that has gone, which takes the form off the screen. Held inside the form,
    the "it worked" never got a chance to run and the clerk was shown a red
    refusal for the handover they had just made.
  */
  const [state, action] = useActionState<ActionState, FormData>(releaseCargo, {});
  const released = Boolean(state.ok);

  /* Same reason: opening a case is what makes the check refuse, so the answer
     to "did that work" cannot live under the form the refusal removes. */
  const [lossState, lossAction] = useActionState<ExceptionState, FormData>(
    raiseException,
    {}
  );
  const locked = Boolean(lossState.ok && lossState.id);

  /*
    The confirmation replaces the screen rather than sitting under it.

    Leaving the cargo record and a green "hand it over" above a small success
    line means a clerk who thumbs back up after handing a box over sees a
    screen identical to the one that told them to hand it over.
  */
  if (released) {
    return (
      <div className="mx-auto max-w-3xl">
        <ReleasedPanel reference={handover.reference} />
      </div>
    );
  }

  /*
    "CLEARED" WITH A DEAD BUTTON IS WORSE THAN A PLAIN REFUSAL.

    Cargo opened from a list is genuinely clear — the check says so — but the
    box has not been read yet, and the check knows nothing about that. A clerk
    who reads GO, fills the form in and finds the button dead has been walked
    into it. Say what is outstanding at the top, where the answer to "may I
    hand this over" lives.
  */
  const waitingOnScan =
    !handover.released && handover.check.ok && handover.expected > 0 && scannedOut === 0;
  const note = handover.note;

  const verdict: { tone: "ok" | "warn" | "block"; headline: string; detail: string } =
    handover.released
      ? {
          tone: "warn",
          headline: t("Already collected"),
          detail: t("This cargo has been released. It should not be in the warehouse."),
        }
      : !handover.check.ok
        ? {
            tone: "block",
            headline: t("These boxes may not go"),
            detail: t(handover.check.blockedBy ?? "This cargo cannot be released."),
          }
        : waitingOnScan
          ? {
              tone: "warn",
              headline: t("Cleared — now scan the box"),
              detail: t("Payment and paperwork are in order. Read the QR on the carton to confirm you have the right one, then hand it over."),
            }
          : {
              tone: "ok",
              headline: t("Cleared — hand it over"),
              /* "Paid in full" is not what happened on a credit release, and
                 this is the sentence the clerk reads to the person at the
                 counter. The bill may still be open on agreed terms. */
              detail: `${
                note?.onCredit
                  ? t("Released on credit — the bill is still open. Pickup note")
                  : t("Paid in full and pickup note")
              } ${note?.noteNumber ?? ""} ${t("is open. Check who is collecting, photograph the handover, release.")}`,
            };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* 1. May I hand this over? First thing on the screen, every time. */}
      <ScanVerdict tone={verdict.tone} headline={verdict.headline} detail={verdict.detail} />

      <CargoFacts handover={handover} goods={goods} scannedBoxId={scannedBoxId} />

      {mayRelease && handover.check.ok && !handover.released ? (
        <ReleaseForm
          handover={handover}
          state={state}
          action={action}
          scannedOut={scannedOut}
          onScannedOut={setScannedOut}
        />
      ) : (
        <BlockedActions handover={handover} mayRelease={mayRelease} />
      )}

      {/*
        The other outcome. Sometimes the record says the cargo is here and the
        shelf says otherwise, and the wrong thing to do then is to mark it
        handed over and sort it out afterwards. It sits outside the release
        form — a form inside a form is invalid, and this must never be
        submitted by the same tap as a handover — and it stays on screen once
        the case is open, which is the moment the rest of the screen turns into
        a refusal.
      */}
      {mayRelease && !handover.released && (handover.check.ok || locked) ? (
        <UnableToLocateForm
          cargoId={handover.cargoId}
          reference={handover.reference}
          state={lossState}
          action={lossAction}
        />
      ) : null}
    </div>
  );
}

/**
 * Who the cargo belongs to and what it is.
 *
 * The clerk reads this back to the customer before anything moves, so it
 * carries the things a person can check standing there: the name, the phone
 * number they were called on, how many boxes are actually on the floor, and
 * what is in them. Payment is a FACT and never a figure — the note says the
 * bill is settled, which is all this desk needs to hand a box over, and the
 * shillings are Finance's.
 */
function CargoFacts({
  handover,
  goods,
  scannedBoxId,
}: {
  handover: CounterHandover;
  goods: string;
  scannedBoxId?: string;
}) {
  const t = useT();
  const note = handover.note;
  const complete = handover.boxesShort.length === 0;
  const scannedBox = scannedBoxId
    ? handover.boxes.find((box) => box.id === scannedBoxId)
    : undefined;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4 sm:p-6">
        <div className="min-w-0">
          <p className="tnum font-mono text-xl font-bold">{handover.reference}</p>
          <p className="mt-1 text-base font-medium">{handover.receiver.fullName}</p>
          <p className="tnum text-sm text-muted-foreground">
            {formatTzPhone(handover.receiver.phone)}
          </p>
          {/* Sender ≠ receiver. Releasing to the sender is releasing to the
              wrong person, so the other name is shown and labelled. */}
          {handover.sender ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Sent by")} {handover.sender.fullName} — {t("only the receiver may collect")}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <CargoStatusBadge status={handover.status as CargoStatus} />
          <Button asChild variant="outline" size="sm" className="min-h-11">
            <Link href="/app/scan">{t("Scan another")}</Link>
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
        <Fact
          label={t("Boxes here")}
          value={`${handover.boxesHere} ${t("of")} ${handover.expected}`}
          tone={complete ? "ok" : "bad"}
          /* Which carton is short, wherever it is short. A clerk reading
             "2 of 3" with no number beside it hunts the whole shelf. */
          note={
            complete
              ? undefined
              : `${handover.boxesShort.map((n) => `#${n}`).join(", ")} ${t("not checked in")}`
          }
        />
        <Fact label={t("Weight")} value={formatWeight(handover.weightKg)} />
        {/* BlueWave consolidates into containers, not into a master packing
            carton, so this consignment has no carton to look inside. The cell
            stays: an empty fact a clerk can see is not the same as a fact the
            screen decided not to show them. */}
        <Fact label={t("Packing carton")} value="—" />
        <Fact label={t("Container")} value={handover.containerRef ?? "—"} />
        <Fact label={t("Arrived in Dar")} value={formatDate(handover.arrivedInDar)} />
        <Fact
          label={t("Pickup note")}
          value={note ? note.noteNumber : t("Not issued")}
          tone={note?.status === "ACTIVE" ? "ok" : note ? "bad" : undefined}
        />
      </dl>

      <div className="space-y-3 border-t p-4 sm:p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("Contents")}
          </p>
          <p className="mt-0.5 text-sm">{goods}</p>
          {/* The words painted on the carton. The description says what the
              goods are; this is what somebody reads off the box. */}
          {handover.shippingMark ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("Shipping mark")}:{" "}
              <span className="font-medium text-foreground">{handover.shippingMark}</span>
            </p>
          ) : null}
        </div>

        {/*
          The box actually in the clerk's hand, and whether Dar ever booked it
          in. "Boxes here: 2 of 3" and a scanned carton sat on the same screen
          without ever being connected, so a clerk holding the missing carton
          would go and look for it on the shelf.
        */}
        {scannedBox ? (
          <p
            className={cn(
              "text-sm",
              scannedBox.state === "at-dar" || scannedBox.state === "collected"
                ? "text-muted-foreground"
                : "font-medium text-warning"
            )}
          >
            {t("You scanned box")} {scannedBox.sequence} {t("of")} {handover.expected} —{" "}
            {scannedBox.state === "at-dar" || scannedBox.state === "collected"
              ? t("checked in at Dar.")
              : t("this one was never checked in at Dar.")}
          </p>
        ) : null}

        {/*
          Only while the note is live.

          Gated on the note merely existing, a collected or withdrawn
          consignment showed an amber verdict at the top and a full-width green
          "settled in full" panel underneath — and green is the colour that
          reads as permission across a counter.

          The payment FACT, never the figure. The owner's rule is that
          warehouse staff never see shipping prices, so the Dar counter reads
          that the bill is settled and the note that says so, which is all it
          needs to hand a box over. The shillings are simply absent from what
          the browser is sent rather than hidden with a class.
        */}
        {note && note.status === "ACTIVE" ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 px-4 py-3",
              note.onCredit
                ? "border-warning/50 bg-warning/10"
                : "border-success/50 bg-success/10"
            )}
          >
            <div>
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-[0.14em]",
                  note.onCredit ? "text-warning/80" : "text-success/80"
                )}
              >
                {t("Payment")}
              </p>
              <p
                className={cn(
                  "font-display text-lg font-bold leading-tight",
                  note.onCredit ? "text-warning" : "text-success"
                )}
              >
                {note.onCredit ? t("Written on credit") : t("Settled in full")}
              </p>
            </div>
            <p
              className={cn(
                "text-right text-xs",
                note.onCredit ? "text-warning/80" : "text-success/80"
              )}
            >
              <span className="tnum">{note.noteNumber}</span>
              <span className="block">
                {t("issued")} {formatDate(note.issuedAt)}
              </span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  tone,
  note,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
  /** A second line, for a fact that needs qualifying. */
  note?: string;
}) {
  return (
    <div className="bg-card p-3 sm:p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "tnum mt-0.5 break-words font-mono font-semibold",
          // The box count decides whether a partial consignment goes out of the
          // door, so it is not the same size as the container reference.
          tone ? "text-base" : "text-sm",
          tone === "ok" && "text-success",
          tone === "bad" && "text-destructive"
        )}
      >
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-xs leading-tight text-destructive">{note}</p> : null}
    </div>
  );
}

/**
 * What to do instead, for cargo that cannot go.
 *
 * A refusal with no route out is a screen the clerk has to leave and re-solve
 * somewhere else, with a customer watching. The check's own sentences say what
 * is missing; these say whose job it is, with a number to ring, because a clerk
 * who cannot name a department is a clerk who decides it is easier to hand the
 * boxes over and sort the paperwork out afterwards.
 */
function BlockedActions({
  handover,
  mayRelease,
}: {
  handover: CounterHandover;
  mayRelease: boolean;
}) {
  const t = useT();

  return (
    <div className="space-y-4">
      <div className="panel p-4 sm:p-6">
        {handover.released ? (
          <p className="text-sm text-muted-foreground">
            <span className="tnum">{handover.released.number}</span> ·{" "}
            {formatDate(handover.released.releasedAt)}
            {handover.released.collectedByName
              ? ` · ${t("Taken by")} ${handover.released.collectedByName}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("This cargo cannot be released from here. Nothing has been changed.")}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-11">
            <Link href={`/app/cargo/${handover.cargoId}`}>{t("Open the cargo")}</Link>
          </Button>
          <Button asChild className="h-11">
            <Link href="/app/scan">{t("Scan another box")}</Link>
          </Button>
        </div>

        {!mayRelease ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("You may open this screen but not hand cargo over. Ask the Dar counter.")}
          </p>
        ) : null}

        <div className="mt-4 border-t pt-4">
          <ReleaseChecklist conditions={handover.check.conditions} />
        </div>
      </div>

      {handover.remedies.length > 0 ? (
        <div className="panel p-4 sm:p-6">
          <h3 className="text-sm font-semibold">{t("Who can put this right")}</h3>
          <div className="mt-3 space-y-3">
            {handover.remedies.map((remedy) => (
              <div key={`${remedy.desk}-${remedy.what}`} className="rounded-xl border p-4">
                <p className="text-sm font-semibold">
                  <Tx>{remedy.label}</Tx>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  <Tx>{remedy.what}</Tx>
                </p>
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
                            <PhoneCall className="h-4 w-4" />
                            {t("Call")}
                          </a>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("No phone number on file for that desk — use the staff list.")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Shown alone once the cargo has gone, so nothing still reads "hand it over". */
function ReleasedPanel({ reference }: { reference: string }) {
  const t = useT();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className="panel border-success/40 p-8 text-center sm:p-10">
      <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
      <h2
        ref={heading}
        tabIndex={-1}
        className="focus-ring mt-4 font-display text-xl font-bold"
      >
        {t("Cargo released")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        <span className="tnum font-mono">{reference}</span>{" "}
        {t("has been handed over and marked collected.")}
      </p>
      <Button asChild className="mt-6 h-11">
        <Link href="/app/scan">{t("Next customer")}</Link>
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The handover                                                         */
/* ------------------------------------------------------------------ */

const RELATIONSHIP_WORDS: Record<string, string> = {
  SELF: "the customer",
  AGENT: "agent / transporter",
  EMPLOYEE: "their employee",
  FAMILY: "family member",
};

function ReleaseForm({
  handover,
  state,
  action,
  scannedOut,
  onScannedOut,
}: {
  handover: CounterHandover;
  state: ActionState;
  action: (formData: FormData) => void;
  scannedOut: number;
  onScannedOut: (done: number) => void;
}) {
  const t = useT();

  /**
   * Who is actually taking the box, tracked so the last sentence before an
   * irreversible tap names the person typed into the form. A line reading
   * "Release to {customer}" off the customer record is the wrong name whenever
   * an agent or an employee collects — the one sentence that could catch a
   * wrong-receiver mistake would be confirming something nobody entered.
   */
  const [receiver, setReceiver] = useState(handover.receiver.fullName);
  const [relationship, setRelationship] = useState("SELF");
  const [noNote, setNoNote] = useState(false);
  const [scanImpossible, setScanImpossible] = useState(false);
  const [boxSaid, setBoxSaid] = useState<{ tone: "ok" | "warning" | "error"; text: string } | null>(
    null
  );
  const [reading, startReading] = useTransition();

  /*
    Every box goes out under its own scan, and the scan is a server action —
    the box row is stamped there, refused there when it belongs to somebody
    else, and the sentence that comes back is the one the clerk reads. The
    camera only supplies the code.
  */
  const readBox = useCallback(
    (code: string) => {
      startReading(async () => {
        const form = new FormData();
        form.set("cargoId", handover.cargoId);
        form.set("code", code);
        const result = await scanBoxForRelease({}, form);
        setBoxSaid(
          result.error
            ? { tone: "error", text: result.error }
            : result.warning
              ? { tone: "warning", text: result.warning }
              : result.ok
                ? { tone: "ok", text: result.ok }
                : null
        );
        if (result.progress) onScannedOut(result.progress.done);
        if (!result.error && typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate?.(result.warning ? 200 : 60);
        }
      });
    },
    [handover.cargoId, onScannedOut]
  );

  /* Nothing to scan — a consignment with no box labels — is not the same as
     nothing scanned. The first cannot be asked for and never blocks the
     counter. */
  const expectsScan = handover.expected > 0;
  const everyBoxOut = expectsScan && scannedOut >= handover.expected;
  const armed = !expectsScan || scannedOut > 0 || scanImpossible;

  return (
    <div className="space-y-4">
      <form action={action} className="panel space-y-6 p-4 sm:p-6">
        <input type="hidden" name="cargoId" value={handover.cargoId} />
        {/* What the record says went out. The counter is never asked to type a
            figure the system already holds. */}
        <input
          type="hidden"
          name="packagesReleased"
          value={handover.expected || handover.darPackages || 1}
        />

        {everyBoxOut ? (
          <div className="flex items-center gap-2 rounded-xl border border-success/40 bg-success/5 p-3">
            <PackageCheck className="h-4 w-4 shrink-0 text-success" />
            <p className="text-sm font-medium text-success">{t("Box scanned and confirmed")}</p>
          </div>
        ) : scanImpossible ? (
          <div className="rounded-xl border-2 border-warning/50 bg-warning/10 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-warning">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {t("Releasing without scanning the label")}
            </p>
            <p className="mt-1 text-xs text-warning/90">
              {t("Check the tracking number against the customer's paperwork yourself, and make sure the cargo is in the handover photograph — that photo is the only record that the right box left the building.")}
            </p>
          </div>
        ) : expectsScan ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("Scan the box to confirm")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {t("You opened this cargo from a list, so the box itself has not been read yet.")}
            </p>
            <QrScanner
              onResult={readBox}
              busy={reading}
              label={t("Point the camera at the QR on the carton")}
            />
            {/*
              The way out, for the box whose label cannot be read.

              It does not skip a check so much as name what is actually being
              relied on. Nothing here proves the right box is on the counter —
              a typed tracking number would prove no more than the list did —
              so the handover photograph becomes the proof, and the release is
              recorded with no box scan against it, which is itself the record
              that none was read.
            */}
            <button
              type="button"
              onClick={() => setScanImpossible(true)}
              className="focus-ring mt-3 min-h-11 text-left text-xs font-medium text-warning underline underline-offset-2"
            >
              {t("The label cannot be read — release without scanning")}
            </button>
          </div>
        ) : null}

        {/* Every box, one at a time, and what the server said about the last
            one. A box that belongs to another consignment is refused by name. */}
        {expectsScan && !everyBoxOut ? (
          <p className="tnum text-xs text-muted-foreground">
            {t("Boxes scanned out")}: {scannedOut} {t("of")} {handover.expected}
          </p>
        ) : null}
        {boxSaid ? (
          <p
            className={cn(
              "rounded-xl border p-3 text-sm font-medium",
              boxSaid.tone === "ok" && "border-success/40 bg-success/5 text-success",
              boxSaid.tone === "warning" && "border-warning/40 bg-warning/10 text-warning",
              boxSaid.tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive"
            )}
          >
            <Tm>{boxSaid.text}</Tm>
          </p>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">{t("Who is collecting?")}</h3>

          <div className="space-y-1.5">
            <Label htmlFor="collectedByName" className="text-xs">
              {t("Receiver name")}
            </Label>
            <Input
              id="collectedByName"
              name="collectedByName"
              className="h-11"
              value={receiver}
              onChange={(e) => setReceiver(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="collectedByPhone" className="text-xs">
              {t("Receiver phone")}
            </Label>
            <Input
              id="collectedByPhone"
              name="collectedByPhone"
              className="h-11"
              defaultValue={handover.receiver.phone}
              inputMode="tel"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="relationship" className="text-xs">
                {t("Collecting as")}
              </Label>
              <NativeSelect
                id="relationship"
                name="relationship"
                className="h-11"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
              >
                <option value="SELF">{t("The customer")}</option>
                <option value="AGENT">{t("Agent / transporter")}</option>
                <option value="EMPLOYEE">{t("Their employee")}</option>
                <option value="FAMILY">{t("Family member")}</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="collectedByIdNo" className="text-xs">
                {t("ID number")}{" "}
                <span className="text-muted-foreground">
                  {relationship === "SELF"
                    ? t("if you checked one")
                    : t("required — someone else is collecting")}
                </span>
              </Label>
              <Input id="collectedByIdNo" name="collectedByIdNo" className="h-11" />
            </div>
          </div>

          {/*
            THE PAPER, ASKED ABOUT SEPARATELY FROM THE PERMISSION.

            Finance's note is what the release check reads, and it has already
            said yes by the time this form is on screen. What it cannot know is
            whether the customer walked in holding their printed copy — and
            they often do not. Ticking this changes nothing about what may
            leave; it writes down that no paper was seen, and who decided to
            hand the boxes over anyway, on the release record and in the audit
            line. An unticked checkbox submits nothing at all, so the hidden
            field is what says the question was put.
          */}
          <div className="space-y-3 rounded-lg border border-dashed p-3">
            <input type="hidden" name="noteAsked" value="1" />
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                name="noteMissing"
                value="1"
                className="mt-0.5 h-5 w-5 shrink-0"
                checked={noNote}
                onChange={(e) => setNoNote(e.target.checked)}
              />
              <span>
                {t("The customer has no printed pickup note")}
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {handover.note
                    ? `${t("The note on file is")} ${handover.note.noteNumber}. ${t("Tick this only if they cannot show it.")}`
                    : t("Tick this only if they cannot show it.")}
                </span>
              </span>
            </label>
            {noNote ? (
              <div className="space-y-1.5">
                <Label htmlFor="noteAbsenceReason" className="text-xs">
                  {t("How did you identify them?")}
                </Label>
                <Input
                  id="noteAbsenceReason"
                  name="noteAbsenceReason"
                  className="h-11"
                  required
                  minLength={3}
                  placeholder={t("National ID checked, known customer, phone matched…")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("This is recorded against the handover with your name on it.")}
                </p>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rel-notes" className="text-xs">
              {t("Note")}
            </Label>
            <Textarea id="rel-notes" name="notes" rows={2} />
          </div>
        </div>

        <div className="border-t pt-5">
          {/*
            "Expected", not "Required *".

            releaseCargo will not block a handover on a flat battery, because a
            paying customer sent away from the counter is strictly worse than a
            consignment recorded without a picture. A clerk who cannot tell
            which of the two lines is true either turns that customer away or
            learns that this app's "Required" labels are decorative, and the
            second is worse.
          */}
          <h3 className="mb-1 text-sm font-semibold">{t("Photograph the handover")}</h3>
          <p className="mb-4 text-xs text-muted-foreground">
            {t("Expected. This is your proof the cargo was collected, and what settles a dispute later — you can still save without one.")}
          </p>
          <PhotoCapture
            name="signature"
            required
            max={2}
            label={t("Delivery photo")}
            hint={t("The cargo with the person collecting it, if they agree.")}
          />
        </div>

        <FormMessage error={state.error} />

        <div className="space-y-3 border-t pt-4">
          {armed ? (
            <p className="text-sm">
              {t("Handing")}{" "}
              <span className="tnum font-mono font-semibold">{handover.reference}</span>{" "}
              {t("to")} <span className="font-semibold">{receiver || "—"}</span>
              {relationship !== "SELF" ? (
                <span className="text-muted-foreground">
                  {" "}
                  ({t(RELATIONSHIP_WORDS[relationship])})
                </span>
              ) : null}
              .
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Scan the box before releasing it.")}</p>
          )}
          {/*
            No Cancel beside the submit. It threw away the receiver details and
            both handover photographs with no confirmation, from a position a
            thumb reaches for while aiming at Release. The way out is still
            there, at the top of the screen, away from this one.
          */}
          <SubmitButton
            className="h-11 w-full"
            disabled={!armed}
            pendingLabel={t("Releasing…")}
          >
            {t("Release cargo")}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
