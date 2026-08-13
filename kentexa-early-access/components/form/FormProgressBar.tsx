'use client';

import { STEP_LABELS } from '@/hooks/useRegistrationForm';
import { useLanguage } from '@/lib/i18n';

interface FormProgressBarProps {
  step: number;
  onStepClick?: (index: number) => void;
  // Steps below this index aren't part of this flow (e.g. Account Type,
  // already answered before the "tell us more" wizard loads) — hidden from
  // the tab row and excluded from the "step X of Y" count entirely, rather
  // than shown as a dead, already-answered tab.
  minStep?: number;
}

export default function FormProgressBar({ step, onStepClick, minStep = 0 }: FormProgressBarProps) {
  const { t } = useLanguage();
  const visibleLabels = STEP_LABELS.slice(minStep);
  const visibleTotal = visibleLabels.length;
  const visibleStep = step - minStep;

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
        <span>{t('step_x_of_y', { step: visibleStep + 1, total: visibleTotal })}</span>
        <span className="hidden sm:inline">{t(STEP_LABELS[step])}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
          style={{ width: `${((visibleStep + 1) / visibleTotal) * 100}%` }}
        />
      </div>
      <div className="mt-3 hidden justify-between gap-1 sm:flex">
        {visibleLabels.map((label, offset) => {
          const index = offset + minStep;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onStepClick?.(index)}
              disabled={!onStepClick || index > step}
              className={[
                'flex-1 truncate rounded px-1 py-1 text-center text-xs transition-colors',
                index === step
                  ? 'font-semibold text-primary dark:text-primary-light'
                  : index < step
                    ? 'cursor-pointer text-gray-500 hover:text-primary dark:text-gray-400'
                    : 'cursor-not-allowed text-gray-300 dark:text-gray-600',
              ].join(' ')}
            >
              {t(label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
