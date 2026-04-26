/**
 * Integration test — S6: retrieve_similar_bids with override docs
 * Spec: docs/rfp/override-feedback-loop.md §7
 *
 * Verifies:
 *  1. retrieveSimilarBids node surfaces override docs from the past-bids dataset
 *  2. synthesiseRecommendation receives the override content and the PRECEDENT RULE
 *     instruction in the prompt it sends to the LLM
 */

// Intercept the ragflow client so no real RAGflow calls are made
jest.mock('../../services/rfp-analyzer/src/ragflow', () => ({
  retrieveChunks: jest.fn(),
}));

// Intercept ChatOpenAI so no real LLM calls are made.
// All jest.fn() instances are created inline to avoid SWC/babel hoisting issues.
jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        decision: 'CONDITIONAL GO',
        confidence: 55,
        justifications: [
          'Past precedent shows scoped bid is viable',
          'Team can deliver modules C & D',
          'Client is a key reference account',
        ],
        redFlags: [],
        similarBids: [],
      }),
    }),
  })),
}));

import { retrieveChunks } from '../../services/rfp-analyzer/src/ragflow';
import { ChatOpenAI } from '@langchain/openai';
import {
  retrieveSimilarBids,
  synthesiseRecommendation,
} from '../../services/rfp-analyzer/src/graph';
import type { Requirements, BlockerAnalysis } from '../../services/rfp-analyzer/src/types';

const mockRetrieveChunks = retrieveChunks as jest.MockedFunction<typeof retrieveChunks>;

// Synthetic override document matching the schema in §3 of the spec
const OVERRIDE_DOC = `# Globex Corp — Cloud Infrastructure Tender — go_scoped

**Analysis ID:** analysis-test-001
**RFP Date:** 2026-03-10

## Analyzer Verdict
- Decision: NO-GO (confidence 22%)
- Key blockers:
  - Insufficient capacity for data-centre modules A & B

## Human Override
- Final decision: go_scoped
- Scope: Bid modules C & D only; exclude A (capacity) and B (out of scope)
- Rationale: Globex Corp is a key reference account; partial delivery still builds the relationship
- Override by: director@sales.example.com at 2026-03-15T10:00:00Z
- Cited precedents: none

## Outcome (post-bid)
- Result: pending`;

const BASE_STATE = {
  pdfUrl: '',
  pdfBytes: null,
  pdfText: '',
  requirements: {
    requirements: ['Cloud infrastructure upgrade', 'Support for modules C and D'],
    buyerName: 'Globex Corp',
    country: null,
    deadline: '2026-07-01',
    budget: '$600,000',
    summary: 'Cloud infrastructure upgrade for Globex Corp focusing on modules C and D',
  } satisfies Requirements,
  kbProducts: '[1] Product catalogue covers modules C and D',
  kbPricing: '[1] Standard enterprise pricing applies',
  kbPastBids: '',
  kbLicensing: '[1] Enterprise edition required for module E',
  blockerAnalysis: {
    blockers: [],
    entitlementMismatches: [],
    hasCriticalBlocker: false,
  } satisfies BlockerAnalysis,
  recommendation: null,
};

describe('retrieve_similar_bids integration', () => {
  // Capture the llm mock instance created when graph.ts loads.
  // We capture it here (beforeAll) because clearAllMocks() will wipe mock.instances.
  let llmInstance: { withStructuredOutput: jest.Mock };

  beforeAll(() => {
    // mock.results[0].value is the object returned by the mockImplementation factory,
    // which is what graph.ts stores as `llm`. mock.instances[0] is the constructor `this`
    // (a different, empty object) and does not carry withStructuredOutput.
    llmInstance = (ChatOpenAI as unknown as jest.Mock).mock.results[0].value as typeof llmInstance;
  });

  beforeEach(() => {
    // clearAllMocks wipes mock.calls/results but NOT mockReturnValue implementations,
    // so llmInstance.withStructuredOutput still returns { invoke: jest.fn() } on next call.
    jest.clearAllMocks();
  });

  /**
   * Return the `invoke` mock from the most recent withStructuredOutput call.
   * Must be called AFTER the function under test has run.
   */
  function getSynthesisInvokeMock(): jest.Mock {
    const wsResults = llmInstance.withStructuredOutput.mock.results;
    return wsResults[wsResults.length - 1].value.invoke as jest.Mock;
  }

  // ─── retrieveSimilarBids ────────────────────────────────────────────────────

  describe('retrieveSimilarBids node', () => {
    it('queries the past-bids dataset and populates kbPastBids with the returned override doc', async () => {
      mockRetrieveChunks.mockResolvedValue(`[1] ${OVERRIDE_DOC}`);

      const result = await retrieveSimilarBids(BASE_STATE);

      expect(mockRetrieveChunks).toHaveBeenCalledWith(
        expect.stringContaining('Globex Corp'),
        expect.any(String),
        5,
      );
      expect(result.kbPastBids).toContain('go_scoped');
      expect(result.kbPastBids).toContain('Human Override');
      expect(result.kbPastBids).toContain('Globex Corp');
    });

    it('includes the requirements summary in the retrieval query', async () => {
      mockRetrieveChunks.mockResolvedValue(`[1] ${OVERRIDE_DOC}`);

      await retrieveSimilarBids(BASE_STATE);

      const [query] = mockRetrieveChunks.mock.calls[0];
      expect(query).toContain('modules C and D');
    });

    it('returns the retrieval result gracefully when the dataset is not configured', async () => {
      mockRetrieveChunks.mockResolvedValue('[dataset not yet configured — pending MAR-17]');

      const result = await retrieveSimilarBids(BASE_STATE);

      expect(result.kbPastBids).toContain('dataset not yet configured');
    });
  });

  // ─── Synthesis prompt ──────────────────────────────────────────────────────

  describe('synthesis prompt cites override doc', () => {
    it('passes kbPastBids content to the LLM when override docs are present', async () => {
      const stateWithOverride = { ...BASE_STATE, kbPastBids: `[1] ${OVERRIDE_DOC}` };

      await synthesiseRecommendation(stateWithOverride);

      const invokeMock = getSynthesisInvokeMock();
      expect(invokeMock).toHaveBeenCalledTimes(1);

      const [messages] = invokeMock.mock.calls[0] as [Array<{ role: string; content: string }>];
      const userContent = messages.find((m) => m.role === 'user')?.content ?? '';
      expect(userContent).toContain('Past Similar Bids:');
      expect(userContent).toContain('go_scoped');
      expect(userContent).toContain('Human Override');
    });

    it('includes the PRECEDENT RULE instruction in the synthesis prompt', async () => {
      const stateWithOverride = { ...BASE_STATE, kbPastBids: `[1] ${OVERRIDE_DOC}` };

      await synthesiseRecommendation(stateWithOverride);

      const invokeMock = getSynthesisInvokeMock();
      const [messages] = invokeMock.mock.calls[0] as [Array<{ role: string; content: string }>];
      const userContent = messages.find((m) => m.role === 'user')?.content ?? '';

      // Synthesis prompt must carry the precedent-citation instruction (§4 of spec)
      expect(userContent).toContain('PRECEDENT RULE');
      // Instruction must reference the scoped-bid confidence downgrade logic
      expect(userContent).toContain('CONDITIONAL-GO');
    });
  });
});
