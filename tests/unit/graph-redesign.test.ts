/**
 * MAR-79 — Redesigned RFP analyzer LangGraph: correctness unit tests
 *
 * Covers the five acceptance criteria:
 *  (a) Won precedent overrides weak blocker — synthesis prompt includes WON-PRECEDENT RULE
 *  (b) Cross-product licensing not authoritative — blanket AUTHORITATIVE text removed
 *  (c) Sentinel detection — raw sentinel strings sanitised before LLM injection
 *  (d) Country-filtered pricing — country passed to pricing retrieval
 *  (e) Bilingual PDF section preserved — 120 000-char limit replaces old 40 000
 */

jest.mock('../../services/rfp-analyzer/src/ragflow', () => ({
  retrieveChunks: jest.fn(),
}));

jest.mock('pdf-parse', () => jest.fn());

jest.mock('axios');

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        decision: 'CONDITIONAL GO',
        confidence: 60,
        justifications: ['j1', 'j2', 'j3'],
        redFlags: [],
        similarBids: [],
      }),
    }),
  })),
}));

import { retrieveChunks } from '../../services/rfp-analyzer/src/ragflow';
import { ChatOpenAI } from '@langchain/openai';
import pdfParse from 'pdf-parse';
import {
  retrieveSimilarBids,
  synthesiseRecommendation,
  queryKnowledgeBases,
  extractRequirements,
} from '../../services/rfp-analyzer/src/graph';
import type { Requirements, BlockerAnalysis } from '../../services/rfp-analyzer/src/types';

const mockRetrieveChunks = retrieveChunks as jest.MockedFunction<typeof retrieveChunks>;
const mockPdfParse = pdfParse as jest.MockedFunction<typeof pdfParse>;

const WON_BID = `# LaVMIS — Land Vehicle Management Info System — outcome=won
Buyer: Ministry of Transport, KSA
Scope: Fleet management, vehicle registry, reporting
Result: won — delivered MnA Data Hub v3 full scope`;

const BASE_STATE = {
  pdfUrl: '',
  pdfBytes: null,
  pdfText: '',
  requirements: {
    requirements: ['Fleet management system', 'Vehicle registry'],
    buyerName: 'Ministry of Transport',
    country: 'KSA',
    deadline: '2026-09-01',
    budget: '$2,000,000',
    summary: 'Fleet management and vehicle registry for Ministry of Transport KSA',
  } satisfies Requirements,
  kbProducts: '[1] MnA Data Hub covers fleet management and registry modules',
  kbPricing: '[1] KSA enterprise pricing applies',
  kbPastBids: '',
  kbLicensing: '[1] MnA Enterprise edition required for module X',
  blockerAnalysis: {
    blockers: [{ description: 'Module X requires enterprise edition', severity: 'high' as const, category: 'licensing' }],
    entitlementMismatches: [],
    hasCriticalBlocker: true,
  } satisfies BlockerAnalysis,
  recommendation: null,
};

describe('MAR-79 graph redesign correctness', () => {
  // graph.ts creates llmFast (index 0 / haiku) then llm (index 1 / sonnet).
  // synthesiseRecommendation, detectBlockers use llm (index 1); extractRequirements uses llmFast (index 0).
  let llmFastInstance: { withStructuredOutput: jest.Mock };
  let llmSmartInstance: { withStructuredOutput: jest.Mock };

  beforeAll(() => {
    const instances = (ChatOpenAI as unknown as jest.Mock).mock.results;
    llmFastInstance = instances[0]?.value as typeof llmFastInstance;
    llmSmartInstance = instances[1]?.value as typeof llmSmartInstance;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function getLatestInvokeMock(instance: { withStructuredOutput: jest.Mock }): jest.Mock {
    const wsResults = instance.withStructuredOutput.mock.results;
    return wsResults[wsResults.length - 1].value.invoke as jest.Mock;
  }

  // ── (a) Won precedent overrides weak blocker ───────────────────────────────

  it('(a) synthesis prompt contains WON-PRECEDENT RULE and passes won bid to LLM', async () => {
    const stateWithWon = { ...BASE_STATE, kbPastBids: `[1] ${WON_BID}` };

    await synthesiseRecommendation(stateWithWon);

    const invokeMock = getLatestInvokeMock(llmSmartInstance);
    const [messages] = invokeMock.mock.calls[0] as [Array<{ role: string; content: string }>];
    const userContent = messages.find((m) => m.role === 'user')?.content ?? '';

    expect(userContent).toContain('WON-PRECEDENT RULE');
    expect(userContent).toContain('outcome=won');
    expect(userContent).toContain(WON_BID);
  });

  // ── (b) Cross-product licensing not authoritative ──────────────────────────

  it('(b) synthesis prompt no longer declares licensing AUTHORITATIVE across all products', async () => {
    await synthesiseRecommendation(BASE_STATE);

    const invokeMock = getLatestInvokeMock(llmSmartInstance);
    const [messages] = invokeMock.mock.calls[0] as [Array<{ role: string; content: string }>];
    const userContent = messages.find((m) => m.role === 'user')?.content ?? '';

    // Old blanket AUTHORITATIVE declaration must be gone
    expect(userContent).not.toContain('AUTHORITATIVE over Products');
    // Per-product scoping instruction must be present instead
    expect(userContent).toContain('apply per-product');
    expect(userContent).toContain('do not apply cross-product licensing constraints');
  });

  // ── (c) Sentinel detection ─────────────────────────────────────────────────

  it('(c) retrieveSimilarBids sanitises all sentinel strings before returning kbPastBids', async () => {
    // Both the won-filter attempt and the broad fallback return sentinels
    mockRetrieveChunks
      .mockResolvedValueOnce('[dataset not yet configured — pending MAR-17]')
      .mockResolvedValueOnce('[no results: empty]');

    const result = await retrieveSimilarBids(BASE_STATE);

    expect(result.kbPastBids).not.toMatch(/^\[dataset not yet configured/);
    expect(result.kbPastBids).not.toMatch(/^\[no results:/);
    expect(result.kbPastBids).toContain('no data retrieved');
    expect(result.kbPastBids).toContain('missing context');
  });

  // ── (d) Country-filtered pricing ──────────────────────────────────────────

  it('(d) queryKnowledgeBases passes buyer country to pricing retrieval', async () => {
    mockRetrieveChunks.mockResolvedValue('[1] pricing data');

    await queryKnowledgeBases(BASE_STATE);

    const pricingCall = mockRetrieveChunks.mock.calls.find(
      ([query]) => typeof query === 'string' && query.toLowerCase().includes('pricing'),
    );
    expect(pricingCall).toBeDefined();
    const [pricingQuery, , , pricingFilters] = pricingCall!;

    const countryInQuery = String(pricingQuery).includes('KSA');
    const countryInFilter =
      pricingFilters != null &&
      (pricingFilters as Record<string, string>).country === 'KSA';

    expect(countryInQuery || countryInFilter).toBe(true);
  });

  // ── (e) Bilingual PDF section preserved ───────────────────────────────────

  it('(e) extractRequirements keeps up to 120 000 chars, not the old 40 000 limit', async () => {
    const LONG_TEXT = 'ب'.repeat(75_000) + 'x'.repeat(75_000); // bilingual: Arabic + Latin chars
    mockPdfParse.mockResolvedValueOnce({
      text: LONG_TEXT,
      numpages: 60,
      numrender: 60,
      info: {},
      metadata: {} as never,
      version: 'v1.10.100',
    });

    // llmFast handles extractRequirements; stub its withStructuredOutput
    llmFastInstance.withStructuredOutput.mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        requirements: ['Fleet management'],
        buyerName: 'Test Buyer',
        country: 'KSA',
        deadline: null,
        budget: null,
        summary: 'Test',
      }),
    });

    const result = await extractRequirements({
      ...BASE_STATE,
      pdfBytes: Buffer.from('fake pdf bytes'),
    });

    expect(result.pdfText).toHaveLength(120_000);
    // Ensure old 40 000-char truncation is NOT in effect
    expect(result.pdfText).not.toHaveLength(40_000);
  });
});
