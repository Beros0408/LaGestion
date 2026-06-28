import React, { useId, useState } from "react";
import { X } from "lucide-react";
import { C } from "../../theme";

export default function TagInput({
  label,
  value = [],
  onChange,
  hint,
  placeholder = "Ajouter un tag…",
  className = "",
  id,
}) {
  const autoId = useId();
  const inputId = id || `${autoId}-tag`;
  const [brouillon, setBrouillon] = useState("");

  const ajouter = (brut) => {
    const tag = brut.trim();
    if (!tag) return;
    if (value.includes(tag)) return;
    onChange([...value, tag]);
  };

  const supprimer = (tag) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      ajouter(brouillon);
      setBrouillon("");
    } else if (e.key === "Backspace" && brouillon === "" && value.length > 0) {
      supprimer(value[value.length - 1]);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-xs font-medium"
          style={{ color: C.textSecondary }}
        >
          {label}
        </label>
      )}
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl px-2 py-1.5 focus-within:ring-2"
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          "--tw-ring-color": C.primary,
        }}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
          >
            {tag}
            <button
              type="button"
              onClick={() => supprimer(tag)}
              aria-label={`Supprimer le tag ${tag}`}
              className="rounded focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, "--tw-ring-color": C.primary }}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          type="text"
          value={brouillon}
          onChange={(e) => setBrouillon(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (brouillon) {
              ajouter(brouillon);
              setBrouillon("");
            }
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-sm focus:outline-none"
          style={{ color: C.textPrimary }}
        />
      </div>
      {hint && (
        <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{hint}</p>
      )}
    </div>
  );
}
