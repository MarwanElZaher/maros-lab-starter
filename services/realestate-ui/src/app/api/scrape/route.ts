import { NextRequest, NextResponse } from 'next/server';

const OLX_SCRAPER_URL = process.env.OLX_SCRAPER_URL ?? 'http://olx-scraper:3001';

export async function POST(req: NextRequest) {
  const body = await req.json();

  let res: Response;
  try {
    res = await fetch(`${OLX_SCRAPER_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return NextResponse.json({ error: 'scraper unreachable', detail: String(err) }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
