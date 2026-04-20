"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Me {
  email: string;
  role: "presales_engineer" | "sales_director";
}

export function NavBar() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => null);
  }, []);

  return (
    <nav className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-6">
      <Link href="/upload" className="font-semibold text-indigo-600 hover:text-indigo-800">
        RFP Analyzer
      </Link>
      <Link href="/upload" className="text-sm text-gray-600 hover:text-gray-900">
        Upload
      </Link>
      {me?.role === "sales_director" && (
        <>
          <Link href="/admin/kb" className="text-sm text-gray-600 hover:text-gray-900">
            KB Admin
          </Link>
          <Link href="/admin/audit" className="text-sm text-gray-600 hover:text-gray-900">
            Audit Log
          </Link>
        </>
      )}
      {me && (
        <span className="ml-auto text-xs text-gray-400">
          {me.email} · {me.role === "sales_director" ? "Sales Director" : "Presales Engineer"}
        </span>
      )}
    </nav>
  );
}
