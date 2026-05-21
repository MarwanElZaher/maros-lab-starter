import { chromium } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const DUBIZZLE_BASE = 'https://www.dubizzle.com.eg';
export const SOURCE_DOMAIN = 'www.dubizzle.com.eg';

export function buildSearchUrl(params: ScrapeParams): string {
  const url = new URL(`${DUBIZZLE_BASE}/ar/properties/apartments-flats/for-sale/`);
  url.searchParams.set('keywords', params.location);
  if (params.priceMax != null) {
    url.searchParams.set('price__lte', String(params.priceMax));
  }
  return url.toString();
}

export async function scrapeDubizzle(params: ScrapeParams): Promise<Listing[]> {
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
      .waitForSelector('[class*="listing"], [class*="Listing"], [class*="property-card"]', { timeout: 15_000 })
      .catch(() => undefined);

    const rawListings = await page.$$eval(
      '[class*="listing-card"], [class*="ListingCard"], article[class*="listing"]',
      (items) =>
        items.slice(0, 10).map((item) => {
          const link = item.querySelector('a') as HTMLAnchorElement | null;
          const titleEl = item.querySelector('h2, h3, [class*="title"], [class*="Title"]');
          const priceEl = item.querySelector('[class*="price"], [class*="Price"], strong');
          const sizeEl = item.querySelector('[class*="size"], [class*="area"]');
          const phoneEl = item.querySelector('a[href^="tel:"]');
          return {
            post_url: link?.href?.startsWith('http') ? link.href : `https://www.dubizzle.com.eg${link?.href ?? ''}`,
            description_snippet: titleEl?.textContent?.trim() ?? '',
            price: priceEl?.textContent?.trim() ?? '',
            size: sizeEl?.textContent?.trim() ?? '',
            mobile_number: phoneEl
              ? (phoneEl as HTMLAnchorElement).href.replace('tel:', '').trim()
              : '',
            source: 'www.dubizzle.com.eg',
          };
        }),
    );

    return rawListings.filter((r) => r.post_url !== '');
  } finally {
    await browser.close();
  }
}
