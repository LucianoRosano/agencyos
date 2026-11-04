"use client";

import { Select } from "@agencyos/ui";
import type { SelectHTMLAttributes } from "react";

/** Select de filtro que envía su formulario GET al cambiar (sin botón extra). */
export function FilterSelect({
  options,
  placeholder,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder: string }) {
  return (
    <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
