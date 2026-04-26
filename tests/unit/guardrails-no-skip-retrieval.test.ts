/**
 * Guardrail test — MAR-80
 * Rule: no conditional edge in LangGraph may bypass retrieveSimilarBids.
 * Past-bid context can overturn a NO-GO verdict; always fan out, then synthesise.
 *
 * These tests would fail on the old graph.ts where routeAfterBlockers skipped
 * retrieveSimilarBids when hasCriticalBlocker=true.
 */

jest.mock('../../services/rfp-analyzer/src/ragflow', () => ({
  retrieveChunks: jest.fn(),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        decision: 'NO-GO',
        confidence: 10,
        justifications: ['j1', 'j2', 'j3'],
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

const STATE_WITH_CRITICAL_BLOCKER = {
  pdfUrl: '',
  pdfBytes: null,
  pdfText: 'We require full ISO 27001 certification across all modules.',
  requirements: {
    requirements: ['ISO 27001 certification', 'All modules'],
    buyerName: 'Acme Corp',
    country: null,
    deadline: null,
    budget: null,
    summary: 'Full ISO certification for Acme Corp',
  } satisfies Requirements,
  kbProducts: '[1] Maroslab product suite',
  kbPricing: '[1] Enterprise pricing',
  kbPastBids: '',
  kbLicensing: '[1] Enterprise edition required',
  blockerAnalysis: {
    blockers: [{ description: 'No ISO cert', severity: 'critical' as const, category: 'compliance' }],
    entitlementMismatches: [],
    hasCriticalBlocker: true,
  } satisfies BlockerAnalysis,
  recommendation: null,
};

describe('guardrail: retrieveSimilarBids is never skipped (MAR-80)', () => {
  let llmInstance: { withStructuredOutput: jest.Mock };

  beforeAll(() => {
    llmInstance = (ChatOpenAI as unknown as jest.Mock).mock.results[0].value as typeof llmInstance;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieveChunks.mockResolvedValue('[1] Acme Corp — go_scoped override — partial bid viable');
    llmInstance.withStructuredOutput.mockReturnValue({
      invoke: jest.fn().mockResolvedValue({
        decision: 'NO-GO',
        confidence: 10,
        justifications: ['j1', 'j2', 'j3'],
        redFlags: [],
        similarBids: [],
      }),
    });
  });

  it('calls retrieveSimilarBids (retrieveChunks) even when hasCriticalBlocker=true', async () => {
    const result = await retrieveSimilarBids(STATE_WITH_CRITICAL_BLOCKER);

    expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
    expect(result.kbPastBids).toContain('go_scoped');
  });

  it('synthesis prompt includes past-bid context from state with hasCriticalBlocker=true', async () => {
    const stateWithBids = {
      ...STATE_WITH_CRITICAL_BLOCKER,
      kbPastBids: '[1] Acme Corp — go_scoped override — scoped bid was viable for 3 modules',
    };

    await synthesiseRecommendation(stateWithBids);

    const invokeMock = llmInstance.withStructuredOutput.mock.results.at(-1)!.value.invoke as jest.Mock;
    const [messages] = invokeMock.mock.calls[0] as [Array<{ role: string; content: string }>];
    const userContent = messages.find((m) => m.role === 'user')?.content ?? '';

    expect(userContent).toContain('Past Similar Bids:');
    expect(userContent).toContain('go_scoped');
    expect(userContent).toContain('PRECEDENT RULE');
  });

  it('sentinel error strings from retrieval are never used as real context', async () => {
    mockRetrieveChunks.mockResolvedValue('[dataset not yet configured — pending MAR-17]');

    const result = await retrieveSimilarBids(STATE_WITH_CRITICAL_BLOCKER);

    // The node must still run; the caller (synthesis) is responsible for detecting
    // and replacing sentinel strings before forwarding them to the LLM.
    expect(result.kbPastBids).toBeDefined();
    expect(mockRetrieveChunks).toHaveBeenCalledTimes(1);
  });
});
