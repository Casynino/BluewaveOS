"use client";

import { useActionState } from "react";

import { Check, Panel } from "@/components/app/explore-fields";
import { useT } from "@/components/app/locale-provider";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { saveChinaOffer, type ContentState } from "@/lib/actions/explore-content";
import { SOURCING_SERVICES, type SourcingServiceKey } from "@/lib/china-content";

/**
 * What the public site offers on the China side.
 *
 * Each box is a promise made to a stranger: a ticked service gets its own
 * option on the sourcing form, and the visit form exists only while visits are
 * on. Nothing is ticked here that the team cannot actually do next week.
 */
export function ExploreOfferForm({
  sourcingServices,
  visitsEnabled,
}: {
  sourcingServices: string[];
  visitsEnabled: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<ContentState, FormData>(saveChinaOffer, {});
  const offered = new Set(sourcingServices);

  return (
    <form action={action}>
      <Panel
        title="What the website offers"
        hint="Visitors can only ask for what is ticked here. Changes show on the website at once."
      >
        <p className="mb-4 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-muted-foreground">
          {t("Tick only the services BlueWave really provides today. A ticked service is a promise to a customer.")}
        </p>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-xs font-medium">{t("Sourcing services")}</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.keys(SOURCING_SERVICES) as SourcingServiceKey[]).map((key) => (
              <Check
                key={key}
                name="sourcingServices"
                value={key}
                label={SOURCING_SERVICES[key].label}
                hint={SOURCING_SERVICES[key].blurb}
                defaultChecked={offered.has(key)}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-5 border-t pt-4">
          <Check
            name="visitsEnabled"
            label="Take business-visit requests on the website"
            hint="When off, the visit form is hidden and visitors are asked to contact us instead."
            defaultChecked={visitsEnabled}
          />
        </div>

        <div className="mt-5 space-y-3">
          <FormMessage error={state.error} ok={state.ok} />
          <SubmitButton pendingLabel={t("Saving…")}>{t("Save what the website offers")}</SubmitButton>
        </div>
      </Panel>
    </form>
  );
}
