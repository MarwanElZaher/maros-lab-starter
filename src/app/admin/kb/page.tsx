"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Dataset = "products" | "pricing" | "past_bids" | "licensing" | "user_guides";
type DocStatus = "parsing" | "ready" | "failed" | "pending";

interface KbDoc {
  id: string;
  name: string;
  status: DocStatus;
  created_at: string | null;
}

const DATASET_LABELS: Record<Dataset, string> = {
  products: "Products",
  pricing: "Pricing",
  past_bids: "Past Bids & Case Studies",
  licensing: "Licensing",
  user_guides: "User Guides",
};

const DATASET_HINTS: Record<Dataset, string> = {
  products: "Brochures, architecture docs, and data sheets that describe product features and specifications.",
  pricing: "Price lists, discount tiers, and SKU pricing tables. Do not upload licensing rules here.",
  past_bids: "Past bid submissions and customer case studies showing real-world delivery evidence.",
  licensing: "Edition entitlements, SKU-to-license mappings, and usage rights. Not for price lists.",
  user_guides: "Product manuals, installation guides, and step-by-step how-to documentation.",
};

const STATUS_CLASSES: Record<DocStatus, string> = {
  ready: "bg-green-100 text-green-800",
  parsing: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-gray-100 text-gray-600",
};

export default function KbAdminPage() {
  const [dataset, setDataset] = useState<Dataset>("products");
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [parsingId, setParsingId] = useState<string | null>(null);

  const fetchDocs = useCallback(async (ds: Dataset) => {
    setLoadingDocs(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/kb?dataset=${ds}`);
      if (res.status === 403) { setDocsError("Access denied. Sales Director role required."); return; }
      const json = await res.json() as { docs?: KbDoc[]; error?: string };
      if (json.docs) setDocs(json.docs);
      else setDocsError(json.error ?? "Failed to load documents");
    } catch {
      setDocsError("Network error");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs(dataset);
  }, [dataset, fetchDocs]);

  useEffect(() => {
    const hasParsingDocs = docs.some((d) => d.status === "parsing" || d.status === "pending");
    if (!hasParsingDocs) return;
    const interval = setInterval(() => { void fetchDocs(dataset); }, 10_000);
    return () => clearInterval(interval);
  }, [docs, dataset, fetchDocs]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dataset", dataset);
      const res = await fetch("/api/kb", { method: "POST", body: form });
      if (res.status === 403) { setUploadMsg({ ok: false, text: "Access denied. Sales Director role required." }); return; }
      const json = await res.json() as { ok?: boolean; error?: string; docId?: string };
      if (json.ok) {
        setUploadMsg({ ok: true, text: `Uploaded successfully. Document ID: ${json.docId ?? "unknown"}` });
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await fetchDocs(dataset);
      } else {
        setUploadMsg({ ok: false, text: json.error ?? "Upload failed" });
      }
    } catch {
      setUploadMsg({ ok: false, text: "Network error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleParse(docId: string) {
    setParsingId(docId);
    try {
      const res = await fetch(`/api/kb/${docId}/parse?dataset=${dataset}`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        alert(json.error ?? "Re-parse failed");
        return;
      }
      await fetchDocs(dataset);
    } catch {
      alert("Network error");
    } finally {
      setParsingId(null);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document from the knowledge base?")) return;
    setDeletingId(docId);
    try {
      const res = await fetch(`/api/kb/${docId}?dataset=${dataset}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        alert(json.error ?? "Delete failed");
        return;
      }
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      alert("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Knowledge Base Admin</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Dataset</label>
          <div className="flex flex-wrap gap-4">
            {(Object.entries(DATASET_LABELS) as [Dataset, string][]).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer" title={DATASET_HINTS[value]}>
                <input
                  type="radio"
                  name="dataset"
                  value={value}
                  checked={dataset === value}
                  onChange={() => { setDataset(value); setUploadMsg(null); }}
                  className="accent-indigo-600"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">{DATASET_HINTS[dataset]}</p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Upload Document (PDF / DOCX)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploadMsg(null); }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          {uploadMsg && (
            <p className={`text-sm rounded p-3 border ${uploadMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
              {uploadMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={!file || uploading}
            className="bg-indigo-600 text-white py-2 px-5 rounded-lg font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{DATASET_LABELS[dataset]} Documents</h2>
          <button
            onClick={() => fetchDocs(dataset)}
            disabled={loadingDocs}
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
          >
            {loadingDocs ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {docsError ? (
          <p className="text-sm text-red-600 px-6 py-4">{docsError}</p>
        ) : docs.length === 0 && !loadingDocs ? (
          <p className="text-sm text-gray-500 px-6 py-4">No documents in this dataset.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide bg-gray-50">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-mono text-xs text-gray-800 max-w-xs truncate" title={doc.name}>{doc.name}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[doc.status]}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-gray-500">
                    {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-6 py-3 text-right flex items-center justify-end gap-3">
                    <button
                      onClick={() => handleParse(doc.id)}
                      disabled={parsingId === doc.id || doc.status === "parsing"}
                      className="text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {parsingId === doc.id ? "Queuing…" : "Re-parse"}
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deletingId === doc.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === doc.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
