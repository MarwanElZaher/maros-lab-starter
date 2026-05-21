import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { query, parsed, listings } = await req.json();

  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!spreadsheetId || !serviceAccountJson) {
    return NextResponse.json({ ok: false, reason: 'sheets not configured' });
  }

  try {
    const { google } = await import('googleapis');
    const credentials = JSON.parse(serviceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const rows = (listings as Record<string, string>[]).map((l) => [
      new Date().toISOString(),
      query,
      parsed?.location ?? '',
      parsed?.sizeMin ?? '',
      parsed?.sizeMax ?? '',
      parsed?.priceMax ?? '',
      l.post_url ?? '',
      l.description ?? '',
      l.mobile_number ?? '',
      l.price ?? '',
      l.size ?? '',
      l.location ?? '',
    ]);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    return NextResponse.json({ ok: true, rows: rows.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
