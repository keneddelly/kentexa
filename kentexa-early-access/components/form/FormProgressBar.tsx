'use client';

import { STEP_LABELS, TOTAL_STEPS } from '@/hooks/useRegistrationForm';

interface FormProgressBarProps {
  step: number;
  onStepClick?: (index: number) => void;
}

export default function FormProgressBar({ step, onStepClick }: FormProgressBarProps) {
  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-sm font-medium text-gray-500 dark:text-gray-400">
        <span>
          Step {step + 1} of {TOTAL_STEPS}
        </span>
        <span className="hidden sm:inline">{STEP_LABELS[step]}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>
      <div className="mt-3 hidden justify-between gap-1 sm:flex">
        {STEP_LABELS.map((label, index) => (
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
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
