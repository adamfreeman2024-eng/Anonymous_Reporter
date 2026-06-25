"use client";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("theme");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={t("toggle")}
      className="fixed top-4 right-4 z-50 rounded-full p-3 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors duration-200"
      title={t("toggle")}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
