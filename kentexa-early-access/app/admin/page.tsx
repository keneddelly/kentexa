'use client';

import { useEffect, useState } from 'react';
import { ApiError, getAdminStats } from '@/lib/apiClient';
import type { AdminStats } from '@/lib/types';
import StatsCard from '@/components/admin/StatsCard';
import { SkeletonCard, SkeletonChart } from '@/components/ui/Skeleton';
import RegistrationsPerDayChart from '@/components/admin/charts/RegistrationsPerDayChart';
import ByRegionChart from '@/components/admin/charts/ByRegionChart';
import ByCategoryChart from '@/components/admin/charts/ByCategoryChart';
import AccountTypeChart from '@/components/admin/charts/AccountTypeChart';

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdminStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.statusCode === 403) {
          setForbidden(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load stats');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (forbidden) {
    return (
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
        <h2 className="mb-1 text-lg font-semibold">Not authorized</h2>
        <p className="text-sm">
          You are logged in, but this account does not have Admin or Manager access to the Early
          Access dashboard. Please sign in with an authorized account.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-6 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats ? (
          <>
            <StatsCard label="Total Registrations" value={stats.total} />
            <StatsCard label="Pending" value={stats.pending} accentClassName="text-yellow-500" />
            <StatsCard label="Approved" value={stats.approved} accentClassName="text-green-600 dark:text-green-400" />
            <StatsCard label="Rejected" value={stats.rejected} accentClassName="text-red-500" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {stats ? (
          <>
            <RegistrationsPerDayChart data={stats.registrationsPerDay} />
            <AccountTypeChart data={stats.byAccountType} />
            <ByRegionChart data={stats.byRegion} />
            <ByCategoryChart data={stats.byCategory} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <SkeletonChart key={i} />)
        )}
      </div>
    </div>
  );
}
