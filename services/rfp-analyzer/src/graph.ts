import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Langfuse } from 'langfuse';
import axios from 'axios';
import pdfParse from 'pdf-parse';
import { retrieveChunks } from './ragflow';
import {
  RequirementsSchema,
  BlockerAnalysisSchema,
  RecommendationSchema,
  type Requirements,
  type BlockerAnalysis,
  type Recommendation,
} from './types';

const PRODUCTS_DATASET = process.env.RAGFLOW_DATASET_PRODUCTS ?? '';
const PRICING_DATASET = process.env.RAGFLOW_DATASET_PRICING ?? '';
const PAST_BIDS_DATASET = process.env.RAGFLOW_DATASET_PAST_BIDS ?? '';
const LICENSING_DATASET = process.env.RAGFLOW_DATASET_LICENSING ?? '';

const OPENROUTER_CONFIG = {
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://rfp.marwanelzaher.info',
      'X-Title': 'RFP Analyzer',
    },
  },
  temperature: 0,
};

// Haiku for cheap structured extraction; sonnet-4-6 minimum for binding go/no-go decisions
const llmFast = new ChatOpenAI({
  modelName: 'anthropic/claude-haiku-4-5',
  ...OPENROUTER_CONFIG,
});

const llm = new ChatOpenAI({
  modelName: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-6',
  ...OPENROUTER_CONFIG,
});

// Matches sentinel strings returned by ragflow.ts when a dataset is unconfigured or empty
const SENTINEL_RE = /^\[(?:dataset not yet configured|no results:|retrieval error:)/;

function sanitizeKb(raw: string, label: string): string {
  if (SENTINEL_RE.test(raw)) {
    return `[${label}: no data retrieved — treat as missing context, not evidence of absence]`;
  }
  return raw;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LfTrace = any;

const GraphState = Annotation.Root({
  pdfUrl: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  pdfBytes: Annotation<Buffer | null>({ reducer: (_, b) => b, default: () => null }),
  pdfText: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  requirements: Annotation<Requirements | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  kbProducts: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  kbPricing: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  kbPastBids: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  kbLicensing: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  blockerAnalysis: Annotation<BlockerAnalysis | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  recommendation: Annotation<Recommendation | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  _lfTrace: Annotation<LfTrace>({ reducer: (_, b) => b, default: () => null }),
});

type State = typeof GraphState.State;

export async function extractRequirements(state: State): Promise<Partial<State>> {
  const span = state._lfTrace?.span({ name: 'extractRequirements', input: { pdfUrl: state.pdfUrl } }) ?? null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let pdfText: string;
  try {
    let bytes: Buffer;
    if (state.pdfBytes && state.pdfBytes.length > 0) {
      bytes = state.pdfBytes;
    } else if (state.pdfUrl) {
      const resp = await axios.get<ArrayBuffer>(state.pdfUrl, {
        responseType: 'arraybuffer',
        signal: controller.signal as never,
        maxContentLength: 50 * 1024 * 1024,
      });
      bytes = Buffer.from(resp.data);
    } else {
      throw new Error('neither pdfBytes nor pdfUrl provided');
    }
    const parsed = await pdfParse(bytes);
    // 120 000 chars covers bilingual (Arabic + English) RFPs without truncating mandatory clauses
    pdfText = parsed.text.slice(0, 120_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF extraction failed: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  const structured = llmFast.withStructuredOutput(RequirementsSchema, { method: 'functionCalling' });
  const messages = [
    {
      role: 'system',
      content:
        'You are a presales analyst. Extract the key procurement requirements from this RFP document. ' +
        'Be precise and complete. For country, extract the buyer\'s country code (e.g. "KSA", "EG", "AE"); null if not determinable.',
    },
    {
      role: 'user',
      content: `Extract structured requirements from this RFP:\n\n${pdfText}`,
    },
  ];

  const generation = state._lfTrace?.generation({
    name: 'extractRequirements:llm',
    model: 'anthropic/claude-haiku-4-5',
    input: messages,
  }) ?? null;

  const requirements = await structured.invoke(messages);
  generation?.end({ output: requirements });
  span?.end({ output: { pdfTextLength: pdfText.length, requirements } });

  return { pdfText, requirements };
}

export async function queryKnowledgeBases(state: State): Promise<Partial<State>> {
  const span = state._lfTrace?.span({ name: 'queryKnowledgeBases', input: { summary: state.requirements?.summary } }) ?? null;

  const query = state.requirements?.summary ?? state.pdfText.slice(0, 500);
  const country = state.requirements?.country ?? null;

  // Country in both the query string and metadata filter for geo-accurate pricing
  const pricingQuery = country
    ? `Pricing and discounts for: ${query} country: ${country}`
    : `Pricing and discounts for: ${query}`;
  const pricingFilters = country ? { country } : undefined;

  const [kbProducts, kbPricing, kbLicensing] = await Promise.all([
    retrieveChunks(`Products matching: ${query}`, PRODUCTS_DATASET),
    retrieveChunks(pricingQuery, PRICING_DATASET, 5, pricingFilters),
    retrieveChunks(`Licensing and entitlements for: ${query}`, LICENSING_DATASET),
  ]);

  const result = {
    kbProducts: sanitizeKb(kbProducts, 'products'),
    kbPricing: sanitizeKb(kbPricing, 'pricing'),
    kbLicensing: sanitizeKb(kbLicensing, 'licensing'),
  };
  span?.end({ output: { kbProductsLength: result.kbProducts.length, kbPricingLength: result.kbPricing.length } });

  return result;
}

export async function retrieveSimilarBids(state: State): Promise<Partial<State>> {
  const span = state._lfTrace?.span({ name: 'retrieveSimilarBids', input: { summary: state.requirements?.summary } }) ?? null;

  const summary = state.requirements?.summary ?? state.pdfText.slice(0, 500);
  const buyerName = state.requirements?.buyerName ?? '';

  // Priority: won bids via metadata filter (maximum positive-precedent recall).
  // Fall back to broad embedding search if metadata filter returns nothing.
  const wonQuery = `Similar won bids: ${summary} buyer: ${buyerName}`;
  let raw = await retrieveChunks(wonQuery, PAST_BIDS_DATASET, 10, { outcome: 'won' });
  if (SENTINEL_RE.test(raw)) {
    const broadQuery = `Bids similar to: ${summary} buyer: ${buyerName}`;
    raw = await retrieveChunks(broadQuery, PAST_BIDS_DATASET, 10);
  }

  const kbPastBids = sanitizeKb(raw, 'past bids');
  span?.end({ output: { kbPastBidsLength: kbPastBids.length } });

  return { kbPastBids };
}

export async function detectBlockers(state: State): Promise<Partial<State>> {
  const span = state._lfTrace?.span({ name: 'detectBlockers', input: { requirementCount: state.requirements?.requirements?.length } }) ?? null;

  const structured = llm.withStructuredOutput(BlockerAnalysisSchema, { method: 'functionCalling' });
  const messages = [
    {
      role: 'system',
      content:
        'You are a presales risk analyst. Identify hard blockers and red flags in the RFP against our product and pricing capabilities.',
    },
    {
      role: 'user',
      content: [
        `RFP Requirements:\n${JSON.stringify(state.requirements, null, 2)}`,
        `Our Products:\n${state.kbProducts}`,
        `Our Pricing:\n${state.kbPricing}`,
        `Past Similar Bids (WON precedent — if a won bid matches this RFP scope, treat that as mitigating evidence against blockers):\n${state.kbPastBids}`,
        `Licensing context (apply ONLY to the specific product line named in each chunk — do not use a licensing rule for product X to block product Y; cross-product licensing rules are not applicable):\n${state.kbLicensing}`,
        `An entitlement mismatch applies only when the RFP requires a feature that the licensing doc restricts to a specific edition for the SAME product SKU. List each mismatch with: feature name, required edition, estimated customer edition (or null if unknown).`,
        'Identify blockers where we cannot meet mandatory requirements.',
      ].join('\n\n'),
    },
  ];

  const generation = state._lfTrace?.generation({
    name: 'detectBlockers:llm',
    model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    input: messages,
  }) ?? null;

  const blockerAnalysis = await structured.invoke(messages);
  generation?.end({ output: blockerAnalysis });
  span?.end({ output: { blockerCount: blockerAnalysis?.blockers?.length, hasCriticalBlocker: blockerAnalysis?.hasCriticalBlocker } });

  return { blockerAnalysis };
}

export async function synthesiseRecommendation(state: State): Promise<Partial<State>> {
  const span = state._lfTrace?.span({ name: 'synthesiseRecommendation', input: { hasCriticalBlocker: state.blockerAnalysis?.hasCriticalBlocker } }) ?? null;

  const structured = llm.withStructuredOutput(RecommendationSchema, { method: 'functionCalling' });
  const messages = [
    {
      role: 'system',
      content:
        'You are a senior presales strategist. Produce a structured GO / CONDITIONAL GO / NO-GO recommendation for this RFP based on our capabilities, pricing, past performance, and any identified blockers.',
    },
    {
      role: 'user',
      content: [
        `RFP Requirements:\n${JSON.stringify(state.requirements, null, 2)}`,
        `Our Products:\n${state.kbProducts}`,
        `Our Pricing:\n${state.kbPricing}`,
        `Past Similar Bids:\n${state.kbPastBids}`,
        `Licensing (apply per-product — only authoritative for the specific product line named in each chunk; do not apply cross-product licensing constraints):\n${state.kbLicensing}`,
        `Blocker Analysis:\n${JSON.stringify(state.blockerAnalysis, null, 2)}`,
        `WON-PRECEDENT RULE: If Past Similar Bids contains any bid with outcome=won whose buyer name or technical scope overlaps this RFP, that is strong positive evidence to bid GO or CONDITIONAL GO. You MUST NOT return NO-GO if a relevant won precedent exists, unless the blockers are completely unrelated to the won-bid scope AND are unambiguous and unresolvable. In that case, downgrade to CONDITIONAL GO and clearly explain why the precedent does not apply.`,
        `PRECEDENT RULE: Scan the Past Similar Bids context above for any document that records\na human override where the team chose go_scoped or go_full despite a NO-GO or\nCONDITIONAL-GO analyzer verdict. If one or more such precedents exist, you MUST:\n1. Add a "Precedent" subsection to the recommendation text that lists each cited past-bid\n   document and its override rationale.\n2. Explicitly ask: "Could a scoped bid approach work here as it did in [cited case]?"\n3. Adjust the confidence: a NO-GO verdict that has a relevant go_scoped precedent MUST be\n   downgraded to CONDITIONAL-GO unless you can state a strong differentiating reason why\n   that precedent does not apply.`,
        'Produce the final recommendation. Include 3-5 justifications, all identified red flags with severity, and 2-3 similar bids with outcomes. If datasets are not yet configured, still produce a best-effort recommendation from the RFP text alone.',
      ].join('\n\n'),
    },
  ];

  const generation = state._lfTrace?.generation({
    name: 'synthesiseRecommendation:llm',
    model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-4-6',
    input: messages,
  }) ?? null;

  const recommendation = await structured.invoke(messages);
  generation?.end({ output: recommendation });
  span?.end({ output: { decision: recommendation?.decision, confidence: recommendation?.confidence } });

  return { recommendation };
}

// Flow: extractRequirements → queryKnowledgeBases → retrieveSimilarBids → detectBlockers → synthesiseRecommendation
// retrieveSimilarBids always runs BEFORE synthesis — the conditional skip on hasCriticalBlocker is gone.
const graph = new StateGraph(GraphState)
  .addNode('extractRequirements', extractRequirements)
  .addNode('queryKnowledgeBases', queryKnowledgeBases)
  .addNode('retrieveSimilarBids', retrieveSimilarBids)
  .addNode('detectBlockers', detectBlockers)
  .addNode('synthesiseRecommendation', synthesiseRecommendation)
  .addEdge(START, 'extractRequirements')
  .addEdge('extractRequirements', 'queryKnowledgeBases')
  .addEdge('queryKnowledgeBases', 'retrieveSimilarBids')
  .addEdge('retrieveSimilarBids', 'detectBlockers')
  .addEdge('detectBlockers', 'synthesiseRecommendation')
  .addEdge('synthesiseRecommendation', END)
  .compile();

export async function runAnalysis(input: { pdfUrl?: string; pdfBytes?: Buffer }): Promise<Recommendation> {
  const langfuseEnabled = !!(
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_BASE_URL
  );

  const traceId = `rfp-${Date.now()}`;
  let lf: Langfuse | null = null;
  let trace: LfTrace = null;

  if (langfuseEnabled) {
    lf = new Langfuse({
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      baseUrl: process.env.LANGFUSE_BASE_URL!,
    });
    trace = lf.trace({ name: traceId, metadata: { pdfUrl: input.pdfUrl ?? '(upload)' } });
  }

  const result = await graph.invoke(
    { pdfUrl: input.pdfUrl ?? '', pdfBytes: input.pdfBytes ?? null, _lfTrace: trace },
  );

  if (lf) await lf.flushAsync();

  if (!result.recommendation) {
    throw new Error('Graph completed without producing a recommendation');
  }
  return result.recommendation;
}
