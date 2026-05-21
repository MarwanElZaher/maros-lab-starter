/**
 * Unit tests for the LangGraph AI extraction pipeline (MAR-96).
 * Anthropic SDK is fully mocked — no real API calls.
 */

const MOCK_EXTRACTED = {
  post_url: 'https://source.example/listing/123',
  mobile_number: '01012345678',
  description_snippet: 'شقة للبيع 3 غرف نوم - الشماليات',
  price: '1,500,000 ج.م',
  size: '120 م²',
};

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import {
  extractListingFromPage,
  setAnthropicClient,
  RawPage,
} from '../../services/olx-scraper/src/langgraph-extractor';
import Anthropic from '@anthropic-ai/sdk';

const PARAMS = { location: 'الشماليات', sizeMin: 80, sizeMax: 150 };

function makeAnthropicResponse(data: Record<string, string>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
  };
}

function makeRawPage(source: RawPage['source'], url: string, html: string): RawPage {
  return { source, url, html };
}

const OLX_HTML = `
<html><body>
<div class="ad-listing">
  <h2>شقة للبيع في الشماليات</h2>
  <span class="price">1,500,000 ج.م</span>
  <span class="area">120 م²</span>
  <a href="tel:01012345678">01012345678</a>
</div>
</body></html>`;

const AQARMAP_HTML = `
<html><body>
<div class="property-card">
  <h3>شقة مميزة الشماليات للبيع</h3>
  <span class="price">2,000,000 ج.م</span>
  <span class="size">110 م²</span>
  <a href="tel:01198765432">01198765432</a>
</div>
</body></html>`;

const DUBIZZLE_HTML = `
<html><body>
<article class="listing-card">
  <h2>Apartment for Sale - Al Shamaliyat</h2>
  <strong>EGP 1,800,000</strong>
  <span class="area">100 sqm</span>
  <a href="tel:01055566677">01055566677</a>
</article>
</body></html>`;

describe('LangGraph AI Extractor — multi-source', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(makeAnthropicResponse(MOCK_EXTRACTED));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = new (Anthropic as any)();
    setAnthropicClient(mockClient);
  });

  it('extracts 5 required fields from OLX mock HTML', async () => {
    const page = makeRawPage('olx', 'https://www.olx.com.eg/ar/ad/123.html', OLX_HTML);
    const result = await extractListingFromPage(page, PARAMS);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('post_url');
    expect(result).toHaveProperty('mobile_number');
    expect(result).toHaveProperty('description_snippet');
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('size');
  });

  it('extracts 5 required fields from Aqarmap mock HTML', async () => {
    const page = makeRawPage('aqarmap', 'https://aqarmap.com.eg/ar/listing/456', AQARMAP_HTML);
    const result = await extractListingFromPage(page, PARAMS);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('post_url');
    expect(result).toHaveProperty('mobile_number');
    expect(result).toHaveProperty('description_snippet');
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('size');
  });

  it('extracts 5 required fields from Dubizzle mock HTML', async () => {
    const page = makeRawPage('dubizzle', 'https://www.dubizzle.com.eg/ar/properties/789', DUBIZZLE_HTML);
    const result = await extractListingFromPage(page, PARAMS);

    expect(result).not.toBeNull();
    expect(result).toHaveProperty('post_url');
    expect(result).toHaveProperty('mobile_number');
    expect(result).toHaveProperty('description_snippet');
    expect(result).toHaveProperty('price');
    expect(result).toHaveProperty('size');
  });

  it('returns null when AI returns no JSON', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot extract this.' }] });
    const mockClient = new (Anthropic as any)(); // eslint-disable-line @typescript-eslint/no-explicit-any
    setAnthropicClient(mockClient);

    const page = makeRawPage('olx', 'https://www.olx.com.eg/ar/ad/bad.html', '<html></html>');
    const result = await extractListingFromPage(page, PARAMS);
    expect(result).toBeNull();
  });

  it('source field matches the input source', async () => {
    const page = makeRawPage('aqarmap', 'https://aqarmap.com.eg/ar/listing/789', AQARMAP_HTML);
    const result = await extractListingFromPage(page, PARAMS);

    expect(result?.source).toBe('aqarmap');
  });

  it('falls back to page URL when AI returns empty post_url', async () => {
    mockCreate.mockResolvedValue(makeAnthropicResponse({ ...MOCK_EXTRACTED, post_url: '' }));
    const mockClient = new (Anthropic as any)(); // eslint-disable-line @typescript-eslint/no-explicit-any
    setAnthropicClient(mockClient);

    const url = 'https://www.olx.com.eg/ar/ad/fallback.html';
    const page = makeRawPage('olx', url, OLX_HTML);
    const result = await extractListingFromPage(page, PARAMS);
    expect(result?.post_url).toBe(url);
  });
});
