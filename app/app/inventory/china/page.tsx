import type { Metadata } from "next";

import InventoryPage from "../page";

export const metadata: Metadata = { title: "Cargo in China" };

/**
 * Everything still in China, for every desk.
 *
 * The same floor screen, asked about the origin end of the route: Dar's own
 * floor stays at /app/inventory, and this address is what the "Cargo in China"
 * menu entry opens, so the menu can tell the two apart by address alone.
 */
export default async function CargoInChinaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return InventoryPage({ searchParams: Promise.resolve({ ...params, at: "china" }) });
}
