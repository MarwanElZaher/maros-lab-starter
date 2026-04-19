import axios from 'axios';

const BASE_URL = process.env.RAGFLOW_BASE_URL ?? '';
const API_KEY = process.env.RAGFLOW_API_KEY ?? '';

interface Chunk {
  content: string;
  document_name?: string;
  similarity?: number;
}

interface RetrievalResponse {
  code: number;
  message?: string;
  data?: { chunks: Chunk[] };
}

export async function retrieveChunks(
  question: string,
  datasetId: string,
  topK = 5,
): Promise<string> {
  if (!datasetId) {
    return '[dataset not yet configured — pending MAR-17]';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const resp = await axios.post<RetrievalResponse>(
      `${BASE_URL}/api/v1/retrieval`,
      { question, dataset_ids: [datasetId], top_k: topK },
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        signal: controller.signal as never,
      },
    );

    const { data } = resp;
    if (data.code !== 0 || !data.data?.chunks?.length) {
      return `[no results: ${data.message ?? 'empty'}]`;
    }

    return data.data.chunks
      .map((c, i) => `[${i + 1}] ${c.content.trim()}`)
      .join('\n\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `[retrieval error: ${msg}]`;
  } finally {
    clearTimeout(timeout);
  }
}
