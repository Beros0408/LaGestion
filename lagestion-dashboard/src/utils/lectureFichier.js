// Lecture d'un fichier d'import (CSV, XLSX, XLS, ODS) → lignes de valeurs brutes. S'exécute dans le Web Worker
// lectureFichier.worker.js : un fichier piégé reste isolé du reste de l'application et peut être interrompu.
import * as XLSX from "xlsx";
import { LIMITE_LIGNES, lireCsv } from "./import.js";

export class ErreurLecture extends Error {}

const EXTENSIONS_CLASSEUR = ["xlsx", "xls", "ods"];
const EXTENSIONS_TEXTE = ["csv", "txt"];

function jjmmaaaa({ d, m, y }) {
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

// Valeur d'une cellule : texte, nombre, date au format jj/mm/aaaa, pourcentage « 20 % ».
function valeurCellule(cell) {
  if (!cell) return null;
  switch (cell.t) {
    case "s": return cell.v;
    case "b": return cell.v ? "VRAI" : "FAUX";
    case "e": return cell.w ?? "#ERREUR";
    case "d": return jjmmaaaa({ d: cell.v.getDate(), m: cell.v.getMonth() + 1, y: cell.v.getFullYear() });
    case "n": {
      if (cell.z && XLSX.SSF.is_date(cell.z)) {
        const p = XLSX.SSF.parse_date_code(cell.v);
        if (p) return jjmmaaaa(p);
      }
      if (cell.z && String(cell.z).includes("%")) return `${Math.round(cell.v * 1e6) / 1e4} %`;
      return cell.v;
    }
    default: return cell.v ?? null;
  }
}

function verifierLignes(lignes) {
  const remplies = lignes.filter((l) => (l ?? []).some((v) => v !== null && v !== undefined && String(v).trim() !== "")).length;
  if (remplies > LIMITE_LIGNES + 1) {
    throw new ErreurLecture(
      `Le fichier contient ${remplies.toLocaleString("fr-FR")} lignes remplies : au plus ${LIMITE_LIGNES.toLocaleString("fr-FR")} lignes par import. Découpez-le en plusieurs fichiers.`
    );
  }
}

// Feuille → lignes (seules les cellules présentes sont parcourues) et fusions.
function lireFeuille(ws) {
  const lignes = [];
  let colMin = Infinity;
  let ligneMin = Infinity;
  for (const ref of Object.keys(ws)) {
    if (ref[0] === "!") continue;
    const { r, c } = XLSX.utils.decode_cell(ref);
    const v = valeurCellule(ws[ref]);
    if (v === null || v === undefined || v === "") continue;
    if (!lignes[r]) lignes[r] = [];
    lignes[r][c] = v;
    colMin = Math.min(colMin, c);
    ligneMin = Math.min(ligneMin, r);
  }
  if (colMin === Infinity) return { lignes: [], fusions: [], ligneDebut: 0, colonneDebut: 0 };
  // Décalage : la première ligne et la première colonne remplies deviennent l'origine.
  const sortie = [];
  for (let r = ligneMin; r < lignes.length; r++) {
    const l = lignes[r] ?? [];
    sortie.push(Array.from({ length: Math.max(0, l.length - colMin) }, (_, c) => l[c + colMin] ?? null));
  }
  const fusions = (ws["!merges"] ?? []).map((f) => ({
    s: { r: f.s.r - ligneMin, c: f.s.c - colMin },
    e: { r: f.e.r - ligneMin, c: f.e.c - colMin },
  })).filter((f) => f.e.r >= 0 && f.e.c >= 0);
  return { lignes: sortie, fusions, ligneDebut: ligneMin, colonneDebut: colMin };
}

// octets : ArrayBuffer ; nom : nom du fichier (extension) ; feuille : nom de la feuille voulue (sinon la première remplie).
export function lireFichier(octets, nom, feuille = null) {
  const ext = String(nom).split(".").pop().toLowerCase();
  if (EXTENSIONS_TEXTE.includes(ext)) {
    const r = lireCsv(new Uint8Array(octets));
    verifierLignes(r.lignes);
    return r;
  }
  if (!EXTENSIONS_CLASSEUR.includes(ext)) {
    throw new ErreurLecture("Format non pris en charge : choisissez un fichier .csv, .xlsx, .xls ou .ods.");
  }
  let wb;
  try {
    wb = XLSX.read(new Uint8Array(octets), { type: "array", cellDates: false, cellNF: true, cellHTML: false, cellFormula: false });
  } catch {
    throw new ErreurLecture("Fichier illisible : vérifiez qu'il s'agit bien d'un classeur Excel ou d'un CSV, non protégé par un mot de passe.");
  }
  const feuilles = wb.SheetNames;
  const lues = new Map();
  const lire = (n) => { if (!lues.has(n)) lues.set(n, lireFeuille(wb.Sheets[n])); return lues.get(n); };
  const choisie = feuille && feuilles.includes(feuille) ? feuille : feuilles.find((n) => lire(n).lignes.length > 0) ?? feuilles[0];
  const contenu = lire(choisie);
  verifierLignes(contenu.lignes);
  return { format: ext.toUpperCase(), encodage: null, separateur: null, feuilles, feuille: choisie, ...contenu };
}
