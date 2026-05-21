import { chromium } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const AQARMAP_BASE = 'https://aqarmap.com.eg';
export const SOURCE_DOMAIN = 'aqarmap.com.eg';

export function buildSearchUrl(params: ScrapeParams): string {
  const url = new URL(`${AQARMAP_BASE}/ar/for-sale/apartment/`);
  url.searchParams.set('q', params.location);
  if (params.priceMax != null) {
    url.searchParams.set('price_to', String(params.priceMax));
  }
  return url.toString();
}

export async function scrapeAqarmap(params: ScrapeParams): Promise<Listing[]> {
  const searchUrl = buildSearchUrl(params);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'ar-EG',
    });
    const page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page
      .waitForSelector('.listing-card, .property-card, [class*="ListingCard"], [class*="PropertyCard"]', { timeout: 15_000 })
      .catch(() => undefined);

    const rawListings = await page.$$eval(
      '.listing-card, .property-card, [class*="ListingCard"]',
      (items) =>
        items.slice(0, 10).map((item) => {
          const link = item.querySelector('a') as HTMLAnchorElement | null;
          const titleEl = item.querySelector('h2, h3, [class*="title"], [class*="Title"]');
          const priceEl = item.querySelector('[class*="price"], [class*="Price"]');
          const sizeEl = item.querySelector('[class*="size"], [class*="area"], [class*="Area"]');
          const phoneEl = item.querySelector('a[href^="tel:"]');
          return {
            post_url: link?.href ?? '',
            description_snippet: titleEl?.textContent?.trim() ?? '',
            price: priceEl?.textContent?.trim() ?? '',
            size: sizeEl?.textContent?.trim() ?? '',
            mobile_number: phoneEl
              ? (phoneEl as HTMLAnchorElement).href.replace('tel:', '').trim()
              : '',
            source: 'aqarmap.com.eg',
          };
        }),
    );

    return rawListings.filter((r) => r.post_url !== '');
  } finally {
    await browser.close();
  }
}
