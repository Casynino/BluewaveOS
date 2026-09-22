# BlueWave Cargo — Architecture

Sea freight, China → Tanzania. Where the system comes from, what is BlueWave's
own, and the design the business runs on.

---

## 1. Where this system comes from

BlueWave Cargo runs sea freight — loose cargo and full containers, received in
China and handed over in Dar es Salaam — and this codebase is a proven,
production sea-freight system of the same business rebuilt for BlueWave. Nothing in
the business logic was redesigned: the cargo and container lifecycles, the CBM
engine, pricing, invoicing, payments, release control, QR boxes, the bilingual
staff interface and every audit trail are carried over as they worked.

What changed is the identity, and the facts that belong to BlueWave alone:

| | BlueWave Cargo |
|---|---|
| Legal name | SCOHU BLUEWAVE CARGO LIMITED · TIN 156 894 648 |
| Dar es Salaam office | Aggrey & Likoma Street, near Mkombozi Bank, Kariakoo |
| Phones | +255 688 887 784 · +255 628 430 911 |
| China warehouse | 广东省佛山市南海区大沥镇沥雅路翔丰产业园区1栋 · entry no. (入仓号) BW-021 · +86 153 6042 1106 · +86 186 6654 4018 |
| Website · Instagram | www.bluewavecargo.co.tz · @bluewave_cargo |
| Collection accounts | CRDB USD 0250696722000 · CRDB TZS 0150696722000 · TIGO Lipa 9608058 |
| Invoice | VAT 0%, 1 USD = 2,700 TZS at the time of writing |
| References | cargo BW0001, container BWC26M09C1 |

These live in `prisma/data/company.ts` for the first seed and in
`CompanySetting` / `BankAccount` / `Warehouse` afterwards — never in components.

**The China warehouse is in Foshan (Nanhai), not Guangzhou.** Everywhere the
system speaks of "our warehouse", "the China floor" or the receiving counter it
says Foshan. Guangzhou still appears where it is geography — its wholesale
markets in the sourcing guide.

Not yet confirmed by the company, and therefore left as the proven defaults
until somebody who knows says otherwise: the weekly sailing rhythm (receiving
closes Friday, the box sails Monday — editable in the website schedule), the
28–30 day transit promise (`lib/constants.ts`), the rate book (empty; Finance
enters it at /app/finance/rates), and a company email address.

---

## 2. Architecture

### 2.1 Stack

The stack the proven system runs on:
Next.js 15 App Router · React 19 (RSC + server actions) · Prisma 6 · Postgres ·
NextAuth v5 (credentials) · Tailwind · shadcn/Radix · Vercel + Neon.

### 2.2 Roles and departments

```
Role            ADMIN · MANAGER · CUSTOMER_SUPPORT · CHINA_WAREHOUSE
                DAR_WAREHOUSE · FINANCE · CUSTOMER
Department      MANAGEMENT · CUSTOMER_SUPPORT · CHINA_WAREHOUSE
                DAR_WAREHOUSE · FINANCE
```

`CUSTOMER` is a role with **no department** — it is not staff. Every customer
query is scoped by `customerId` derived from the session server-side, never from
a URL parameter (§53).

### 2.3 The cargo chain (§4, §48)

One `Cargo` row, created once, carrying the same `reference` + `qrToken` from
Foshan to release. Everything else hangs off it:

```
Customer ──┬─ (sender)   ┐
           └─ (receiver) ┴─> Cargo ─┬─> CargoPackage[]   (L×W×H, unit, CBM)
                                    ├─> CargoPhoto[]
                                    ├─> ChinaReceiving ──> DeliveryNote
                                    ├─> ContainerCargo ──> Container ──> Shipment
                                    │                       └─> ContainerExpense[]
                                    ├─> PackingListLine[]
                                    ├─> DarReceiving     (own measurements, never overwriting China's)
                                    ├─> Invoice ─> InvoiceItem[] ─> Payment[] ─> Receipt
                                    ├─> ExceptionCase[]
                                    └─> Release ─> Collection | Delivery
```

### 2.4 Decisions that need stating explicitly

**Sender and receiver.** `Cargo.senderId` and `Cargo.receiverId`, both to
`Customer`, both required, often the same row. The **receiver** is who the
invoice addresses and who may collect; the **sender** is who the shipping mark
belongs to. This comes straight from how the trade actually works and is not in the
brief.

**CBM, and the unit that produced it.** Store `lengthCm`, `widthCm`, `heightCm`,
`quantity`, `unit` (`CM` | `M`) **and** `cbm` as `Decimal(12,4)`. Compute:

```
CM: cbm = L × W × H × qty ÷ 1_000_000
M : cbm = L × W × H × qty
```

`cbm` is written by the server from the inputs — never accepted from a form. A
manual override needs `cbm.override`, and writes a `FieldChange` row carrying old
value, new value, actor, reason, timestamp (§18). Never silently overwritten.

**Two measurements, both preserved.** `ChinaReceiving` and `DarReceiving` are
separate rows with their own weight, package count and CBM. The UI shows
*China / Dar / difference*. Neither ever overwrites the other (§21). This is the
single most important auditability rule in the warehouse layer.

**Money.** `Decimal` throughout. `subtotal`, `vatPercent`, `vatAmount`, `total`
in **USD**; `fxRateId` pins the `ExchangeRate` row used; `totalTzs` derived and
stored *as a snapshot on the issued invoice only*. Balance is **always derived**:
`total − Σ verified payments`. No stored balance column anywhere.

**Rates.** `ShippingRate { origin, destination, service, cargoType, basis
(PER_CBM | PER_KG), rate, minimumCbm, currency, effectiveFrom, effectiveTo,
status }`. The invoice stores `standardRate`, `appliedRate` and `variance` at
issue time (§25); changing the rate book never moves an issued invoice (§24).

**Container splitting.** `ContainerCargo` is a join row at **package** grain, not
cargo grain — because the live system already splits packages across containers.
A cargo has one *current* container in the common case, and the model does not
break when it doesn't.

**Container P&L.** `ContainerExpense { container, expenseType, vendor, amount,
currency, fxRate, billable, billedToCustomerId }`, carried over from the original
system. Without it the business cannot tell whether a sailing made money.

**Release authorisation is computed, never asserted.** A single server function
answers "may this be released?" from: Dar received ∧ verified ∧ no financial hold
∧ no operational hold ∧ invoice issued ∧ balance ≤ 0 ∧ authorisation present.
The warehouse screen renders that function's answer and offers no override
(§29).

### 2.5 Statuses

```
ContainerStatus  OPEN · LOADING · LOADED · SEALED · DEPARTED
                 IN_TRANSIT · ARRIVED · CLOSED
ShipmentStatus   PREPARING · READY · DEPARTED_CHINA · IN_TRANSIT
                 ARRIVED_TANZANIA · CLEARANCE · CLEARED · DAR_WAREHOUSE · COMPLETED
CargoStatus      REGISTERED · RECEIVED_CHINA · ASSIGNED · LOADED · IN_TRANSIT
                 ARRIVED_TZ · RECEIVED_DAR · VERIFIED · INVOICED · PAID
                 READY_FOR_RELEASE · COLLECTED · DELIVERED · CANCELLED
InvoiceStatus    DRAFT · ISSUED · PARTIALLY_PAID · PAID · OVERDUE · CANCELLED
PaymentStatus    PENDING · VERIFIED · REJECTED · REVERSED
```

Container status drives shipment status drives cargo status — cargo milestones
are **derived from container events**, not typed per piece. That is the core
structural difference from air freight, where each box is checked off a
manifest individually.

### 2.6 References (§5)

```
Cargo BW-2026-000125 · Shipping mark BW-NINO-125 · Customer CUS-000125
Delivery Note DN-2026-000125 · Container BWC-CN-2026-005 (+ real MSCU1234567)
Packing List PL-2026-000012 · Shipment SHP-2026-000012
Invoice INV-2026-000125 · Receipt RCT-2026-000125 · Release REL-2026-000125
Booking BK-000125 · Pickup PU-000125 · Exception EXC-2026-000125
```

All minted from a `Counter` table inside the caller's transaction.

### 2.7 Route map

```
/                     public site (EN/SW)
/track, /track/[code] tracking
/calculator           CBM calculator
/rates                published rates, from the database
/schedule             sailings + receiving deadlines
/book, /pickup, /quote  requests
/login, /register
/portal/*             customer portal   — role CUSTOMER, scoped by session
/app/*                staff              — role ≠ CUSTOMER
  /app/dashboard · /app/cargo · /app/receive · /app/containers
  /app/packing-lists · /app/shipments · /app/verification · /app/release
  /app/finance/* · /app/support/* · /app/exceptions · /app/manager/* · /app/admin/*
```

Two separate shells. A `CUSTOMER` reaching `/app/*` is bounced; a staff member
reaching `/portal/*` is bounced. Both enforced at the page and at every action.

---

## 3. Phase plan (as built)

Ordered so each phase is independently useful and nothing is built before the
thing it depends on.

| Phase | Contents |
|---|---|
| **1** | Project scaffold, Prisma schema, auth, `User`/`Role`/`Department`, RBAC + `authorize()`, audit log, admin user management, Manager role split. |
| **2** | `Customer` (sender/receiver), `Cargo`, `CargoPackage`, shipping marks, China receiving, photos, **Delivery Note** (print + PDF). |
| **3** | `Container`, loading, `ContainerCargo`, **Packing List**, **CBM engine + override audit**, `Shipment` (vessel/voyage/line/ports/seal), milestones. |
| **4** | Dar receiving, verification, China-vs-Dar variance, `ExceptionCase` + Manager supervision. |
| **5** | `ShippingRate`, customer pricing, `ExchangeRate` pinning, VAT, `Invoice`, `Payment` + verification, `Receipt`, derived balances, `ContainerExpense`. |
| **6** | Release authorisation engine, collection, delivery requests, notifications. |
| **7** | Public website (EN/SW), registration, **customer portal**, tracking, CBM calculator, published rates, booking/pickup/quote, schedule. |
| **8** | Customer Support inbox + customer-context panel, Manager dashboards, reports, global search, performance. |

Release control (phase 6) deliberately lands *before* the customer portal, so the
portal never shows a customer a "collect now" that the warehouse would refuse.

---

## 4. The rules this system inherits

Learned the hard way on live freight businesses, and not negotiable:

1. Every `"use server"` export calls `authorize()` itself.
2. Money is derived, never stored. There is no balance column.
3. The ledger is append-only; a wrong line gets a reversing line.
4. The session says who; the database says what they may do.
5. Document numbers come from `Counter`, inside the transaction.
6. Public output is an allow-list, never an omission.
7. Rates live in the database; historical documents keep the rate they used.
8. Every state change is appended, never mutated.
