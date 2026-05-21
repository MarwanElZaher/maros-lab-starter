// Re-export shared types for backward compatibility
export { ListingSchema, type Listing, type ScrapeParams } from './types';
export { buildSearchUrl, scrapeOlx } from './scrapers/olx';
export { scrapeAqarmap } from './scrapers/aqarmap';
export { scrapeDubizzle } from './scrapers/dubizzle';

import { scrapeOlx } from './scrapers/olx';
import { scrapeAqarmap } from './scrapers/aqarmap';
import { scrapeDubizzle } from './scrapers/dubizzle';
import { Listing, ScrapeParams } from './types';

export interface FanOutResult {
  listings: Listing[];
  sourceResults: Record<string, { count: number; error?: string }>;
}

export async function scrapeAllSources(params: ScrapeParams): Promise<FanOutResult> {
  const sources = [
    { name: 'olx', fn: scrapeOlx },
    { name: 'aqarmap', fn: scrapeAqarmap },
    { name: 'dubizzle', fn: scrapeDubizzle },
  ];

  const settled = await Promise.allSettled(sources.map((s) => s.fn(params)));

  const listings: Listing[] = [];
  const sourceResults: Record<string, { count: number; error?: string }> = {};

  for (let i = 0; i < sources.length; i++) {
    const name = sources[i].name;
    const result = settled[i];
    if (result.status === 'fulfilled') {
      listings.push(...result.value);
      sourceResults[name] = { count: result.value.length };
    } else {
      sourceResults[name] = { count: 0, error: String(result.reason) };
    }
  }

  return { listings, sourceResults };
}
