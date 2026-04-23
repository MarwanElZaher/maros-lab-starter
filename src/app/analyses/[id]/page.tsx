"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import "@copilotkit/react-ui/styles.css";
import { RfpReport, OverrideDecision, OverrideFields } from "@/types/rfp";
import { ReportView, DECISION_STYLES } from "@/components/ReportView";
import { OverrideModal, overrideBadgeStyle, overrideLabel } from "@/components/OverrideModal";

interface AnalysisRecord extends OverrideFields {
  id: string;
  rfpId: string;
  clientName: string | null;
  submitterEmail: string;
  decision: string;
  confidence: number;
  createdAt: string;
  recommendation: RfpReport;
}

const OVERRIDE_ELIGIBLE_DECISIONS = new Set(["NO-GO", "CONDITIONAL GO"]);

export default function AnalysisDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => { if (u) setUserRole(u.role); })
      .catch(() => {});
  }, []);

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

  function handleOverrideSuccess(decision: OverrideDecision) {
    setShowModal(false);
    setAnalysis((prev) =>
      prev
        ? { ...prev, overrideDecision: decision }
        : prev
    );
    setToast("Override recorded successfully.");
    setTimeout(() => setToast(null), 4000);
  }

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

  const canOverride =
    userRole === "sales_director" &&
    analysis.overrideDecision === "none" &&
    OVERRIDE_ELIGIBLE_DECISIONS.has(analysis.decision);

  const hasOverride = analysis.overrideDecision !== "none";

  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      {showModal && (
        <OverrideModal
          analysisId={analysis.id}
          onClose={() => setShowModal(false)}
          onSuccess={handleOverrideSuccess}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

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
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${decisionStyle.bg} ${decisionStyle.text}`}
            >
              {analysis.decision}
            </span>

            {hasOverride && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${overrideBadgeStyle(analysis.overrideDecision)}`}
              >
                {overrideLabel(analysis.overrideDecision)}
              </span>
            )}

            <span>{new Date(analysis.createdAt).toLocaleDateString()}</span>
            <span>{analysis.submitterEmail}</span>

            {canOverride && (
              <button
                onClick={() => setShowModal(true)}
                className="ml-auto text-xs bg-amber-50 border border-amber-300 text-amber-800 px-3 py-1 rounded-full hover:bg-amber-100 transition-colors"
              >
                Override analyzer decision
              </button>
            )}

            {hasOverride && userRole === "sales_director" && (
              <span className="ml-auto text-xs text-gray-400 italic">
                Override recorded — contact support to amend
              </span>
            )}
          </div>
        </div>

        {hasOverride && (
          <details className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm">
            <summary className="font-medium text-amber-900 cursor-pointer">
              Override details
            </summary>
            <div className="mt-3 space-y-2 text-gray-700">
              <p>
                <span className="font-medium">Decision:</span>{" "}
                {overrideLabel(analysis.overrideDecision)}
              </p>
              {analysis.overrideScope && (
                <p>
                  <span className="font-medium">Scope:</span> {analysis.overrideScope}
                </p>
              )}
              {analysis.overrideRationale && (
                <p>
                  <span className="font-medium">Rationale:</span> {analysis.overrideRationale}
                </p>
              )}
              {analysis.overrideByUserEmail && (
                <p className="text-xs text-gray-500">
                  By {analysis.overrideByUserEmail}
                  {analysis.overrideAt
                    ? ` · ${new Date(analysis.overrideAt).toLocaleString()}`
                    : ""}
                </p>
              )}
            </div>
          </details>
        )}

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
