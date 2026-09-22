"use client";

import Link from "next/link";

import {
  usePublicSubmit,
  VsCheck,
  VsChecks,
  VsError,
  VsField,
  VsGroupTitle,
  VsSection,
  VsSections,
  VsSent,
  VsSubmit,
  VsTrap,
  type VsOption,
} from "@/components/bw/vs-form-kit";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitVisitRequest } from "@/lib/actions/visits";
import { darDateInput } from "@/lib/dar-time";

export const VISIT_LANGUAGES = ["English", "Swahili", "Chinese interpreter", "Other"] as const;

export type VisitFormProps = {
  cities: VsOption[];
  marketGroups: { city: string; markets: VsOption[] }[];
  factories: VsOption[];
  categories: VsOption[];
  /** Names, as the action stores them — already resolved from the slugs in the address. */
  selected: { cities: string[]; markets: string[]; factories: string[]; categories: string[] };
};

/**
 * THE BUSINESS-VISIT REQUEST.
 *
 * Every choice is posted by name (the action keeps what the visitor picked as
 * it read when they picked it). Hotel and transport are asked for, not
 * promised: the team says what can be arranged when it calls.
 */
export function VisitForm({ cities, marketGroups, factories, categories, selected }: VisitFormProps) {
  const { state, pending, onSubmit } = usePublicSubmit(submitVisitRequest);
  /* The floor on the travel dates, read now rather than when the module
     loaded; the server refuses a past date anyway. */
  const today = darDateInput();

  if (state.ok) {
    return (
      <VsSent state={state} kind="visit">
        <p className="mt-6 text-sm text-bw-muted">
          While you wait, look through the{" "}
          <Link href="/markets" className="font-medium text-bw-fg underline underline-offset-4 hover:text-bw-coral">
            markets guide
          </Link>{" "}
          or read how we{" "}
          <Link href="/sourcing" className="font-medium text-bw-fg underline underline-offset-4 hover:text-bw-coral">
            source and ship
          </Link>{" "}
          what you buy.
        </p>
      </VsSent>
    );
  }

  const marketCount = marketGroups.reduce((n, g) => n + g.markets.length, 0);

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-8">
        <VsSections>
          <VsSection index="01" title="Who is travelling">
            <div className="grid gap-4 sm:grid-cols-2">
              <VsField id="v-contactName" label="Your name">
                <Input id="v-contactName" name="contactName" required minLength={2} maxLength={120} autoComplete="name" />
              </VsField>
              <VsField id="v-contactPhone" label="Phone" hint="With the country code if outside Tanzania.">
                <Input
                  id="v-contactPhone"
                  name="contactPhone"
                  type="tel"
                  inputMode="tel"
                  required
                  maxLength={40}
                  autoComplete="tel"
                  placeholder="+255 …"
                />
              </VsField>
              <VsField id="v-whatsapp" label="WhatsApp" optional hint="If it is a different number.">
                <Input id="v-whatsapp" name="whatsapp" type="tel" inputMode="tel" maxLength={40} />
              </VsField>
              <VsField id="v-contactEmail" label="Email" optional>
                <Input id="v-contactEmail" name="contactEmail" type="email" maxLength={200} autoComplete="email" />
              </VsField>
              <VsField id="v-travelers" label="Number of travellers">
                <Input
                  id="v-travelers"
                  name="travelers"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={50}
                  step={1}
                  defaultValue={1}
                  required
                />
              </VsField>
              <VsField id="v-language" label="Language support" optional>
                <NativeSelect id="v-language" name="language" defaultValue="">
                  <option value="">No preference</option>
                  {VISIT_LANGUAGES.map((language) => (
                    <option key={language} value={language}>
                      {language}
                    </option>
                  ))}
                </NativeSelect>
              </VsField>
            </div>
          </VsSection>

          <VsSection index="02" title="When" lead="Roughly is fine. Market halls keep their own holidays, and the team will tell you if your dates fall on one.">
            <div className="grid gap-4 sm:grid-cols-2">
              <VsField id="v-travelFrom" label="Arriving in China">
                <Input id="v-travelFrom" name="travelFrom" type="date" min={today} max="2099-12-31" />
              </VsField>
              <VsField id="v-travelTo" label="Leaving China" optional>
                <Input id="v-travelTo" name="travelTo" type="date" min={today} max="2099-12-31" />
              </VsField>
            </div>
            <VsCheck name="flexibleDates" label="My dates are flexible" sub="Tick this if you have not fixed your dates yet — the team will suggest some." className="sm:max-w-md" />
          </VsSection>

          <VsSection
            index="03"
            title="Where you want to go"
            lead="Pick what you know. If you only know what you want to buy, pick the product below and leave the rest to us."
          >
            {cities.length ? (
              <div className="space-y-3">
                <VsGroupTitle count={cities.length}>Cities</VsGroupTitle>
                <VsChecks name="cities" options={cities} selected={selected.cities} />
              </div>
            ) : null}

            {marketCount ? (
              <div className="space-y-5">
                <VsGroupTitle count={marketCount}>Markets</VsGroupTitle>
                {marketGroups.map((group) => (
                  <div key={group.city} className="space-y-2">
                    <p className="font-bw-display text-lg font-semibold uppercase leading-none text-bw-fg">{group.city}</p>
                    <VsChecks name="markets" options={group.markets} selected={selected.markets} />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              <VsGroupTitle count={factories.length || undefined}>Factories</VsGroupTitle>
              {factories.length ? (
                <VsChecks name="factories" options={factories} selected={selected.factories} />
              ) : (
                <p className="rounded-[2px] border border-dashed border-bw-line px-4 py-3 text-sm text-bw-muted">
                  Factory listings are being added. Want to see a factory? Say what it makes in the notes below and the
                  team will look for one.
                </p>
              )}
            </div>
          </VsSection>

          <VsSection index="04" title="What you want to buy">
            {categories.length ? (
              <VsChecks name="categories" options={categories} selected={selected.categories} />
            ) : (
              <p className="text-sm text-bw-muted">Tell us in the notes below.</p>
            )}
          </VsSection>

          <VsSection
            index="05"
            title="Help on the ground"
            lead="Tell us what you would like help with, and the team will say what can be arranged when they call. Ticking a box is a request, not a reservation."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <VsCheck name="wantsHotelHelp" label="I'd like help with a hotel" sub="Near the markets you plan to visit." />
              <VsCheck name="wantsTransportHelp" label="I'd like help with local transport" sub="Between markets, factories and your hotel." />
            </div>
            <VsField id="v-notes" label="Anything else" optional hint="Products you are after, budgets, a supplier you already know, a factory you want to see.">
              <Textarea id="v-notes" name="notes" rows={4} maxLength={2000} />
            </VsField>
          </VsSection>
        </VsSections>

        <VsTrap />

        <div className="space-y-4 border-t border-bw-line pt-6">
          <VsError message={state.error} />
          <p className="text-xs text-bw-muted">
            This sends a request. Nothing is booked, and nobody is charged, until the team has spoken to you and the
            status page says Confirmed.
          </p>
          <VsSubmit pending={pending}>Send visit request</VsSubmit>
        </div>
      </form>
    </div>
  );
}
