import { permanentRedirect } from "next/navigation";

/* The China guide moved to Explore China; old links and bookmarks follow it. */
export default function ChinaPage() {
  permanentRedirect("/explore");
}
