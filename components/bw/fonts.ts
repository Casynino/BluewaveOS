import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";

/*
  THE PUBLIC SITE'S TYPE, AND NOWHERE ELSE.

  Barlow Condensed is the voice of a port — the lettering on a crane, a
  container's side, a departures board — and carries every headline. Barlow is
  its reading companion. JetBrains Mono sets what somebody copies or compares:
  references, dates, volumes, money. The staff app keeps its own faces.
*/
export const bwDisplay = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bw-display",
  display: "swap",
});

export const bwSans = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bw-sans",
  display: "swap",
});

export const bwMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-bw-mono",
  display: "swap",
});

export const bwFontVars = `${bwDisplay.variable} ${bwSans.variable} ${bwMono.variable}`;
