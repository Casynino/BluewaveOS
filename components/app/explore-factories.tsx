"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import {
  Check,
  Field,
  GalleryField,
  ImagePathField,
  PhotoLibraryList,
  RowThumb,
} from "@/components/app/explore-fields";
import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { saveFactory, type ContentState } from "@/lib/actions/explore-content";
import { FACTORY_LISTING_LABEL } from "@/lib/china-content";

export type FactoryRow = {
  id: string;
  slug: string;
  name: string;
  cityId: string | null;
  cityName: string | null;
  district: string | null;
  industry: string | null;
  summary: string | null;
  body: string | null;
  products: string[];
  production: string | null;
  moq: string | null;
  exportExperience: string | null;
  listing: "LISTING" | "PARTNER";
  visitsAvailable: boolean;
  heroImage: string | null;
  gallery: string[];
  imagesIllustrative: boolean;
  latitude: number | null;
  longitude: number | null;
  categoryIds: string[];
  featured: boolean;
  published: boolean;
  sortOrder: number;
};

export type Option = { id: string; name: string };

/**
 * The factory directory, editable.
 *
 * Nothing here is invented: a factory goes in because somebody at BlueWave
 * knows it exists, and is published only once its details have been checked.
 * "BlueWave sourcing partner" is a claim made to customers about a real
 * relationship, so it is a deliberate choice with the warning beside it,
 * never the default.
 */
export function ExploreFactories({
  factories,
  cities,
  categories,
  photos,
  startNew,
  editId,
}: {
  factories: FactoryRow[];
  cities: Option[];
  categories: Option[];
  photos: string[];
  startNew?: boolean;
  editId?: string;
}) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(saveFactory, {});
  const initial = editId ? (factories.find((f) => f.id === editId) ?? null) : null;
  const [editing, setEditing] = useState<FactoryRow | null>(initial);
  const [open, setOpen] = useState(Boolean(initial) || Boolean(startNew));
  const [listing, setListing] = useState<"LISTING" | "PARTNER">(initial?.listing ?? "LISTING");

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setEditing(null);
    }
  }, [state]);

  const startEdit = (row: FactoryRow | null) => {
    setEditing(row);
    setListing(row?.listing ?? "LISTING");
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PhotoLibraryList photos={photos} />
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">
              {open ? (editing ? t("Edit factory") : t("Add a factory")) : t("Factories")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("Only real factories. Never write “verified” — the website shows “Factory listing” or “BlueWave sourcing partner”.")}
            </p>
          </div>
          <Button
            type="button"
            variant={open ? "ghost" : "default"}
            size="sm"
            onClick={() => (open ? setOpen(false) : startEdit(null))}
          >
            {open ? (
              t("Close")
            ) : (
              <>
                <Plus />
                {t("New factory")}
              </>
            )}
          </Button>
        </header>

        {open ? (
          <form key={editing?.id ?? "new"} action={action} className="space-y-5 p-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormMessage error={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="name" label="Factory name" className="sm:col-span-2">
                <Input id="name" name="name" defaultValue={editing?.name} required />
              </Field>
              <Field id="cityId" label="City" optional>
                <NativeSelect id="cityId" name="cityId" defaultValue={editing?.cityId ?? ""}>
                  <option value="">{t("— Not placed in a city —")}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field id="district" label="District" optional>
                <Input id="district" name="district" defaultValue={editing?.district ?? ""} />
              </Field>
              <Field id="industry" label="Industry" optional>
                <Input id="industry" name="industry" defaultValue={editing?.industry ?? ""} placeholder="LED lighting" />
              </Field>
              <Field id="moq" label="Minimum order (MOQ)" optional>
                <Input id="moq" name="moq" defaultValue={editing?.moq ?? ""} placeholder="500 pieces per design" />
              </Field>
              <Field id="summary" label="Summary — one or two lines" optional className="sm:col-span-2">
                <Textarea id="summary" name="summary" rows={2} defaultValue={editing?.summary ?? ""} />
              </Field>
              <Field id="body" label="Full description" optional className="sm:col-span-2">
                <Textarea id="body" name="body" rows={6} defaultValue={editing?.body ?? ""} />
              </Field>
              <Field id="products" label="Products — one per line" optional>
                <Textarea id="products" name="products" rows={5} defaultValue={editing?.products.join("\n")} />
              </Field>
              <Field id="production" label="Production capacity" optional>
                <Textarea id="production" name="production" rows={5} defaultValue={editing?.production ?? ""} />
              </Field>
              <Field id="exportExperience" label="Export experience" optional className="sm:col-span-2">
                <Input
                  id="exportExperience"
                  name="exportExperience"
                  defaultValue={editing?.exportExperience ?? ""}
                  placeholder="Ships to East Africa regularly"
                />
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">{t("Product categories")}</legend>
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t("No product categories yet — add them on the Product categories tab.")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                  {categories.map((c) => (
                    <Check
                      key={c.id}
                      name="categoryIds"
                      value={c.id}
                      label={c.name}
                      defaultChecked={editing?.categoryIds.includes(c.id)}
                    />
                  ))}
                </div>
              )}
            </fieldset>

            <div
              className={`space-y-3 rounded-lg border p-4 ${
                listing === "PARTNER" ? "border-destructive/40 bg-destructive/5" : "border-warning/30 bg-warning/5"
              }`}
            >
              <Field id="listing" label="How the website describes this factory">
                <NativeSelect
                  id="listing"
                  name="listing"
                  value={listing}
                  onChange={(e) => setListing(e.target.value as "LISTING" | "PARTNER")}
                  className="sm:max-w-sm"
                >
                  <option value="LISTING">{t(FACTORY_LISTING_LABEL.LISTING)}</option>
                  <option value="PARTNER">{t(FACTORY_LISTING_LABEL.PARTNER)}</option>
                </NativeSelect>
              </Field>
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  {t("Choose “BlueWave sourcing partner” only when BlueWave has a real, existing working relationship with this factory. Customers read it as our recommendation. If in doubt, keep “Factory listing”.")}
                </span>
              </p>
            </div>

            <Check
              name="visitsAvailable"
              label="Visits available"
              hint="Tick only if this factory has agreed to receive visitors brought by BlueWave."
              defaultChecked={editing?.visitsAvailable}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ImagePathField id="heroImage" name="heroImage" label="Main image" defaultValue={editing?.heroImage} />
              <GalleryField id="gallery" name="gallery" label="Gallery" defaultValue={editing?.gallery} />
            </div>
            <Check
              name="imagesIllustrative"
              label="These images are illustrative"
              hint="Tick when the pictures show this kind of factory, not this factory. The website then marks them “Illustrative photo”."
              defaultChecked={editing ? editing.imagesIllustrative : false}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="latitude" label="Latitude" optional hint="For the map, e.g. 23.0215">
                <Input
                  id="latitude"
                  name="latitude"
                  inputMode="decimal"
                  defaultValue={editing?.latitude != null ? String(editing.latitude) : ""}
                />
              </Field>
              <Field id="longitude" label="Longitude" optional hint="e.g. 113.1214">
                <Input
                  id="longitude"
                  name="longitude"
                  inputMode="decimal"
                  defaultValue={editing?.longitude != null ? String(editing.longitude) : ""}
                />
              </Field>
              <Field id="sortOrder" label="Position in the list">
                <Input
                  id="sortOrder"
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(editing?.sortOrder ?? factories.length)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
              <Check
                name="published"
                label="Published"
                hint="Publish a factory only after its name, place and details have been checked. Unpublished factories are kept here and not shown on the website."
                defaultChecked={editing ? editing.published : false}
              />
              <Check
                name="featured"
                label="Featured"
                hint="Shown first on the guide's front page."
                defaultChecked={editing?.featured}
              />
            </div>

            <SubmitButton pendingLabel={t("Saving…")}>
              {editing ? t("Save changes") : t("Add factory")}
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      {!open && state.ok ? <FormMessage ok={state.ok} /> : null}

      {factories.length === 0 ? (
        <Card>
          <EmptyState
            icon="Factory"
            title={t("No factories yet")}
            description={t("The directory starts empty. Add only factories BlueWave knows are real.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {factories.map((row) => (
            <Card key={row.id} className={`p-4 ${row.published ? "" : "opacity-70"}`}>
              <div className="flex gap-4">
                <RowThumb src={row.heroImage} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{row.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {[row.cityName, row.district, row.industry].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={row.listing === "PARTNER" ? "good" : "outline"}>
                        {t(FACTORY_LISTING_LABEL[row.listing])}
                      </Badge>
                      {row.featured ? <Badge tone="progress">{t("featured")}</Badge> : null}
                      {row.published ? null : <Badge tone="neutral">{t("draft")}</Badge>}
                    </div>
                  </div>
                  {row.summary ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{row.summary}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.visitsAvailable ? t("Visits available") : t("No visits")}
                    {row.imagesIllustrative ? ` · ${t("illustrative photos")}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startEdit(row);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <Pencil />
                  {t("Edit")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
