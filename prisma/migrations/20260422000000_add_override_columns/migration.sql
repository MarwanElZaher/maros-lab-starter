-- Add override columns to rfp_analyses (spec: docs/rfp/override-feedback-loop.md §1)
ALTER TABLE rfp_analyses
  ADD COLUMN override_decision      TEXT NOT NULL DEFAULT 'none'
                                    CHECK (override_decision IN ('none','go_full','go_scoped','no_go_confirmed')),
  ADD COLUMN override_scope         TEXT,
  ADD COLUMN override_rationale     TEXT,
  ADD COLUMN override_by_user_email TEXT,
  ADD COLUMN override_at            TIMESTAMPTZ,
  ADD COLUMN cited_analysis_ids     TEXT[] NOT NULL DEFAULT '{}';

-- Scope required when decision is go_scoped
ALTER TABLE rfp_analyses
  ADD CONSTRAINT chk_go_scoped_requires_scope
    CHECK (override_decision <> 'go_scoped' OR (override_scope IS NOT NULL AND trim(override_scope) <> ''));

-- Rationale required for any non-none override
ALTER TABLE rfp_analyses
  ADD CONSTRAINT chk_override_requires_rationale
    CHECK (override_decision = 'none' OR (override_rationale IS NOT NULL AND trim(override_rationale) <> ''));
