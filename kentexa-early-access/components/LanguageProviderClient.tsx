'use client';

import { LanguageContext, useLanguageProviderValue } from '@/lib/i18n';

export default function LanguageProviderClient({ children }: { children: React.ReactNode }) {
  const value = useLanguageProviderValue();
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
