"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin, Pencil } from "lucide-react";

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
import { saveMarketPlace, type ContentState } from "@/lib/actions/explore-content";

export type MarketPlaceRow = {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  summary: string | null;
  published: boolean;
  cityId: string | null;
  cityName: string | null;
  address: string | null;
  visitDuration: string | null;
  imageUrl: string | null;
  gallery: string[];
  latitude: number | null;
  longitude: number | null;
  categoryIds: string[];
  featured: boolean;
};

type Option = { id: string; name: string };

/**
 * Where each market sits in the guide.
 *
 * The market's name, description, products and tips are kept on the markets
 * directory (/app/admin/markets), which the support desk reads. This is only
 * what the public guide needs on top: its city, its categories, the address,
 * the pictures and the map pin.
 */
export function ExploreMarketPlaces({
  markets,
  cities,
  categories,
  photos,
  editId,
}: {
  markets: MarketPlaceRow[];
  cities: Option[];
  categories: Option[];
  photos: string[];
  editId?: string;
}) {
  const t = useT();
  if (markets.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="Store"
          title={t("No markets yet")}
          description={t("Add markets on the China markets screen first, then place them on the guide here.")}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <PhotoLibraryList photos={photos} />
      {markets.map((market) => (
        <MarketPlaceCard
          key={market.id}
          market={market}
          cities={cities}
          categories={categories}
          startOpen={market.id === editId}
        />
      ))}
    </div>
  );
}

export function MarketPlaceCard({
  market,
  cities,
  categories,
  startOpen,
}: {
  market: MarketPlaceRow;
  cities: Option[];
  categories: Option[];
  startOpen?: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(saveMarketPlace, {});
  const [open, setOpen] = useState(Boolean(startOpen));

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const placed = Boolean(market.cityId);

  return (
    <Card id={`market-${market.id}`} className={market.published ? "" : "opacity-80"}>
      <div className="flex flex-wrap items-center gap-4 p-4">
        <RowThumb src={market.imageUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{market.name}</h3>
            {market.featured ? <Badge tone="progress">{t("featured")}</Badge> : null}
            {market.published ? null : <Badge tone="neutral">{t("unpublished")}</Badge>}
            {placed ? null : <Badge tone="warn">{t("not placed in a guide city")}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            <MapPin className="mr-1 inline size-3.5" />
            {market.cityName ?? market.city ?? "—"}
            {market.address ? ` · ${market.address}` : ""}
          </p>
          <p className="tnum text-xs text-muted-foreground">
            {market.categoryIds.length} {t("categories")} · {market.gallery.length} {t("photos")}
            {market.latitude != null && market.longitude != null ? ` · ${t("on the map")}` : ""}
          </p>
        </div>
        <Button type="button" variant={open ? "ghost" : "outline"} size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? (
            t("Close")
          ) : (
            <>
              <Pencil />
              {t("Guide details")}
            </>
          )}
        </Button>
      </div>

      {!open && state.ok ? (
        <div className="px-4 pb-4">
          <FormMessage ok={state.ok} />
        </div>
      ) : null}

      {open ? (
        <form action={action} className="space-y-5 border-t p-4">
          <input type="hidden" name="id" value={market.id} />
          <FormMessage error={state.error} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              id={`cityId-${market.id}`}
              label="Guide city"
              optional
              hint="The market appears on this city's page."
            >
              <NativeSelect id={`cityId-${market.id}`} name="cityId" defaultValue={market.cityId ?? ""}>
                <option value="">{t("— Not placed in a city —")}</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`visitDuration-${market.id}`} label="Time to allow for a visit" optional>
              <Input
                id={`visitDuration-${market.id}`}
                name="visitDuration"
                defaultValue={market.visitDuration ?? ""}
                placeholder="Half a day"
              />
            </Field>
            <Field id={`address-${market.id}`} label="Address" optional className="sm:col-span-2">
              <Input id={`address-${market.id}`} name="address" defaultValue={market.address ?? ""} />
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
                    defaultChecked={market.categoryIds.includes(c.id)}
                  />
                ))}
              </div>
            )}
          </fieldset>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ImagePathField id={`imageUrl-${market.id}`} name="imageUrl" label="Main image" defaultValue={market.imageUrl} />
            <GalleryField id={`gallery-${market.id}`} name="gallery" label="Gallery" defaultValue={market.gallery} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field id={`latitude-${market.id}`} label="Latitude" optional hint="For the map, e.g. 23.0215">
              <Input
                id={`latitude-${market.id}`}
                name="latitude"
                inputMode="decimal"
                defaultValue={market.latitude != null ? String(market.latitude) : ""}
              />
            </Field>
            <Field id={`longitude-${market.id}`} label="Longitude" optional hint="e.g. 113.1214">
              <Input
                id={`longitude-${market.id}`}
                name="longitude"
                inputMode="decimal"
                defaultValue={market.longitude != null ? String(market.longitude) : ""}
              />
            </Field>
            <div className="pt-6">
              <Check
                name="featured"
                label="Featured"
                hint="Shown first on the guide's front page."
                defaultChecked={market.featured}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("The name, description, products, tips and publishing are edited on the China markets screen.")}
          </p>

          <SubmitButton pendingLabel={t("Saving…")}>{t("Save guide details")}</SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}
