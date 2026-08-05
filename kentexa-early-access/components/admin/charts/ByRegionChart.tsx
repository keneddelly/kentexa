'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { getChartColors, SEQUENTIAL_BLUE_DARK, SEQUENTIAL_BLUE_LIGHT } from './palette';
import type { AdminStats } from '@/lib/types';

interface Props {
  data: AdminStats['byRegion'];
}

export default function ByRegionChart({ data }: Props) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const barColor = theme === 'dark' ? SEQUENTIAL_BLUE_DARK : SEQUENTIAL_BLUE_LIGHT;

  const chartData = data
    .map((d) => ({ region: d.region || 'Unknown', count: Number(d.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Businesses by region (top 10)
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={{ stroke: colors.grid }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="region"
            width={100}
            tick={{ fill: colors.axis, fontSize: 11 }}
            axisLine={{ stroke: colors.grid }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.text }}
            labelStyle={{ color: colors.text }}
          />
          <Bar dataKey="count" name="Businesses" fill={barColor} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
