'use client';

import { useEffect, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import Input from '@/components/ui/Input';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { searchLocations } from '@/lib/apiClient';
import type { RegistrationFormValues } from '@/lib/formSchema';
import type { LocationSearchResult } from '@/lib/types';
import { useLanguage } from '@/lib/i18n';

interface Props {
  form: UseFormReturn<RegistrationFormValues>;
}

const TYPE_LABEL_KEY: Record<LocationSearchResult['type'], string> = {
  ward: 'location_type_ward',
  district: 'location_type_district',
  region: 'location_type_region',
};

export default function LocationCombobox({ form }: Props) {
  const { t } = useLanguage();
  const { setValue, watch } = form;
  const region = watch('region');
  const district = watch('district');
  const ward = watch('ward');

  const [query, setQuery] = useState(() => [ward, district, region].filter(Boolean).join(', '));
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [hasSelection, setHasSelection] = useState(!!(region && district));
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(query, 300);

  useEffect(() => {
    if (hasSelection || debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    searchLocations(debouncedQuery.trim())
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, hasSelection]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const select = (result: LocationSearchResult) => {
    // The backend's decimal columns can come back as numeric strings — coerce defensively.
    const lat = result.lat !== null && result.lat !== undefined ? Number(result.lat) : undefined;
    const lng = result.lng !== null && result.lng !== undefined ? Number(result.lng) : undefined;
    setValue('region', result.region ?? '', { shouldValidate: true });
    setValue('district', result.district ?? '', { shouldValidate: true });
    setValue('ward', result.ward ?? '', { shouldValidate: true });
    setValue('latitude', Number.isNaN(lat) ? undefined : lat, { shouldValidate: true });
    setValue('longitude', Number.isNaN(lng) ? undefined : lng, { shouldValidate: true });
    setQuery(result.fullAddress);
    setHasSelection(true);
    setIsOpen(false);
  };

  const clearSelection = () => {
    setHasSelection(false);
    setQuery('');
    setValue('region', '', { shouldValidate: true });
    setValue('district', '', { shouldValidate: true });
    setValue('ward', '', { shouldValidate: true });
    setValue('latitude', undefined);
    setValue('longitude', undefined);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(results[highlighted]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        label={t('location_area_label')}
        required
        placeholder={t('location_area_placeholder')}
        value={query}
        readOnly={hasSelection}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlighted(0);
          setIsOpen(true);
        }}
        onFocus={() => !hasSelection && setIsOpen(true)}
        onKeyDown={onKeyDown}
        hint={hasSelection ? undefined : t('location_area_hint')}
      />

      {hasSelection && (
        <button
          type="button"
          onClick={clearSelection}
          className="absolute right-3 top-9 text-xs font-medium text-primary hover:underline dark:text-primary-light"
        >
          {t('location_change')}
        </button>
      )}

      {isOpen && !hasSelection && (isLoading || results.length > 0) && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {t('location_searching')}
            </div>
          )}
          {!isLoading &&
            results.map((result, i) => (
              <button
                key={`${result.type}-${result.wardId ?? result.districtId ?? result.regionId}-${i}`}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(result)}
                className={[
                  'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm',
                  i === highlighted
                    ? 'bg-primary/5 dark:bg-primary-light/10'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
                ].join(' ')}
              >
                <span className="text-gray-800 dark:text-gray-100">{result.fullAddress}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400">
                  {t(TYPE_LABEL_KEY[result.type])}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
