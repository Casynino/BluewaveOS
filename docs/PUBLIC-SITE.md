# BlueWave public site — design system

The public website has its own design language, independent of the staff app
and the customer portal. It lives in `components/bw/` and the `BLUEWAVE` block
at the end of `app/globals.css`, and everything is scoped under the `.bw`
class set by `app/(public)/layout.tsx`.

## Direction

Blue hour over a port. Real logistics photography (ports, ships, containers,
warehouses) as the base; an isometric drawing style for the China → Tanzania
corridor; coral flow lines for cargo moving; and glass panels **only** where
they carry live figures out of the database (next sailing, exchange rate,
tracking status). Never invented statistics, never decorative floating cards,
no drones, no "platform" talk — the site sells sea cargo, not software.

## Tokens (Tailwind `bw-*`)

| Token | Use |
|---|---|
| `bw-night` `#06131F` | Heavy bands, footer, board backgrounds |
| `bw-ink` `#0A2236` | Text on light, dark sections |
| `bw-deep` `#0C3350` | Hover on ink |
| `bw-harbour` `#0B5E8E` | Brand blue, index numbers on light |
| `bw-cyan` `#40C0E8` | Index numbers and accents on dark |
| `bw-coral` `#D63C50` | Primary action, flow lines, label squares |
| `bw-coral-bright` | Coral on dark backgrounds |
| `bw-concrete` `#EDF1F4` | Page ground |
| `bw-slab` | Secondary light surface |
| `bw-steel` `#4A5A6A` | Secondary text on light |
| `bw-rule` `#C9D3DC` | Hairlines |

Corners are square (`rounded-[2px]`–`[4px]`), never pills. Borders are
hairlines. No drop-shadow cards on light surfaces.

## Type

- `font-bw-display` / `.bw-display` — Barlow Condensed, UPPERCASE, for every
  headline and button label.
- `font-bw-sans` — Barlow, body copy (the default inside `.bw`).
- `.bw-mono` / `font-bw-mono` — JetBrains Mono for references, dates, CBM,
  money, and small uppercase labels.
- `.bw-label` / `<Label>` — mono uppercase with a coral square: the manifest
  line that opens every section.

## Building blocks (`components/bw/`)

- `ui.tsx` — `Frame` (page column), `Label`, `Action` (slab button: tones
  `coral`, `ink`, `line`, `light`, `ghost-light`), `Headline`, `SectionIntro`
  (index / label / headline + lead, asymmetric), `PageBanner` (the opening band
  of every inner page), `Figure`.
- `header.tsx`, `footer.tsx`, `lockup.tsx` — site chrome.
- `track-field.tsx` — the tracking input (compact / dark / large).
- `corridor.tsx`, `iso.tsx` — the isometric corridor and the drawing kit.
- `world-route.tsx` — pixel world map with the real sea lane.
- `departure-board.tsx` — the sailings timetable.
- `callouts.tsx` — facts wired to a container drawing.
- `data.ts` — cached readers: `bwCompany()`, `bwExchangeRate()`,
  `bwSailings(n)`. Company facts are never typed into a component.

Utilities: `.bw-glass` (live-data panel), `.bw-photo` + `.bw-shade`
(photography), `.bw-ribs` (container corrugation on dark bands), `.bw-yard`
(hairline grid), `.bw-flow` (moving dashes), `.bw-draw`, `.bw-ping`,
`.bw-rise`. All motion stops under `prefers-reduced-motion`.

## Rules

- Every figure comes from the existing backend: `publicRateBook`,
  `estimateFreight`, `publicSailings`, `trackByReference`,
  `currentExchangeRate`, `supplierAddress`, the request server actions. No
  second rate list, no hard-coded schedule.
- `components/site/request-forms.tsx`, `price-calculator.tsx` and
  `cargo-photos.tsx` are shared with the customer portal — use them, don't
  restyle them in place.
- Copy is plain and concrete: what we do, where, and what the customer does
  next. No "revolutionising", "seamless", "platform".
- Each inner page opens with `PageBanner`, then gets a layout of its own.

## The China gateway (information architecture)

BlueWave is a China → Tanzania business, sourcing and logistics company. The
site follows the buyer's journey:

DISCOVER CHINA → FIND MARKETS / FACTORIES → VISIT → SOURCE / BUY → SEND TO THE
FOSHAN WAREHOUSE → SHIP → TRACK → ARRIVE IN DAR → CLEAR → COLLECT

| Group | Routes |
|---|---|
| Explore China | `/explore` (hub + "where does my product live"), `/cities/[slug]`, `/markets`, `/markets/[slug]`, `/factories`, `/factories/[slug]`, `/visit` (business visits) |
| Source | `/sourcing`, `/pickup`, `/quote` |
| Logistics | `/services` (sea cargo), `/schedule`, `/calculator`, `/track` |
| BlueWave | `/how-it-works`, `/about`, `/contact` |

Status pages for requests made on the site: `/visit/status/[reference]?k=…`
and `/sourcing/status/[reference]?k=…` — the `k` key is the only thing that
opens them; a reference alone never does.

### Data (all database-driven, edited at /app/admin/explore)

- `ChinaCity`, `ProductCategory`, `Factory`, and `MarketInformation` (now with
  city, categories, gallery, products, hours, visit duration, coordinates).
- Read ONLY through `lib/explore.ts` (`listCities`, `listCategories`,
  `listMarkets`, `listFactories`, `cityBySlug`, `marketBySlug`,
  `factoryBySlug`, `discover`, `chinaSettings`) — published rows only.
- Requests: `BusinessVisitRequest` (`lib/actions/visits.ts`
  `submitVisitRequest`) and website `SourcingRequest`s
  (`lib/actions/public-sourcing.ts` `submitSourcingRequest`). Labels and keys in
  `lib/china-content.ts`.

### Honesty rules for this content

- No factory is invented. The directory starts empty; staff add real ones.
  "BlueWave sourcing partner" appears only when `listing = PARTNER`; otherwise
  "Factory listing". Never "verified".
- Pictures marked `imagesIllustrative` carry a visible "Illustrative photo" note.
- Sourcing services and business visits are shown only as far as
  `CompanySetting.sourcingServices` / `visitsEnabled` allow.
- A business visit is a request. Nothing on the site says it is booked until
  staff set it to CONFIRMED.
- Empty states are honest ("Factory listings are being added — ask us to find
  one") and always offer the next action (sourcing request, contact).
