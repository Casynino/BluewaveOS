import { permanentRedirect } from "next/navigation";

/* Rates and the calculator are one page: the rate book is answered, not
   listed. Old links and bookmarks to /rates land there. */
export default function RatesPage() {
  permanentRedirect("/calculator");
}
