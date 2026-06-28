import React, { useId } from "react";
import { C } from "../../theme";

export default function Textarea({
  label,
  error,
  hint,
  id,
  required,
  className = "",
  rows = 4,
  ...rest
}) {
  const autoId = useId();
  const taId = id || autoId;
  const errorId = error ? `${taId}-err` : undefined;
  const hintId = hint && !error ? `${taId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={taId}
          className="mb-1 block text-xs font-medium"
          style={{ color: C.textSecondary }}
        >
          {label}
          {required && (
            <span aria-hidden="true" style={{ color: C.error }}> *</span>
          )}
        </label>
      )}
      <textarea
        id={taId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        className="w-full resize-y rounded-xl px-3 py-2 text-sm focus:outline-none focus-visible:ring-2"
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
