import { cn } from "@/lib/utils";

/**
 * THE GREETING AT THE TOP OF EVERY HOME.
 *
 * One short greeting, the same for everybody (owner, 16 Nov 2026, from the
 * look of his ZELab system): "Mambo vipi?" and the first name, then one line
 * saying what the person is here to do. No job title, no rules, no wide
 * capitals. Left, where the eye starts, with the port fading in on the right.
 *
 * "Mambo vipi? " is already twelve letters, so a long name would be cut off on
 * a phone: the type steps down a size as the whole greeting grows, so every
 * name is read in full. A computer has the room and keeps one size.
 */
export function GreetingBanner({
  hello,
  name,
  line,
  tools,
  image = "/photos/port-cranes.jpg",
}: {
  hello: string;
  name: string;
  line: string;
  /** The bell and the night switch, at the right on a computer (a phone has its own bar). */
  tools?: React.ReactNode;
  image?: string | null;
}) {
  const length = hello.length + 1 + name.length;
  const size =
    length <= 18 ? "text-[1.65rem]" : length <= 22 ? "text-[1.45rem]" : length <= 26 ? "text-[1.3rem]" : "text-[1.15rem]";

  return (
    <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#06142b_0%,#0b2147_45%,#123a78_100%)] text-white shadow-[0_12px_30px_-14px_rgba(5,22,39,0.75)] ring-1 ring-white/10 print:hidden">
      {/* A light from the right, where the port is. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_220px_at_92%_60%,rgba(64,192,232,0.22),transparent_62%)]"
      />
      {image ? (
        /* A phone has room for the words or the picture, not both: there the
           port is narrower and quieter, so it never sits under the name. */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-[40%] bg-cover bg-center opacity-40 [mask-image:linear-gradient(to_left,#000_20%,transparent)] sm:w-[38%] sm:opacity-70 lg:w-[34%] lg:opacity-85"
          style={{ backgroundImage: `url(${image})` }}
        />
      ) : null}

      {tools ? <div className="absolute right-4 top-4 z-10 flex items-center gap-2">{tools}</div> : null}

      <div className="relative flex min-h-[5.5rem] min-w-0 flex-col justify-center px-5 py-4 text-left sm:min-h-[7rem] sm:px-7">
        <h1 className={cn("max-w-full truncate leading-tight tracking-tight text-white sm:max-w-[60%] sm:text-3xl", size)}>
          <span className="font-normal text-white/70">{hello}</span> <span className="font-semibold">{name}</span>
        </h1>
        <p className="mt-1 max-w-[68%] text-[12.5px] leading-snug text-white/60 sm:max-w-[60%] sm:text-sm">{line}</p>
      </div>
    </section>
  );
}
