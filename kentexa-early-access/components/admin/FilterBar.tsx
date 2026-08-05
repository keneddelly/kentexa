'use client';

import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import type { RegistrationListFilters } from '@/lib/types';
import { AccountType, BusinessCategory, RegistrationStatus, formatEnumLabel } from '@/lib/types';

interface FilterBarProps {
  filters: RegistrationListFilters;
  onChange: (filters: RegistrationListFilters) => void;
  onExportCsv: () => void;
  onExportExcel: () => void;
  isExporting?: boolean;
}

const accountTypeOptions = [
  { value: '', label: 'All Account Types' },
  ...Object.values(AccountType).map((v) => ({ value: v, label: formatEnumLabel(v) })),
];

const categoryOptions = [
  { value: '', label: 'All Categories' },
  ...Object.values(BusinessCategory).map((v) => ({ value: v, label: formatEnumLabel(v) })),
];

const statusOptions = [
  { value: '', label: 'All Statuses' },
  ...Object.values(RegistrationStatus).map((v) => ({ value: v, label: formatEnumLabel(v) })),
];

export default function FilterBar({ filters, onChange, onExportCsv, onExportExcel, isExporting }: FilterBarProps) {
  const update = (patch: Partial<RegistrationListFilters>) => {
    onChange({ ...filters, ...patch, page: 1 });
  };

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Search name, phone, email…"
          value={filters.search ?? ''}
          onChange={(e) => update({ search: e.target.value })}
        />
        <Select
          options={accountTypeOptions}
          value={filters.accountType ?? ''}
          onChange={(e) => update({ accountType: e.target.value })}
        />
        <Input
          placeholder="Region"
          value={filters.region ?? ''}
          onChange={(e) => update({ region: e.target.value })}
        />
        <Select
          options={categoryOptions}
          value={filters.businessCategory ?? ''}
          onChange={(e) => update({ businessCategory: e.target.value })}
        />
        <Select
          options={statusOptions}
          value={filters.status ?? ''}
          onChange={(e) => update({ status: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ page: 1, limit: filters.limit, sortBy: filters.sortBy, sortOrder: filters.sortOrder })}
        >
          Clear filters
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onExportCsv} isLoading={isExporting}>
            Export CSV
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onExportExcel} isLoading={isExporting}>
            Export Excel
          </Button>
        </div>
      </div>
    </div>
  );
}
