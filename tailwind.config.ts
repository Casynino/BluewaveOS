import type { Config } from "tailwindcss";

/**
 * The palette is the logo's, sampled from it: the deep-blue arc over the ship,
 * the blue of the containers on deck, the cyan of the wave, and the coral flag.
 * Coral is the accent and is used sparingly — on a screen where every second
 * element is coral, nothing is urgent. (`sun` is the accent's name in the
 * class list; it holds the flag's coral.)
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.25rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          muted: "hsl(var(--brand-muted))",
        },
        signal: {
          DEFAULT: "hsl(var(--signal))",
          foreground: "hsl(var(--signal-foreground))",
        },
        marine: {
          DEFAULT: "hsl(var(--marine))",
          foreground: "hsl(var(--marine-foreground))",
        },
        ink: "hsl(var(--ink))",
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
        },
        /* The public website's own palette — see the BLUEWAVE block at the end of app/globals.css. Blue hour over a
           port: a deep night-ocean for the heavy bands, harbour blue off the
           logo's arc, the wave's cyan for light, and the flag's coral for the
           flow of cargo and the one thing to press. Surfaces are a cool
           concrete grey, the colour of a warehouse floor. */
        bw: {
          night: "#06131F",
          ink: "#0A2236",
          deep: "#0C3350",
          harbour: "#0B5E8E",
          wave: "#2A9AD4",
          cyan: "#40C0E8",
          coral: "#D63C50",
          "coral-bright": "#F0566A",
          "coral-dark": "#B42E41",
          concrete: "#EDF1F4",
          slab: "#DDE4EA",
          slate: "#2B3A4A",
          steel: "#4A5A6A",
          rule: "#C9D3DC",
          /* Semantic tokens that follow the light/dark theme (vars in the
             BLUEWAVE block of globals.css). Page text, muted text, hairlines,
             the page ground and panels. The bands above stay dark in both. */
          fg: "rgb(var(--bw-fg) / <alpha-value>)",
          muted: "rgb(var(--bw-muted) / <alpha-value>)",
          line: "rgb(var(--bw-line) / <alpha-value>)",
          ground: "rgb(var(--bw-ground) / <alpha-value>)",
          panel: "rgb(var(--bw-panel) / <alpha-value>)",
        },
        // Brand, straight off the logo.
        navy: {
          50: "#eef7fc",
          100: "#d5ecf7",
          200: "#acd8ef",
          300: "#76bde3",
          400: "#3f9fd3",
          500: "#1f86c0",
          600: "#0870b0",
          700: "#0b5e8e",
          800: "#0d4c72",
          900: "#0c3a57",
          950: "#072437",
        },
        cyan: {
          400: "#5ccdef",
          500: "#40c0e8",
          600: "#2a9ad4",
        },
        sun: {
          400: "#f06a78",
          500: "#ea4a5c",
          600: "#d03346",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        "bw-display": ["var(--font-bw-display)", "Arial Narrow", "sans-serif"],
        "bw-sans": ["var(--font-bw-sans)", "system-ui", "sans-serif"],
        "bw-mono": ["var(--font-bw-mono)", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "grow-up": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        /* The line sweeping the viewfinder while the camera is reading. It is
           decoration over a live picture; the frame drawn on the picture is
           what tells a clerk where to hold the sticker. */
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.5s ease-out both",
        "grow-up": "grow-up 0.6s cubic-bezier(0.16,1,0.3,1) both",
        "scan-line": "scan-line 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
