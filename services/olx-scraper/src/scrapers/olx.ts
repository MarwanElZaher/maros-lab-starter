import { chromium, BrowserContext } from 'playwright';
import { Listing, ScrapeParams } from '../types';

const OLX_BASE = 'https://www.olx.com.eg';
const MAX_LISTINGS = 10;
const MAX_PHONE_LOOKUPS = 5;
const SIZE_PATTERN = /(\d[\d,]*)\s*م²?/;

export const SOURCE_DOMAIN = 'www.olx.com.eg';

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
      .waitForSelector('[data-aut-id="itemBox"]', { timeout: 15_000 })
      .catch(() => undefined);

    const rawListings = await page.$$eval(
      '[data-aut-id="itemBox"]',
      (items, maxItems) =>
        items.slice(0, maxItems).map((item) => {
          const link = item.querySelector('a') as HTMLAnchorElement | null;
          const titleEl = item.querySelector('[data-aut-id="itemTitle"]');
          const priceEl = item.querySelector('[data-aut-id="itemPrice"]');
          const detailsEl = item.querySelector('[data-aut-id="itemDetails"]');
          return {
            post_url: link?.href ?? '',
            description_snippet: titleEl?.textContent?.trim() ?? '',
            price: priceEl?.textContent?.trim() ?? '',
            size: detailsEl?.textContent?.trim() ?? '',
            mobile_number: '',
            source: SOURCE_DOMAIN,
          };
        }),
      MAX_LISTINGS,
    );

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
    return results;
  } finally {
    await browser.close();
  }
}

async function extractPhone(context: BrowserContext, url: string): Promise<string> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
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
