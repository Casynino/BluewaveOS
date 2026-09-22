/**
 * Links built from the company's own contact settings.
 *
 * The numbers on CompanySetting are typed for people to read — "+255 688 887
 * 784" — and a tel: or wa.me link with the spaces and plus sign left in fails
 * on some phones and opens WhatsApp to nobody on others. The formatting is kept
 * for display and stripped only here.
 */

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/**
 * The WhatsApp line as a person reads it: "+255 628 430 911".
 *
 * The setting holds digits, because that is what wa.me wants; a customer
 * reading "255628430911" beside a WhatsApp button cannot tell whether it is
 * the number they should save. Null when there is nothing to show.
 */
export function whatsappLabel(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("255") && digits.length === 12) {
    return `+255 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

/** Null when the setting is empty or holds no digits, so no dead button renders. */
export function whatsappHref(number: string | null | undefined) {
  const digits = (number ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? `https://wa.me/${digits}` : null;
}

/**
 * A WhatsApp chat that opens with the message already written.
 *
 * NOBODY SHOULD ARRIVE IN THE DESK'S INBOX SAYING NOTHING. A bare wa.me link
 * opens an empty chat, and what lands is "Hi" — the desk then spends two
 * messages finding out who is writing and about what. With the greeting and the
 * reference already in the box the customer presses send once, and the first
 * thing the desk reads is the thing it needs.
 *
 * Swahili first: it is the customer's language, and the warmth is the point.
 * The text is the customer's to edit before they send it — it is a draft in
 * their app, not a message anybody sends on their behalf.
 */
export function whatsappLink(
  number: string | null | undefined,
  text?: string | null
): string | null {
  const base = whatsappHref(number);
  if (!base || !text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/**
 * The greeting every WhatsApp link opens with.
 *
 * The owner's own words, spacing and all. It was carrying the reference and a
 * line about the payment slip until he read one on his phone: what he wants in
 * the box is a greeting and nothing else, so the customer opens the chat, sends
 * it, and says the rest themselves.
 */
export const WHATSAPP_OPENER = "Habari !! Mambo vipi ?";
