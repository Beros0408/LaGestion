import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Trash2, Boxes } from "lucide-react";
import { C, alpha, euroCentimes } from "../../theme";
import { TAUX_TVA } from "../../data/factures";
import { ligneHT } from "../../utils/facture";
import { LIGNE_VIDE, idChampLigne, ligneRemplie } from "../../utils/lignesDocument";
import Input from "../form/Input.jsx";
import Select from "../form/Select.jsx";
import ChoixCatalogue from "../ChoixCatalogue.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";

const TAUX_OPTIONS = TAUX_TVA.map((t) => ({
  value: String(t),
  label: `${String(t).replace(".", ",")} %`,
}));

// Lignes d'une facture ou d'un devis : saisie, choix dans le catalogue, remplacement confirmé.
// Le formulaire parent détient l'état (form.lignes, errors.lignes, errors.ligneItems).
// Fenêtres rendues hors du <form> : Entrée dans la recherche du catalogue ne doit pas le soumettre.
export default function LignesDocument({ lignes, errors, setForm, setErrors }) {
  // Choix dans le catalogue : ligne visée et bouton d'origine (retour du focus)
  const [choixLigne, setChoixLigne] = useState(null);
  const [remplacement, setRemplacement] = useState(null);

  const majLigne = (i, cle, valeur) => {
    setForm((prev) => ({
      ...prev,
      lignes: prev.lignes.map((l, idx) => (idx === i ? { ...l, [cle]: valeur } : l)),
    }));
    setErrors((prev) => {
      if (!prev.ligneItems?.[i]?.[cle] && !prev.lignes) return prev;
      const next = { ...prev };
      if (next.lignes) delete next.lignes;
      if (next.ligneItems?.[i]?.[cle]) {
        next.ligneItems = next.ligneItems.map((e, idx) => {
          if (idx !== i) return e;
          const { [cle]: _omit, ...reste } = e;
          return reste;
        });
      }
      return next;
    });
  };

  // Pré-remplit la ligne ; quantité et remise de ligne restent inchangées, tout reste modifiable.
  const appliquerProduit = (i, p) => {
    setForm((prev) => ({
      ...prev,
      lignes: prev.lignes.map((l, idx) =>
        idx === i
          ? {
              ...l,
              description: p.nom,
              reference: p.reference ?? "",
              unite: p.unite ?? "",
              prix_unitaire: String(p.prix_unitaire_ht),
              taux_tva: String(p.taux_tva),
              produit_id: p.id,
            }
          : l
      ),
    }));
    setErrors((prev) => {
      if (!prev.ligneItems?.[i]?.prix_unitaire && !prev.ligneItems?.[i]?.description) return prev;
      return {
        ...prev,
        ligneItems: prev.ligneItems.map((e, idx) => (idx === i ? { ...e, prix_unitaire: undefined, description: undefined } : e)),
      };
    });
  };

  const choisirProduit = (p) => {
    const { index, element } = choixLigne;
    setChoixLigne(null);
    if (ligneRemplie(lignes[index])) setRemplacement({ index, produit: p, element });
    else appliquerProduit(index, p);
  };

  const ajouterLigne = () => {
    setForm((prev) => ({ ...prev, lignes: [...prev.lignes, { ...LIGNE_VIDE }] }));
  };

  const supprimerLigne = (i) => {
    setForm((prev) => ({ ...prev, lignes: prev.lignes.filter((_, idx) => idx !== i) }));
  };

  return (
    <>
        <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Lignes d'articles</h3>
            <button
              type="button"
              onClick={ajouterLigne}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
            >
              <Plus size={14} aria-hidden="true" />
              Ajouter une ligne
            </button>
          </div>
      
          {errors.lignes && (
            <p role="alert" className="mb-3 text-xs font-medium" style={{ color: C.errorText }}>
              {errors.lignes}
            </p>
          )}
      
          <div className="space-y-3">
            {lignes.map((l, i) => {
              const erreursLigne = errors.ligneItems?.[i] ?? {};
              const ligneCalc = {
                quantite: Number(l.quantite) || 0,
                prix_unitaire: Number(l.prix_unitaire) || 0,
                taux_tva: Number(l.taux_tva) || 0,
                remise: Number(l.remise) || 0,
              };
              const ht = ligneHT(ligneCalc);
              return (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 rounded-xl p-3"
                  style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
                >
                  <div className="col-span-12 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs" style={{ color: C.textSecondary }}>
                      {l.produit_id ? "Article du catalogue (valeurs modifiables)" : "Saisie libre"}
                    </p>
                    <button
                      type="button"
                      onClick={(e) => setChoixLigne({ index: i, element: e.currentTarget })}
                      aria-label={`Choisir dans le catalogue pour la ligne ${i + 1}`}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
                      style={{ color: C.primary, border: `1px solid ${C.borderInput}` }}
                    >
                      <Boxes size={14} aria-hidden="true" />
                      Choisir dans le catalogue
                    </button>
                  </div>
                  <div className="col-span-12 md:col-span-8">
                    <Input
                      id={idChampLigne(i, "description")}
                      label={`Description ligne ${i + 1}`}
                      required
                      value={l.description}
                      onChange={(e) => majLigne(i, "description", e.target.value)}
                      placeholder="Prestation, produit…"
                      error={erreursLigne.description}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input
                      label="Référence"
                      value={l.reference}
                      onChange={(e) => majLigne(i, "reference", e.target.value)}
                      placeholder="SKU"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input
                      label="Unité"
                      value={l.unite}
                      onChange={(e) => majLigne(i, "unite", e.target.value)}
                      placeholder="h, j, kg…"
                    />
                  </div>
      
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      id={idChampLigne(i, "quantite")}
                      label="Quantité"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.quantite}
                      onChange={(e) => majLigne(i, "quantite", e.target.value)}
                      error={erreursLigne.quantite}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      id={idChampLigne(i, "prix_unitaire")}
                      label="Prix U. HT (€)"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.prix_unitaire}
                      onChange={(e) => majLigne(i, "prix_unitaire", e.target.value)}
                      error={erreursLigne.prix_unitaire}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      id={idChampLigne(i, "remise")}
                      label="Remise (€)"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.remise}
                      onChange={(e) => majLigne(i, "remise", e.target.value)}
                      error={erreursLigne.remise}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Select
                      label="TVA"
                      value={l.taux_tva}
                      onChange={(e) => majLigne(i, "taux_tva", e.target.value)}
                      options={TAUX_OPTIONS}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3 flex flex-col justify-end pb-1">
                    <p className="text-[11px]" style={{ color: C.textSecondary }}>Total ligne</p>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                      {euroCentimes(ht)}<span className="text-xs font-normal" style={{ color: C.textSecondary }}> HT</span>
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => supprimerLigne(i)}
                      aria-label={`Supprimer la ligne ${i + 1}`}
                      title="Supprimer la ligne"
                      disabled={lignes.length === 1}
                      className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: C.error }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      {createPortal(
        <>
          <ChoixCatalogue
            ouvert={Boolean(choixLigne)}
            onChoisir={choisirProduit}
            onFermer={() => setChoixLigne(null)}
            elementRetour={choixLigne?.element}
          />
          <ConfirmDialog
            ouvert={Boolean(remplacement)}
            titre="Remplacer le contenu de cette ligne ?"
            message={remplacement ? `La description, la référence, l'unité, le prix HT et la TVA seront remplacés par ceux de « ${remplacement.produit.nom} ».` : ""}
            libelleAnnuler="Annuler"
            libelleConfirmer="Remplacer"
            onAnnuler={() => setRemplacement(null)}
            onConfirmer={() => {
              appliquerProduit(remplacement.index, remplacement.produit);
              setRemplacement(null);
            }}
            elementRetour={remplacement?.element}
          />
        </>,
        document.body
      )}
    </>
  );
}
