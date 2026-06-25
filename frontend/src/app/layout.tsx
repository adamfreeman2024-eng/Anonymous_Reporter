import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anonymous Reporter",
  description: "Zero-Trust Anonymous Reporting System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hy" suppressHydrationWarning>
      <body className="min-h-screen bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        {children}
      </body>
    </html>
  );
}
