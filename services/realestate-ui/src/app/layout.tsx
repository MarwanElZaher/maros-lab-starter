import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'بحث عقارات',
  description: 'بحث عن شقق في مصر',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, Arial, sans-serif', background: '#f5f5f5' }}>
        {children}
      </body>
    </html>
  );
}
