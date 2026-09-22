/*
  ISOMETRIC DRAWING, BY HAND.

  The corridor and the container on the public site are drawn from boxes: every
  object is a few cuboids projected at 30°. No 3D library and no image files —
  a few hundred bytes of SVG each, sharp at any size, and it renders on the
  server like the rest of the page.
*/

export const COS = Math.cos(Math.PI / 6);
export const SIN = 0.5;

/** Grid units (x, y on the floor, z up) to screen units. */
export function iso(x: number, y: number, z = 0, scale = 100): [number, number] {
  return [(x - y) * COS * scale, (x + y) * SIN * scale - z * scale];
}

const pts = (list: [number, number][]) => list.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");

export type Faces = { top: string; left: string; right: string; stroke?: string };

/**
 * One box. `x, y, z` is its floor corner nearest the viewer's left; `w` runs
 * along x, `d` along y, `h` up. Drawn right face, left face, top — the order
 * that needs no depth sort for a single box.
 */
export function Cuboid({
  x,
  y,
  z = 0,
  w,
  d,
  h,
  faces,
  scale = 100,
  ox = 0,
  oy = 0,
}: {
  x: number;
  y: number;
  z?: number;
  w: number;
  d: number;
  h: number;
  faces: Faces;
  scale?: number;
  ox?: number;
  oy?: number;
}) {
  const p = (a: number, b: number, c: number): [number, number] => {
    const [sx, sy] = iso(a, b, c, scale);
    return [sx + ox, sy + oy];
  };
  const top = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const left = [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const right = [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)];
  const stroke = faces.stroke ?? "rgb(6 19 31 / 0.18)";
  return (
    <g strokeWidth={0.8} stroke={stroke} strokeLinejoin="round">
      <polygon points={pts(right)} fill={faces.right} />
      <polygon points={pts(left)} fill={faces.left} />
      <polygon points={pts(top)} fill={faces.top} />
    </g>
  );
}

/* Shades for the palette: top lightest, left mid, right darkest. */
export const SHADE = {
  slate: { top: "#3A4B5D", left: "#26333F", right: "#1B252F" },
  slab: { top: "#F7F9FB", left: "#D8E0E7", right: "#C3CDD6" },
  carton: { top: "#E8CFA4", left: "#CFAE78", right: "#B8955F" },
  coral: { top: "#F26A7C", left: "#D63C50", right: "#B42E41" },
  harbour: { top: "#2A83BA", left: "#0B5E8E", right: "#084A70" },
  cyan: { top: "#7AD6F2", left: "#40C0E8", right: "#2A9AD4" },
  steel: { top: "#9AAAB8", left: "#6E7F8E", right: "#56687A" },
  hull: { top: "#4A5663", left: "#2F3944", right: "#232B34" },
  white: { top: "#FFFFFF", left: "#E6ECF1", right: "#D1DAE2" },
} satisfies Record<string, Faces>;

export type StationKind = "supplier" | "warehouse" | "loading" | "sea" | "port" | "clearance" | "customer";

/**
 * The object standing on a station's platform, centred on a 1×1 floor tile
 * whose near corner is (0, 0). Kept inside the tile so neighbours never touch.
 */
export function StationObject({ kind, scale = 100, ox = 0, oy = 0 }: { kind: StationKind; scale?: number; ox?: number; oy?: number }) {
  const c = { scale, ox, oy };
  switch (kind) {
    case "supplier":
      return (
        <g>
          <Cuboid {...c} x={0.18} y={0.45} w={0.34} d={0.34} h={0.3} faces={SHADE.carton} />
          <Cuboid {...c} x={0.55} y={0.45} w={0.3} d={0.3} h={0.26} faces={SHADE.carton} />
          <Cuboid {...c} x={0.2} y={0.1} w={0.36} d={0.3} h={0.32} faces={SHADE.carton} />
          <Cuboid {...c} x={0.22} y={0.47} z={0.3} w={0.28} d={0.28} h={0.24} faces={SHADE.carton} />
        </g>
      );
    case "warehouse":
      return (
        <g>
          <Cuboid {...c} x={0.1} y={0.15} w={0.8} d={0.7} h={0.42} faces={SHADE.white} />
          <Cuboid {...c} x={0.1} y={0.15} z={0.42} w={0.8} d={0.7} h={0.05} faces={SHADE.steel} />
          <Cuboid {...c} x={0.3} y={0.85} w={0.32} d={0.02} h={0.28} faces={SHADE.coral} />
        </g>
      );
    case "loading":
      return (
        <g>
          <Cuboid {...c} x={0.08} y={0.28} w={0.84} d={0.36} h={0.36} faces={SHADE.harbour} />
          <Cuboid {...c} x={0.08} y={0.28} z={0.36} w={0.84} d={0.36} h={0.36} faces={SHADE.coral} />
        </g>
      );
    case "sea":
      return (
        <g>
          <Cuboid {...c} x={0.0} y={0.3} w={1.0} d={0.42} h={0.18} faces={SHADE.hull} />
          <Cuboid {...c} x={0.1} y={0.34} z={0.18} w={0.26} d={0.34} h={0.2} faces={SHADE.coral} />
          <Cuboid {...c} x={0.38} y={0.34} z={0.18} w={0.26} d={0.34} h={0.2} faces={SHADE.harbour} />
          <Cuboid {...c} x={0.66} y={0.34} z={0.18} w={0.14} d={0.34} h={0.34} faces={SHADE.white} />
          <Cuboid {...c} x={0.1} y={0.34} z={0.38} w={0.26} d={0.34} h={0.18} faces={SHADE.cyan} />
        </g>
      );
    case "port":
      return (
        <g>
          <Cuboid {...c} x={0.15} y={0.2} w={0.08} d={0.08} h={0.95} faces={SHADE.coral} />
          <Cuboid {...c} x={0.15} y={0.7} w={0.08} d={0.08} h={0.95} faces={SHADE.coral} />
          <Cuboid {...c} x={0.1} y={0.18} z={0.95} w={0.85} d={0.62} h={0.08} faces={SHADE.coral} />
          <Cuboid {...c} x={0.55} y={0.35} w={0.4} d={0.3} h={0.26} faces={SHADE.harbour} />
        </g>
      );
    case "clearance":
      return (
        <g>
          <Cuboid {...c} x={0.15} y={0.2} w={0.62} d={0.62} h={0.04} faces={SHADE.white} />
          <Cuboid {...c} x={0.2} y={0.26} z={0.04} w={0.5} d={0.5} h={0.03} faces={SHADE.white} />
          <Cuboid {...c} x={0.42} y={0.42} z={0.07} w={0.2} d={0.2} h={0.12} faces={SHADE.coral} />
          <Cuboid {...c} x={0.48} y={0.48} z={0.19} w={0.08} d={0.08} h={0.2} faces={SHADE.hull} />
        </g>
      );
    case "customer":
      return (
        <g>
          <Cuboid {...c} x={0.08} y={0.3} w={0.56} d={0.4} h={0.44} faces={SHADE.white} />
          <Cuboid {...c} x={0.64} y={0.32} w={0.26} d={0.36} h={0.3} faces={SHADE.harbour} />
          <Cuboid {...c} x={0.2} y={0.7} z={0.14} w={0.3} d={0.01} h={0.14} faces={SHADE.coral} />
        </g>
      );
  }
}

/** A station's platform: a dark slab, like a berth. */
export function Platform({ scale = 100, ox = 0, oy = 0, size = 1.3, active = false }: { scale?: number; ox?: number; oy?: number; size?: number; active?: boolean }) {
  const inset = (size - 1) / 2;
  return (
    <g>
      <Cuboid
        scale={scale}
        ox={ox}
        oy={oy}
        x={-inset}
        y={-inset}
        z={-0.12}
        w={size}
        d={size}
        h={0.12}
        faces={active ? { ...SHADE.slate, top: "#44576B" } : SHADE.slate}
      />
    </g>
  );
}
