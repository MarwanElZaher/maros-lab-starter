'use client';

import { CopilotKit } from '@copilotkit/react-core';
import { CopilotPopup } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';
import { RealEstateSearchForm } from './RealEstateSearchForm';

export default function RealEstatePage() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <main dir="rtl" className="min-h-screen bg-gray-50 p-8">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          بحث شقق للبيع
        </h1>
        <p className="text-center text-gray-500 mb-8 text-sm">
          اكتب بحثك بالعربي أو الإنجليزي — سيفهم الذكاء الاصطناعي طلبك
        </p>
        <RealEstateSearchForm />
        <CopilotPopup
          instructions="أنت مساعد بحث عقاري. ساعد المستخدم في تحديد موقع البحث والمواصفات. عند فهم الطلب، استخدم أداة parseRealEstateQuery."
          labels={{ title: 'مساعد العقارات', initial: 'كيف يمكنني مساعدتك في البحث؟' }}
        />
      </main>
    </CopilotKit>
  );
}
