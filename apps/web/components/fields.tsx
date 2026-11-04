"use client";

import { Checkbox, Field, Input, Select, Textarea } from "@agencyos/ui";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useFieldError } from "./action-form";

type Common = { label: string; name: string; hint?: ReactNode; className?: string; required?: boolean };

export function TextField({ label, name, hint, className, required, ...props }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className} required={required}>
      <Input id={name} name={name} aria-invalid={error ? true : undefined} aria-describedby={error ? `${name}-error` : undefined} {...props} />
    </Field>
  );
}

export function TextAreaField({ label, name, hint, className, required, ...props }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className} required={required}>
      <Textarea id={name} name={name} aria-invalid={error ? true : undefined} {...props} />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  hint,
  className,
  required,
  options,
  placeholder,
  ...props
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const error = useFieldError(name);
  return (
    <Field label={label} name={name} error={error} hint={hint} className={className} required={required}>
      <Select id={name} name={name} aria-invalid={error ? true : undefined} {...props}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckField({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm text-text">
      <Checkbox name={name} defaultChecked={defaultChecked} className="mt-0.5" />
      <span>
        {label}
        {hint ? <span className="block text-[12px] text-text-faint">{hint}</span> : null}
      </span>
    </label>
  );
}
