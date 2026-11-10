"use client";

import { useEffect } from "react";

import { actionClass, Frame } from "@/components/bw/ui";
import { t } from "@/lib/i18n";

/**
 * A public page that failed to draw. Nothing internal is ever printed here.
 * It opens on the night band like every other page, so the header that floats
 * over it in white stays readable.
 */
export default function SiteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Site error:", error);
  }, [error]);

  return (
    <section role="alert" className="bw-top relative isolate overflow-hidden bg-bw-night text-white">
      <div aria-hidden className="bw-ribs absolute inset-0 -z-10" />
      <Frame className="py-16 sm:py-24">
        <h1 className="bw-display max-w-3xl text-[clamp(2.4rem,6vw,4.8rem)] uppercase">
          {t(null, "Something went wrong")}
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/70">
          {t(null, "Try again in a moment. You can still track cargo and reach us on WhatsApp.")}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className={actionClass("coral")}>
            {t(null, "Try again")}
          </button>
          <a href="/track" className={actionClass("ghost-light")}>
            {t(null, "Track cargo")}
          </a>
          <a href="/" className={actionClass("ghost-light")}>
            {t(null, "Home")}
          </a>
        </div>
      </Frame>
    </section>
  );
}
