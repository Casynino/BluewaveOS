import type { CSSProperties } from "react";
import Image from "next/image";

/*
  The full-page scene behind the sign-in form: the sea at night, with the
  company's ships sailing past in three lanes (a feeder far out, the pilot boat
  close in, a loaded container ship in front), the port's cranes on the
  horizon, stars, glints on the water and the sea itself as a glowing grid
  rolling in. Pure SVG and CSS, decorative, hidden from screen readers.
  Layout numbers live in login.css. Each lane: --b waterline, --k size, --w
  width ratio, --d crossing time, --s offset, --rx where it rests when motion
  is reduced.
*/

const vars = (v: Record<string, string>) => v as CSSProperties;

const STARS = [
  ["6%", "8%", "2px", "4.5s", "-1s"], ["14%", "22%", "1.5px", "6s", "-3s"], ["23%", "6%", "2px", "5s", "-2s"],
  ["31%", "30%", "1.5px", "7s", "-5s"], ["42%", "12%", "2.5px", "5.5s", "-1.5s"], ["51%", "26%", "1.5px", "6.5s", "-4s"],
  ["58%", "5%", "2px", "4.8s", "-2.5s"], ["67%", "18%", "1.5px", "6.2s", "-0.5s"], ["74%", "34%", "2px", "5.2s", "-3.5s"],
  ["83%", "9%", "2.5px", "7.5s", "-6s"], ["90%", "24%", "1.5px", "5.8s", "-2s"], ["96%", "14%", "2px", "6.8s", "-4.5s"],
];
const STREAKS = [
  ["68%", "150px", "5.4s", "-0.6s"], ["74%", "90px", "4.4s", "-1.8s"], ["80%", "210px", "6.2s", "-2.8s"],
  ["86%", "120px", "5s", "-1.2s"], ["92%", "180px", "5.8s", "-2.2s"], ["97%", "100px", "4.6s", "-0.4s"],
];

/* The containers' colours, from the logo: its blues, the wave's cyan, the flag's coral, and a few plain boxes. */
const BOX_COLOURS = ["#2f6fd0", "#40c0e8", "#d63c50", "#1d4e89", "#e3e9f2", "#f2b33d", "#3a86d4", "#16365f"];

function Containers({ x0, tiers, shift = 0 }: { x0: number; tiers: number[]; shift?: number }) {
  return (
    <g>
      {tiers.flatMap((count, col) =>
        Array.from({ length: count }, (_, tier) => {
          const x = x0 + col * 42;
          const y = 150 - 17 * (tier + 1) - tier;
          const fill = BOX_COLOURS[(col * 3 + tier * 5 + shift) % BOX_COLOURS.length];
          return (
            <g key={`${col}-${tier}`}>
              <rect x={x} y={y} width={40} height={17} rx={1} fill={fill} />
              <rect x={x} y={y} width={40} height={17} rx={1} fill="url(#ls-ribs)" />
            </g>
          );
        })
      )}
    </g>
  );
}

/** Shared by every ship: the box ribs, the hull's shading and the glow on the water under it. */
function Defs() {
  return (
    <defs>
      <pattern id="ls-ribs" width="4" height="17" patternUnits="userSpaceOnUse">
        <rect width="1" height="17" fill="rgba(0,0,0,0.18)" />
      </pattern>
      <linearGradient id="ls-hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#173a68" />
        <stop offset="1" stopColor="#0a1a33" />
      </linearGradient>
      <linearGradient id="ls-refl" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(64,192,232,0.22)" />
        <stop offset="1" stopColor="rgba(64,192,232,0)" />
      </linearGradient>
    </defs>
  );
}

function Wake({ from, to }: { from: number; to: number }) {
  return (
    <g fill="none" strokeLinecap="round">
      <path className="ls-wake" d={`M${from} 201 C${from - 60} 204 ${to + 80} 199 ${to} 205`} stroke="rgba(255,255,255,0.5)" strokeWidth="3" />
      <path className="ls-wake" d={`M${from} 206 C${from - 50} 211 ${to + 120} 208 ${to + 60} 214`} stroke="rgba(160,225,250,0.35)" strokeWidth="2" style={{ animationDelay: "-0.6s" }} />
    </g>
  );
}

function Puffs({ x, y }: { x: number; y: number }) {
  return (
    <g fill="rgba(205,220,240,0.35)">
      {[0, 0.85, 1.7].map((delay) => (
        <circle key={delay} className="ls-puff" cx={x} cy={y} r="6" style={{ animationDelay: `${delay}s` }} />
      ))}
    </g>
  );
}

/** A loaded container ship: bridge and funnel at the stern, boxes stacked to the bow. */
function ContainerShip({ tiers, shift }: { tiers: number[]; shift: number }) {
  return (
    <svg className="ls-veh-svg" viewBox="0 0 760 230">
      <Defs />
      <rect x="40" y="203" width="680" height="20" fill="url(#ls-refl)" />
      <Wake from={20} to={-170} />
      <g className="ls-ship">
        <Puffs x={56} y={26} />
        {/* funnel */}
        <path d="M44 58 L48 32 H68 L71 58 Z" fill="#d63c50" />
        <path d="M48 32 H68 L68.8 38 H47.1 Z" fill="#0a1a33" />
        {/* accommodation and bridge */}
        <rect x="38" y="66" width="80" height="84" fill="#e9eff7" />
        <rect x="104" y="66" width="14" height="84" fill="#cdd8e6" />
        <rect x="28" y="56" width="100" height="11" rx="1" fill="#f4f7fb" />
        <rect x="32" y="59.5" width="92" height="4" fill="#40c0e8" className="ls-beam" />
        {[78, 94, 110, 126].map((y) =>
          [46, 60, 74, 88].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="8" height="6" fill="#9fdcff" className="ls-beam" style={{ animationDelay: `${(x + y) % 5 * -0.4}s` }} />)
        )}
        <line x1="90" y1="56" x2="90" y2="34" stroke="#cdd8e6" strokeWidth="2" />
        <rect x="80" y="40" width="20" height="3" rx="1" fill="#cdd8e6" />
        <circle cx="90" cy="32" r="2.6" fill="#ff5a6a" className="ls-blink" />
        {/* boxes on deck */}
        <Containers x0={134} tiers={tiers} shift={shift} />
        {/* bow mast and its light */}
        <line x1="728" y1="146" x2="728" y2="112" stroke="#cdd8e6" strokeWidth="2" />
        <circle cx="728" cy="110" r="2.6" fill="#fff" className="ls-blink" style={{ animationDelay: "-0.45s" }} />
        {/* hull */}
        <path d="M14 150 H700 C722 150 742 146 756 140 C752 166 738 188 716 202 H60 C40 196 22 178 14 150 Z" fill="url(#ls-hull)" />
        <path d="M30 186 H730 C726 193 721 198 716 202 H60 C50 199 38 193 30 186 Z" fill="#d63c50" />
        <path d="M14 150 H700 C722 150 742 146 756 140" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
        <text x="640" y="173" textAnchor="middle" fill="#fff" fillOpacity="0.88" fontSize="13" fontWeight="700" letterSpacing="3" fontFamily="Inter, system-ui, sans-serif">
          BLUE WAVE
        </text>
        <circle cx="744" cy="152" r="2.2" fill="#ff5a6a" className="ls-beam" />
      </g>
      <path className="ls-foam" d="M702 199 C718 195 734 190 754 196 C742 204 722 207 702 204 Z" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

/** The pilot boat: low and quick, a big white wheelhouse, a long wake. */
function PilotBoat() {
  return (
    <svg className="ls-veh-svg" viewBox="0 0 760 230">
      <Defs />
      <rect x="60" y="203" width="640" height="20" fill="url(#ls-refl)" />
      <Wake from={40} to={-260} />
      <g className="ls-ship" style={{ animationDuration: "3.2s" }}>
        <Puffs x={226} y={52} />
        {/* exhaust stacks */}
        <rect x="214" y="60" width="16" height="40" rx="2" fill="#d63c50" />
        <rect x="214" y="60" width="16" height="7" rx="2" fill="#0a1a33" />
        {/* deckhouse and wheelhouse */}
        <rect x="196" y="98" width="320" height="44" rx="4" fill="#eef3f9" />
        <rect x="490" y="98" width="26" height="44" fill="#d3dde9" />
        <rect x="250" y="54" width="226" height="10" rx="3" fill="#dfe7f1" />
        <path d="M256 64 H470 L486 100 H246 Z" fill="#f7f9fc" />
        <path d="M262 70 H466 L476 92 H256 Z" fill="#40c0e8" className="ls-beam" />
        {[300, 340, 380, 420].map((x) => (
          <rect key={x} x={x} y="70" width="4" height="22" fill="#f7f9fc" />
        ))}
        {[220, 262, 304, 346, 388, 430].map((x) => (
          <rect key={x} x={x} y="110" width="26" height="12" rx="2" fill="#9fdcff" className="ls-beam" style={{ animationDelay: `${(x % 7) * -0.3}s` }} />
        ))}
        {/* mast */}
        <line x1="364" y1="54" x2="364" y2="14" stroke="#cdd8e6" strokeWidth="3" />
        <line x1="346" y1="26" x2="382" y2="26" stroke="#cdd8e6" strokeWidth="2.5" />
        <circle cx="364" cy="11" r="3" fill="#ff5a6a" className="ls-blink" />
        {/* hull, coral sheer stripe, bow fender */}
        <path d="M30 140 H640 C690 140 728 128 752 112 C748 150 728 186 690 202 H90 C60 196 40 176 30 140 Z" fill="url(#ls-hull)" />
        <path d="M30 140 H640 C690 140 728 128 752 112 L749 126 C726 140 690 153 640 153 H33 Z" fill="#d63c50" />
        <text x="590" y="178" textAnchor="middle" fill="#fff" fillOpacity="0.88" fontSize="17" fontWeight="700" letterSpacing="4" fontFamily="Inter, system-ui, sans-serif">
          PILOT
        </text>
        <path d="M30 150 C26 140 28 132 34 128" fill="none" stroke="#111b2c" strokeWidth="8" strokeLinecap="round" />
      </g>
      <path className="ls-foam" d="M680 198 C708 190 736 178 760 186 C748 200 716 208 680 206 Z" fill="rgba(255,255,255,0.9)" />
      <path className="ls-foam" d="M720 190 C738 176 752 168 770 170" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "-0.5s" }} />
    </svg>
  );
}

const BigShip = () => <ContainerShip tiers={[3, 4, 4, 3, 4, 5, 4, 4, 3, 4, 3, 3, 2, 2]} shift={0} />;
const Feeder = () => <ContainerShip tiers={[2, 3, 2, 3, 3, 2, 3, 2, 2, 3, 2, 2, 1, 1]} shift={3} />;

const LANES = [
  { Ship: Feeder, b: "27%", k: "0.55", w: "1", d: "34s", s: "-20s", wave: "0.22", waveD: "3.4s", rx: "54cqw" },
  { Ship: PilotBoat, b: "16%", k: "0.62", w: "1", d: "13s", s: "-4s", wave: "0.35", waveD: "2.2s", rx: "6cqw" },
  { Ship: BigShip, b: "5%", k: "1", w: "1", d: "30s", s: "-11s", wave: "0.5", waveD: "1.6s", rx: "30cqw" },
];

/** Three ship-to-shore cranes on the quay, booms out over the water, a stack of boxes at their feet. */
function Port() {
  const crane = (x: number, h: number) => (
    <g key={x}>
      <path
        d={`M${x} 160 L${x + 10} ${160 - h} M${x + 44} 160 L${x + 34} ${160 - h} M${x + 4} ${160 - h * 0.45} H${x + 40}`}
        stroke="#0d2444"
        strokeWidth="5"
        fill="none"
      />
      <path d={`M${x - 70} ${160 - h} H${x + 70}`} stroke="#0d2444" strokeWidth="7" />
      <path d={`M${x + 10} ${160 - h} L${x + 22} ${150 - h * 1.25} L${x + 34} ${160 - h}`} stroke="#0d2444" strokeWidth="4" fill="none" />
      <path d={`M${x + 22} ${150 - h * 1.25} L${x - 66} ${160 - h} M${x + 22} ${150 - h * 1.25} L${x + 68} ${160 - h}`} stroke="rgba(64,192,232,0.5)" strokeWidth="1.2" />
      <path d={`M${x - 70} ${160 - h} H${x + 70}`} stroke="rgba(64,192,232,0.35)" strokeWidth="1" transform="translate(0 -3.5)" />
      <circle cx={x + 22} cy={148 - h * 1.25} r="2.6" fill="#ff5a6a" className="ls-blink" style={{ animationDelay: `${(x % 3) * -0.3}s` }} />
      <rect x={x - 40} y={164 - h} width="10" height="9" fill="#173a68" />
    </g>
  );
  return (
    <div className="ls-port">
      <svg viewBox="0 0 400 160">
        {crane(110, 92)}
        {crane(220, 106)}
        {crane(330, 98)}
        {[0, 1, 2].map((tier) =>
          [0, 1, 2, 3, 4, 5, 6, 7].map((col) => (
            <rect
              key={`${tier}-${col}`}
              x={150 + col * 26}
              y={150 - tier * 10}
              width="24"
              height="9"
              fill={["#173a68", "#1d4e89", "#2a3f63", "#13305a"][(col + tier) % 4]}
              opacity={tier === 2 && col % 3 === 0 ? 0 : 0.95}
            />
          ))
        )}
        <rect x="0" y="158" width="400" height="2" fill="#0d2444" />
      </svg>
    </div>
  );
}

export function LoginScene() {
  return (
    <div className="ls" aria-hidden="true">
      <span className="ls-aurora a" />
      <span className="ls-aurora b" />
      {STARS.map(([l, t, z, d, s], i) => (
        <span key={i} className="ls-star" style={vars({ "--l": l, "--t": t, "--z": z, "--d": d, "--s": s })} />
      ))}
      {/* the big logo, standing on the horizon between the words and the card (wide screens; elsewhere it sits above them) */}
      <span className="ls-sky-logo ls-brand">
        <Image src="/brand/bluewave-logo-light.png" alt="" width={630} height={400} priority />
      </span>
      <Port />
      <div className="ls-horizon" />
      <div className="ls-floor">
        <div className="ls-grid" />
      </div>
      {STREAKS.map(([t, w, d, s], i) => (
        <span key={i} className="ls-streak" style={vars({ "--t": t, "--w": w, "--d": d, "--s": s })} />
      ))}
      {LANES.map(({ Ship, b, k, w, d, s, wave, waveD, rx }) => (
        <div key={b}>
          <div className="ls-lane" style={vars({ "--b": b, "--o": wave, "--d": waveD })} />
          <div className="ls-veh" style={vars({ "--b": b, "--k": k, "--w": w, "--d": d, "--s": s, "--rx": rx })}>
            <Ship />
          </div>
        </div>
      ))}
    </div>
  );
}
