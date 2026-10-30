import { useId, type InputHTMLAttributes } from "react";
import { describedBy, fieldControl } from "../utils/ui";
import { Field } from "./Field";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  error?: string | null;
  hint?: string;
  id?: string;
  /** Class for the wrapper (width, margin), not for the <input> itself */
  className?: string;
}

export function Input({ label, error, hint, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field id={inputId} label={label} error={error} hint={hint} className={className}>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={fieldControl(Boolean(error))}
        {...rest}
      />
    </Field>
  );
}
