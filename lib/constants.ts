import type {
  BookingType,
  CargoCondition,
  CargoStatus,
  ContainerStatus,
  DeliveryStatus,
  Department,
  PackageType,
  ExceptionPriority,
  ExceptionStatus,
  InvoiceStatus,
  PaymentStatus,
  RequestStatus,
  Role,
  SailingStatus,
  ServiceType,
  ShipmentStatus,
} from "@prisma/client";

import type { Permission } from "@/lib/rbac";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  CUSTOMER_SUPPORT: "Customer Support",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar Warehouse",
  FINANCE: "Finance",
  CUSTOMER: "Customer",
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  MANAGEMENT: "Management",
  CUSTOMER_SUPPORT: "Customer Support",
  CHINA_WAREHOUSE: "China Warehouse",
  DAR_WAREHOUSE: "Dar Warehouse",
  FINANCE: "Finance",
};

/** Which department a staff role belongs to, when it is created. */
export const ROLE_DEPARTMENT: Record<Role, Department | null> = {
  ADMIN: "MANAGEMENT",
  MANAGER: "MANAGEMENT",
  CUSTOMER_SUPPORT: "CUSTOMER_SUPPORT",
  CHINA_WAREHOUSE: "CHINA_WAREHOUSE",
  DAR_WAREHOUSE: "DAR_WAREHOUSE",
  FINANCE: "FINANCE",
  CUSTOMER: null,
};

type StatusMeta = {
  label: string;
  /** What a customer is told. Never the internal phrasing. */
  publicLabel: string;
  where: string;
  tone: "neutral" | "progress" | "good" | "warn" | "bad";
};

/**
 * THE ELEVEN MILESTONES, IN ORDER.
 *
 * This array is the tracking timeline, the dashboard's sense of "how far", and
 * the order things sort in. It is written once here so those three can never
 * drift apart. CANCELLED is deliberately absent — it is an exit, not a step, and
 * putting it in a sequence implies cargo passes through it.
 */
export const CARGO_FLOW: CargoStatus[] = [
  "REGISTERED",
  "RECEIVED_CHINA",
  "ASSIGNED_TO_CONTAINER",
  "CONTAINER_LOADED",
  "DEPARTED_CHINA",
  "IN_TRANSIT",
  "ARRIVED_TANZANIA",
  "RECEIVED_DAR",
  "READY_FOR_RELEASE",
  "COLLECTED",
];

export const CARGO_STATUS_META: Record<CargoStatus, StatusMeta> = {
  REGISTERED: {
    label: "Registered",
    publicLabel: "Booking created",
    where: "Awaiting arrival in China",
    tone: "neutral",
  },
  RECEIVED_CHINA: {
    label: "Received in China",
    publicLabel: "Received in China",
    where: "Foshan warehouse",
    tone: "progress",
  },
  ASSIGNED_TO_CONTAINER: {
    /* The enum name is historical; the warehouse says "loaded to container",
       so that is what the screen says. Renaming the enum would mean a
       destructive migration for a word. */
    label: "Loaded to container",
    publicLabel: "Loaded into a container",
    where: "Foshan warehouse",
    tone: "progress",
  },
  CONTAINER_LOADED: {
    label: "Container sealed",
    publicLabel: "Container sealed",
    where: "Foshan",
    tone: "progress",
  },
  DEPARTED_CHINA: {
    label: "Departed China",
    publicLabel: "Departed China",
    where: "At sea",
    tone: "progress",
  },
  IN_TRANSIT: {
    label: "In transit",
    publicLabel: "In transit",
    where: "At sea",
    tone: "progress",
  },
  ARRIVED_TANZANIA: {
    /* The box landed, so its goods landed — the owner's rule, and the same
       answer lib/tracking-stage.ts gives the customer, who was told that day
       and whose free storage started on it. The check-in afterwards is a
       separate answer about the same boxes (lib/verification.ts), so this
       status must not claim it and must not say "in transit" either: telling a
       customer their goods are still at sea a week after we wrote to say they
       had arrived is the system contradicting its own letter. */
    label: "Arrived in Dar",
    publicLabel: "Arrived in Dar es Salaam",
    where: "Dar es Salaam — not checked in yet",
    tone: "progress",
  },
  RECEIVED_DAR: {
    /* The Dar check-in: the floor has the boxes counted onto its own shelves.
       The customer's stage is still "Arrived in Dar es Salaam" — arriving is
       what the container did, and counting is what we did. */
    label: "Checked in at Dar",
    publicLabel: "Arrived in Dar es Salaam",
    where: "Dar es Salaam warehouse",
    tone: "progress",
  },
  READY_FOR_RELEASE: {
    label: "Ready for pickup",
    publicLabel: "Ready for pickup",
    where: "Dar es Salaam warehouse",
    tone: "good",
  },
  COLLECTED: {
    label: "Collected",
    publicLabel: "Collected",
    where: "Handed over",
    tone: "good",
  },
  DELIVERED: {
    label: "Delivered",
    publicLabel: "Delivered",
    where: "Delivered to address",
    tone: "good",
  },
  MISSING_AT_DAR: {
    label: "Missing at Dar",
    /* The customer is told the truth without being told the container was a
       mess. Support rings them; a tracking page is not where somebody should
       learn their goods cannot be found. */
    publicLabel: "Being located",
    where: "Under investigation",
    tone: "bad",
  },
  CANCELLED: {
    label: "Cancelled",
    publicLabel: "Cancelled",
    where: "—",
    tone: "bad",
  },
};

/**
 * What a floor wrote on a receiving row, said in words.
 *
 * Both counters record it and four screens read it back, so it is written once:
 * the same boxes were reading "Wet" on one page and "Arrived wet" on another,
 * off two copies of this map that had drifted apart.
 */
export const CARGO_CONDITION_LABELS: Record<CargoCondition, string> = {
  GOOD: "Good",
  MINOR_DAMAGE: "Minor damage",
  DAMAGED: "Damaged",
  WET: "Wet",
  REPACKED: "Repacked",
};

/** How a line is packed, as the counter says it rather than as it is stored. */
export const PACKAGE_TYPE_LABELS: Record<PackageType, string> = {
  CARTON: "Carton",
  BALE: "Bale",
  BAG: "Bag",
  PALLET: "Pallet",
  CRATE: "Crate",
  DRUM: "Drum",
  PIECE: "Piece",
  OTHER: "Other",
};

export const CONTAINER_STATUS_LABELS: Record<ContainerStatus, string> = {
  OPEN: "Open",
  LOADING: "Loading",
  LOADED: "Loaded",
  SEALED: "Sealed",
  /* A departed box is at sea: departure lands on IN_TRANSIT in one press, and
     a box left at DEPARTED from before that reads the same way. */
  DEPARTED: "In transit",
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived",
  CLOSED: "Closed",
};

/**
 * Once sealed, the box is shut.
 *
 * Loading screens ask this rather than testing `status === "OPEN"` in six
 * places, because "which statuses accept cargo" is one rule and six copies of it
 * is five chances to be wrong about a container already on the water.
 */
export const LOADABLE_CONTAINER_STATUSES: ContainerStatus[] = [
  "OPEN",
  "LOADING",
];

/**
 * Shut, and not yet landed.
 *
 * The stretch of a box's life nothing could reach: loading stops at the seal
 * and the landed amendments start at the port. A consignment physically inside
 * a container on the water is recorded here — see `putOnSailedContainer`.
 */
export const SAILED_CONTAINER_STATUSES: ContainerStatus[] = [
  "SEALED",
  "DEPARTED",
  "IN_TRANSIT",
];

/** On the Dar floor rather than in Foshan or at sea. */
export const LANDED_CONTAINER_STATUSES: ContainerStatus[] = ["ARRIVED", "CLOSED"];

/**
 * WHO MAY OPEN A CONTAINER'S EDIT PAGE.
 *
 * Three different jobs live on one screen, and each carries its own gate
 * inside: the sailing is `shipment.edit`'s, cargo on an open box is
 * `container.load`'s, and cargo on a landed one is `container.amendArrived`'s.
 * The door asks for any of the three, because a desk holding one of them has
 * work to do on the page and being sent to the no-access screen instead teaches
 * it the system is broken. What it may actually change, the page decides
 * section by section — and every server action asks again for itself.
 */
export const CONTAINER_EDIT_PERMISSIONS: Permission[] = [
  "shipment.edit",
  "container.load",
  "container.amendArrived",
];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PREPARING: "Preparing",
  READY: "Ready",
  DEPARTED_CHINA: "In transit",
  IN_TRANSIT: "In transit",
  ARRIVED_TANZANIA: "Arrived Tanzania",
  /* Retired values, never written — BlueWave has no clearance stage. */
  CLEARANCE: "Arrived Tanzania",
  CLEARED: "Arrived Tanzania",
  DAR_WAREHOUSE: "At Dar warehouse",
  COMPLETED: "Completed",
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Awaiting verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REVERSED: "Reversed",
  CANCELLED: "Cancelled",
};

/** Where a delivery request has got to, as the desk arranging it reads it. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  ASSIGNED: "Assigned to a driver",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  CANCELLED: "Cancelled",
};

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  OPEN: "Open",
  INVESTIGATING: "Investigating",
  WAITING_CUSTOMER: "Waiting on customer",
  WAITING_FINANCE: "Waiting on Finance",
  WAITING_WAREHOUSE: "Waiting on warehouse",
  ESCALATED: "Escalated",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const EXCEPTION_PRIORITY_LABELS: Record<ExceptionPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * The route, as the business sells it. Used by the public site and the
 * tracking map; not a routing decision, because there is only one lane.
 */
export const ROUTE = {
  originCity: "Foshan",
  originCountry: "China",
  destinationCity: "Dar es Salaam",
  destinationCountry: "Tanzania",
  /** What the company tells customers on the website and on Instagram. */
  transitDaysMin: 30,
  transitDaysMax: 35,
} as const;

export const COMPANY = {
  name: "BlueWave Cargo",
  tagline: "From sourcing to delivery",
} as const;

/**
 * The four services the website takes requests for, in the company's own words.
 *
 * SHARED_CARGO is what the enum has always been called and what the database
 * holds; "loose cargo" is what the business says out loud. The label lives here
 * so the two never have to be the same string.
 */
/**
 * The two services the rate book is kept in, said rather than abbreviated.
 *
 * LCL and FCL are the trade's own shorthand and the column stores them that
 * way, but a rate row and a quote are read by people who did not grow up in
 * freight.
 */
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  LCL: "Loose cargo",
  FCL: "Full container",
};

export const SERVICE_LABEL: Record<BookingType, string> = {
  FULL_CONTAINER: "Full container",
  SHARED_CARGO: "Loose cargo",
  SPECIAL_CARGO: "Special cargo",
  CUSTOMS_CLEARANCE: "Customs clearance",
};

/** Where a sailing is in its booking window, said to a customer. */
export const SAILING_STATUS_LABEL: Record<SailingStatus, string> = {
  OPEN_FOR_BOOKING: "Open for booking",
  CUTOFF_APPROACHING: "Cut-off approaching",
  CLOSED: "Closed for cargo",
  DEPARTED: "Departed China",
  IN_TRANSIT: "In transit",
  ARRIVED: "Arrived",
  DELAYED: "Delayed",
  CANCELLED: "Cancelled",
};

/** How a website request is progressing. */
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REJECTED: "Rejected",
};

/**
 * The two sentences that must sit under any estimated price on a public screen.
 *
 * Here rather than in lib/public-estimate.ts because the calculator prints them
 * in the browser and that module is server-only — and because the wording is
 * the owner's, not a programmer's, so it lives where wording lives.
 */
export const ESTIMATE_CAVEAT =
  "This is an estimated shipping charge. Final pricing may change after cargo verification, measurement, documentation review and Finance confirmation.";

export const FX_CAVEAT = "Prices may vary as exchange rates fluctuate.";
