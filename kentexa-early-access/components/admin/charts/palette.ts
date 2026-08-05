// Validated categorical palette (see dataviz skill references/palette.md).
// Order is the CVD-safety mechanism — do not reorder or cycle independently.
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

export const CATEGORICAL_DARK = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
];

// Sequential single-hue steps (blue), for magnitude-only bar/line marks.
export const SEQUENTIAL_BLUE_LIGHT = '#256abf'; // step 500
export const SEQUENTIAL_BLUE_DARK = '#3987e5'; // step 400 (dark)
export const SEQUENTIAL_ORANGE_LIGHT = '#eb6834';
export const SEQUENTIAL_ORANGE_DARK = '#d95926';

export interface ChartColors {
  categorical: string[];
  axis: string;
  grid: string;
  text: string;
  tooltipBg: string;
  tooltipBorder: string;
}

export function getChartColors(theme: 'light' | 'dark'): ChartColors {
  if (theme === 'dark') {
    return {
      categorical: CATEGORICAL_DARK,
      axis: '#9ca3af',
      grid: '#374151',
      text: '#e5e7eb',
      tooltipBg: '#1f2937',
      tooltipBorder: '#374151',
    };
  }
  return {
    categorical: CATEGORICAL_LIGHT,
    axis: '#6b7280',
    grid: '#e5e7eb',
    text: '#374151',
    tooltipBg: '#ffffff',
    tooltipBorder: '#e5e7eb',
  };
}
