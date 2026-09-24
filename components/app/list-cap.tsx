import { T } from "@/lib/server-t";

/**
 * WHAT A LIST IS NOT SHOWING.
 *
 * Several operational lists read a fixed number of rows and draw them. Read
 * with nothing said, a clerk takes the last row on the page for the last row
 * there is — a container that sailed in March reads as a container that never
 * existed, and a consignment waiting to be priced reads as one already billed.
 * On a system somebody keeps books in, a silent cut is a lie.
 *
 * So the sentence says the size of the cut and the size of the whole, and
 * names the way to the rest. One key with the figures spliced in: a count
 * assembled out of three fragments translates into three fragments of Chinese
 * in English order.
 */
export function ListCap({
  shown,
  total,
  order = "newest",
}: {
  shown: number;
  total: number;
  /** Which end of the list the rows were taken from. */
  order?: "newest" | "oldest";
}) {
  if (total <= shown) return null;
  const sentence = T(
    order === "newest"
      ? "Showing the newest {shown} of {total}. Search or filter to reach the rest."
      : "Showing the oldest {shown} of {total}. Search or filter to reach the rest."
  )
    .replace("{shown}", String(shown))
    .replace("{total}", String(total));
  return <p className="px-1 text-xs text-muted-foreground">{sentence}</p>;
}
