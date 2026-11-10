import React from "react";
import { BORDURE_CARTE, C, euroCentimes } from "../../theme";
import Input from "../form/Input.jsx";

// Récapitulatif d'une facture ou d'un devis : remise globale et totaux (voir calculerRecap).
export default function RecapitulatifDocument({ remise, onRemise, erreurRemise, recap }) {
  return (
      <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Récapitulatif</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Input
              label="Remise globale (€)"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={remise}
              onChange={(e) => onRemise(e.target.value)}
              error={erreurRemise}
              hint="Appliquée sur le total HT, répartie entre les taux de TVA"
            />
          </div>
          <dl className="space-y-2 text-sm">
            {recap.remise > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>Total HT brut</dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.htBrut)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>
                    Remise globale
                    {recap.plafonnee && <span className="block text-xs">Remise limitée au total HT</span>}
                  </dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>− {euroCentimes(recap.remise)}</dd>
                </div>
              </>
            )}
            <div className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>{recap.remise > 0 ? "Total HT net" : "Total HT"}</dt>
              <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.ht)}</dd>
            </div>
            {recap.tvaDetail.length === 0 ? (
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>TVA</dt>
                <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euroCentimes(0)}</dd>
              </div>
            ) : (
              recap.tvaDetail.map((d) => (
                <div key={d.taux} className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>
                    TVA {String(d.taux).replace(".", ",")} % <span style={{ color: C.textSecondary }}>(base {euroCentimes(d.base)})</span>
                  </dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(d.tva)}</dd>
                </div>
              ))
            )}
            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
              <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.ttc)}</dd>
            </div>
          </dl>
        </div>
      </div>
  );
}
