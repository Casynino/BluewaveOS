import { cn } from "@/lib/utils";

/** A round number to draw the top of the axis at, so ticks land on whole values. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s * 4 >= value) ?? magnitude * 10;
  return Math.ceil(value / step) * step;
}

export type BarDatum = { label: string; parts: { key: string; value: number }[] };

/**
 * Bars you can read exact numbers off: a faint grid, ticks on whole values, one
 * stack per day. Hovering a bar says what it is made of.
 */
export function StackedBars({
  data,
  colors,
  height = 180,
}: {
  data: BarDatum[];
  colors: Record<string, string>;
  height?: number;
}) {
  const totals = data.map((d) => d.parts.reduce((s, p) => s + p.value, 0));
  const top = niceMax(Math.max(1, ...totals));
  const ticks = [top, (top * 3) / 4, top / 2, top / 4, 0].map((t) => Math.round(t * 10) / 10);
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between pb-6 text-right text-[10px] text-muted-foreground tnum" style={{ height: height + 24 }}>
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative flex items-end gap-1" style={{ height }}>
          {ticks.map((t, i) => (
            <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ bottom: `${(i / 4) * 100}%`, transform: "translateY(1px)" }} />
          ))}
          {data.map((d, i) => {
            const total = totals[i];
            return (
              <div
                key={d.label}
                className="relative flex h-full flex-1 flex-col justify-end"
                title={`${d.label}: ${total}${d.parts.filter((p) => p.value).map((p) => ` · ${p.key} ${p.value}`).join("")}`}
              >
                <div className="flex flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: `${(total / top) * 100}%` }}>
                  {d.parts.filter((p) => p.value > 0).map((p) => (
                    <div key={p.key} className={colors[p.key]} style={{ height: `${(p.value / total) * 100}%` }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 text-[10px] text-muted-foreground">
          {data.map((d, i) => (
            <span key={d.label} className="flex-1 truncate text-center">
              {i % 2 === (data.length - 1) % 2 ? d.label : ""}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Legend({ colors }: { colors: Record<string, string> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {Object.entries(colors).map(([key, cls]) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2.5 rounded-full", cls)} />
          {key}
        </span>
      ))}
    </div>
  );
}

/** A ranked list: the name, a bar to scale, and the number. */
export function RankedBars({ rows, tone = "bg-brand" }: { rows: { name: string; count: number }[]; tone?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="tnum text-muted-foreground">{r.count}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div className={cn("h-full rounded-full", tone)} style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The health ring: a score out of 100, drawn as an arc. */
export function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const tone = score >= 85 ? "stroke-success" : score >= 60 ? "stroke-warning" : "stroke-destructive";
  return (
    <div className="relative size-32 shrink-0">
      <svg viewBox="0 0 128 128" className="size-full -rotate-90">
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="9" className="stroke-secondary" />
        <circle cx="64" cy="64" r={r} fill="none" strokeWidth="9" strokeLinecap="round" className={tone} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-bold leading-none tnum">{score}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">out of 100</p>
        </div>
      </div>
    </div>
  );
}

/** A tiny trend line with a soft fill. Server-drawn, no library; stretches to the width it is given. */
export function Sparkline({
  id,
  values,
  color = "#ffffff",
  width = 240,
  height = 32,
  className,
}: {
  /** Unique per page — names the fill gradient. */
  id: string;
  values: number[];
  color?: string;
  /** Drawing width; the picture stretches to fill whatever space it is given. */
  width?: number;
  height?: number;
  className?: string;
}) {
  const pad = 3;
  const n = values.length;
  const max = Math.max(...values, 1);
  const x = (i: number) => (n <= 1 ? width / 2 : pad + (i / (n - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1] ?? [0, height];
  const flat = values.every((v) => v === 0);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className={className}>
      {flat ? (
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke={color} strokeOpacity={0.35} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${last[0]} ${height} L${pts[0][0]} ${height} Z`} fill={`url(#${id})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

/** A handful of small bars, one per value (used for the database timings). */
export function MiniBars({
  values,
  colors,
  floor = 1,
  width = 240,
  height = 32,
  className,
}: {
  values: number[];
  colors: string[];
  /** The scale never goes below this, so a set of tiny values reads as small, not as full bars. */
  floor?: number;
  width?: number;
  height?: number;
  className?: string;
}) {
  const n = Math.max(values.length, 1);
  const gap = 12;
  const bw = (width - gap * (n - 1)) / n;
  const max = Math.max(...values, floor);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className={className}>
      {values.map((v, i) => {
        const h = Math.max(3, (v / max) * (height - 2));
        return <rect key={i} x={i * (bw + gap)} y={height - h} width={bw} height={h} rx={2} fill={colors[i] ?? colors[0]} />;
      })}
    </svg>
  );
}

