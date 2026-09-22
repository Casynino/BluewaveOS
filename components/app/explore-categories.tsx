"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Check, Field, ImagePathField, PhotoLibraryList, RowThumb } from "@/components/app/explore-fields";
import { FormMessage } from "@/components/app/form-message";
import { useT } from "@/components/app/locale-provider";
import { SubmitButton } from "@/components/app/submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveCategory, type ContentState } from "@/lib/actions/explore-content";

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  image: string | null;
  published: boolean;
  sortOrder: number;
  markets: number;
  factories: number;
};

/**
 * The product categories a visitor searches the guide by ("where does my
 * product live") — markets and factories are tagged with these.
 */
export function ExploreCategories({
  categories,
  photos,
  startNew,
  editId,
}: {
  categories: CategoryRow[];
  photos: string[];
  startNew?: boolean;
  editId?: string;
}) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(saveCategory, {});
  const initial = editId ? (categories.find((c) => c.id === editId) ?? null) : null;
  const [editing, setEditing] = useState<CategoryRow | null>(initial);
  const [open, setOpen] = useState(Boolean(initial) || Boolean(startNew));

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      setEditing(null);
    }
  }, [state]);

  const startEdit = (row: CategoryRow | null) => {
    setEditing(row);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PhotoLibraryList photos={photos} />
      <Card>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">
              {open ? (editing ? t("Edit category") : t("Add a product category")) : t("Product categories")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("Visitors find markets and factories by these. Tag markets and factories with them on their own forms.")}
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
                {t("New category")}
              </>
            )}
          </Button>
        </header>

        {open ? (
          <form key={editing?.id ?? "new"} action={action} className="space-y-4 p-4">
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <FormMessage error={state.error} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="name" label="Category name">
                <Input id="name" name="name" defaultValue={editing?.name} placeholder="Electronics" required />
              </Field>
              <Field id="sortOrder" label="Position in the list">
                <Input
                  id="sortOrder"
                  name="sortOrder"
                  inputMode="numeric"
                  defaultValue={String(editing?.sortOrder ?? categories.length)}
                />
              </Field>
              <Field id="summary" label="Summary — one or two lines" optional className="sm:col-span-2">
                <Textarea id="summary" name="summary" rows={2} defaultValue={editing?.summary ?? ""} />
              </Field>
              <div className="sm:col-span-2">
                <ImagePathField id="image" name="image" label="Image" defaultValue={editing?.image} />
              </div>
              <Check
                name="published"
                label="Published"
                hint="Shown on the public website."
                defaultChecked={editing ? editing.published : true}
              />
            </div>
            <SubmitButton pendingLabel={t("Saving…")}>
              {editing ? t("Save changes") : t("Add category")}
            </SubmitButton>
          </form>
        ) : null}
      </Card>

      {!open && state.ok ? <FormMessage ok={state.ok} /> : null}

      {categories.length === 0 ? (
        <Card>
          <EmptyState
            icon="Tags"
            title={t("No product categories yet")}
            description={t("Add categories such as electronics or clothing, then tag markets and factories with them.")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {categories.map((row) => (
            <Card key={row.id} className={`flex items-center gap-4 p-3 ${row.published ? "" : "opacity-70"}`}>
              <RowThumb src={row.image} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{row.name}</h3>
                  {row.published ? null : <Badge tone="neutral">{t("draft")}</Badge>}
                </div>
                {row.summary ? <p className="line-clamp-1 text-sm text-muted-foreground">{row.summary}</p> : null}
                <p className="tnum text-xs text-muted-foreground">
                  {row.markets} {t("markets")} · {row.factories} {t("factories")}
                </p>
              </div>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
