import { test } from "node:test";
import assert from "node:assert/strict";
import { C, BORDURE_CARTE } from "../src/theme.js";

// Contraste WCAG 2.x entre deux couleurs #RRGGBB.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("bordure des cartes : même valeur que le fond de la barre latérale, une seule source", () => {
  assert.equal(C.bordureCarte, C.sidebarBg);
  assert.equal(BORDURE_CARTE, `1px solid ${C.sidebarBg}`);
});

test("fond des cartes : tout texte ≥ 4,5:1, bordure nettement visible", () => {
  for (const cle of ["textPrimary", "textSecondary", "errorText", "successText", "warningText", "infoText", "accentText", "primary"]) {
    assert.ok(contraste(C[cle], C.fondCarte) >= 4.5, `${cle} sur fondCarte : ${contraste(C[cle], C.fondCarte).toFixed(2)}`);
  }
  assert.ok(contraste(C.bordureCarte, C.fondCarte) >= 3, "bordure sur fondCarte");
  assert.ok(contraste(C.bordureCarte, C.bgMain) >= 3, "bordure sur le fond de page");
});
