'use client';

import { useEffect, useState } from 'react';
import { getPublicStats } from '@/lib/apiClient';
import type { PublicStats } from '@/lib/types';
import Skeleton from '@/components/ui/Skeleton';
import { useLanguage } from '@/lib/i18n';

const LABELS: { key: keyof PublicStats; labelKey: string }[] = [
  { key: 'businessesRegistered', labelKey: 'stats_businesses' },
  { key: 'serviceProviders', labelKey: 'stats_service_providers' },
  { key: 'transporters', labelKey: 'stats_transporters' },
  { key: 'regionsCovered', labelKey: 'stats_regions' },
];

export default function StatsCounter() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPublicStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return null;

  return (
    <section className="bg-primary py-14 dark:bg-primary-dark">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-6 sm:grid-cols-4">
        {LABELS.map(({ key, labelKey }) => (
          <div key={key} className="text-center text-white">
            {stats ? (
              <div className="text-3xl font-extrabold sm:text-4xl">{stats[key].toLocaleString()}+</div>
            ) : (
              <div className="flex justify-center">
                <Skeleton className="h-9 w-16 bg-white/20" />
              </div>
            )}
            <div className="mt-2 text-sm font-medium text-white/80">{t(labelKey)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
