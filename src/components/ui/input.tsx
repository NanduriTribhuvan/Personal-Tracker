import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputBase =
  'flex h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3 text-[15px] sm:h-10 sm:text-sm text-foreground placeholder:text-subtle-foreground transition-colors hover:border-border-strong focus-visible:border-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-loss/70 aria-[invalid=true]:focus-visible:ring-loss/25';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input ref={ref} type={type} className={cn(inputBase, className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(inputBase, 'h-auto min-h-20 py-2.5 resize-y', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/** Native select — fully accessible and gives a proper picker on mobile. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative min-w-0">
      <select
        ref={ref}
        className={cn(inputBase, 'appearance-none pr-9 cursor-pointer [&>option]:bg-elevated', className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    </div>
  ),
);
Select.displayName = 'Select';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[13px] font-medium text-muted-foreground', className)} {...props} />;
}

interface FieldProps {
  id: string;
  label: React.ReactNode;
  error?: string;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** Label + control + hint/error, wired up with aria attributes by id convention. */
export function Field({ id, label, error, hint, required, className, children }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required && <span className="ml-0.5 text-loss" aria-hidden>*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-loss">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for an input inside <Field>. */
export function fieldAria(id: string, error?: string, hasHint = false) {
  return {
    id,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  };
}
