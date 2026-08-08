"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

const LOCALES = [
  { code: "hy", label: "Հայ" },
  { code: "en", label: "EN" },
  { code: "ru", label: "RU" },
];

/**
 * Minimal locale switcher — works with next-intl `localePrefix: "as-needed"`.
 * Preserves the current path when switching languages.
 */
export function LocaleSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();

  // Strip any existing locale prefix, then prepend the target locale.
  const rest = pathname.replace(/^\/(hy|en|ru)(?=\/|$)/, "") || "/";

  return (
    <nav
      aria-label="Language switcher"
      className="flex items-center gap-1 text-xs font-medium"
    >
      {LOCALES.map((l) => {
        const active = l.code === locale;
        return (
          <Link
            key={l.code}
            href={`/${l.code}${rest}`}
            className={
              active
                ? "px-2 py-1 rounded bg-red-600 text-white"
                : "px-2 py-1 rounded text-zinc-500 hover:text-zinc-200"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
