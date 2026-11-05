import { C } from "../../theme";
import { SECTEUR_NON_RENSEIGNE, SECTEUR_AUTRES } from "../../data/secteurs";

// Couleurs partagées entre graphiques et légendes (graphiques chargés en différé).
// Secteurs : 6 nommés au plus (dashboard.js), puis « Autres secteurs » et « Non renseigné » : aucune couleur répétée.
const PALETTE_SECTEURS = [C.chart1, C.chart2, C.chart3, C.chart4, C.chart5, C.chart6];
export const couleurSecteur = (nom, i) => {
  if (nom === SECTEUR_NON_RENSEIGNE) return C.chart8;
  if (nom === SECTEUR_AUTRES) return C.chart7;
  return PALETTE_SECTEURS[i];
};

// Entonnoir, du bleu au vert : Qualification → Conclusion.
export const COULEURS_ETAPES = [C.chart1, C.chart4, C.chart2, C.chart5];

// Âge des créances, du plus récent au plus ancien.
export const COULEURS_AGES = [C.chart4, C.chart3, C.chart7, C.chart6];
