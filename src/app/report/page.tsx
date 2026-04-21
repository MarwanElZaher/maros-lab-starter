"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { RfpReport } from "@/types/rfp";
import { ReportView } from "@/components/ReportView";

export default function ReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [report, setReport] = useState<RfpReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");

    if (id) {
      const cached = sessionStorage.getItem("rfp_report");
      if (cached) {
        const parsed = JSON.parse(cached) as RfpReport & { rfpId?: string };
        if (parsed.rfpId === id) {
          setReport(parsed);
          setLoaded(true);
          return;
        }
      }
      fetch(`/api/analyses/${id}`)
        .then((r) => {
          if (r.status === 403) throw new Error("forbidden");
          if (!r.ok) throw new Error("not_found");
          return r.json();
        })
        .then((data) => {
          const rec = data.recommendation as RfpReport;
          setReport({ ...rec, rfpId: data.rfpId });
        })
        .catch((e: Error) => {
          setError(e.message === "forbidden" ? "You do not have access to this report." : "Report not found.");
        })
        .finally(() => setLoaded(true));
    } else {
      const stored = sessionStorage.getItem("rfp_report");
      if (stored) {
        setReport(JSON.parse(stored) as RfpReport);
      }
      setLoaded(true);
    }
  }, [searchParams]);

  if (!loaded) return null;

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={() => router.push("/analyses")} className="text-indigo-600 underline text-sm">
          View past analyses
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">No report loaded. Please upload an RFP first.</p>
        <button
          onClick={() => router.push("/upload")}
          className="text-indigo-600 underline text-sm"
        >
          Go to Upload
        </button>
      </div>
    );
  }

  const systemPrompt = `You are an expert bid advisor. The user has just analyzed an RFP with the following result:\n${JSON.stringify(report, null, 2)}\n\nAnswer follow-up questions about this tender concisely.`;

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Bid Analysis Report</h1>
          <button
            onClick={() => router.push("/upload")}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            ← New Analysis
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <ReportView report={report} />
        </div>
      </div>
      <CopilotSidebar
        defaultOpen={false}
        instructions={systemPrompt}
        labels={{ title: "Ask about this tender", placeholder: "E.g. What are the main risks?" }}
      />
    </CopilotKit>
  );
}
