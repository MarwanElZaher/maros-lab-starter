"use client";

import { useEffect, useState } from "react";
import { OverrideDecision } from "@/types/rfp";

interface PastAnalysis {
  id: string;
  clientName: string | null;
  decision: string;
  createdAt: string;
}

interface Props {
  analysisId: string;
  onClose: () => void;
  onSuccess: (overrideDecision: OverrideDecision) => void;
}

const DECISION_LABELS: Record<Exclude<OverrideDecision, "none">, string> = {
  no_go_confirmed: "Confirm analyzer (NO-GO stands)",
  go_full: "Go full-scope anyway",
  go_scoped: "Go scoped (sub-bid)",
};

const OVERRIDE_BADGE: Record<Exclude<OverrideDecision, "none">, string> = {
  no_go_confirmed: "bg-gray-100 text-gray-700",
  go_full: "bg-green-100 text-green-800",
  go_scoped: "bg-blue-100 text-blue-800",
};

export function overrideBadgeStyle(decision: OverrideDecision): string {
  if (decision === "none") return "";
  return OVERRIDE_BADGE[decision];
}

export function overrideLabel(decision: OverrideDecision): string {
  if (decision === "none") return "";
  const map: Record<Exclude<OverrideDecision, "none">, string> = {
    no_go_confirmed: "NO-GO Confirmed",
    go_full: "Override: Go Full-Scope",
    go_scoped: "Override: Go Scoped",
  };
  return map[decision];
}

export function OverrideModal({ analysisId, onClose, onSuccess }: Props) {
  const [decision, setDecision] = useState<Exclude<OverrideDecision, "none">>("no_go_confirmed");
  const [scope, setScope] = useState("");
  const [rationale, setRationale] = useState("");
  const [cited, setCited] = useState<string[]>([]);
  const [pastAnalyses, setPastAnalyses] = useState<PastAnalysis[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analyses")
      .then((r) => (r.ok ? r.json() : { analyses: [] }))
      .then((data) => {
        const all: PastAnalysis[] = (data.analyses ?? []).filter(
          (a: PastAnalysis) => a.id !== analysisId
        );
        setPastAnalyses(all);
      })
      .catch(() => {});
  }, [analysisId]);

  function toggleCited(id: string) {
    setCited((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/rfp/${analysisId}/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          override_decision: decision,
          override_rationale: rationale,
          override_scope: decision === "go_scoped" ? scope : undefined,
          cited_analysis_ids: cited,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? `Request failed (${res.status})`);
        return;
      }

      onSuccess(decision);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Override analyzer decision</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Decision radio */}
          <fieldset>
            <legend className="text-sm font-medium text-gray-700 mb-2">Final decision</legend>
            <div className="space-y-2">
              {(Object.keys(DECISION_LABELS) as Array<Exclude<OverrideDecision, "none">>).map((val) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="override_decision"
                    value={val}
                    checked={decision === val}
                    onChange={() => setDecision(val)}
                    className="accent-indigo-600"
                  />
                  <span className="text-sm text-gray-800">{DECISION_LABELS[val]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Scope — only for go_scoped */}
          {decision === "go_scoped" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scope description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                rows={3}
                required
                placeholder="Describe which modules/parts we bid on and what is excluded…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}

          {/* Rationale */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Rationale <span className="text-red-500">*</span>
            </label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              required
              placeholder="Why is the team overriding the analyzer recommendation?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {/* Cite similar bids */}
          {pastAnalyses.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Cite similar bids (optional)</p>
              <div className="max-h-36 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                {pastAnalyses.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cited.includes(a.id)}
                      onChange={() => toggleCited(a.id)}
                      className="accent-indigo-600"
                    />
                    <span className="text-xs text-gray-700">
                      {a.clientName ?? "Unknown Client"} — {a.decision} —{" "}
                      {new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save override"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
