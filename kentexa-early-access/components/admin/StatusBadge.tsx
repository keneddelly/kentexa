import { RegistrationStatus } from '@/lib/types';

const STYLES: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING]:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  [RegistrationStatus.APPROVED]:
    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  [RegistrationStatus.REJECTED]: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export default function StatusBadge({ status }: { status: RegistrationStatus | string }) {
  const style = STYLES[status as RegistrationStatus] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${style}`}>
      {status}
    </span>
  );
}
