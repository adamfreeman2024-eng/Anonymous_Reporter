import { NextIntlClientProvider, hasLocale } from "next-intl";
import { ThemeProvider } from "@/components/ThemeProvider";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    messages = (await import("../../messages/hy.json")).default;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider>
        {children}
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
