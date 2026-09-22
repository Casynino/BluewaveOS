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
  /** The line the company answers on WhatsApp — the owner's: +255 628 430 911.
      Calls still reach the office number above. */
  whatsapp: "255628430911",
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
  /* What a day on the Dar floor costs once the free week is up. Printed on
     every bill as the storage policy; changed in settings, not here. */
  storagePerDay: 5,
  storageCurrency: "USD",
  instagram: "bluewave_cargo",
  /* The four the company prints, in its own order. VAT is not among them
     while the company's rate is nil — a bill that names a tax it does not
     charge is a bill somebody will argue with. */
  invoiceTerms: [
    "All payments must be made to our official bank account within 48-72 hours.",
    "The invoice total includes customs, shipping and clearing charges.",
    "Any USD rate change before payment will require a revised invoice.",
    "Complaints must be raised within 24 hours of invoice issuance.",
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

/**
 * Where customers collect — the pickup warehouse, which is not the office. The
 * office in Kariakoo is `darAddress` above; the goods are handed over here.
 * Arrival, ready and pickup messages, pickup notes and tracking all read this
 * row. scripts/set-dar-warehouse-address.ts writes it to a live database.
 */
export const DAR_WAREHOUSE = {
  code: "DAR",
  name: "Dar es Salaam Warehouse",
  kind: "TANZANIA" as const,
  addressLocal: null as string | null,
  addressEnglish: "Tabata Matumbi, nyuma ya Azania Group, Dar es Salaam, Tanzania",
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
