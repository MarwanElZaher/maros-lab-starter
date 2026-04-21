"use client";

import { useEffect } from "react";
import { RfpReport, RedFlag } from "@/types/rfp";

const SEVERITY_COLORS: Record<RedFlag["severity"], string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  high: "bg-orange-100 text-orange-800 border-orange-200",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
};

export const DECISION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  GO: { bg: "bg-green-500", text: "text-white", label: "GO" },
  "CONDITIONAL GO": { bg: "bg-amber-500", text: "text-white", label: "CONDITIONAL GO" },
  "NO-GO": { bg: "bg-red-600", text: "text-white", label: "NO-GO" },
};

const OUTCOME_COLORS: Record<string, string> = {
  won: "text-green-600",
  lost: "text-red-600",
  withdrawn: "text-gray-500",
};

export function ReportView({ report, logView = true }: { report: RfpReport; logView?: boolean }) {
  useEffect(() => {
    if (!logView) return;
    fetch("/api/user/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (user) {
          fetch("/api/rfp/view-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rfpId: report.rfpId }),
          }).catch(() => null);
        }
      });
  }, [report.rfpId, logView]);

  const decision = DECISION_STYLES[report.decision] ?? DECISION_STYLES["NO-GO"];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-6">
        <span className={`px-5 py-2 rounded-full text-lg font-bold ${decision.bg} ${decision.text}`}>
          {decision.label}
        </span>
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">Bid Confidence</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-3">
              <div
                className="bg-indigo-500 h-3 rounded-full"
                style={{ width: `${report.confidence}%` }}
              />
            </div>
            <span className="text-sm font-semibold w-10 text-right">{report.confidence}%</span>
          </div>
        </div>
      </div>

      {/* Justifications */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Justifications</h2>
        <ul className="space-y-2">
          {report.justifications.map((j, i) => (
            <li key={i} className="flex gap-2 text-sm text-gray-700">
              <span className="text-indigo-500 mt-0.5">•</span>
              <span>{j}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Red Flags */}
      {report.redFlags.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Red Flags</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-4 font-medium">Severity</th>
                  <th className="pb-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.redFlags.map((rf, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[rf.severity]}`}
                      >
                        {rf.severity}
                      </span>
                    </td>
                    <td className="py-2 text-gray-700">{rf.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Similar Bids */}
      {report.similarBids.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Similar Bids</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.similarBids.map((bid, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-medium text-gray-900">{bid.title}</p>
                  <span className={`text-xs font-semibold ml-2 ${OUTCOME_COLORS[bid.outcome]}`}>
                    {bid.outcome.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{bid.relevance}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
