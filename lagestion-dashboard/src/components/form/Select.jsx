import React, { useId } from "react";
import { ChevronDown } from "lucide-react";
import { C } from "../../theme";

export default function Select({
  label,
  error,
  hint,
  id,
  required,
  options = [],
  className = "",
  ...rest
}) {
  const autoId = useId();
  const selectId = id || autoId;
  const errorId = error ? `${selectId}-err` : undefined;
  const hintId = hint && !error ? `${selectId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1 block text-xs font-medium"
          style={{ color: C.textSecondary }}
        >
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: C.error }}> *</span>
          )}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className="w-full appearance-none rounded-xl py-2 pl-3 pr-8 text-sm focus:outline-none focus-visible:ring-2"
          style={{
            backgroundColor: C.bgCard,
            border: `1px solid ${error ? C.error : C.border}`,
            color: C.textPrimary,
            "--tw-ring-color": C.primary,
          }}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
          style={{ color: C.textSecondary }}
        />
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs" style={{ color: C.textSecondary }}>
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-xs font-medium"
          style={{ color: C.error }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
