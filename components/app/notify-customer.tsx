"use client";

import { useActionState, useEffect, useState } from "react";
import { MessageCircle, Send } from "lucide-react";

import { logCustomerContact, type ActionState } from "@/lib/actions/messages";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { useT } from "@/components/app/locale-provider";
import { Tx } from "@/components/app/tx";
export type MessageOption = {
  kind: string;
  label: string;
  /** The button's words for a stage message: "Notify customer — Cargo in transit". */
  action?: string;
  body: string;
  /** The real addresses the message carries, listed under the preview. */
  links?: { label: string; href: string }[];
  /** True for the stage this consignment is actually at. */
  suggested?: boolean;
};

/**
 * The message as the customer will see it in WhatsApp: *bold* drawn bold and
 * every address a link that opens, so staff can check each one before sending.
 */
export function MessagePreview({ body }: { body: string }) {
  return (
    <div className="rounded-lg border bg-emerald-50/60 p-4 text-sm leading-relaxed text-foreground dark:bg-emerald-950/20">
      {body.split("\n").map((line, index) =>
        line.trim() === "" ? (
          <div key={index} className="h-2" />
        ) : (
          <p key={index} className="break-words">
            {line.split(/(\*[^*]+\*|https?:\/\/\S+)/g).map((part, i) =>
              /^\*[^*]+\*$/.test(part) ? (
                <strong key={i}>{part.slice(1, -1)}</strong>
              ) : /^https?:\/\//.test(part) ? (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">
                  {part}
                </a>
              ) : (
                <span key={i}>{part}</span>
              )
            )}
          </p>
        )
      )}
    </div>
  );
}

/**
 * THE BRIDGE TO THE CUSTOMER.
 *
 * Support is the desk that tells people what has happened to their goods. The
 * message for the stage the consignment has reached is written here from the
 * record — its own template, never another stage's — and shown in full, links
 * and all, before anything is sent. Staff read it, change a word if they must,
 * and only then open WhatsApp.
 *
 * IT DOES NOT SEND ANYTHING. WhatsApp opens; a person presses send. Logging it
 * as "contacted" rather than "notified" is the difference between what this
 * system knows and what it would like to claim.
 */
export function NotifyCustomer({
  cargoId,
  invoiceId,
  phone,
  customerName,
  options,
  lastContact,
}: {
  cargoId?: string;
  invoiceId?: string;
  /** Digits only, country code, no plus. Null when we have no usable number. */
  phone: string | null;
  customerName: string;
  options: MessageOption[];
  lastContact?: { label: string; when: string; by: string } | null;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(
    logCustomerContact,
    {}
  );

  const suggested = options.find((o) => o.suggested) ?? options[0];
  const [kind, setKind] = useState(suggested?.kind ?? "general");
  const [body, setBody] = useState(suggested?.body ?? "");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const chosen = options.find((o) => o.kind === kind);

  useEffect(() => {
    const next = options.find((o) => o.kind === kind);
    if (next) setBody(next.body);
    setEditing(false);
  }, [kind, options]);

  const openWhatsApp = () => {
    if (!phone) return;
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(body)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (options.length === 0) return null;

  if (!open) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {tx("Tell")} {customerName}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastContact ? (
                <>
                  {tx("Last contacted about")} &ldquo;<Tx>{lastContact.label}</Tx>&rdquo; · {lastContact.when} ·{" "}
                  {lastContact.by}
                </>
              ) : (
                tx("Nobody has messaged them about this consignment yet.")
              )}
            </p>
          </div>
          <Button
            type="button"
            variant={lastContact ? "outline" : "default"}
            onClick={() => setOpen(true)}
            disabled={!phone}
          >
            <MessageCircle />
            {phone ? (suggested?.action ? tx(suggested.action) : tx("Notify on WhatsApp")) : tx("No phone number")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-brand/30">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-brand" />
          {chosen?.action ? tx(chosen.action) : `${tx("Notify")} ${customerName}`}
        </CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          {tx("Close")}
        </Button>
      </CardHeader>

      <CardContent>
        <form action={action} className="space-y-4">
          {cargoId ? (
            <input type="hidden" name="cargoId" value={cargoId} />
          ) : null}
          {invoiceId ? (
            <input type="hidden" name="invoiceId" value={invoiceId} />
          ) : null}
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="channel" value="WHATSAPP" />
          <input type="hidden" name="body" value={body} />

          <div className="space-y-1.5">
            <Label htmlFor="messageKind">{tx("What are you telling them?")}</Label>
            <NativeSelect
              id="messageKind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {options.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {tx(option.label)}
                  {option.suggested ? ` — ${tx("where it is now")}` : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="messageBody">{tx("Preview — exactly what they will receive")}</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
                {editing ? tx("Done editing") : tx("Edit wording")}
              </Button>
            </div>
            {editing ? (
              <Textarea
                id="messageBody"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-sans text-sm"
              />
            ) : (
              <MessagePreview body={body} />
            )}
          </div>

          {chosen?.links && chosen.links.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{tx("Links in this message")}</p>
              <ul className="space-y-1 text-xs">
                {chosen.links.map((link) => (
                  <li key={link.href} className="flex flex-wrap gap-x-2">
                    <span className="font-medium">{tx(link.label)}</span>
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline underline-offset-2">
                      {link.href}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <FormMessage error={state.error} ok={state.ok} />

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton onClick={openWhatsApp} pendingLabel={tx("Logging…")}>
              <Send />
              {tx("Open WhatsApp and log it")}
            </SubmitButton>
            <SubmitButton variant="outline" pendingLabel={tx("Logging…")}>
              {tx("Log without opening")}
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx("WhatsApp opens with this text ready. You still press send there — we record that we contacted them, not that it was delivered.")}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

const CHANNELS = [
  ["WHATSAPP", "WhatsApp"],
  ["PHONE", "Phone call"],
  ["SMS", "SMS"],
  ["EMAIL", "Email"],
  ["IN_PERSON", "In person"],
] as const;

/**
 * SEND THIS INVOICE.
 *
 * Under the bill itself, always open: pick the message, pick how, edit the
 * wording, open it in WhatsApp, then record it. Recording puts it on the
 * customer's contact history, so the next person who speaks to them knows what
 * they were told — and the call list stops saying "never contacted".
 */
export function SendInvoice({
  cargoId,
  invoiceId,
  phone,
  displayPhone,
  options,
}: {
  cargoId?: string;
  invoiceId: string;
  phone: string | null;
  displayPhone: string;
  options: MessageOption[];
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(logCustomerContact, {});
  const suggested = options.find((o) => o.suggested) ?? options[0];
  const [kind, setKind] = useState(suggested?.kind ?? "general");
  const [channel, setChannel] = useState<string>("WHATSAPP");
  const [body, setBody] = useState(suggested?.body ?? "");
  const [editing, setEditing] = useState(false);
  const chosen = options.find((o) => o.kind === kind);

  useEffect(() => {
    const next = options.find((o) => o.kind === kind);
    if (next) setBody(next.body);
    setEditing(false);
  }, [kind, options]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft print:hidden">
      <h2 className="font-semibold">{tx("Send invoice notification")}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {tx("Open it in WhatsApp, then record it — recording marks the invoice as sent, which is what the follow-up list works from.")}
      </p>
      <form action={action} className="mt-4 space-y-4">
        {cargoId ? <input type="hidden" name="cargoId" value={cargoId} /> : null}
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="kind" value={kind} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="send-kind">{tx("Message")}</Label>
            <NativeSelect id="send-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {options.map((option) => (
                <option key={option.kind} value={option.kind}>
                  {tx(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-channel">{tx("How")}</Label>
            <NativeSelect id="send-channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              {CHANNELS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="send-body">{tx("Preview — exactly what they will receive")}</Label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
              {editing ? tx("Done editing") : tx("Edit wording")}
            </Button>
          </div>
          <input type="hidden" name="body" value={body} />
          {editing ? (
            <Textarea id="send-body" rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-sans text-sm" />
          ) : (
            <MessagePreview body={body} />
          )}
        </div>
        {chosen?.links && chosen.links.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {chosen.links.map((link) => (
              <li key={link.href} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{tx(link.label)}</span>
                <a href={link.href} target="_blank" rel="noopener noreferrer" className="break-all text-brand underline underline-offset-2">
                  {link.href}
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        <FormMessage error={state.error} ok={state.ok ? "Recorded as sent." : undefined} />
        <div className="flex flex-wrap items-center gap-2">
          {phone && channel === "WHATSAPP" ? (
            <Button asChild variant="outline">
              <a href={`https://wa.me/${phone}?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">
                <MessageCircle />
                {tx("Open in WhatsApp")}
              </a>
            </Button>
          ) : null}
          <SubmitButton pendingLabel={tx("Recording…")}>
            <Send />
            {tx("Record as sent")}
          </SubmitButton>
        </div>
        <p className="text-xs text-muted-foreground">
          Recorded against {displayPhone}. Recording puts this on the customer&rsquo;s contact history so the next person who speaks to them knows what they were told.
        </p>
      </form>
    </section>
  );
}
