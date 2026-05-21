// Unit tests for the OLX scraper service (MAR-95)
// Playwright is fully mocked — no real browser or network calls.

const MOCK_LISTINGS = [
  {
    post_url: 'https://www.olx.com.eg/ar/ad/123456789.html',
    description_snippet: 'شقة للبيع في الشماليات، 100 متر، تشطيب سوبر لوكس',
    price: '500,000 ج.م',
    size: '100 م²',
    mobile_number: '',
  },
  {
    post_url: 'https://www.olx.com.eg/ar/ad/987654321.html',
    description_snippet: 'شقة مميزة في الشماليات 90 م²',
    price: '450,000 ج.م',
    size: '90 م²',
    mobile_number: '',
  },
];

const mockPage = {
  goto: jest.fn().mockResolvedValue(undefined),
  waitForSelector: jest.fn().mockResolvedValue(undefined),
  $$eval: jest.fn().mockResolvedValue(MOCK_LISTINGS),
  locator: jest.fn().mockReturnValue({ count: jest.fn().mockResolvedValue(0) }),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  title: jest.fn().mockResolvedValue('OLX Egypt'),
  url: jest.fn().mockReturnValue('https://www.olx.com.eg/ar/properties-for-sale/'),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  addInitScript: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.mock('playwright', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue(mockBrowser),
  },
}));

// Import after mocking so the module picks up the mock
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { scrapeOlx, buildSearchUrl } = require('../../services/olx-scraper/src/scraper') as typeof import('../../services/olx-scraper/src/scraper');

describe('OLX scraper — buildSearchUrl', () => {
  it('encodes Arabic location correctly', () => {
    const url = buildSearchUrl({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });
    expect(url).toContain(encodeURIComponent('الشماليات'));
    expect(url).toContain('size_min=80');
    expect(url).toContain('size_max=150');
    expect(url).toContain('olx.com.eg');
  });

  it('includes priceMax when provided', () => {
    const url = buildSearchUrl({ location: 'المعادي', sizeMin: 60, sizeMax: 120, priceMax: 3000000 });
    expect(url).toContain('price_max=3000000');
  });

  it('omits priceMax when not provided', () => {
    const url = buildSearchUrl({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });
    expect(url).not.toContain('price_max');
  });
});

describe('OLX scraper — scrapeOlx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPage.$$eval.mockResolvedValue(MOCK_LISTINGS);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockContext.newPage.mockResolvedValue(mockPage);
  });

  it('returns a non-empty array when called with an Arabic location string', async () => {
    const results = await scrapeOlx({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it('each result has the five required fields', async () => {
    const results = await scrapeOlx({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });

    for (const item of results) {
      expect(item).toHaveProperty('post_url');
      expect(item).toHaveProperty('mobile_number');
      expect(item).toHaveProperty('description_snippet');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('size');
    }
  });

  it('post_url values are OLX URLs', async () => {
    const results = await scrapeOlx({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });

    for (const item of results) {
      expect(item.post_url).toMatch(/olx\.com\.eg/);
    }
  });

  it('launches browser and closes it after scraping', async () => {
    const { chromium } = require('playwright') as { chromium: { launch: jest.Mock } };
    await scrapeOlx({ location: 'الشماليات', sizeMin: 80, sizeMax: 150 });

    expect(chromium.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: true }));
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
