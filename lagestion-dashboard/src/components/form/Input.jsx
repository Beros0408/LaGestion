import React, { useId } from "react";
import { C } from "../../theme";

export default function Input({
  label,
  error,
  hint,
  id,
  required,
  className = "",
  ...rest
}) {
  const autoId = useId();
  const inputId = id || autoId;
  const errorId = error ? `${inputId}-err` : undefined;
  const hintId = hint && !error ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium"
          style={{ color: C.textSecondary }}
        >
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: C.error }}> *</span>
          )}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${error ? C.error : C.border}`,
          color: C.textPrimary,
          "--tw-ring-color": C.primary,
        }}
        {...rest}
      />
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
