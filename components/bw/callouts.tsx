import { Cuboid, Platform, SHADE } from "@/components/bw/iso";
import { cn } from "@/lib/utils";

export type Fact = { title: string; body: string };

/**
 * FACTS WIRED TO THE THING THEY ARE ABOUT.
 *
 * A stack of containers in the middle and what we do to every consignment
 * set either side of it, each joined to the stack by a hairline — the way a
 * technical drawing labels a part. On a phone the lines go and the facts
 * stack under the drawing.
 */
export function Callouts({ left, right }: { left: Fact[]; right: Fact[] }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-[1fr_minmax(0,26rem)_1fr] lg:gap-0">
      <ul className="order-2 grid gap-8 lg:order-1 lg:gap-14">
        {left.map((fact) => (
          <FactItem key={fact.title} fact={fact} side="left" />
        ))}
      </ul>
      <div className="order-1 mx-auto w-full max-w-[15rem] sm:max-w-xs lg:order-2 lg:max-w-none">
        <ContainerStack />
      </div>
      <ul className="order-3 grid gap-8 lg:gap-14">
        {right.map((fact) => (
          <FactItem key={fact.title} fact={fact} side="right" />
        ))}
      </ul>
    </div>
  );
}

function FactItem({ fact, side }: { fact: Fact; side: "left" | "right" }) {
  return (
    <li className={cn("relative", side === "left" ? "lg:pr-24 lg:text-right" : "lg:pl-24")}>
      <span
        aria-hidden
        className={cn(
          "absolute top-3 hidden h-px w-20 bg-bw-coral lg:block",
          side === "left" ? "right-0" : "left-0"
        )}
      />
      <span
        aria-hidden
        className={cn("absolute top-[9px] hidden size-[7px] bg-bw-coral lg:block", side === "left" ? "-right-1" : "-left-1")}
      />
      <p className="font-bw-display text-2xl font-semibold uppercase text-bw-fg">{fact.title}</p>
      <p className="mt-2 leading-relaxed text-bw-muted">{fact.body}</p>
    </li>
  );
}

/** Three boxes on a berth, in the company's colours. */
function ContainerStack() {
  const s = 120;
  const ox = 0;
  const oy = 20;
  const c = { scale: s, ox, oy };
  const box = (x: number, y: number, z: number, faces: typeof SHADE.coral) => (
    <Cuboid {...c} x={x} y={y} z={z} w={1.5} d={0.62} h={0.6} faces={faces} />
  );
  return (
    <svg viewBox="-230 -170 460 400" className="h-auto w-full overflow-visible" role="img" aria-label="Containers stacked on a berth">
      <Platform {...c} size={2.3} />
      {/* One row, bottom up: each box sits wholly in front of the one below it. */}
      {box(-0.3, 0.5, 0, SHADE.harbour)}
      {box(-0.3, 0.5, 0.6, SHADE.coral)}
      {box(-0.3, 0.5, 1.2, SHADE.white)}
      {/* Corrugation on the near long face. */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = -0.3 + 0.15 + i * 0.15;
        const y = 0.5 + 0.62;
        return (
          <g key={i} stroke="rgb(6 19 31 / 0.18)" strokeWidth={1.2}>
            {[0, 0.6, 1.2].map((z) => {
              const a = [(x - y) * 0.866 * s + ox, (x + y) * 0.5 * s - (z + 0.07) * s + oy];
              const b = [(x - y) * 0.866 * s + ox, (x + y) * 0.5 * s - (z + 0.53) * s + oy];
              return <line key={z} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}
