/**
 * BlueWave Cargo's rate book, as the company keeps it (USD).
 *
 * Priced per cargo type — a cubic metre of car batteries is not a cubic metre
 * of clothes. Dense goods are priced by the tonne, and are stored per kilogram
 * (a tonne rate divided by 1000) because that is the unit the pricing engine
 * weighs in; the money comes out the same.
 *
 * Not here, on purpose:
 * - Cheap mobile phones (1 US$/piece) and smart phones (3 US$/piece). The
 *   engine prices by volume, weight or flat per consignment, not per piece;
 *   loaded as FLAT they would charge one dollar a consignment. They are
 *   priced on the price list until per-piece pricing exists.
 * - "Debt" and "Transport to cargo": charges, not kinds of cargo.
 * - A general rate. The company has none; a type with no rate is left
 *   unpriced for the confirmer rather than charged a guessed figure.
 */
export type RateUnit = "CBM" | "TONNE";

export const RATE_BOOK: [english: string, swahili: string, unit: RateUnit, usd: number][] = [
  ["Motorcycle accessories spare parts", "Vipuli vya pikipiki", "CBM", 350],
  ["Motorcycle battery", "Betri za pikipiki", "CBM", 480],
  ["Fabric", "Vitenge", "CBM", 1000],
  ["TV", "Runinga", "CBM", 400],
  ["Motorcycle spare parts heavy", "Vipuli vya pikipiki nzito", "CBM", 400],
  ["Clothes", "Nguo", "CBM", 400],
  ["Car spare parts", "Spea za magari", "CBM", 500],
  ["Car accessories", "Vifaa vya magari", "CBM", 400],
  ["Car spring", "Chemchem za magari", "TONNE", 500],
  ["Electronic car / Motorcycle", "Gari za umeme / Pikipiki", "CBM", 500],
  ["Bolt and Nuts", "Bolti na nuts", "TONNE", 500],
  ["Engine Oil", "Mafuta ya Injini", "CBM", 450],
  ["Bales compressed", "Marobota", "CBM", 550],
  ["Handbags", "Mapochi / Mkoba", "CBM", 400],
  ["Wallet", "Wallet", "CBM", 400],
  ["Shoes", "Viatu", "CBM", 350],
  ["Wigs / Hair", "Wigi / Nywele", "CBM", 400],
  ["Stationary", "Steshenari", "CBM", 380],
  ["Toner / Ink / Catridges", "Wino", "CBM", 400],
  ["Machines / Heavy goods", "Mashine / bidhaa nzito", "TONNE", 500],
  ["Heavy Electronics eg Fridge, AC, Freezer", "Kiyoyozi / Jokofu", "CBM", 450],
  ["Roofing Sheet", "Mabati", "TONNE", 700],
  ["Tiles (ceramic)", "Marumaru", "TONNE", 500],
  ["Hardware", "Hardware", "CBM", 450],
  ["Solar items", "Vifaa vya Solar / umeme wa jua", "CBM", 400],
  ["Electronic products", "Vifaa vya umeme", "CBM", 450],
  ["Mobile Accessories", "Vifaa vya simu", "CBM", 400],
  ["Mobile Phone Battery", "Betri za simu", "CBM", 400],
  ["Photographic Equipments", "Vifaa vya picha na camera", "CBM", 450],
  ["Video cd", "CD", "CBM", 800],
  ["Cosmetics", "Vipodozi", "CBM", 450],
  ["Glasses / Jewelery", "Urembo", "CBM", 400],
  ["Furniture", "Fenicha", "CBM", 400],
  ["Sundries and Supermarket", "Supermarket", "CBM", 500],
  ["Bicycle", "Baiskeli", "CBM", 450],
  ["Baby Toys", "Midoli ya watoto", "CBM", 400],
  ["Music System", "Muziki", "CBM", 450],
  ["Watches", "Saa", "CBM", 400],
  ["Mercury", "Mekyuli", "CBM", 1000],
  ["Led Lamp", "Taa za ofisi", "CBM", 450],
  ["Computer accessories", "Vifaa vya compyuta", "CBM", 450],
  ["Non woven bags", "Mfuko", "CBM", 450],
  ["Kitchen Utencils", "Vyombo vya jikoni", "CBM", 400],
  ["Tractor parts", "Vifaa vya trekta", "CBM", 500],
  ["Transformer and Generator", "Transfoma na Genereta", "TONNE", 500],
  ["Foil and Takeaway", "Foili", "CBM", 450],
  ["Mattress", "Magodoro", "CBM", 400],
  ["Fuel Pump", "Pampu za sheli ya mafuta", "CBM", 500],
  ["Blender", "Blenda", "CBM", 400],
  ["Medals", "Medali", "CBM", 400],
  ["Bottles / Empty cans", "Chupa", "CBM", 400],
  ["Baby Diaper", "Baby daipa", "CBM", 380],
  ["Shisha", "Shisha", "CBM", 450],
  ["Car tyres", "Tairi", "CBM", 400],
  ["Sealant", "Sealant", "CBM", 500],
  ["Incubator", "Incubeta", "CBM", 450],
  ["Glass", "Glasi", "CBM", 500],
  ["Car Battery", "Betri za gari", "CBM", 800],
  ["Bedsheet", "Mashuka", "CBM", 500],
  ["Curtains", "Pazia", "CBM", 400],
  ["Car paint", "Rangi za magari", "CBM", 450],
  ["Dolls", "Midoli", "CBM", 350],
  ["Sport Accessories", "Vifaa vya michezo", "CBM", 400],
  ["Perfume", "Pafyumu", "CBM", 500],
  ["Oven", "Oveni", "CBM", 400],
  ["Frames", "Fremu", "CBM", 400],
  ["Laboratory Equipment", "Vifaa vya maabara", "CBM", 400],
  ["Transmission Fluid", "", "CBM", 480],
  ["Microscope", "", "CBM", 450],
  ["Saloon Stuff", "Vifaa vya saluni", "CBM", 400],
];

/** A rate book row as ShippingRate stores it. */
export function rateRow([english, swahili, unit, usd]: (typeof RATE_BOOK)[number]) {
  return {
    cargoType: english,
    basis: unit === "TONNE" ? ("PER_KG" as const) : ("PER_CBM" as const),
    rate: unit === "TONNE" ? usd / 1000 : usd,
    notes: [swahili ? `Swahili: ${swahili}` : null, unit === "TONNE" ? `USD ${usd} per tonne` : null]
      .filter(Boolean)
      .join(" · ") || null,
  };
}
