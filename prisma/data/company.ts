/**
 * BLUEWAVE CARGO, AS THE BUSINESS PRESENTS ITSELF.
 *
 * The one place the company's own facts live before they reach the database.
 * Both seeds read from here; after the first run every value belongs to
 * CompanySetting, BankAccount and Warehouse and is edited at
 * /app/admin/settings and /app/finance/accounts — never in a component.
 *
 * Sources: the company's printed invoice, its Instagram profile
 * (@bluewave_cargo) and the China address it sends customers. A field nobody
 * has confirmed is left null rather than filled with something plausible: a
 * wrong phone number on an invoice is worse than no phone number.
 */

export const COMPANY = {
  name: "BlueWave Cargo",
  tagline: "From sourcing to delivery",
  /** Not published anywhere yet. Set it in settings once there is one. */
  email: null as string | null,
  phone: "+255 688 887 784",
  altPhone: "+255 628 430 911",
  /** The main office line, which the company answers on WhatsApp. */
  whatsapp: "255688887784",
  darAddress: "Aggrey & Likoma Street, near Mkombozi Bank, Kariakoo, Dar es Salaam, Tanzania",
  chinaAddress: "广东省佛山市南海区大沥镇沥雅路翔丰产业园区1栋 入仓号：BW-021",
  /** The company that signs for goods in China has not been given to us. */
  chinaEntity: null as string | null,
  darEntity: "SCOHU BLUEWAVE CARGO LIMITED",
  darPostal: null as string | null,
  tin: "156 894 648",
  vrn: null as string | null,
  /** The company's invoice shows VAT at 0%. Changed in settings when that changes. */
  vatPercent: 0,
  freeStorageDays: 7,
  instagram: "bluewave_cargo",
  invoiceTerms: [
    "Invoice must be paid within 48 hours.",
    "All payments must be through our bank accounts or cash.",
  ].join("\n"),
};

export const CHINA_WAREHOUSE = {
  code: "FS",
  name: "Foshan Warehouse",
  kind: "CHINA" as const,
  /* In Chinese first: this is the string a customer forwards to a factory, and
     a driver in Nanhai reads it off a phone. The entry number (入仓号) is part
     of the address — the park's gate books goods in against it. */
  addressLocal: "广东省佛山市南海区大沥镇沥雅路翔丰产业园区1栋 入仓号：BW-021",
  addressEnglish:
    "Building 1, Xiangfeng Industrial Park, Liya Road, Dali Town, Nanhai District, Foshan, Guangdong (warehouse entry no. BW-021)",
  city: "Foshan",
  country: "China",
  /* Both lines, as the company prints them. Shown to the supplier, never dialled
     from a link, so one field carries the pair. */
  phone: "+86 153 6042 1106 / +86 186 6654 4018",
};

export const DAR_WAREHOUSE = {
  code: "DAR",
  name: "Dar es Salaam Warehouse",
  kind: "TANZANIA" as const,
  addressLocal: null as string | null,
  addressEnglish: "Aggrey & Likoma Street, near Mkombozi Bank, Kariakoo, Dar es Salaam",
  city: "Dar es Salaam",
  country: "Tanzania",
  phone: "+255 688 887 784",
};

/** The accounts printed on the company's invoice, in the order it prints them. */
export const COLLECTION_ACCOUNTS = [
  {
    kind: "BANK" as const,
    bankName: "CRDB BANK",
    accountName: "SCOHU BLUEWAVE CARGO LIMITED",
    accountNumber: "0250696722000",
    currency: "USD",
    branch: null as string | null,
  },
  {
    kind: "BANK" as const,
    bankName: "CRDB BANK",
    accountName: "SCOHU BLUEWAVE CARGO LIMITED",
    accountNumber: "0150696722000",
    currency: "TZS",
    branch: null as string | null,
  },
  {
    kind: "MOBILE_MONEY" as const,
    bankName: "TIGO LIPA",
    accountName: "SCOHU BLUEWAVE CARGO LIMITED",
    accountNumber: "9608058",
    currency: "TZS",
    branch: null as string | null,
  },
];

/** 1 USD = 2,700 TZS, the rate on the company's invoice. */
export const OPENING_USD_TZS = 2700;
