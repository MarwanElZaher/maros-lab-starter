import {
  CopilotRuntime,
  OpenAIAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import OpenAI from "openai";
import { NextRequest } from "next/server";

function makeRuntime() {
  const openai = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    baseURL: "https://openrouter.ai/api/v1",
  });

  const serviceAdapter = new OpenAIAdapter({
    openai,
    model: "openai/gpt-4o-mini",
  });

  const runtime = new CopilotRuntime();

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest;
}

const handleRequest = makeRuntime();

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
export async function GET(req: NextRequest) {
  return handleRequest(req);
}
export async function OPTIONS(req: NextRequest) {
  return handleRequest(req);
}
