import Fastify from 'fastify';
import { z } from 'zod';
import { runAnalysis } from './graph';

const server = Fastify({ logger: false });

const AnalyzeBody = z.object({
  pdf_url: z.string().url(),
});

server.get('/health', async () => ({ ok: true }));

server.post('/analyze', async (request, reply) => {
  const parsed = AnalyzeBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  try {
    const recommendation = await runAnalysis(parsed.data.pdf_url);
    return reply.send(recommendation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'Analysis failed');
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
