import { cn } from "@/lib/utils";

/**
 * THE BANNER AT THE TOP OF A HOME SCREEN, KEPT TO WHAT IT IS FOR.
 *
 * The person's name in wide capitals between two thin gold rules, their job
 * title small and gold under it, then the day — the same banner on every
 * desk's home. At most a couple of buttons under that; everything
 * else is on the page below or in the menu, where it already lives.
 *
 * Navy in both themes, so a bright banner never competes with the data under
 * it. The photograph fades in from the right on a computer only: on a phone it
 * would sit under the name.
 */
export function CleanBanner({
  title,
  kicker,
  line,
  children,
  image = "/photos/port-cranes.jpg",
  tools,
  className,
}: {
  title: React.ReactNode;
  /** Whose it is: the job title, or the route. Set small, wide and gold. */
  kicker?: React.ReactNode;
  /** The day, or whatever one line belongs under the title. */
  line?: React.ReactNode;
  /** A button or two, centred under the lines. */
  children?: React.ReactNode;
  /** A photo that fades in from the right edge, from /public/photos. */
  image?: string | null;
  /** The bell and the night switch, small at the left on a computer. */
  tools?: React.ReactNode;
  className?: string;
}) {
  const long = typeof title === "string" && title.length > 10;
  return (
    <section
      className={cn(
        /* On a phone, a smaller banner: deep navy into sea blue, the port
           behind a navy veil. On a computer the flat navy with its glow and
           the photograph fading in from the right. */
        "relative overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#07112a_0%,#0b1d47_48%,#17387a_100%)] text-white shadow-[0_10px_30px_-14px_rgba(5,22,39,0.7)] ring-1 ring-white/10 lg:bg-[#0a1a33] lg:bg-none print:hidden",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(700px_220px_at_88%_55%,rgba(47,111,208,0.42),transparent_62%)] lg:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_170px_at_50%_0%,rgba(253,196,0,0.10),transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_140%,rgba(88,140,235,0.42),transparent_55%),radial-gradient(ellipse_at_0%_-30%,rgba(227,179,65,0.22),transparent_50%)] lg:hidden"
      />
      {image ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-45 [mask-image:linear-gradient(to_right,transparent,black_70%)] lg:hidden"
            style={{ backgroundImage: `url(${image})` }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(7,17,42,0.78),rgba(7,17,42,0.15)_80%)] lg:hidden" />
        </>
      ) : null}
      {image ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30%] bg-cover bg-center opacity-75 [mask-image:linear-gradient(to_left,#000_40%,transparent)] lg:block"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : null}

      {tools ? <div className="absolute left-6 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2">{tools}</div> : null}

      <div className="relative flex min-h-[6rem] flex-col items-center justify-center px-5 py-4 text-center lg:min-h-[7.5rem] lg:py-5">
        <h1
          className={cn(
            "flex max-w-full items-center gap-4 font-semibold uppercase text-white",
            long
              ? "text-base tracking-[0.22em] sm:text-2xl sm:tracking-[0.3em] lg:text-3xl"
              : "text-xl tracking-[0.35em] sm:text-3xl sm:tracking-[0.5em] lg:text-4xl"
          )}
        >
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
          {/* The padding gives back the space the wide tracking leaves after the
              last letter, so the word sits truly in the middle. */}
          <span className={cn("min-w-0 break-words", long ? "pl-[0.22em] sm:pl-[0.3em]" : "pl-[0.35em] sm:pl-[0.5em]")}>
            {title}
          </span>
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
        </h1>
        {kicker ? (
          <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[0.32em] text-[#fdc400] lg:mt-2 lg:text-[11px]">{kicker}</p>
        ) : null}
        {line ? <p className="tnum mt-1 text-[13px] text-white/70 lg:mt-1.5 lg:text-sm">{line}</p> : null}
        {children ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
      </div>
    </section>
  );
}
