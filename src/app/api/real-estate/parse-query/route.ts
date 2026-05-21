import { NextRequest, NextResponse } from 'next/server';
import { parseArabicQuery } from '@/lib/real-estate/query-parser';

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query?: string };
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }
    const params = await parseArabicQuery(query);
    return NextResponse.json(params);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
