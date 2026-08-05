import { InputHTMLAttributes, forwardRef } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className = '', id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input
            ref={ref}
            id={inputId}
            type="checkbox"
            className={[
              'mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary-light',
              'dark:border-gray-600 dark:bg-gray-800',
              className,
            ].join(' ')}
            {...props}
          />
          <span>{label}</span>
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export default Checkbox;
