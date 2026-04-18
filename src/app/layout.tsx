import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maro's LAB — Engagement",
  description: "Client engagement powered by Maro's LAB",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
