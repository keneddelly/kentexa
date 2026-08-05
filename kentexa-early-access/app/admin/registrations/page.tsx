'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import FilterBar from '@/components/admin/FilterBar';
import RegistrationsTable from '@/components/admin/RegistrationsTable';
import RejectReasonModal from '@/components/admin/RejectReasonModal';
import Button from '@/components/ui/Button';
import {
  ApiError,
  approveRegistration,
  deleteRegistration,
  exportCsv,
  exportExcel,
  listRegistrations,
  rejectRegistration,
} from '@/lib/apiClient';
import type { PaginatedRegistrations, RegistrationListFilters } from '@/lib/types';

const DEFAULT_FILTERS: RegistrationListFilters = {
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'DESC',
};

export default function AdminRegistrationsPage() {
  const [filters, setFilters] = useState<RegistrationListFilters>(DEFAULT_FILTERS);
  const [result, setResult] = useState<PaginatedRegistrations | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listRegistrations(filters)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.statusCode === 403) {
          setForbidden(true);
        } else {
          toast.error(err instanceof Error ? err.message : 'Failed to load registrations');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  const refetch = () => setReloadToken((t) => t + 1);

  const handleApprove = async (id: number) => {
    setActioningId(id);
    try {
      await approveRegistration(id);
      toast.success('Registration approved');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActioningId(null);
    }
  };

  const handleRejectConfirm = async (reason: string) => {
    if (rejectTargetId === null) return;
    setActioningId(rejectTargetId);
    try {
      await rejectRegistration(rejectTargetId, reason);
      toast.success('Registration rejected');
      setRejectTargetId(null);
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActioningId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this registration? This cannot be undone.')) return;
    setActioningId(id);
    try {
      await deleteRegistration(id);
      toast.success('Registration deleted');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setActioningId(null);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await exportCsv(filters);
      toast.success('CSV export started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportExcel(filters);
      toast.success('Excel export started');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  if (forbidden) {
    return (
      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
        <h2 className="mb-1 text-lg font-semibold">Not authorized</h2>
        <p className="text-sm">
          You are logged in, but this account does not have Admin or Manager access to the Early
          Access dashboard.
        </p>
      </div>
    );
  }

  const totalPages = result?.totalPages ?? 1;
  const page = filters.page ?? 1;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">Registrations</h1>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        onExportCsv={handleExportCsv}
        onExportExcel={handleExportExcel}
        isExporting={isExporting}
      />

      <RegistrationsTable
        registrations={result?.data ?? []}
        isLoading={isLoading}
        onApprove={handleApprove}
        onReject={(id) => setRejectTargetId(id)}
        onDelete={handleDelete}
        actioningId={actioningId}
      />

      {result && result.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
          <span>
            Page {page} of {totalPages} · {result.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages}
              onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <RejectReasonModal
        isOpen={rejectTargetId !== null}
        onClose={() => setRejectTargetId(null)}
        onConfirm={handleRejectConfirm}
        isSubmitting={actioningId === rejectTargetId}
      />
    </div>
  );
}
