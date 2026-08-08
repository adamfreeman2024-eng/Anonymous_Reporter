import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["hy", "en", "ru"],
  defaultLocale: "hy",
  localePrefix: "as-needed",
});
