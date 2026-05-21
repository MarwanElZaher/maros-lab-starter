/**
 * Parses Arabic (and mixed Arabic/English) natural-language real estate queries
 * into structured search parameters using claude-sonnet-4-6.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface SearchParams {
  location: string;
  sizeMin: number;
  sizeMax: number;
  priceMax?: number;
}

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function setAnthropicClient(client: Anthropic): void {
  _client = client;
}

const SYSTEM_PROMPT = `You parse Arabic and English real estate search queries into structured JSON.
Return ONLY valid JSON with these keys:
- location: string (the area/neighborhood name, in Arabic if provided)
- sizeMin: number (minimum apartment size in m², default 50 if not mentioned)
- sizeMax: number (maximum apartment size in m², default 200 if not mentioned)
- priceMax: number | null (maximum price in EGP, null if not mentioned)

Examples:
"شقق في الشماليات 3 غرف" → {"location":"الشماليات","sizeMin":80,"sizeMax":130,"priceMax":null}
"apartments in Maadi 100 sqm max 2M" → {"location":"Maadi","sizeMin":80,"sizeMax":120,"priceMax":2000000}
"شقة الشماليات 80 متر" → {"location":"الشماليات","sizeMin":70,"sizeMax":90,"priceMax":null}

Interpret Arabic room counts: 1 غرفة≈40-60m², 2 غرف≈60-90m², 3 غرف≈80-130m², 4 غرف≈120-180m².`;

export async function parseArabicQuery(query: string): Promise<SearchParams> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: query }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]) as {
    location: string;
    sizeMin: number;
    sizeMax: number;
    priceMax: number | null;
  };

  return {
    location: parsed.location,
    sizeMin: parsed.sizeMin,
    sizeMax: parsed.sizeMax,
    priceMax: parsed.priceMax ?? undefined,
  };
}
