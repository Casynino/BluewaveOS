"use client";

import { useEffect, useRef } from "react";

/**
 * THE NIGHT BEHIND THE PUBLIC SITE.
 *
 * One fixed canvas under every section, which are laid over it translucent: a
 * still field of faint stars in the dark theme, nothing in the light one. It is
 * drawn once, and again only when the window is resized or the theme changes —
 * nothing on it moves, glows or follows the pointer (owner, 10 Nov 2026). The
 * life on the site belongs to the photographs, the boards and the drawings.
 */
export function BwSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    /* Placed once, as fractions of the window, so a phone's address bar
       sliding away resizes the field rather than reshuffling it. */
    const area = (window.innerWidth * window.innerHeight) / 10000;
    const stars = Array.from({ length: Math.round(area * (window.innerWidth < 640 ? 1 : 1.5)) }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.2,
      a: 0.12 + Math.random() * 0.4,
    }));

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!document.documentElement.classList.contains("dark")) return;
      for (const star of stars) {
        ctx.fillStyle = `rgba(214,238,250,${star.a})`;
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();

    /* The theme toggle flips the class on <html>; the stars follow it. */
    const theme = new MutationObserver(draw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", draw);
    return () => {
      theme.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
