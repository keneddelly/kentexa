'use client';

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import Card from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { getChartColors } from './palette';
import { formatEnumLabel, type AdminStats } from '@/lib/types';

interface Props {
  data: AdminStats['byAccountType'];
}

export default function AccountTypeChart({ data }: Props) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);

  const chartData = data.map((d) => ({
    name: formatEnumLabel(d.accountType || 'other'),
    value: Number(d.count),
  }));

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Account type distribution
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            stroke={theme === 'dark' ? '#1f2937' : '#ffffff'}
            strokeWidth={2}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={colors.categorical[index % colors.categorical.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.text }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            wrapperStyle={{ fontSize: 12, color: colors.text }}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
