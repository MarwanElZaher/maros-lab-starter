import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
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

const llm = new ChatOpenAI({
  modelName: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4-5',
  openAIApiKey: process.env.OPENROUTER_API_KEY,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://rfp.marwanelzaher.info',
      'X-Title': 'RFP Analyzer',
    },
  },
  temperature: 0,
});

const GraphState = Annotation.Root({
  pdfUrl: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  pdfText: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  requirements: Annotation<Requirements | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  kbProducts: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  kbPricing: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  kbPastBids: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  blockerAnalysis: Annotation<BlockerAnalysis | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
  recommendation: Annotation<Recommendation | null>({
    reducer: (_, b) => b,
    default: () => null,
  }),
});

type State = typeof GraphState.State;

async function extractRequirements(state: State): Promise<Partial<State>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let pdfText: string;
  try {
    const resp = await axios.get<ArrayBuffer>(state.pdfUrl, {
      responseType: 'arraybuffer',
      signal: controller.signal as never,
      maxContentLength: 50 * 1024 * 1024,
    });
    const parsed = await pdfParse(Buffer.from(resp.data));
    pdfText = parsed.text.slice(0, 40_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF extraction failed: ${msg}`);
  } finally {
    clearTimeout(timeout);
  }

  const structured = llm.withStructuredOutput(RequirementsSchema, { method: "functionCalling" });
  const requirements = await structured.invoke([
    {
      role: 'system',
      content:
        'You are a presales analyst. Extract the key procurement requirements from this RFP document. Be precise and complete.',
    },
    {
      role: 'user',
      content: `Extract structured requirements from this RFP:\n\n${pdfText}`,
    },
  ]);

  return { pdfText, requirements };
}

async function queryKnowledgeBases(state: State): Promise<Partial<State>> {
  const query = state.requirements?.summary ?? state.pdfText.slice(0, 500);

  const [kbProducts, kbPricing, kbPastBids] = await Promise.all([
    retrieveChunks(`Products matching: ${query}`, PRODUCTS_DATASET),
    retrieveChunks(`Pricing and discounts for: ${query}`, PRICING_DATASET),
    retrieveChunks(`Similar past bids: ${query}`, PAST_BIDS_DATASET, 5),
  ]);

  return { kbProducts, kbPricing, kbPastBids };
}

async function detectBlockers(state: State): Promise<Partial<State>> {
  const structured = llm.withStructuredOutput(BlockerAnalysisSchema, { method: "functionCalling" });
  const blockerAnalysis = await structured.invoke([
    {
      role: 'system',
      content:
        'You are a presales risk analyst. Identify hard blockers and red flags in the RFP against our product and pricing capabilities.',
    },
    {
      role: 'user',
      content: `RFP Requirements:\n${JSON.stringify(state.requirements, null, 2)}\n\nOur Products:\n${state.kbProducts}\n\nOur Pricing:\n${state.kbPricing}\n\nIdentify blockers where we cannot meet mandatory requirements.`,
    },
  ]);

  return { blockerAnalysis };
}

async function retrieveSimilarBids(state: State): Promise<Partial<State>> {
  const query = state.requirements?.summary ?? '';
  const kbPastBids = await retrieveChunks(
    `Bids similar to: ${query} buyer: ${state.requirements?.buyerName ?? ''}`,
    PAST_BIDS_DATASET,
    5,
  );
  return { kbPastBids };
}

async function synthesiseRecommendation(state: State): Promise<Partial<State>> {
  const structured = llm.withStructuredOutput(RecommendationSchema, { method: "functionCalling" });
  const recommendation = await structured.invoke([
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
        `Blocker Analysis:\n${JSON.stringify(state.blockerAnalysis, null, 2)}`,
        'Produce the final recommendation. Include 3-5 justifications, all identified red flags with severity, and 2-3 similar bids with outcomes. If datasets are not yet configured, still produce a best-effort recommendation from the RFP text alone.',
      ].join('\n\n'),
    },
  ]);

  return { recommendation };
}

function routeAfterBlockers(state: State): 'retrieveSimilarBids' | 'synthesiseRecommendation' {
  if (state.blockerAnalysis?.hasCriticalBlocker) {
    return 'synthesiseRecommendation';
  }
  return 'retrieveSimilarBids';
}

const graph = new StateGraph(GraphState)
  .addNode('extractRequirements', extractRequirements)
  .addNode('queryKnowledgeBases', queryKnowledgeBases)
  .addNode('detectBlockers', detectBlockers)
  .addNode('retrieveSimilarBids', retrieveSimilarBids)
  .addNode('synthesiseRecommendation', synthesiseRecommendation)
  .addEdge(START, 'extractRequirements')
  .addEdge('extractRequirements', 'queryKnowledgeBases')
  .addEdge('queryKnowledgeBases', 'detectBlockers')
  .addConditionalEdges('detectBlockers', routeAfterBlockers)
  .addEdge('retrieveSimilarBids', 'synthesiseRecommendation')
  .addEdge('synthesiseRecommendation', END)
  .compile();

export async function runAnalysis(pdfUrl: string): Promise<Recommendation> {
  const result = await graph.invoke({ pdfUrl });
  if (!result.recommendation) {
    throw new Error('Graph completed without producing a recommendation');
  }
  return result.recommendation;
}
