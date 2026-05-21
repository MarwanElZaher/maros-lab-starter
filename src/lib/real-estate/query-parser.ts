/**
 * Parses Arabic (and mixed Arabic/English) natural-language real estate queries
 * into structured search parameters via OpenRouter (anthropic/claude-sonnet-4-6).
 */
import OpenAI from 'openai';

export interface SearchParams {
  location: string;
  sizeMin: number;
  sizeMax: number;
  priceMax?: number;
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _client;
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
  const response = await getClient().chat.completions.create({
    model: 'anthropic/claude-sonnet-4-6',
    max_tokens: 256,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: query },
    ],
  });

  const text = response.choices[0]?.message?.content ?? '';

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
