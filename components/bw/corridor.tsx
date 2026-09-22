import { COS, iso, Platform, StationObject, type StationKind } from "@/components/bw/iso";
import { cn } from "@/lib/utils";

export type Station = { kind: StationKind; place: string; title: string; body: string };

/** The lane, supplier to customer, in the order cargo actually moves. */
export function corridorStations(transitDays: number): Station[] {
  return [
    { kind: "supplier", place: "China", title: "Your supplier", body: "Delivers to our warehouse, or we collect from the factory." },
    { kind: "warehouse", place: "Foshan", title: "BlueWave warehouse", body: "Counted, weighed, measured and photographed. Every package gets its own reference and QR." },
    { kind: "loading", place: "Foshan", title: "Container loading", body: "Loose cargo shares a container; each consignment stays traceable on its own." },
    { kind: "sea", place: "Indian Ocean", title: "At sea", body: `About ${transitDays} days from departure to Dar es Salaam.` },
    { kind: "port", place: "Dar es Salaam", title: "Arrival", body: "Container discharged; your cargo is counted again against the China figures." },
    { kind: "clearance", place: "Dar es Salaam", title: "Clearance", body: "Customs handled through arrival, then into our warehouse." },
    { kind: "customer", place: "Kariakoo", title: "You collect", body: "Pay the invoice, receive your pickup note, collect with your ID." },
  ];
}

const S = 100;
const STEP = 2.9;
const LIFT = 0.6;

/* Station i on the floor grid: a zig-zag that reads left to right on screen. */
function grid(i: number): [number, number] {
  const lift = i % 2 ? LIFT : 0;
  return [i * (STEP / 2) + lift, -i * (STEP / 2) + lift];
}

/**
 * THE CORRIDOR, DRAWN.
 *
 * Seven platforms on a concrete floor, each with what happens there standing
 * on it, joined by the lane — a coral line with cargo flowing along it. Wide
 * screens get the isometric floor; a phone gets the same platforms stacked,
 * which is how a list of steps is read with a thumb.
 */
export function Corridor({ stations, dark = false }: { stations: Station[]; dark?: boolean }) {
  const [minX, maxX] = [-1.1 * COS * S, (stations.length - 1) * STEP * COS * S + 1.2 * COS * S];
  const width = maxX - minX;
  const top = -1.5 * S;
  const height = 3.95 * S;

  const centre = (i: number) => {
    const [gx, gy] = grid(i);
    return iso(gx + 0.5, gy + 0.5, 0, S);
  };

  return (
    <>
      <div className="hidden lg:block">
        <svg
          viewBox={`${minX} ${top} ${width} ${height}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label="The route from your supplier in China to collection in Dar es Salaam"
        >
          {/* The lane, beneath the platforms. */}
          {stations.slice(0, -1).map((_, i) => {
            const [gx, gy] = grid(i);
            const [nx, ny] = grid(i + 1);
            const a = iso(gx + 0.5, gy + 0.5, 0, S);
            const bend = iso(nx + 0.5, gy + 0.5, 0, S);
            const b = iso(nx + 0.5, ny + 0.5, 0, S);
            const d = `M${a[0]},${a[1]} L${bend[0]},${bend[1]} L${b[0]},${b[1]}`;
            return (
              <g key={i} fill="none" strokeLinecap="round" strokeLinejoin="round">
                <path d={d} className={dark ? "stroke-white/10" : "stroke-bw-line"} strokeWidth={14} />
                <path d={d} className="bw-flow" stroke="#D63C50" strokeWidth={4} />
              </g>
            );
          })}

          {stations.map((station, i) => {
            const [gx, gy] = grid(i);
            const [ox, oy] = iso(gx, gy, 0, S);
            const [cx, cy] = centre(i);
            const above = i % 2 === 1;
            return (
              <g key={station.title}>
                <Platform ox={ox} oy={oy} scale={S} />
                <StationObject kind={station.kind} ox={ox} oy={oy} scale={S} />
                <g transform={`translate(${cx} ${above ? cy - 1.28 * S : cy + 0.95 * S})`}>
                  <text
                    textAnchor="middle"
                    fontSize={15}
                    letterSpacing={2.4}
                    fill="currentColor"
                    className={cn("bw-mono", dark ? "text-white/60" : "text-bw-muted")}
                  >
                    {String(i + 1).padStart(2, "0")} · {station.place.toUpperCase()}
                  </text>
                  <text
                    y={30}
                    textAnchor="middle"
                    fontSize={28}
                    fontWeight={600}
                    style={{ fontFamily: "var(--font-bw-display)" }}
                    fill="currentColor"
                    className={dark ? "text-white" : "text-bw-fg"}
                  >
                    {station.title.toUpperCase()}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
        <ol className="mt-6 grid grid-cols-7 gap-4">
          {stations.map((station) => (
            <li key={station.title} className={cn("text-sm leading-snug", dark ? "text-white/65" : "text-bw-muted")}>
              {station.body}
            </li>
          ))}
        </ol>
      </div>

      <ol className="relative grid gap-0 lg:hidden">
        {stations.map((station, i) => (
          <li key={station.title} className="relative flex gap-4 pb-8 last:pb-0">
            {i < stations.length - 1 ? (
              <span aria-hidden className="absolute bottom-0 left-[39px] top-[64px] w-[3px] bg-bw-coral/80" />
            ) : null}
            <svg viewBox="-85 -140 170 225" className="h-24 w-20 shrink-0 overflow-visible" aria-hidden>
              <Platform scale={80} ox={0} oy={-40} />
              <StationObject kind={station.kind} scale={80} ox={0} oy={-40} />
            </svg>
            <div className="min-w-0 pt-2">
              <p className={cn("bw-mono text-[0.68rem] uppercase tracking-[0.16em]", dark ? "text-bw-cyan" : "text-bw-harbour")}>
                {String(i + 1).padStart(2, "0")} · {station.place}
              </p>
              <p className={cn("mt-1 font-bw-display text-2xl font-semibold uppercase", dark ? "text-white" : "text-bw-fg")}>
                {station.title}
              </p>
              <p className={cn("mt-1 leading-relaxed", dark ? "text-white/65" : "text-bw-muted")}>{station.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
