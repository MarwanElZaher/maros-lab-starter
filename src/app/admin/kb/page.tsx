"use client";

import { useState } from "react";

type KbAction = "add_product" | "update_pricing" | "archive_bid";

const ACTION_LABELS: Record<KbAction, string> = {
  add_product: "Add Product",
  update_pricing: "Update Pricing",
  archive_bid: "Archive Bid",
};

export default function KbAdminPage() {
  const [action, setAction] = useState<KbAction>("add_product");
  const [entity, setEntity] = useState("");
  const [dataJson, setDataJson] = useState("{}");
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(dataJson);
    } catch {
      setStatus({ ok: false, message: "Invalid JSON in data field" });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/kb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, entity, data }),
      });

      if (res.status === 403) {
        setStatus({ ok: false, message: "Access denied. Sales Director role required." });
        setLoading(false);
        return;
      }

      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setStatus({ ok: true, message: `${ACTION_LABELS[action]} completed successfully.` });
        setEntity("");
        setDataJson("{}");
      } else {
        setStatus({ ok: false, message: json.error ?? "Operation failed" });
      }
    } catch (err) {
      setStatus({ ok: false, message: err instanceof Error ? err.message : "Network error" });
    }

    setLoading(false);
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Knowledge Base Admin</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as KbAction)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {(Object.entries(ACTION_LABELS) as [KbAction, string][]).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {action === "add_product" ? "Product Name" : action === "update_pricing" ? "Document ID" : "Bid ID"}
          </label>
          <input
            type="text"
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            placeholder={action === "add_product" ? "e.g. Enterprise Security Suite" : "doc-id-xxx"}
          />
        </div>

        {action !== "archive_bid" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data (JSON)
            </label>
            <textarea
              value={dataJson}
              onChange={(e) => setDataJson(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder='{"price": 9999, "currency": "USD"}'
            />
          </div>
        )}

        {status && (
          <p className={`text-sm rounded p-3 border ${status.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !entity}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Processing…" : ACTION_LABELS[action]}
        </button>
      </form>
    </div>
  );
}
