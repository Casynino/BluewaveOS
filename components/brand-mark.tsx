import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The company mark, as the company draws it.
 *
 * Ship and "BLUE WAVE CARGO LTD" lettering are both cut from the logo
 * artwork, not re-set in a system font. The artwork's hull and letters are
 * charcoal, drawn for paper, so the dark theme swaps in the light cut — the
 * same drawing with the charcoal in white — rather than putting the ship on a
 * white tile. `size` is the height of the ship.
 */
export function BrandMark({
  className,
  showWordmark = true,
  size = 36,
}: {
  className?: string;
  showWordmark?: boolean;
  size?: number;
}) {
  const markWidth = Math.round((size * 373) / 240);
  const wordHeight = Math.max(10, Math.round(size * 0.36));
  const wordWidth = Math.round((wordHeight * 1061) / 120);
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative shrink-0" style={{ width: markWidth, height: size }}>
        <Image src="/brand/bluewave-mark.png" alt="" width={markWidth} height={size} priority className="dark:hidden" />
        <Image
          src="/brand/bluewave-mark-light.png"
          alt=""
          width={markWidth}
          height={size}
          priority
          className="hidden dark:block"
        />
      </span>
      {showWordmark ? (
        <span className="relative shrink-0" style={{ width: wordWidth, height: wordHeight }}>
          <Image
            src="/brand/bluewave-wordmark.png"
            alt="Blue Wave Cargo Ltd"
            width={wordWidth}
            height={wordHeight}
            priority
            className="dark:hidden"
          />
          <Image
            src="/brand/bluewave-wordmark-light.png"
            alt="Blue Wave Cargo Ltd"
            width={wordWidth}
            height={wordHeight}
            priority
            className="hidden dark:block"
          />
        </span>
      ) : null}
    </span>
  );
}
