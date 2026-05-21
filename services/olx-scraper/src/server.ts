import Fastify from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { scrapeOlx } from './scrapers/olx';
import { scrapeAllSources } from './scraper';

const server = Fastify({ logger: true });

const ScrapeBody = z.object({
  location: z.string().min(1),
  sizeMin: z.number().int().positive(),
  sizeMax: z.number().int().positive(),
  priceMax: z.number().int().positive().optional(),
  multiSource: z.boolean().optional().default(false),
});

server.get('/health', async () => ({ ok: true }));

server.post('/scrape', async (request, reply) => {
  const parsed = ScrapeBody.safeParse(request.body);
  if (!parsed.success) {
    return reply.status(400).send({ error: parsed.error.flatten() });
  }

  const { multiSource, ...params } = parsed.data;

  try {
    if (multiSource) {
      const { listings, sourceResults } = await scrapeAllSources(params);
      return reply.send({ jobId: uuidv4(), listings, sourceResults });
    } else {
      const listings = await scrapeOlx(params);
      return reply.send({ jobId: uuidv4(), listings });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    request.log.error({ err }, 'Scrape failed');
    return reply.status(500).send({ error: message });
  }
});

const port = Number(process.env.PORT ?? 3001);
server.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`olx-scraper listening on port ${port}`);
});
