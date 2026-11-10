"use client";

import { createContext, useContext } from "react";
import Link from "next/link";

export type AuthView = "signin" | "create";

/**
 * Set by the sign-in page's phone gate (app/login/login-gate.tsx): it shows one
 * of its two cards. Elsewhere — the register page, a computer — there is none.
 */
export const AuthSwitchContext = createContext<((view: AuthView) => void) | null>(null);

/**
 * A link between Sign in and Create account. On a phone, inside the sign-in
 * page's pop-up, it swaps the card in place (and starts Create account again
 * from the phone number); anywhere else it is an ordinary link to its page.
 */
export function AuthSwitch({
  to,
  href,
  className,
  children,
}: {
  to: AuthView;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const show = useContext(AuthSwitchContext);
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (show && window.matchMedia("(max-width: 767px)").matches) {
          e.preventDefault();
          show(to);
        }
      }}
    >
      {children}
    </Link>
  );
}
