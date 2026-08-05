'use client';

import Link from 'next/link';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/admin/StatusBadge';
import { SkeletonTableRow } from '@/components/ui/Skeleton';
import type { Registration } from '@/lib/types';
import { RegistrationStatus, formatEnumLabel } from '@/lib/types';

interface RegistrationsTableProps {
  registrations: Registration[];
  isLoading: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (id: number) => void;
  actioningId?: number | null;
}

const COLUMNS = ['ID', 'Business', 'Owner', 'Type', 'Region', 'Status', 'Created', 'Actions'];

export default function RegistrationsTable({
  registrations,
  isLoading,
  onApprove,
  onReject,
  onDelete,
  actioningId,
}: RegistrationsTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400">
          <tr>
            {COLUMNS.map((col) => (
              <th key={col} className="px-4 py-3 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => <SkeletonTableRow key={i} columns={COLUMNS.length} />)}

          {!isLoading && registrations.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-4 py-10 text-center text-gray-400">
                No registrations found.
              </td>
            </tr>
          )}

          {!isLoading &&
            registrations.map((reg) => (
              <tr key={reg.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                  {reg.earlyAccessId}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{reg.businessName}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{reg.ownerName}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600 dark:text-gray-300">
                  {formatEnumLabel(reg.accountType)}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{reg.region}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={reg.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">
                  {new Date(reg.createdAt).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/admin/registrations/${reg.id}`}>
                      <Button size="sm" variant="ghost">
                        View
                      </Button>
                    </Link>
                    {reg.status === RegistrationStatus.PENDING && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onApprove(reg.id)}
                          isLoading={actioningId === reg.id}
                        >
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onReject(reg.id)}>
                          Reject
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="danger" onClick={() => onDelete(reg.id)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
