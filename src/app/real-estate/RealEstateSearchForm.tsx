'use client';

import { useState } from 'react';
import { useCopilotAction, useCopilotReadable } from '@copilotkit/react-core';

interface SearchParams {
  location: string;
  sizeMin: number;
  sizeMax: number;
  priceMax?: number;
}

interface Listing {
  post_url: string;
  mobile_number: string;
  description_snippet: string;
  price: string;
  size: string;
  source?: string;
}

export function RealEstateSearchForm() {
  const [nlQuery, setNlQuery] = useState('');
  const [params, setParams] = useState<SearchParams>({ location: '', sizeMin: 50, sizeMax: 200 });
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useCopilotReadable({
    description: 'Current real estate search parameters',
    value: params,
  });

  useCopilotAction({
    name: 'parseRealEstateQuery',
    description:
      'Parse an Arabic or English natural-language real estate query into structured search parameters',
    parameters: [
      { name: 'location', type: 'string', description: 'Neighborhood or area name' },
      { name: 'sizeMin', type: 'number', description: 'Minimum apartment size in m²' },
      { name: 'sizeMax', type: 'number', description: 'Maximum apartment size in m²' },
      { name: 'priceMax', type: 'number', description: 'Maximum price in EGP (optional)', required: false },
    ],
    handler: ({ location, sizeMin, sizeMax, priceMax }) => {
      setParams({ location, sizeMin, sizeMax, priceMax });
      return `تم تحديد البحث: ${location}، ${sizeMin}–${sizeMax} م²`;
    },
  });

  const handleNlParse = async () => {
    if (!nlQuery.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/real-estate/parse-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      });
      if (!res.ok) throw new Error(await res.text());
      const parsed = await res.json() as SearchParams;
      setParams(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!params.location) return;
    setLoading(true);
    setError('');
    setListings([]);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, multiSource: true }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { listings: Listing[] };
      setListings(data.listings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          بحث بالذكاء الاصطناعي (اكتب بالعربي أو الإنجليزي)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            placeholder="مثال: شقق في الشماليات 3 غرف بسعر مناسب"
            className="flex-1 border rounded-lg px-4 py-2 text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
            dir="rtl"
          />
          <button
            onClick={handleNlParse}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            تحليل
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="bg-white rounded-xl shadow p-6 mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">الموقع</label>
          <input
            type="text"
            value={params.location}
            onChange={(e) => setParams({ ...params, location: e.target.value })}
            className="w-full border rounded-lg px-4 py-2 text-right"
            dir="rtl"
            required
          />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأدنى للمساحة (م²)</label>
            <input
              type="number"
              value={params.sizeMin}
              onChange={(e) => setParams({ ...params, sizeMin: Number(e.target.value) })}
              className="w-full border rounded-lg px-4 py-2"
              min={1}
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأقصى للمساحة (م²)</label>
            <input
              type="number"
              value={params.sizeMax}
              onChange={(e) => setParams({ ...params, sizeMax: Number(e.target.value) })}
              className="w-full border rounded-lg px-4 py-2"
              min={1}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">الحد الأقصى للسعر (ج.م) — اختياري</label>
          <input
            type="number"
            value={params.priceMax ?? ''}
            onChange={(e) => setParams({ ...params, priceMax: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full border rounded-lg px-4 py-2"
            min={0}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'جارٍ البحث...' : 'ابحث الآن'}
        </button>
      </form>

      {error && <p className="text-red-600 text-center mb-4">{error}</p>}

      {listings.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-700">{listings.length} نتيجة</h2>
          {listings.map((l, i) => (
            <div key={i} className="bg-white rounded-xl shadow p-4" dir="rtl">
              <p className="font-medium text-gray-800 mb-1">{l.description_snippet || 'بدون وصف'}</p>
              <div className="text-sm text-gray-500 space-y-1">
                {l.price && <p>السعر: {l.price}</p>}
                {l.size && <p>المساحة: {l.size}</p>}
                {l.mobile_number && <p>الهاتف: {l.mobile_number}</p>}
                {l.source && <p className="text-xs text-gray-400">المصدر: {l.source}</p>}
              </div>
              {l.post_url && (
                <a href={l.post_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-sm mt-2 block hover:underline">
                  عرض الإعلان ←
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
