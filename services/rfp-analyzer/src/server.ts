import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { runAnalysis, runAnalysisFromBuffer } from './graph';

const server = Fastify({ logger: false });
server.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

const AnalyzeBody = z.object({
  pdf_url: z.string().url(),
});

server.get('/health', async () => ({ ok: true }));

// JSON path (backwards compat): { pdf_url: "https://..." }
server.post('/analyze', async (request, reply) => {
  const contentType = request.headers['content-type'] ?? '';

  if (contentType.includes('multipart/form-data')) {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: 'No file provided' });
    }
    const buf = await data.toBuffer();
    try {
      const recommendation = await runAnalysisFromBuffer(buf);
      return reply.send(recommendation);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      request.log.error({ err }, 'Analysis failed');
      return reply.status(500).send({ error: message });
    }
  }

  const parsed = AnalyzeBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }
  try {
    const recommendation = await runAnalysis({ pdfUrl: parsed.data.pdf_url });
    return reply.send(recommendation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'Analysis failed');
    return reply.status(500).send({ error: message });
  }
});

// Multipart path (UI upload): field name "file"
server.post('/analyze-upload', async (request, reply) => {
  try {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'missing file field' });
    const buf = await file.toBuffer();
    if (buf.length === 0) return reply.status(400).send({ error: 'empty file' });
    const recommendation = await runAnalysis({ pdfBytes: buf });
    return reply.send(recommendation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'Analysis upload failed');
    return reply.status(500).send({ error: message });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`rfp-analyzer listening on port ${port}`);
});
