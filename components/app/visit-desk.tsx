"use client";

import { useActionState, useState } from "react";

import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { updateVisitRequest, type VisitState } from "@/lib/actions/visits";
import { t, type Locale } from "@/lib/i18n";

export const VISIT_STATUSES = [
  { value: "REQUESTED", label: "Requested" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

/** Statuses under which the visitor's status page prints the plan. */
const PLAN_PUBLIC = new Set(["CONFIRMED", "IN_PROGRESS", "COMPLETED"]);

/**
 * Moving a visit along. The plan is the visitor's to read (their status page
 * prints it once the visit is confirmed); the staff note never leaves the desk.
 * Confirming without a plan is refused by the action — the field says so first.
 */
export function VisitWorkflow({
  visit,
  staff,
  locale,
}: {
  visit: {
    id: string;
    status: string;
    assignedToId: string | null;
    plan: string | null;
    staffNote: string | null;
  };
  staff: { id: string; name: string }[];
  locale: Locale;
}) {
  const [state, action] = useActionState<VisitState, FormData>(updateVisitRequest, {});
  const [status, setStatus] = useState(visit.status);
  const planNeeded = status === "CONFIRMED";
  const planPublic = PLAN_PUBLIC.has(status);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={visit.id} />
      <FormMessage error={state.error} ok={state.ok} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="visit-status">{t(locale, "Status")}</Label>
          <NativeSelect
            id="visit-status"
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {VISIT_STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {t(locale, option.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="visit-assignee">{t(locale, "Handled by")}</Label>
          <NativeSelect id="visit-assignee" name="assignedToId" defaultValue={visit.assignedToId ?? ""}>
            <option value="">{t(locale, "Unassigned")}</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="visit-plan">
          {t(locale, "Plan — the visitor reads this")}{" "}
          {planNeeded ? (
            <span className="font-normal text-destructive">{t(locale, "required")}</span>
          ) : null}
        </Label>
        <Textarea
          id="visit-plan"
          name="plan"
          rows={6}
          maxLength={4000}
          defaultValue={visit.plan ?? ""}
          required={planNeeded}
          placeholder={t(locale, "Dates, markets and factories by day, who meets them, what has been arranged for hotel and transport.")}
        />
        <p className="text-xs text-muted-foreground">
          {planPublic
            ? t(locale, "Shown on the visitor's status page under this status.")
            : t(locale, "Shown on the visitor's status page once the visit is confirmed.")}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="visit-staffNote">{t(locale, "Staff note — internal, never shown to the visitor")}</Label>
        <Textarea
          id="visit-staffNote"
          name="staffNote"
          rows={3}
          maxLength={4000}
          defaultValue={visit.staffNote ?? ""}
        />
      </div>

      <SubmitButton pendingLabel={t(locale, "Saving…")}>{t(locale, "Save visit")}</SubmitButton>
    </form>
  );
}
