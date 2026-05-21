import { chromium, BrowserContext } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const OLX_BASE = 'https://www.olx.com.eg';
const MAX_LISTINGS = 10;
const MAX_PHONE_LOOKUPS = 5;
const SIZE_PATTERN = /(\d[\d,]*)\s*م²?/;

export const SOURCE_DOMAIN = 'www.olx.com.eg';

// data-aut-id selectors (primary), with fallback CSS selectors for OLX redesigns
const ITEM_SELECTORS = [
  '[data-aut-id="itemBox"]',
  'li[data-aut-id]',
  '._3ToUi li',
  'ul[data-aut-id="itemsList"] li',
];

export function buildSearchUrl(params: ScrapeParams): string {
  const url = new URL(`${OLX_BASE}/ar/properties-for-sale/`);
  url.searchParams.set('q', params.location);
  url.searchParams.set('size_min', String(params.sizeMin));
  url.searchParams.set('size_max', String(params.sizeMax));
  if (params.priceMax != null) {
    url.searchParams.set('price_max', String(params.priceMax));
  }
  return url.toString();
}

export async function scrapeOlx(params: ScrapeParams): Promise<Listing[]> {
  const searchUrl = buildSearchUrl(params);
  console.log(`[olx-scraper] GET ${searchUrl}`);

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
        'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });

    // Remove webdriver flag to reduce bot detection
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45_000 });

    const finalUrl = page.url();
    const pageTitle = await page.title();
    console.log(`[olx-scraper] landed at: ${finalUrl} | title: ${pageTitle}`);

    // Try each selector in priority order; use first that matches
    let activeSelector = ITEM_SELECTORS[0];
    for (const sel of ITEM_SELECTORS) {
      const count = await page.locator(sel).count();
      console.log(`[olx-scraper] selector "${sel}" → ${count} elements`);
      if (count > 0) {
        activeSelector = sel;
        break;
      }
    }

    // Extra wait in case JS is still hydrating
    await page
      .waitForSelector(activeSelector, { timeout: 10_000 })
      .catch(() => undefined);

    const matchCount = await page.locator(activeSelector).count();
    console.log(`[olx-scraper] final listing count with "${activeSelector}": ${matchCount}`);

    const rawListings = await page.$$eval(
      activeSelector,
      (items, maxItems) =>
        items.slice(0, maxItems).map((item) => {
          const link = item.querySelector('a') as HTMLAnchorElement | null;
          const titleEl =
            item.querySelector('[data-aut-id="itemTitle"]') ??
            item.querySelector('h2') ??
            item.querySelector('h3');
          const priceEl =
            item.querySelector('[data-aut-id="itemPrice"]') ??
            item.querySelector('[class*="price"]');
          const detailsEl =
            item.querySelector('[data-aut-id="itemDetails"]') ??
            item.querySelector('[class*="detail"]');
          return {
            post_url: link?.href ?? '',
            description_snippet: titleEl?.textContent?.trim() ?? '',
            price: priceEl?.textContent?.trim() ?? '',
            size: detailsEl?.textContent?.trim() ?? '',
            mobile_number: '',
            source: 'www.olx.com.eg',
          };
        }),
      MAX_LISTINGS,
    );

    console.log(`[olx-scraper] extracted ${rawListings.length} raw listings`);

    const results: Listing[] = [];
    for (const raw of rawListings.slice(0, MAX_PHONE_LOOKUPS)) {
      if (!raw.post_url) continue;
      const phone = await extractPhone(context, raw.post_url);
      const sizeMatch = raw.size.match(SIZE_PATTERN);
      results.push({ ...raw, size: sizeMatch ? `${sizeMatch[1]} م²` : raw.size, mobile_number: phone });
    }
    for (const raw of rawListings.slice(MAX_PHONE_LOOKUPS)) {
      if (!raw.post_url) continue;
      const sizeMatch = raw.size.match(SIZE_PATTERN);
      results.push({ ...raw, size: sizeMatch ? `${sizeMatch[1]} م²` : raw.size });
    }

    console.log(`[olx-scraper] returning ${results.length} listings`);
    return results;
  } finally {
    await browser.close();
  }
}

async function extractPhone(context: BrowserContext, url: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
    const showNumBtn = page.locator(
      '[data-aut-id="btnxShowNumber"], [data-aut-id="phone-button"], button:has-text("اظهر رقم"), button:has-text("اعرض رقم"), button:has-text("أظهر رقم")',
    );
    if ((await showNumBtn.count()) > 0) {
      await showNumBtn.first().click();
      await page.waitForTimeout(2_000);
    }
    const phoneEl = page.locator('[data-aut-id="phoneNumber"], [data-aut-id="phone-display"], .phoneNumber');
    if ((await phoneEl.count()) > 0) {
      const text = await phoneEl.first().textContent();
      if (text?.trim()) return text.trim();
    }
    const telLink = page.locator('a[href^="tel:"]');
    if ((await telLink.count()) > 0) {
      const href = await telLink.first().getAttribute('href');
      return href?.replace('tel:', '').trim() ?? '';
    }
    return '';
  } catch {
    return '';
  } finally {
    await page.close();
  }
}
