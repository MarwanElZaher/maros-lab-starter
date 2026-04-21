"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Analysis {
  id: string;
  rfpId: string;
  submitterEmail: string;
  clientName: string | null;
  decision: string;
  confidence: number;
  redFlagCount: number;
  createdAt: string;
}

const DECISION_BADGE: Record<string, string> = {
  GO: "bg-green-100 text-green-800",
  "CONDITIONAL GO": "bg-amber-100 text-amber-800",
  "NO-GO": "bg-red-100 text-red-800",
};

export default function AnalysesPage() {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [filters, setFilters] = useState({ decision: "", from: "", to: "", submitter: "" });

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u) setRole(u.role); });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.decision) params.set("decision", filters.decision);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.submitter && role === "sales_director") params.set("submitter", filters.submitter);

    fetch(`/api/analyses?${params}`)
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((data) => setAnalyses(data.analyses ?? []))
      .finally(() => setLoading(false));
  }, [filters, role]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Past Analyses</h1>
        <div className="flex gap-3">
          {role === "sales_director" && (
            <button
              onClick={() => { window.location.href = "/api/analyses/export"; }}
              className="text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Export CSV
            </button>
          )}
          <button
            onClick={() => router.push("/upload")}
            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            + New Analysis
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={filters.decision}
          onChange={(e) => setFilters((f) => ({ ...f, decision: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All decisions</option>
          <option value="GO">GO</option>
          <option value="CONDITIONAL GO">CONDITIONAL GO</option>
          <option value="NO-GO">NO-GO</option>
        </select>

        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="From"
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          placeholder="To"
        />

        {role === "sales_director" && (
          <input
            type="email"
            value={filters.submitter}
            onChange={(e) => setFilters((f) => ({ ...f, submitter: e.target.value }))}
            placeholder="Filter by submitter email"
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-60"
          />
        )}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center">Loading…</p>
      ) : analyses.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 mb-4">No analyses found.</p>
          <button
            onClick={() => router.push("/upload")}
            className="text-indigo-600 underline text-sm"
          >
            Upload your first RFP
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Decision</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Confidence</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Red Flags</th>
                {role === "sales_director" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Submitter</th>
                )}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/analyses/${a.id}`)}
                  className="border-b border-gray-100 cursor-pointer hover:bg-indigo-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {a.clientName ?? <span className="text-gray-400 italic">Unknown</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${DECISION_BADGE[a.decision] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {a.decision}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${a.confidence}%` }}
                        />
                      </div>
                      <span className="text-gray-700">{a.confidence}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{a.redFlagCount}</td>
                  {role === "sales_director" && (
                    <td className="px-4 py-3 text-gray-500 text-xs">{a.submitterEmail}</td>
                  )}
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
