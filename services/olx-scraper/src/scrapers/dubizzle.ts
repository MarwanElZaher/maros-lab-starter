import { chromium } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const DUBIZZLE_BASE = 'https://www.dubizzle.com.eg';
export const SOURCE_DOMAIN = 'www.dubizzle.com.eg';

const MAX_LISTINGS = 10;

export function buildSearchUrl(params: ScrapeParams): string {
  // CEO-confirmed: no /en/ prefix; keywords go in path as /q-<encoded>/
  const base = `${DUBIZZLE_BASE}/properties/apartments-duplex-for-sale`;
  const keywordSeg = params.location ? `/q-${encodeURIComponent(params.location)}` : '';
  const url = new URL(`${base}${keywordSeg}/`);
  // Filters as repeated ?filter= params
  if (params.sizeMin != null) url.searchParams.append('filter', `area_gte_${params.sizeMin}`);
  if (params.sizeMax != null) url.searchParams.append('filter', `area_lte_${params.sizeMax}`);
  if (params.priceMax != null) url.searchParams.append('filter', `price_lte_${params.priceMax}`);
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
      locale: 'ar-EG',
      viewport: { width: 1366, height: 768 },
      extraHTTPHeaders: {
        'Accept-Language': 'ar-EG,ar;q=0.9,en;q=0.8',
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

    if (finalUrl.includes('error.html') || finalUrl.includes('/error')) {
      console.error(`[dubizzle-scraper] ERROR: redirected to error page — URL pattern is wrong`);
      return [];
    }

    // CEO-confirmed anchor pattern: href^="/ad/" with -ID<digits>.html suffix
    await page
      .waitForSelector('a[href^="/ad/"]', { timeout: 20_000 })
      .catch(() => undefined);

    const listingUrls: string[] = await page.$$eval('a[href^="/ad/"]', (links) => {
      const seen = new Set<string>();
      const results: string[] = [];
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        if (!href || seen.has(href)) continue;
        if (!/-ID\d+\.html$/.test(href)) continue;
        seen.add(href);
        results.push(href);
      }
      return results;
    });

    console.log(`[dubizzle-scraper] found ${listingUrls.length} listing URLs`);

    // Visit each listing page to extract details
    const listings: Listing[] = [];
    for (const listingUrl of listingUrls.slice(0, MAX_LISTINGS)) {
      try {
        const adPage = await context.newPage();
        await adPage.goto(listingUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

        const title = await adPage
          .locator('h1')
          .first()
          .textContent()
          .catch(() => '');

        const priceText = await adPage
          .locator('[class*="price"], [class*="Price"], strong')
          .first()
          .textContent()
          .catch(() => '');

        const sizeText = await adPage
          .locator('[class*="area"], [class*="size"], [class*="Area"]')
          .first()
          .textContent()
          .catch(() => '');

        // Phone number: try to click reveal button if present
        const phoneRevealBtn = adPage.locator(
          'button[class*="phone"], button[class*="Phone"], button[aria-label*="phone"], button[aria-label*="رقم"]',
        );
        if (await phoneRevealBtn.count() > 0) {
          await phoneRevealBtn.first().click().catch(() => undefined);
          await adPage.waitForTimeout(1000);
        }

        const phoneText = await adPage
          .locator('a[href^="tel:"], [class*="phone"], [class*="Phone"]')
          .first()
          .textContent()
          .catch(() => '');

        listings.push({
          post_url: listingUrl,
          description_snippet: (title ?? '').trim(),
          price: (priceText ?? '').trim(),
          size: (sizeText ?? '').trim(),
          mobile_number: (phoneText ?? '').replace(/\D/g, '').trim(),
          source: SOURCE_DOMAIN,
        });

        await adPage.close();
      } catch (err) {
        console.warn(`[dubizzle-scraper] failed to scrape ${listingUrl}:`, err);
      }
    }

    console.log(`[dubizzle-scraper] extracted ${listings.length} listings`);
    return listings.filter((r) => r.post_url !== '');
  } finally {
    await browser.close();
  }
}
