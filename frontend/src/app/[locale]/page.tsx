import { useTranslations } from "next-intl";
import { ReportForm } from "@/components/ReportForm";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HomePage() {
  const t = useTranslations("report");

  return (
    <main className="min-h-screen py-8 px-4 sm:py-16 sm:px-6 lg:px-8">
      <ThemeToggle />
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 text-center sm:mb-12">
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            🛡️ {t("title")}
          </h1>
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 sm:mt-4 sm:text-base">
            {t("subtitle")}
          </p>
        </div>
        <ReportForm />
      </div>
    </main>
  );
}
