import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getClient() {
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const client = getClient();
  const { query } = await req.json();
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const completion = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4-5',
    messages: [
      {
        role: 'system',
        content: `You are a real-estate query parser for Egypt. Extract search parameters from Arabic apartment queries.
Return ONLY valid JSON with these fields (all optional except location):
{
  "location": "string (neighborhood or area name, keep Arabic)",
  "sizeMin": number | null,
  "sizeMax": number | null,
  "priceMax": number | null
}
No markdown, no explanation — just the JSON object.`,
      },
      { role: 'user', content: query },
    ],
    temperature: 0,
  });

  const text = completion.choices[0]?.message?.content ?? '{}';
  try {
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'parse failed', raw: text }, { status: 500 });
  }
}
