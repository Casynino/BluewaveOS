import { worldDots } from "@/components/bw/world-grid";

/* The window onto the world the lane runs through: East Africa to South China. */
const LON = [22, 128];
const LAT = [36, -18];
const K = 10;

const X = (lon: number) => (lon - LON[0]) * K;
const Y = (lat: number) => (LAT[0] - lat) * K;

/*
  The lane as a ship sails it, not as a crow flies: down the Pearl River,
  across the South China Sea, through the Malacca Strait, south of Sri Lanka
  and across the Indian Ocean to Dar es Salaam.
*/
const LANE: [number, number][] = [
  [113.1, 23.0], // Foshan
  [113.7, 22.2],
  [112.0, 16.0],
  [108.0, 9.0],
  [104.2, 1.6], // Singapore
  [99.5, 4.5], // Malacca Strait
  [94.0, 6.3],
  [81.0, 5.2], // south of Sri Lanka
  [66.0, 1.0],
  [52.0, -3.8],
  [39.3, -6.8], // Dar es Salaam
];

/* Catmull–Rom through the points, as cubic Béziers: a smooth line that still
   passes exactly through every waypoint. */
function smooth(points: [number, number][]) {
  const p = points.map(([lon, lat]) => [X(lon), Y(lat)] as const);
  let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const LANE_PATH = smooth(LANE);

/**
 * THE LANE ON A PIXEL MAP.
 *
 * Land drawn as square pixels, the two ends marked in coral, and the route
 * drawn in once and then sailed by a single marker. Static SVG on the server;
 * the only motion is CSS and one SMIL path, both stilled for anyone who has
 * asked their device for less motion.
 */
export function WorldRoute({ className }: { className?: string }) {
  const dots = worldDots().filter(
    ([lon, lat]) => lon >= LON[0] && lon <= LON[1] && lat <= LAT[0] && lat >= LAT[1]
  );
  const width = (LON[1] - LON[0]) * K;
  const height = (LAT[0] - LAT[1]) * K;
  const [fx, fy] = [X(113.1), Y(23.0)];
  const [dx, dy] = [X(39.3), Y(-6.8)];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="Sea route from Foshan, China, through the Malacca Strait to Dar es Salaam, Tanzania"
    >
      <g fill="rgb(255 255 255 / 0.2)">
        {dots.map(([lon, lat]) => (
          <rect key={`${lon}:${lat}`} x={X(lon) - 7} y={Y(lat) - 7} width={14} height={14} />
        ))}
      </g>

      <path d={LANE_PATH} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth={10} strokeLinecap="round" />
      <path
        d={LANE_PATH}
        pathLength={1}
        fill="none"
        stroke="#F0566A"
        strokeWidth={4.5}
        strokeLinecap="round"
        className="bw-draw"
      />

      <circle r={9} fill="#fff">
        <animateMotion dur="9s" repeatCount="indefinite" path={LANE_PATH} rotate="auto" />
      </circle>

      {[
        [fx, fy, "FOSHAN · CN", "end"],
        [dx, dy, "DAR ES SALAAM · TZ", "start"],
      ].map(([x, y, label, anchor]) => (
        <g key={label as string}>
          <rect x={(x as number) - 11} y={(y as number) - 11} width={22} height={22} fill="#D63C50" className="bw-ping" />
          <rect x={(x as number) - 11} y={(y as number) - 11} width={22} height={22} fill="#D63C50" stroke="#fff" strokeWidth={3} />
          <text
            x={(x as number) + (anchor === "end" ? -24 : 24)}
            y={(y as number) + 8}
            textAnchor={anchor as "start" | "end"}
            fill="#fff"
            fontSize={26}
            letterSpacing={3}
            style={{ fontFamily: "var(--font-bw-mono)" }}
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}
