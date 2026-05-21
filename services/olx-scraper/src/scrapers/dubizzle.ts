import { chromium } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const DUBIZZLE_BASE = 'https://www.dubizzle.com.eg';
export const SOURCE_DOMAIN = 'www.dubizzle.com.eg';

const MAX_LISTINGS = 10;

export function buildSearchUrl(params: ScrapeParams): string {
  const url = new URL(`${DUBIZZLE_BASE}/en/properties/apartments-duplex-for-sale/`);
  url.searchParams.set('keywords', params.location);
  url.searchParams.append('filter', `area_gte_${params.sizeMin}`);
  url.searchParams.append('filter', `area_lte_${params.sizeMax}`);
  if (params.priceMax != null) {
    url.searchParams.append('filter', `price_lte_${params.priceMax}`);
  }
  return url.toString();
}

export async function scrapeDubizzle(params: ScrapeParams): Promise<Listing[]> {
  const searchUrl = buildSearchUrl(params);
  console.log(`[dubizzle-scraper] GET ${searchUrl}`);

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      locale: 'en-EG',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-EG,en;q=0.9,ar;q=0.8',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45_000 });

    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[dubizzle-scraper] landed at: ${finalUrl} | title: ${pageTitle}`);

    // Listing cards are <li> elements containing <a href="/en/ad/..."> links
    await page
      .waitForSelector('a[href*="/en/ad/"]', { timeout: 20_000 })
      .catch(() => undefined);

    const linkCount = await page.locator('a[href*="/en/ad/"]').count();
    console.log(`[dubizzle-scraper] found ${linkCount} listing links`);

    const rawListings = await page.$$eval(
      'a[href*="/en/ad/"]',
      (links, maxItems) => {
        const seen = new Set<string>();
        const results: Array<{
          post_url: string;
          description_snippet: string;
          price: string;
          size: string;
          mobile_number: string;
          source: string;
        }> = [];

        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (!href || seen.has(href)) continue;
          seen.add(href);

          const container = link.closest('li') ?? link.parentElement;
          const titleEl =
            container?.querySelector('h2, h3, [class*="title"], [class*="Title"]') ??
            link;
          const priceEl = container?.querySelector(
            '[class*="price"], [class*="Price"], strong',
          );
          const sizeEl = container?.querySelector('[class*="area"], [class*="size"], [class*="Area"]');

          results.push({
            post_url: href,
            description_snippet: titleEl?.textContent?.trim() ?? '',
            price: priceEl?.textContent?.trim() ?? '',
            size: sizeEl?.textContent?.trim() ?? '',
            mobile_number: '',
            source: 'www.dubizzle.com.eg',
          });

          if (results.length >= maxItems) break;
        }
        return results;
      },
      MAX_LISTINGS,
    );

    console.log(`[dubizzle-scraper] extracted ${rawListings.length} listings`);
    return rawListings.filter((r) => r.post_url !== '');
  } finally {
    await browser.close();
  }
}
