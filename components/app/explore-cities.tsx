"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { saveCity, type ContentState } from "@/lib/actions/explore-content";
import { CITY_SERVICES } from "@/lib/china-content";

export type CityRow = {
  id: string;
  slug: string;
  name: string;
  nameZh: string | null;
  province: string | null;
  tagline: string | null;
  summary: string | null;
  body: string | null;
  knownFor: string[];
  whatToSource: string[];
  businessDistricts: string[];
  travelNote: string | null;
  heroImage: string | null;
  gallery: string[];
  services: string[];
  featured: boolean;
  published: boolean;
  sortOrder: number;
  markets: number;
  factories: number;
};

/**
 * The guide's cities, editable — one form for add and edit, opened above the
 * list, the way the markets directory does it.
 */
export function ExploreCities({
  cities,
  photos,
  startNew,
  editId,
}: {
  cities: CityRow[];
  photos: string[];
  startNew?: boolean;
  editId?: string;
}) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(saveCity, {});
  const initial = editId ? (cities.find((c) => c.id === editId) ?? null) : null;
  const [editing, setEditing] = useState<CityRow | null>(initial);
  const [open, setOpen] = useState(Boolean(initial) || Boolean(startNew));

  /* Closed once saved: the list below now shows what was saved, and a form
     left open would still hold the row it was opened with. */
  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setEditing(null);
    }
  }, [state]);

  const startEdit = (city: CityRow | null) => {
    setEditing(city);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PhotoLibraryList photos={photos} />
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">
              {open ? (editing ? t("Edit city") : t("Add a city")) : t("Cities")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("Each published city has its own page on the website, with its markets and factories.")}
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
                {t("New city")}
              </>
            )}
          </Button>
        </header>

        {open ? (
          <form key={editing?.id ?? "new"} action={action} className="space-y-5 p-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormMessage error={state.error} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="name" label="City name">
                <Input id="name" name="name" defaultValue={editing?.name} placeholder="Yiwu" required />
              </Field>
              <Field id="nameZh" label="Chinese name" optional>
                <Input id="nameZh" name="nameZh" defaultValue={editing?.nameZh ?? ""} placeholder="义乌" />
              </Field>
              <Field id="province" label="Province" optional>
                <Input id="province" name="province" defaultValue={editing?.province ?? ""} placeholder="Zhejiang" />
              </Field>
              <Field id="tagline" label="Tagline — one line" optional className="sm:col-span-3">
                <Input
                  id="tagline"
                  name="tagline"
                  defaultValue={editing?.tagline ?? ""}
                  placeholder="The world's small-commodities market"
                />
              </Field>
              <Field id="summary" label="Summary" optional hint="Shown on the city's card and at the top of its page." className="sm:col-span-3">
                <Textarea id="summary" name="summary" rows={3} defaultValue={editing?.summary ?? ""} />
              </Field>
              <Field id="body" label="Full description" optional className="sm:col-span-3">
                <Textarea id="body" name="body" rows={7} defaultValue={editing?.body ?? ""} />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field id="knownFor" label="Known for — one per line" optional>
                <Textarea id="knownFor" name="knownFor" rows={5} defaultValue={editing?.knownFor.join("\n")} />
              </Field>
              <Field id="whatToSource" label="What to source here — one per line" optional>
                <Textarea id="whatToSource" name="whatToSource" rows={5} defaultValue={editing?.whatToSource.join("\n")} />
              </Field>
              <Field id="businessDistricts" label="Business districts — one per line" optional>
                <Textarea
                  id="businessDistricts"
                  name="businessDistricts"
                  rows={5}
                  defaultValue={editing?.businessDistricts.join("\n")}
                />
              </Field>
              <Field id="travelNote" label="Travel note" optional className="sm:col-span-3">
                <Input
                  id="travelNote"
                  name="travelNote"
                  defaultValue={editing?.travelNote ?? ""}
                  placeholder="About 2 hours by fast train from Guangzhou."
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ImagePathField id="heroImage" name="heroImage" label="Main image" defaultValue={editing?.heroImage} />
              <GalleryField id="gallery" name="gallery" label="Gallery" defaultValue={editing?.gallery} />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium">{t("BlueWave services from this city")}</legend>
              <p className="text-xs text-muted-foreground">
                {t("Tick only what BlueWave really does from this city today.")}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                {(Object.keys(CITY_SERVICES) as (keyof typeof CITY_SERVICES)[]).map((key) => (
                  <Check
                    key={key}
                    name="services"
                    value={key}
                    label={CITY_SERVICES[key]}
                    defaultChecked={editing?.services.includes(key)}
                  />
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-3">
              <Check
                name="published"
                label="Published"
                hint="Shown on the public website."
                defaultChecked={editing ? editing.published : true}
              />
              <Check
                name="featured"
                label="Featured"
                hint="Shown first on the guide's front page."
                defaultChecked={editing?.featured}
              />
              <Field id="sortOrder" label="Position in the list">
                <Input
                  id="sortOrder"
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(editing?.sortOrder ?? cities.length)}
                />
              </Field>
            </div>

            <SubmitButton pendingLabel={t("Saving…")}>
              {editing ? t("Save changes") : t("Add city")}
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      {!open && state.ok ? <FormMessage ok={state.ok} /> : null}

      {cities.length === 0 ? (
        <Card>
          <EmptyState
            icon="Building2"
            title={t("No cities yet")}
            description={t("Add the first city the guide should describe.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cities.map((city) => (
            <Card key={city.id} className={`p-4 ${city.published ? "" : "opacity-70"}`}>
              <div className="flex gap-4">
                <RowThumb src={city.heroImage} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold">
                        {city.name}
                        {city.nameZh ? <span className="ml-2 font-normal text-muted-foreground">{city.nameZh}</span> : null}
                      </h3>
                      <p className="text-sm text-muted-foreground">{city.province}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {city.featured ? <Badge tone="progress">{t("featured")}</Badge> : null}
                      {city.published ? null : <Badge tone="neutral">{t("draft")}</Badge>}
                    </div>
                  </div>
                  {city.tagline ? <p className="mt-1 line-clamp-1 text-sm text-brand">{city.tagline}</p> : null}
                  <p className="tnum mt-1 text-xs text-muted-foreground">
                    {city.markets} {t("markets")} · {city.factories} {t("factories")} · /cities/{city.slug}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2 border-t pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startEdit(city);
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
