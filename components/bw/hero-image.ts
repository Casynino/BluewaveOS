import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";

import type { StaticImageData } from "next/image";

import { PHOTOS } from "@/components/site/photos";

/**
 * The home page's opening picture.
 *
 * The company's own China → Tanzania artwork when it has been put in
 * public/photos/ under one of these names; a container ship under way until then.
 */
const OWN = ["bluewave-corridor.jpg", "bluewave-corridor.png", "bluewave-corridor.webp"];

export function heroImage(): { src: string | StaticImageData; alt: string; own: boolean } {
  for (const name of OWN) {
    if (existsSync(path.join(process.cwd(), "public", "photos", name))) {
      return {
        src: `/photos/${name}`,
        alt: "A container ship carrying Tanzania's colours on the sea route from China to Tanzania",
        own: true,
      };
    }
  }
  return { src: PHOTOS.shipWake.src, alt: PHOTOS.shipWake.alt, own: false };
}
