import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * BLUEWAVE, AS THE COMPANY DRAWS IT.
 *
 * The ship and the "BLUE WAVE CARGO LTD" lettering are both cut from the
 * company's own logo artwork — never re-set in a website font — and laid side
 * by side so the mark fits a header. On a dark band both switch to the light
 * cut: the charcoal hull and letters are redrawn in white, the blues and the
 * coral flag stay as they are.
 */
export function Lockup({ dark = false, className }: { dark?: boolean; className?: string }) {
  /* `dark`: always on a dark band. Otherwise it follows the page's theme. */
  const cut = (light: boolean) => (
    <span className={cn("items-center gap-2.5 sm:gap-3", light ? (dark ? "inline-flex" : "hidden dark:inline-flex") : "inline-flex dark:hidden")}>
      <Image
        src={light ? "/brand/bluewave-mark-light.png" : "/brand/bluewave-mark.png"}
        alt=""
        width={373}
        height={240}
        priority
        className="h-9 w-auto sm:h-11 lg:h-12"
      />
      <Image
        src={light ? "/brand/bluewave-wordmark-light.png" : "/brand/bluewave-wordmark.png"}
        alt="Blue Wave Cargo Ltd"
        width={1061}
        height={120}
        priority
        className="h-[13px] w-auto sm:h-[17px] lg:h-[19px]"
      />
    </span>
  );
  return <span className={cn("inline-flex", className)}>{dark ? cut(true) : <>{cut(false)}{cut(true)}</>}</span>;
}
