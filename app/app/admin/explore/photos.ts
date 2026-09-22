import "server-only";

import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * The pictures already shipped with the website, as the paths a guide field
 * takes. Read from disk on each request so a photo added to public/photos is
 * offered without anybody updating a list.
 */
export async function libraryPhotos(): Promise<string[]> {
  try {
    const files = await readdir(path.join(process.cwd(), "public", "photos"));
    return files
      .filter((f) => /^[\w.-]+\.(jpe?g|png|webp)$/i.test(f))
      .sort()
      .map((f) => `/photos/${f}`);
  } catch {
    return [];
  }
}
