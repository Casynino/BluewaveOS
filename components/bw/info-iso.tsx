import { COS, Cuboid, Platform, SHADE, StationObject, type StationKind } from "@/components/bw/iso";
import { cn } from "@/lib/utils";

/**
 * ONE STATION, STANDING ON ITS OWN.
 *
 * The same berth-and-object drawing the corridor uses, cut out so a page can
 * set a single station beside the words about it — the warehouse beside
 * "China warehouse", the stamp beside "Clearance".
 */
export function StationTile({
  kind,
  className,
  label,
}: {
  kind: StationKind;
  className?: string;
  /** When set, the drawing is announced; otherwise it is decoration. */
  label?: string;
}) {
  return (
    <svg
      viewBox="-85 -140 170 225"
      className={cn("h-auto w-full overflow-visible", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <Platform scale={80} ox={0} oy={-40} />
      <StationObject kind={kind} scale={80} ox={0} oy={-40} />
    </svg>
  );
}

/**
 * THE THREE BOXES A CUSTOMER CAN BOOK, DRAWN TO THE SAME SCALE.
 *
 * A twenty-foot box is half a forty; a high cube is a forty with more
 * headroom. Each is its own drawing at one shared scale, so the difference
 * reads without a table and nothing overlaps on a narrow screen.
 */
export function ContainerSizes({ className }: { className?: string }) {
  const s = 40;
  const d = 0.9;
  const rows = [
    { key: "20", w: 2, h: 0.86, faces: SHADE.harbour, label: "20ft", note: "Half the length of a forty" },
    { key: "40", w: 4, h: 0.86, faces: SHADE.coral, label: "40ft", note: "Twice the floor of a twenty" },
    { key: "hc", w: 4, h: 1.0, faces: SHADE.white, label: "40ft high cube", note: "A forty with extra height" },
  ];
  const widest = (4 + d) * COS * s;
  return (
    <ul className={cn("grid gap-6", className)}>
      {rows.map((row) => {
        const minX = -d * COS * s - 2;
        const maxX = row.w * COS * s + 2;
        const minY = -row.h * s - 2;
        const maxY = (row.w + d) * 0.5 * s + 2;
        const width = maxX - minX;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-end gap-4 border-b border-bw-line pb-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <svg
              viewBox={`${minX} ${minY} ${width} ${maxY - minY}`}
              style={{ width: `${(width / widest) * 100}%` }}
              className="h-auto max-h-28 w-full overflow-visible sm:max-h-32"
              aria-hidden
            >
              <Cuboid scale={s} x={0} y={0} w={row.w} d={d} h={row.h} faces={row.faces} />
              {Array.from({ length: row.w * 5 - 1 }, (_, k) => {
                const x = (k + 1) * 0.2;
                const px = (x - d) * COS * s;
                const top = (x + d) * 0.5 * s - (row.h - 0.08) * s;
                const bottom = (x + d) * 0.5 * s - 0.08 * s;
                return <line key={k} x1={px} y1={top} x2={px} y2={bottom} stroke="rgb(6 19 31 / 0.16)" strokeWidth={1} />;
              })}
            </svg>
            <div className="min-w-0">
              <p className="font-bw-display text-2xl font-semibold uppercase leading-none text-bw-fg">{row.label}</p>
              <p className="mt-1 text-sm leading-snug text-bw-muted">{row.note}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
