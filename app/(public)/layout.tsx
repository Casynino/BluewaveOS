import { bwCompany } from "@/components/bw/data";
import { bwFontVars } from "@/components/bw/fonts";
import { BwFooter } from "@/components/bw/footer";
import { BwHeader } from "@/components/bw/header";
import { BwSky } from "@/components/bw/sky";

/**
 * The public site: its own type, its own palette, its own header and footer.
 * Scoped under `.bw` so none of it reaches the staff app or the portal.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const company = await bwCompany();
  return (
    <div className={`bw ${bwFontVars} relative isolate flex min-h-dvh flex-col`}>
      <BwSky />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:bg-bw-panel focus:px-4 focus:py-2 focus:text-bw-fg"
      >
        Skip to content
      </a>
      <BwHeader contact={{ dar: company.phone, darHref: company.phoneHref, china: company.chinaPhone }} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <BwFooter company={company} />
    </div>
  );
}
