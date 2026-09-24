"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

import { logCustomerContact, type ActionState } from "@/lib/actions/messages";
import { FormMessage } from "@/components/app/form-message";
import { Modal } from "@/components/app/modal";
import { MessagePreview } from "@/components/app/notify-customer";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";

/**
 * TELL THIS CUSTOMER, FROM THE LIST THEY ARE ON.
 *
 * One consignment's stage message — received in China, or stored in China once
 * it is in a container — previewed in full, links and all, before anything is
 * sent. The first send is refused if somebody else has already sent the same
 * stage message in the meantime; "Notify again" is the deliberate second one.
 */
export function NotifyRow({
  cargoId,
  phone,
  kind,
  action,
  body: initialBody,
  links,
  notified,
  stage,
}: {
  cargoId: string;
  /** Digits only, country code, no plus. Null when there is no usable number. */
  phone: string | null;
  kind: string;
  /** "Notify customer — Cargo received in China" */
  action: string;
  body: string;
  links: { label: string; href: string }[];
  notified: { when: string; by: string } | null;
  /** What was said, in the customer's own words: "Received in China". */
  stage: string;
}) {
  const tx = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(logCustomerContact, {});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const openWhatsApp = () => {
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
  };

  return (
    /* THE PRESS FIRST, THEN WHAT WAS SAID.

       A clerk working down this column is deciding whether to ring somebody,
       so the button is where the eye lands and the answer — told, or not told
       — sits beside it rather than above it. Row-sized: a table cell is not a
       page, and a full-height button pushes six columns of figures into two
       lines each. */
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        className="h-8 px-3 text-xs [&_svg]:size-3.5"
        variant="outline"
        disabled={!phone}
        onClick={() => {
          setBody(initialBody);
          setEditing(false);
          setOpen(true);
        }}
      >
        <MessageCircle />
        {!phone ? tx("No phone number") : tx("Notify")}
      </Button>
      {notified ? (
        <span className="text-xs leading-tight text-muted-foreground">
          <span className="block text-foreground">{tx(stage)}</span>
          {notified.when} · {notified.by}
        </span>
      ) : (
        <span className="rounded-md bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
          {tx("Not told")}
        </span>
      )}
      {state.ok && !open ? <span className="text-xs text-success">{tx("Logged.")}</span> : null}

      {open ? (
        <Modal title={tx(action)} onClose={close} className="max-w-lg">
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="cargoId" value={cargoId} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="channel" value="WHATSAPP" />
            <input type="hidden" name="to" value="sender" />
            {/* The first send of a stage is sent once; a second is asked for. */}
            {notified ? null : <input type="hidden" name="once" value="1" />}
            <input type="hidden" name="body" value={body} />

            {notified ? (
              <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
                {tx("Already notified")} {notified.when} · {notified.by}. {tx("Sending again sends the same message a second time.")}
              </p>
            ) : null}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{tx("Preview — exactly what they will receive")}</p>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                  {editing ? tx("Done editing") : tx("Edit wording")}
                </Button>
              </div>
              {editing ? (
                <Textarea rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-sans text-sm" />
              ) : (
                <MessagePreview body={body} />
              )}
            </div>

            {links.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {links.map((link) => (
                  <li key={link.href} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{tx(link.label)}</span>
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline underline-offset-2">
                      {link.href}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}

            <FormMessage error={state.error} ok={undefined} />

            <div className="flex flex-wrap items-center gap-2">
              <SubmitButton onClick={openWhatsApp} pendingLabel={tx("Logging…")}>
                <Send />
                {tx("Open WhatsApp and log it")}
              </SubmitButton>
              <SubmitButton variant="outline" pendingLabel={tx("Logging…")}>
                {tx("Log without opening")}
              </SubmitButton>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
