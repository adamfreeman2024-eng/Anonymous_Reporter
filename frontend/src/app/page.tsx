import { ReportForm } from "@/components/ReportForm";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-16">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Anonymous Reporter
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-400">
          Submit encrypted, untraceable tips to law enforcement. No account
          required. Your identity is never stored.
        </p>
      </header>

      <ReportForm />
    </main>
  );
}
