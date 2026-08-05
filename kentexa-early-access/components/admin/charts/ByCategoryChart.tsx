'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { getChartColors, SEQUENTIAL_ORANGE_DARK, SEQUENTIAL_ORANGE_LIGHT } from './palette';
import { formatEnumLabel, type AdminStats } from '@/lib/types';

interface Props {
  data: AdminStats['byCategory'];
}

export default function ByCategoryChart({ data }: Props) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const barColor = theme === 'dark' ? SEQUENTIAL_ORANGE_DARK : SEQUENTIAL_ORANGE_LIGHT;

  const chartData = data
    .map((d) => ({ category: formatEnumLabel(d.category || 'other'), count: Number(d.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Businesses by category (top 10)
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="category"
            tick={{ fill: colors.axis, fontSize: 10 }}
            axisLine={{ stroke: colors.grid }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            interval={0}
            height={50}
          />
          <YAxis allowDecimals={false} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={{ stroke: colors.grid }} tickLine={false} />
          <Tooltip
            cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.text }}
            labelStyle={{ color: colors.text }}
          />
          <Bar dataKey="count" name="Businesses" fill={barColor} radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
