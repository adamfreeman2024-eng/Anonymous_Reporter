import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anonymous Reporter",
  description:
    "Zero-trust encrypted reporting — submit tips without revealing your identity.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
