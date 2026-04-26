/**
 * MAR-87 — Langfuse standalone SDK tracing
 *
 * Verifies that runAnalysis instruments all 5 LangGraph nodes as spans and each
 * LLM call as a generation. The import is NOT mocked at module level — only the
 * Langfuse class constructor (network calls) is intercepted via jest.mock.
 */

const mockSpanEnd = jest.fn();
const mockGenerationEnd = jest.fn();
const mockSpan = jest.fn(() => ({ end: mockSpanEnd }));
const mockGeneration = jest.fn(() => ({ end: mockGenerationEnd }));
const mockTrace = { span: mockSpan, generation: mockGeneration };
const mockLfTrace = jest.fn().mockReturnValue(mockTrace);
const mockFlushAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('langfuse', () => ({
  Langfuse: jest.fn().mockImplementation(() => ({
    trace: mockLfTrace,
    flushAsync: mockFlushAsync,
  })),
}));

jest.mock('../../services/rfp-analyzer/src/ragflow', () => ({
  retrieveChunks: jest.fn().mockResolvedValue('[1] mock chunk'),
}));

jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({
    text: 'Mock RFP content for Langfuse tracing test',
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: {} as never,
    version: 'v1.10.100',
  }),
);

jest.mock('axios');

const mockStructuredInvokeRequirements = jest.fn().mockResolvedValue({
  requirements: ['Requirement A'],
  buyerName: 'Test Buyer',
  country: 'KSA',
  deadline: null,
  budget: null,
  summary: 'Test RFP summary',
});

const mockStructuredInvokeBlockers = jest.fn().mockResolvedValue({
  blockers: [],
  entitlementMismatches: [],
  hasCriticalBlocker: false,
});

const mockStructuredInvokeRecommendation = jest.fn().mockResolvedValue({
  decision: 'GO',
  confidence: 80,
  justifications: ['j1', 'j2', 'j3'],
  redFlags: [],
  similarBids: [],
  recommendationText: 'Proceed',
});

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn().mockImplementation(() => ({
      invoke: jest
        .fn()
        .mockImplementationOnce(() => mockStructuredInvokeRequirements())
        .mockImplementationOnce(() => mockStructuredInvokeBlockers())
        .mockImplementationOnce(() => mockStructuredInvokeRecommendation()),
    })),
  })),
}));

import { runAnalysis } from '../../services/rfp-analyzer/src/graph';

describe('MAR-87 Langfuse standalone tracing', () => {
  beforeAll(() => {
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_BASE_URL = 'http://localhost:3000';
  });

  afterAll(() => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_BASE_URL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLfTrace.mockReturnValue(mockTrace);
    mockFlushAsync.mockResolvedValue(undefined);
    mockSpan.mockReturnValue({ end: mockSpanEnd });
    mockGeneration.mockReturnValue({ end: mockGenerationEnd });
  });

  it('creates a trace and calls flushAsync after analysis', async () => {
    await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });
    expect(mockLfTrace).toHaveBeenCalledTimes(1);
    expect(mockFlushAsync).toHaveBeenCalledTimes(1);
  });

  it('creates a span for each of the 5 LangGraph nodes', async () => {
    await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });

    const nodeNames = (mockSpan.mock.calls as Array<[{ name: string }]>).map(([args]) => args.name);
    expect(nodeNames).toContain('extractRequirements');
    expect(nodeNames).toContain('queryKnowledgeBases');
    expect(nodeNames).toContain('retrieveSimilarBids');
    expect(nodeNames).toContain('detectBlockers');
    expect(nodeNames).toContain('synthesiseRecommendation');
    expect(mockSpan).toHaveBeenCalledTimes(5);
  });

  it('calls span.end for each node span', async () => {
    await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });
    expect(mockSpanEnd).toHaveBeenCalledTimes(5);
  });

  it('creates a generation for each LLM call (extractRequirements, detectBlockers, synthesiseRecommendation)', async () => {
    await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });

    const generationNames = (mockGeneration.mock.calls as Array<[{ name: string }]>).map(([args]) => args.name);
    expect(generationNames).toContain('extractRequirements:llm');
    expect(generationNames).toContain('detectBlockers:llm');
    expect(generationNames).toContain('synthesiseRecommendation:llm');
    expect(mockGeneration).toHaveBeenCalledTimes(3);
  });

  it('calls generation.end for each LLM generation', async () => {
    await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });
    expect(mockGenerationEnd).toHaveBeenCalledTimes(3);
  });

  it('does not create Langfuse client when env vars are absent', async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_BASE_URL;

    const { Langfuse } = await import('langfuse');
    (Langfuse as jest.Mock).mockClear();

    try {
      await runAnalysis({ pdfBytes: Buffer.from('fake pdf') });
    } catch {
      // runAnalysis may throw if mocks aren't reset; that's OK for this assertion
    }

    expect(Langfuse as jest.Mock).not.toHaveBeenCalled();

    // Restore for afterAll cleanup
    process.env.LANGFUSE_SECRET_KEY = 'sk-test';
    process.env.LANGFUSE_PUBLIC_KEY = 'pk-test';
    process.env.LANGFUSE_BASE_URL = 'http://localhost:3000';
  });
});
