'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Card from '@/components/ui/Card';
import { useTheme } from '@/hooks/useTheme';
import { getChartColors, SEQUENTIAL_BLUE_DARK, SEQUENTIAL_BLUE_LIGHT } from './palette';
import type { AdminStats } from '@/lib/types';

interface Props {
  data: AdminStats['registrationsPerDay'];
}

export default function RegistrationsPerDayChart({ data }: Props) {
  const { theme } = useTheme();
  const colors = getChartColors(theme);
  const lineColor = theme === 'dark' ? SEQUENTIAL_BLUE_DARK : SEQUENTIAL_BLUE_LIGHT;

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    count: Number(d.count),
  }));

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">
        Registrations per day (last 30 days)
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={{ stroke: colors.grid }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: colors.axis, fontSize: 11 }} axisLine={{ stroke: colors.grid }} tickLine={false} />
          <Tooltip
            contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.text }}
            labelStyle={{ color: colors.text }}
          />
          <Line
            type="monotone"
            dataKey="count"
            name="Registrations"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ r: 3, fill: lineColor }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
