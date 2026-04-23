const ragflowBase = () => process.env.RAGFLOW_BASE_URL ?? "";
const ragflowKey = () => process.env.RAGFLOW_API_KEY ?? "";

/**
 * Set structured metadata on a RAGflow document.
 * Uses PUT /api/v1/datasets/{dsId}/documents/{docId} with a meta_fields body.
 * Tolerates non-fatal errors — callers should .catch(() => {}) if metadata is
 * best-effort (e.g. after an upload that already succeeded).
 */
export async function setRagflowDocumentMetadata(
  datasetId: string,
  documentId: string,
  meta: Record<string, string>
): Promise<void> {
  const res = await fetch(
    `${ragflowBase()}/api/v1/datasets/${datasetId}/documents/${documentId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${ragflowKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ meta_fields: meta }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RAGflow metadata update failed: ${text}`);
  }
}
