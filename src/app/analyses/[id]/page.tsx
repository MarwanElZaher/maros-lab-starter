"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { RfpReport } from "@/types/rfp";
import { ReportView, DECISION_STYLES } from "@/components/ReportView";

interface AnalysisRecord {
  id: string;
  rfpId: string;
  clientName: string | null;
  submitterEmail: string;
  decision: string;
  confidence: number;
  createdAt: string;
  recommendation: RfpReport;
}

export default function AnalysisDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/analyses/${params.id}`)
      .then((r) => {
        if (r.status === 403) throw new Error("forbidden");
        if (!r.ok) throw new Error("not_found");
        return r.json();
      })
      .then((data: AnalysisRecord) => setAnalysis(data))
      .catch((e: Error) => {
        setError(
          e.message === "forbidden"
            ? "You do not have access to this report."
            : "Report not found."
        );
      })
      .finally(() => setLoaded(true));
  }, [params.id]);

  if (!loaded) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse bg-gray-100 rounded-xl h-64 mt-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => router.push("/analyses")}
          className="text-indigo-600 underline text-sm"
        >
          View past analyses
        </button>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Report not found.</p>
        <button
          onClick={() => router.push("/analyses")}
          className="text-indigo-600 underline text-sm"
        >
          View past analyses
        </button>
      </div>
    );
  }

  const report: RfpReport = { ...analysis.recommendation, rfpId: analysis.rfpId };
  const decisionStyle = DECISION_STYLES[analysis.decision] ?? DECISION_STYLES["NO-GO"];
  const systemPrompt = `You are an expert bid advisor. The user has just reviewed an RFP analysis with the following result:\n${JSON.stringify(report, null, 2)}\n\nAnswer follow-up questions about this tender concisely.`;

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push("/analyses")}
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            ← Past Analyses
          </button>
          <button
            onClick={() => router.push("/upload")}
            className="text-sm text-indigo-600 hover:text-indigo-800"
          >
            + New Analysis
          </button>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold">
            {analysis.clientName ?? "Unknown Client"}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${decisionStyle.bg} ${decisionStyle.text}`}
            >
              {analysis.decision}
            </span>
            <span>{new Date(analysis.createdAt).toLocaleDateString()}</span>
            <span>{analysis.submitterEmail}</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <ReportView report={report} logView={false} />
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
