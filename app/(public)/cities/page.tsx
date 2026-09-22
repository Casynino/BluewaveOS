import { redirect } from "next/navigation";

/* The cities are laid out on the Explore China hub; there is no second list. */
export default function CitiesIndex() {
  redirect("/explore#cities");
}
