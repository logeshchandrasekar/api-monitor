import { useId, type InputHTMLAttributes } from "react";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label: string;
  hint?: string;
};

export function Checkbox({ label, hint, ...rest }: CheckboxProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-4 rounded border-line accent-[var(--brand)]"
        {...rest}
      />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-sm text-fg-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
