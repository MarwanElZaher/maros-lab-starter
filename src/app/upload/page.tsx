"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RfpReport } from "@/types/rfp";

interface ProgressEvent {
  step: string;
  message: string;
  pct: number;
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress({ step: "start", message: "Starting upload…", pct: 5 });

    const form = new FormData();
    form.append("file", file);

    try {
      const response = await fetch("/api/rfp", { method: "POST", body: form });

      if (!response.ok || !response.body) {
        const text = await response.text();
        setError(text || "Upload failed");
        setUploading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const eventMatch = part.match(/^event: (\w+)\ndata: (.+)$/s);
          if (!eventMatch) continue;
          const [, eventName, dataStr] = eventMatch;
          const data = JSON.parse(dataStr);

          if (eventName === "progress") {
            setProgress(data as ProgressEvent);
          } else if (eventName === "result") {
            const report = data.report as RfpReport;
            sessionStorage.setItem("rfp_report", JSON.stringify(report));
            router.push("/report");
            return;
          } else if (eventName === "error") {
            setError(data.message ?? "Analysis failed");
            setUploading(false);
            return;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Upload RFP for Analysis</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-indigo-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
          />
          {file ? (
            <p className="text-sm text-gray-700 font-medium">{file.name}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-gray-500 text-sm">Click to select a PDF (up to 50 MB)</p>
              <p className="text-xs text-gray-400">RFP documents, tender packs, bid specs</p>
            </div>
          )}
        </div>

        {progress && uploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>{progress.message}</span>
              <span>{progress.pct}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {uploading ? "Analyzing…" : "Analyze RFP"}
        </button>
      </form>
    </div>
  );
}
