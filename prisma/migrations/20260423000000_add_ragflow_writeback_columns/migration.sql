-- Add RAGflow writeback tracking columns to rfp_analyses (MAR-67)
ALTER TABLE rfp_analyses
  ADD COLUMN persisted_to_ragflow BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN ragflow_doc_id       TEXT;
