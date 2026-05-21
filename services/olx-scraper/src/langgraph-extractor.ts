/**
 * LangGraph-style AI extraction pipeline for real estate listings.
 *
 * Graph: parseRawContent → extractWithAI → validateFields
 * Uses claude-sonnet-4-6 to handle varied page layouts and bilingual (Arabic/English) content.
 */
import Anthropic from '@anthropic-ai/sdk';
import { Listing, ScrapeParams } from './types';

export interface RawPage {
  url: string;
  html: string;
  source: 'olx' | 'aqarmap' | 'dubizzle';
}

interface GraphState {
  rawPage: RawPage;
  params: ScrapeParams;
  plainText?: string;
  extracted?: Partial<Listing>;
  validated?: Listing;
  error?: string;
}

type NodeFn = (state: GraphState) => Promise<GraphState>;

function composeGraph(...nodes: NodeFn[]): NodeFn {
  return async (initial: GraphState) => {
    let state = initial;
    for (const node of nodes) {
      if (state.error) break;
      state = await node(state);
    }
    return state;
  };
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 6000);
}

async function parseRawContent(state: GraphState): Promise<GraphState> {
  return { ...state, plainText: htmlToPlainText(state.rawPage.html) };
}

let _client: Anthropic | null = null;
export function getAnthropicClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export function setAnthropicClient(client: Anthropic): void {
  _client = client;
}

async function extractWithAI(state: GraphState): Promise<GraphState> {
  const { plainText, rawPage, params } = state;
  if (!plainText) return { ...state, error: 'No plain text to extract from' };

  const langHint =
    /[\u0600-\u06FF]/.test(params.location) ? 'Arabic' : 'English';

  const systemPrompt = `You are a real estate data extraction assistant. Extract structured fields from ${rawPage.source} listing page content.
The search is for: location="${params.location}" (${langHint}), size ${params.sizeMin}–${params.sizeMax} m².
Return ONLY valid JSON with these exact keys: post_url, mobile_number, description_snippet, price, size.
For bilingual content, prefer Arabic values for description fields; use digits for price/size.
If a field cannot be found, return an empty string "".`;

  const userPrompt = `Page URL: ${rawPage.url}\n\nPage content:\n${plainText}\n\nExtract the listing fields as JSON.`;

  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ...state, error: `AI returned no JSON: ${text.slice(0, 200)}` };

  try {
    const extracted = JSON.parse(jsonMatch[0]) as Partial<Listing>;
    return { ...state, extracted };
  } catch {
    return { ...state, error: `JSON parse failed: ${jsonMatch[0].slice(0, 200)}` };
  }
}

function validateFields(state: GraphState): Promise<GraphState> {
  if (!state.extracted) return Promise.resolve({ ...state, error: 'No extracted data' });

  const validated: Listing = {
    post_url: state.extracted.post_url || state.rawPage.url,
    mobile_number: state.extracted.mobile_number ?? '',
    description_snippet: state.extracted.description_snippet ?? '',
    price: state.extracted.price ?? '',
    size: state.extracted.size ?? '',
    source: state.rawPage.source,
  };

  return Promise.resolve({ ...state, validated });
}

const extractionGraph = composeGraph(
  parseRawContent,
  extractWithAI,
  validateFields,
);

export async function extractListingFromPage(
  rawPage: RawPage,
  params: ScrapeParams,
): Promise<Listing | null> {
  const result = await extractionGraph({ rawPage, params });
  if (result.error || !result.validated) return null;
  return result.validated;
}
