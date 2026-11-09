"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

/**
 * The colour a phone paints its own bars with (the browser's top bar, Android's
 * status bar), kept equal to the page behind them so BlueWave reads as one full
 * screen rather than a page boxed inside a browser.
 *
 * Inside the app and the portal it follows the light/dark the person chose in
 * BlueWave, not only the phone's setting: a white browser bar over the night
 * look is exactly the "forced" look that makes a website feel like a website.
 * The sign-in scene and the public website always open on the night sea, so
 * their bar is always that navy. Keep these in step with globals.css.
 */
export const BAR_COLOR = {
  light: "#f5f7fa", // --surface-2, the app's ground by day
  dark: "#181d2a", // --surface-2 at night
  scene: "#06142b", // the sign-in scene
  site: "#06131f", // the website's opening band and the register page (bw-night)
  verify: "#0a3350", // the pickup-note check page, navy in both looks
  nino: "#06142b", // the developer's page, in the sign-in scene's navy
} as const;

function colourFor(pathname: string, theme: string | undefined) {
  if (pathname.startsWith("/login")) return BAR_COLOR.scene;
  if (pathname.startsWith("/v/")) return BAR_COLOR.verify;
  if (pathname.startsWith("/nino")) return BAR_COLOR.nino;
  const inApp = pathname.startsWith("/app") || pathname.startsWith("/portal") || pathname.startsWith("/t/");
  if (!inApp) return BAR_COLOR.site;
  return theme === "dark" ? BAR_COLOR.dark : BAR_COLOR.light;
}

export function ThemeColor() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname() ?? "/";
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = colourFor(pathname, resolvedTheme);
    const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    if (metas.length) {
      metas.forEach((m) => {
        m.content = color;
        m.removeAttribute("media");
      });
    } else {
      const m = document.createElement("meta");
      m.name = "theme-color";
      m.content = color;
      document.head.appendChild(m);
    }
  }, [resolvedTheme, pathname]);
  return null;
}
