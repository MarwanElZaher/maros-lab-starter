import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Real Estate Scraper — Maro's LAB",
  description: "Search apartments for sale",
};

export default function RealEstateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
