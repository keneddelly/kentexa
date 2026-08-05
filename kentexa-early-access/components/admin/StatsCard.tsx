import Card from '@/components/ui/Card';

interface StatsCardProps {
  label: string;
  value: number;
  accentClassName?: string;
}

export default function StatsCard({ label, value, accentClassName = 'text-primary dark:text-primary-light' }: StatsCardProps) {
  return (
    <Card>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${accentClassName}`}>{value.toLocaleString()}</p>
    </Card>
  );
}
