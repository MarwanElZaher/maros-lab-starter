import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "RFP Analyzer — Maro's LAB",
  description: "AI-powered RFP bid analysis",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const isRealEstate = host.startsWith("realestate.");

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        {!isRealEstate && <NavBar />}
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
