import { useId, type SelectHTMLAttributes } from "react";
import { describedBy, fieldControl } from "../utils/ui";
import { Field } from "./Field";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  error?: string | null;
  hint?: string;
  id?: string;
  className?: string;
}

/** A native <select>: best accessibility and mobile behaviour for free. Pass <option> children. */
export function Select({ label, error, hint, id, className, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <Field id={selectId} label={label} error={error} hint={hint} className={className}>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, error, hint)}
        className={fieldControl(Boolean(error))}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
