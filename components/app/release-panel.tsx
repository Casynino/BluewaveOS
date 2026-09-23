"use client";

import { useActionState, useState } from "react";
import { Check, DoorOpen, X } from "lucide-react";

import { releaseCargo, type ActionState } from "@/lib/actions/release";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
/**
 * The seven conditions, spelled out.
 *
 * A blocked release shows exactly which one failed, so the person at the
 * counter can tell the customer what is missing instead of "the system won't
 * let me". That sentence is what makes people work around a system.
 */
export function ReleaseChecklist({
  conditions,
}: {
  conditions: { label: string; passed: boolean; detail?: string }[];
}) {
  return (
    <ul className="space-y-2">
      {conditions.map((c) => (
        <li key={c.label} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
              c.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            )}
          >
            {c.passed ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          <span className={c.passed ? "" : "font-medium"}>
            <Tx>{c.label}</Tx>
            {c.detail ? (
              <span className="block text-xs font-normal text-muted-foreground">
                <Tx>{c.detail}</Tx>
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ReleaseForm({
  cargoId,
  packages,
  receiverName,
  receiverPhone,
  noteNumber,
  askAboutNote = false,
}: {
  cargoId: string;
  packages: number;
  receiverName: string;
  receiverPhone: string;
  /** The paper the counter matches against, when one was issued. */
  noteNumber?: string | null;
  /**
   * Ask whether the printed note was actually on the counter.
   *
   * Not the question the release check answers. The check has already said a
   * live note exists — it refuses everything else — and this is only whether
   * the customer brought their copy of it. A screen that does not ask records
   * nothing rather than assuming, which is why the field is nullable.
   */
  askAboutNote?: boolean;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    releaseCargo,
    {}
  );
  const [open, setOpen] = useState(false);
  const [somebodyElse, setSomebodyElse] = useState(false);
  const [noNote, setNoNote] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="lg" className="h-14 w-full text-base">
        <DoorOpen />
        {tx("Hand it over")}
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4 rounded-lg border p-4">
      <input type="hidden" name="cargoId" value={cargoId} />

      {/*
        THE PAPER, ASKED ABOUT SEPARATELY FROM THE PERMISSION.

        Finance's note is what the release check reads, and it has already said
        yes by the time this form is on screen. What it cannot know is whether
        the customer walked in holding their printed copy — and they often do
        not. Ticking this box changes nothing about what may leave; it writes
        down that no paper was seen, and who decided to hand the boxes over
        anyway, on the release record and in the audit line.
      */}
      {askAboutNote ? (
        <div className="space-y-3 rounded-lg border border-dashed p-3">
          {/* An unticked checkbox submits nothing at all, which would leave the
              server unable to tell "asked, and they had it" from "never
              asked". This says the question was put. */}
          <input type="hidden" name="noteAsked" value="1" />
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="noteMissing"
              value="1"
              className="mt-0.5 size-5"
              checked={noNote}
              onChange={(e) => setNoNote(e.target.checked)}
            />
            <span>
              {tx("The customer has no printed pickup note")}
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {noteNumber
                  ? `${tx("The note on file is")} ${noteNumber}. ${tx("Tick this only if they cannot show it.")}`
                  : tx("Tick this only if they cannot show it.")}
              </span>
            </span>
          </label>
          {noNote ? (
            <div className="space-y-2">
              <Label htmlFor="noteAbsenceReason">{tx("How did you identify them?")}</Label>
              <Input
                id="noteAbsenceReason"
                name="noteAbsenceReason"
                required
                placeholder={tx("National ID checked, known customer, phone matched…")}
              />
              <p className="text-xs text-muted-foreground">
                {tx("This is recorded against the handover with your name on it.")}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="method">{tx("How is it going?")}</Label>
          <NativeSelect id="method" name="method" defaultValue="COLLECTION">
            <option value="COLLECTION">{tx("Collected from the warehouse")}</option>
            <option value="DELIVERY">{tx("Delivered")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="packagesReleased">{tx("Packages handed over")}</Label>
          <Input
            id="packagesReleased"
            name="packagesReleased"
            type="number"
            min={1}
            required
            defaultValue={packages}
            inputMode="numeric"
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={somebodyElse}
          onChange={(e) => setSomebodyElse(e.target.checked)}
        />
        <span>
          Somebody other than {receiverName} is collecting
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {tx("A driver, a relative, a clearing agent. Record who actually walked out with the boxes — not who was supposed to.")}
          </span>
        </span>
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="collectedByName">{tx("Collected by")}</Label>
          <Input
            id="collectedByName"
            name="collectedByName"
            required
            key={somebodyElse ? "other" : "receiver"}
            defaultValue={somebodyElse ? "" : receiverName}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="collectedByPhone">{tx("Phone")}</Label>
          <Input
            id="collectedByPhone"
            name="collectedByPhone"
            key={somebodyElse ? "other-p" : "receiver-p"}
            defaultValue={somebodyElse ? "" : receiverPhone}
          />
        </div>
        {somebodyElse ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="collectedByIdNo">{tx("ID number")}</Label>
              <Input id="collectedByIdNo" name="collectedByIdNo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">{tx("Relationship")}</Label>
              <Input
                id="relationship"
                name="relationship"
                placeholder={tx("Driver, brother, agent…")}
              />
            </div>
          </>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="signature">{tx("Signature or photo of the handover")}</Label>
        <Input
          id="signature"
          name="signature"
          type="file"
          accept="image/*"
          capture="environment"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rel-notes">{tx("Notes")}</Label>
        <Textarea id="rel-notes" name="notes" />
      </div>

      <FormMessage error={state.error} ok={state.ok} />
      {/* The last thing a clerk touches, one-handed, with a customer watching:
          full width and thumb-sized, not a 36px target beside a Cancel. */}
      <div className="space-y-2">
        <SubmitButton size="lg" className="h-14 w-full text-base">
          <DoorOpen />
          {tx("Release")}
        </SubmitButton>
        <Button type="button" variant="ghost" className="w-full" onClick={() => setOpen(false)}>
          {tx("Cancel")}
        </Button>
      </div>
    </form>
  );
}
