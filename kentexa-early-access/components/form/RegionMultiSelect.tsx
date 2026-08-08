'use client';

import { useEffect, useState } from 'react';
import { getRegions } from '@/lib/apiClient';
import type { RegionOption } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';

interface Props {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
}

export default function RegionMultiSelect({ label, value, onChange }: Props) {
  const { lang } = useLanguage();
  const [regions, setRegions] = useState<RegionOption[]>([]);

  useEffect(() => {
    getRegions()
      .then(setRegions)
      .catch(() => setRegions([]));
  }, []);

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((v) => v !== name) : [...value, name]);
  };

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">{label}</label>
      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-lg border border-gray-200 p-3 sm:grid-cols-3 dark:border-gray-700">
        {regions.map((region) => (
          <label
            key={region.id}
            className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-200"
          >
            <input
              type="checkbox"
              checked={value.includes(region.name)}
              onChange={() => toggle(region.name)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-light dark:border-gray-600"
            />
            {lang === 'sw' ? region.nameSw : region.name}
          </label>
        ))}
        {regions.length === 0 && (
          <span className="col-span-full text-xs text-gray-400">…</span>
        )}
      </div>
    </div>
  );
}
