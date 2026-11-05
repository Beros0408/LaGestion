// Lignes et récapitulatif communs aux factures et aux devis.
import { totalHTBrut, remiseGlobale, totalHT, tvaParTaux, totalTVA, totalTTC } from "./facture.js";

export const MESSAGE_REMISE_PLAFOND = "La remise globale ne peut pas dépasser le total HT des lignes.";

export const LIGNE_VIDE = {
  description: "",
  reference: "",
  unite: "",
  quantite: "1",
  prix_unitaire: "",
  taux_tva: "20",
  remise: "0",
  produit_id: null,
};

// Ligne « remplie » : le choix d'un article demande confirmation avant d'écraser son contenu.
export const ligneRemplie = (l) =>
  l.description.trim() !== "" || (l.prix_unitaire !== "" && Number(l.prix_unitaire) !== 0);

// Ligne enregistrée → valeurs de formulaire (chaînes).
export function ligneVersFormulaire(l) {
  return {
    description: l.description ?? "",
    reference: l.reference ?? "",
    unite: l.unite ?? "",
    quantite: l.quantite != null ? String(l.quantite) : "",
    prix_unitaire: l.prix_unitaire != null ? String(l.prix_unitaire) : "",
    taux_tva: l.taux_tva != null ? String(l.taux_tva) : "20",
    remise: l.remise != null ? String(l.remise) : "0",
    produit_id: l.produit_id ?? null,
  };
}

// Valeurs de formulaire → ligne à enregistrer.
export function ligneDepuisFormulaire(l) {
  return {
    description: l.description.trim(),
    reference: l.reference,
    unite: l.unite,
    quantite: Number(l.quantite),
    prix_unitaire: Number(l.prix_unitaire),
    taux_tva: Number(l.taux_tva),
    remise: Number(l.remise) || 0,
    produit_id: l.produit_id || null,
  };
}

// Erreurs de saisie des lignes : { lignes } ou { ligneItems }, vide si tout est valide.
export function validerLignes(lignes) {
  if (lignes.length === 0) return { lignes: "Ajoutez au moins une ligne." };
  const ligneItems = lignes.map((l) => {
    const e = {};
    const q = Number(l.quantite);
    const p = Number(l.prix_unitaire);
    const r = Number(l.remise);
    if (l.quantite === "" || Number.isNaN(q) || q <= 0) e.quantite = "Quantité positive.";
    if (l.prix_unitaire === "" || Number.isNaN(p) || p <= 0) e.prix_unitaire = "Prix positif.";
    if (l.remise !== "" && (Number.isNaN(r) || r < 0)) e.remise = "Remise ≥ 0.";
    return e;
  });
  return ligneItems.some((e) => Object.keys(e).length > 0) ? { ligneItems } : {};
}

// Totaux à partir des valeurs saisies (règle unique : calculerTotaux).
export function calculerRecap(remise, lignes) {
  const doc = {
    remise: Number(remise) || 0,
    lignes: lignes.map((l) => ({
      quantite: Number(l.quantite) || 0,
      prix_unitaire: Number(l.prix_unitaire) || 0,
      taux_tva: Number(l.taux_tva) || 0,
      remise: Number(l.remise) || 0,
    })),
  };
  return {
    htBrut: totalHTBrut(doc),
    remise: remiseGlobale(doc),
    ht: totalHT(doc),
    tvaDetail: tvaParTaux(doc),
    tva: totalTVA(doc),
    ttc: totalTTC(doc),
    plafonnee: Math.round(doc.remise * 100) > Math.round(totalHTBrut(doc) * 100),
  };
}

const CHAMPS_LIGNE = ["description", "reference", "unite", "quantite", "prix_unitaire", "taux_tva", "remise", "produit_id"];
const CHAMPS_TEXTE_LIGNE = new Set(["description", "reference", "unite"]);

// Lignes prêtes pour l'insertion en base ; cleParent : « facture_id » ou « devis_id ».
export function preparerLignes(lignes, cleParent, parentId, entrepriseId) {
  return lignes.map((l, i) => {
    const ligne = { entreprise_id: entrepriseId, [cleParent]: parentId, position: i };
    CHAMPS_LIGNE.forEach((cle) => {
      const v = l?.[cle];
      if (CHAMPS_TEXTE_LIGNE.has(cle)) {
        if (cle === "description") {
          ligne[cle] = typeof v === "string" ? v.trim() : (v ?? "");
        } else {
          const t = typeof v === "string" ? v.trim() : v;
          ligne[cle] = t ? t : null;
        }
      } else if (cle === "quantite") {
        const n = Number(v);
        ligne[cle] = Number.isFinite(n) && n > 0 ? n : 1;
      } else if (cle === "produit_id") {
        ligne[cle] = v || null;
      } else {
        ligne[cle] = Number(v) || 0;
      }
    });
    return ligne;
  });
}
