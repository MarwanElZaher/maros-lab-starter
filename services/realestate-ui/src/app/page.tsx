'use client';

import { useState } from 'react';

interface Listing {
  post_url?: string;
  description?: string;
  mobile_number?: string;
  price?: string;
  size?: string;
  location?: string;
}

interface ParsedQuery {
  location: string;
  sizeMin?: number;
  sizeMax?: number;
  priceMax?: number;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parsed, setParsed] = useState<ParsedQuery | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setListings([]);
    setParsed(null);

    try {
      const parseRes = await fetch('/api/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!parseRes.ok) throw new Error('فشل تحليل الاستعلام');
      const parsedData: ParsedQuery = await parseRes.json();
      setParsed(parsedData);

      const scrapeRes = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedData),
      });
      if (!scrapeRes.ok) throw new Error('فشل جلب النتائج');
      const data = await scrapeRes.json();
      setListings(data.listings || []);

      if ((data.listings || []).length > 0) {
        fetch('/api/sheets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, parsed: parsedData, listings: data.listings }),
        }).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 800, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ textAlign: 'center', color: '#1a1a1a', marginBottom: '2rem' }}>
        🏠 بحث عقارات مصر
      </h1>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="شقة في الشماليات 100 متر"
          dir="rtl"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            fontSize: '1rem',
            border: '2px solid #ddd',
            borderRadius: 8,
            outline: 'none',
            textAlign: 'right',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            background: loading ? '#999' : '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: '1rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'جاري البحث...' : 'بحث'}
        </button>
      </form>

      {parsed && (
        <div style={{ background: '#e0f2fe', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <strong>تم تحليل البحث:</strong> موقع: {parsed.location}
          {parsed.sizeMin != null && ` | حجم من: ${parsed.sizeMin} متر`}
          {parsed.sizeMax != null && ` إلى ${parsed.sizeMax} متر`}
          {parsed.priceMax != null && ` | حد السعر: ${parsed.priceMax}`}
        </div>
      )}

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {listings.length > 0 && (
        <div>
          <p style={{ color: '#555', marginBottom: '1rem' }}>تم العثور على {listings.length} نتيجة</p>
          {listings.map((listing, i) => (
            <div
              key={i}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                padding: '1rem',
                marginBottom: '0.75rem',
              }}
            >
              {listing.description && (
                <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>{listing.description}</p>
              )}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem', color: '#555' }}>
                {listing.price && <span>💰 {listing.price}</span>}
                {listing.size && <span>📐 {listing.size}</span>}
                {listing.location && <span>📍 {listing.location}</span>}
                {listing.mobile_number && <span>📞 {listing.mobile_number}</span>}
              </div>
              {listing.post_url && (
                <a
                  href={listing.post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: '0.5rem', color: '#2563eb', fontSize: '0.85rem' }}
                >
                  عرض الإعلان ←
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && listings.length === 0 && !error && parsed && (
        <p style={{ textAlign: 'center', color: '#888' }}>لم يتم العثور على نتائج</p>
      )}
    </main>
  );
}
