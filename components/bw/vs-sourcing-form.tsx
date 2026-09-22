"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import {
  usePublicSubmit,
  VsError,
  VsField,
  VsSection,
  VsSections,
  VsSent,
  VsSubmit,
  VsTrap,
} from "@/components/bw/vs-form-kit";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitSourcingRequest } from "@/lib/actions/public-sourcing";

const MAX_PHOTOS = 3;

export type SourcingFormProps = {
  services: { key: string; label: string; blurb: string }[];
  categories: string[];
  cities: string[];
  /** Resolved from the address: names, never slugs. */
  preset: { service?: string; category?: string; city?: string; details?: string };
};

/**
 * "FIND IT FOR ME".
 *
 * The one question that matters is what they are looking for; everything else
 * helps the sourcing team call back with a better first answer. Photos go
 * with the request (up to three) because a picture of the product settles
 * more than a paragraph describing it.
 */
export function SourcingForm({ services, categories, cities, preset }: SourcingFormProps) {
  const { state, pending, onSubmit } = usePublicSubmit(submitSourcingRequest);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  if (state.ok) return <VsSent state={state} kind="sourcing" />;

  const firstService = services.find((s) => s.key === preset.service)?.key ?? services[0]?.key;

  const onPhotos = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length > MAX_PHOTOS) {
      event.target.value = "";
      setPhotos([]);
      setPhotoError(`Choose up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setPhotoError(null);
    setPhotos(files.map((file) => file.name));
  };

  const clearPhotos = () => {
    if (photoInput.current) photoInput.current.value = "";
    setPhotos([]);
    setPhotoError(null);
  };

  return (
    <form onSubmit={onSubmit} encType="multipart/form-data" className="space-y-8">
      <VsSections>
        <VsSection index="01" title="What kind of help">
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((service) => (
              <label
                key={service.key}
                className="flex cursor-pointer items-start gap-3 rounded-[2px] border border-bw-line bg-bw-panel p-4 transition-colors hover:border-bw-fg/40 has-[:checked]:border-bw-coral has-[:checked]:bg-bw-coral/[0.06] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-bw-coral"
              >
                <input
                  type="radio"
                  name="service"
                  value={service.key}
                  defaultChecked={service.key === firstService}
                  required
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-bw-fg/40 peer-checked:border-bw-coral [&>span]:scale-0 peer-checked:[&>span]:scale-100"
                >
                  <span className="size-2 rounded-full bg-bw-coral transition-transform" />
                </span>
                <span className="min-w-0">
                  <span className="block font-bw-display text-xl font-semibold uppercase leading-none text-bw-fg">
                    {service.label}
                  </span>
                  <span className="mt-1.5 block text-sm leading-snug text-bw-muted">{service.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </VsSection>

        <VsSection index="02" title="What you are looking for">
          <div className="grid gap-4 sm:grid-cols-2">
            <VsField id="s-product" label="Product" className="sm:col-span-2">
              <Input
                id="s-product"
                name="product"
                required
                minLength={2}
                maxLength={200}
                placeholder="e.g. Solar street lights, 60 W"
              />
            </VsField>
            <VsField id="s-category" label="Category" optional>
              <NativeSelect id="s-category" name="category" defaultValue={preset.category ?? ""}>
                <option value="">Not sure</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
            </VsField>
            <VsField id="s-preferredCity" label="Where in China" optional>
              <NativeSelect id="s-preferredCity" name="preferredCity" defaultValue={preset.city ?? ""}>
                <option value="">Anywhere</option>
                {cities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </NativeSelect>
            </VsField>
            <VsField id="s-quantity" label="Quantity" optional>
              <Input id="s-quantity" name="quantity" maxLength={120} placeholder="e.g. 200 pieces, 1 container" />
            </VsField>
            <VsField id="s-budget" label="Target price" optional hint="Per piece or for the order — say which, and in which currency.">
              <Input id="s-budget" name="budget" maxLength={120} placeholder="e.g. USD 12 a piece" />
            </VsField>
            <VsField id="s-details" label="Describe it" optional className="sm:col-span-2">
              <Textarea
                id="s-details"
                name="details"
                rows={4}
                maxLength={3000}
                defaultValue={preset.details}
                placeholder="What it is for, the quality you want, a product you have seen that is close."
              />
            </VsField>
            <VsField id="s-specifications" label="Specifications" optional className="sm:col-span-2">
              <Textarea
                id="s-specifications"
                name="specifications"
                rows={3}
                maxLength={2000}
                placeholder="Sizes, colours, materials, power, packaging, branding."
              />
            </VsField>
            <VsField
              id="s-supplierNeeds"
              label="Supplier or factory requirements"
              optional
              className="sm:col-span-2"
            >
              <Textarea
                id="s-supplierNeeds"
                name="supplierNeeds"
                rows={2}
                maxLength={1000}
                placeholder="A factory rather than a trader, a minimum order you can meet, certificates you need."
              />
            </VsField>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-bw-fg">
              Photos<span className="ml-1.5 font-normal text-bw-muted">(optional, up to {MAX_PHOTOS})</span>
            </p>
            <label
              htmlFor="s-photos"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[2px] border border-dashed border-bw-fg/30 bg-bw-ground px-4 py-6 text-center transition-colors hover:border-bw-coral has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-bw-coral"
            >
              <ImagePlus className="size-6 text-bw-coral" aria-hidden />
              <span className="font-bw-display text-lg font-semibold uppercase text-bw-fg">
                {photos.length ? `${photos.length} photo${photos.length === 1 ? "" : "s"} chosen` : "Add photos of the product"}
              </span>
              <span className="text-xs text-bw-muted">A picture from a catalogue, a sample you have, or a screenshot.</span>
              <input
                ref={photoInput}
                id="s-photos"
                name="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={onPhotos}
                className="sr-only"
              />
            </label>
            {photos.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((name) => (
                  <span key={name} className="bw-mono max-w-[16rem] truncate rounded-[2px] border border-bw-line px-2 py-1 text-xs text-bw-fg">
                    {name}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={clearPhotos}
                  className="bw-mono inline-flex items-center gap-1 px-2 py-1 text-xs uppercase tracking-[0.12em] text-bw-muted hover:text-bw-coral"
                >
                  <X className="size-3" aria-hidden /> Remove
                </button>
              </div>
            ) : null}
            {photoError ? (
              <p role="alert" className="text-sm text-bw-coral">
                {photoError}
              </p>
            ) : null}
          </div>
        </VsSection>

        <VsSection index="03" title="How we reach you">
          <div className="grid gap-4 sm:grid-cols-2">
            <VsField id="s-contactName" label="Your name">
              <Input id="s-contactName" name="contactName" required minLength={2} maxLength={120} autoComplete="name" />
            </VsField>
            <VsField id="s-contactPhone" label="Phone" hint="With the country code if outside Tanzania.">
              <Input
                id="s-contactPhone"
                name="contactPhone"
                type="tel"
                inputMode="tel"
                required
                maxLength={40}
                autoComplete="tel"
                placeholder="+255 …"
              />
            </VsField>
            <VsField id="s-whatsapp" label="WhatsApp" optional hint="If it is a different number.">
              <Input id="s-whatsapp" name="whatsapp" type="tel" inputMode="tel" maxLength={40} />
            </VsField>
            <VsField id="s-contactEmail" label="Email" optional>
              <Input id="s-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
            </VsField>
          </div>
        </VsSection>
      </VsSections>

      <VsTrap />

      <div className="space-y-4 border-t border-bw-line pt-6">
        <VsError message={state.error} />
        <p className="text-xs text-bw-muted">
          This sends a request. It is not an order and carries no price — the sourcing team calls you back, and nothing
          is bought until you say so.
        </p>
        <VsSubmit pending={pending}>Send sourcing request</VsSubmit>
      </div>
    </form>
  );
}
