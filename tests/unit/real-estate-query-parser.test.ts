/**
 * Unit tests for the CopilotKit Arabic NL query parser (MAR-96).
 * Anthropic SDK is fully mocked — no real API calls.
 */

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { parseArabicQuery, setAnthropicClient } from '../../src/lib/real-estate/query-parser';
import Anthropic from '@anthropic-ai/sdk';

function makeAnthropicResponse(json: object) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }] };
}

describe('parseArabicQuery — CopilotKit NL parser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockClient = new (Anthropic as any)();
    setAnthropicClient(mockClient);
  });

  it('parses "شقق في الشماليات 3 غرف" → {location, sizeMin, sizeMax}', async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({ location: 'الشماليات', sizeMin: 80, sizeMax: 130, priceMax: null }),
    );
    const result = await parseArabicQuery('شقق في الشماليات 3 غرف');

    expect(result).toMatchInlineSnapshot(`
      {
        "location": "الشماليات",
        "priceMax": undefined,
        "sizeMax": 130,
        "sizeMin": 80,
      }
    `);
  });

  it('parses "شقة المعادي 80 متر بحد أقصى 2 مليون" → includes priceMax', async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({ location: 'المعادي', sizeMin: 70, sizeMax: 90, priceMax: 2000000 }),
    );
    const result = await parseArabicQuery('شقة المعادي 80 متر بحد أقصى 2 مليون');

    expect(result).toMatchInlineSnapshot(`
      {
        "location": "المعادي",
        "priceMax": 2000000,
        "sizeMax": 90,
        "sizeMin": 70,
      }
    `);
  });

  it('parses "apartments in Zamalek 2 bedrooms" (English query)', async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({ location: 'Zamalek', sizeMin: 60, sizeMax: 100, priceMax: null }),
    );
    const result = await parseArabicQuery('apartments in Zamalek 2 bedrooms');

    expect(result).toMatchInlineSnapshot(`
      {
        "location": "Zamalek",
        "priceMax": undefined,
        "sizeMax": 100,
        "sizeMin": 60,
      }
    `);
  });

  it('calls claude-sonnet-4-6 model', async () => {
    mockCreate.mockResolvedValue(
      makeAnthropicResponse({ location: 'الشماليات', sizeMin: 80, sizeMax: 130, priceMax: null }),
    );
    await parseArabicQuery('الشماليات');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-sonnet-4-6' }),
    );
  });

  it('throws when AI returns no JSON', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'لا أستطيع تحليل الطلب' }] });
    await expect(parseArabicQuery('???')).rejects.toThrow('No JSON in response');
  });
});
