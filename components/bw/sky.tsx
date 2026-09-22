"use client";

import { useEffect, useRef } from "react";

/**
 * THE NIGHT BEHIND THE PUBLIC SITE.
 *
 * One fixed canvas under every section, which are laid over it translucent:
 * stars that twinkle, and a slow drift of points joined by fine cyan lines when
 * they pass close — trade lanes forming and letting go. The pointer draws coral
 * lines to the points near it. A cyan and a coral glow sit behind it in CSS.
 *
 * In the light theme the stars go and the lanes are drawn faintly in harbour
 * blue. It pauses when the tab is hidden, draws one still frame under
 * prefers-reduced-motion, and thins out on small screens so a phone on mobile
 * data is not asked to draw a hundred lines a frame.
 */
export function BwSky() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let stars: { x: number; y: number; r: number; p: number; s: number }[] = [];
    let nodes: { x: number; y: number; vx: number; vy: number; hot: boolean }[] = [];
    const pointer = { x: -9999, y: -9999 };

    const seed = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const area = (w * h) / 10000;
      const small = w < 640;
      stars = Array.from({ length: Math.round(area * (small ? 1 : 1.5)) }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.1 + 0.2,
        p: Math.random() * Math.PI * 2,
        s: 0.5 + Math.random() * 1.5,
      }));
      nodes = Array.from({ length: Math.min(small ? 36 : 85, Math.round(area * 0.5)) }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        /* One point in nine burns coral — the cargo moving through the lanes. */
        hot: i % 9 === 0,
      }));
    };

    const draw = (now: number) => {
      const dark = document.documentElement.classList.contains("dark");
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);

      if (dark) {
        for (const star of stars) {
          const a = 0.3 + 0.45 * Math.sin(t * star.s + star.p);
          ctx.fillStyle = `rgba(214,238,250,${Math.max(0.05, a)})`;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const line = dark ? "64,192,232" : "11,94,142";
      const reach = Math.min(160, Math.max(110, w / 10));
      if (!still) {
        for (const n of nodes) {
          const dx = pointer.x - n.x;
          const dy = pointer.y - n.y;
          const d = Math.hypot(dx, dy);
          if (d < 220 && d > 1) {
            n.vx += (dx / d) * 0.01;
            n.vy += (dy / d) * 0.01;
          }
          n.vx *= 0.99;
          n.vy *= 0.99;
          if (Math.hypot(n.vx, n.vy) < 0.08) {
            n.vx += (Math.random() - 0.5) * 0.04;
            n.vy += (Math.random() - 0.5) * 0.04;
          }
          n.x += n.vx;
          n.y += n.vy;
          if (n.x < -20) n.x = w + 20;
          if (n.x > w + 20) n.x = -20;
          if (n.y < -20) n.y = h + 20;
          if (n.y > h + 20) n.y = -20;
        }
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < reach) {
            ctx.strokeStyle = `rgba(${line},${(1 - d / reach) * (dark ? 0.32 : 0.14)})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        const dp = Math.hypot(a.x - pointer.x, a.y - pointer.y);
        if (dp < 200) {
          ctx.strokeStyle = `rgba(240,86,106,${(1 - dp / 200) * 0.5})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
        if (a.hot) {
          ctx.fillStyle = `rgba(240,86,106,${0.25 + 0.2 * Math.sin(t * 1.4 + i)})`;
          ctx.beginPath();
          ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = a.hot ? "rgba(240,86,106,0.9)" : `rgba(${dark ? "150,220,245" : line},${dark ? 0.75 : 0.3})`;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.hot ? 2 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    let frame = 0;
    const loop = (now: number) => {
      draw(now);
      if (!still && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };

    seed();
    draw(performance.now());
    start();

    const onResize = () => {
      seed();
      draw(performance.now());
    };
    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };
    const onVisible = () => !document.hidden && start();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="bw-glow absolute -left-[20%] top-[5%] size-[70vmax] rounded-full bg-[radial-gradient(circle,rgb(64_192_232/0.14),transparent_60%)]" />
      <div className="bw-glow absolute -right-[25%] bottom-[-10%] size-[75vmax] rounded-full bg-[radial-gradient(circle,rgb(214_60_80/0.10),transparent_60%)] [animation-delay:-12s]" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
