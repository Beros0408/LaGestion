import * as XLSX from "xlsx";
import { resteAPayer, statutCalcule, totalAvoirs, totalHT, totalPaye, totalTVA, totalTTC } from "./facture.js";
import { LIBELLE_STATUT, LIBELLE_TYPE } from "../data/factures.js";
import { neutraliserFormule } from "./import.js";

// Texte commençant par =, +, -, @, tabulation ou retour chariot : apostrophe en tête (injection de formules).
const neutraliserLignes = (lignes) => lignes.map((l) => l.map(neutraliserFormule));

const TYPE_LABEL = {
  particulier: "Particulier",
  entreprise: "Entreprise",
};

const FMT_DATE = "dd/mm/yyyy";
const FMT_EURO = '#,##0.00" €"';

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function appliquerFormat(ws, cols, r, type, z) {
  cols.forEach((c) => {
    const ref = XLSX.utils.encode_cell({ c, r });
    const cell = ws[ref];
    if (!cell) return;
    if (type) cell.t = type;
    if (z) cell.z = z;
  });
}

export function exporterClientsExcel(clients) {
  const headers = ["Nom", "Type", "E-mail", "Téléphone", "Adresse", "Statut", "Tags", "Score"];
  const rows = clients.map((c) => [
    c.nom ?? "",
    TYPE_LABEL[c.type] ?? c.type ?? "",
    c.email ?? "",
    c.telephone ?? "",
    c.adresse ?? "",
    c.statut ?? "",
    Array.isArray(c.tags) ? c.tags.join(", ") : "",
    typeof c.score === "number" ? c.score : null,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(neutraliserLignes([headers, ...rows]));
  ws["!cols"] = [
    { wch: 30 },
    { wch: 12 },
    { wch: 30 },
    { wch: 18 },
    { wch: 32 },
    { wch: 12 },
    { wch: 24 },
    { wch: 8 },
  ];

  for (let r = 1; r <= rows.length; r++) {
    appliquerFormat(ws, [7], r, "n", "0");
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  XLSX.writeFile(wb, "clients.xlsx");
}

export function exporterFacturesExcel(factures, clients) {
  const clientsParId = new Map();
  clients.forEach((c) => clientsParId.set(c.id, c));

  const headers = [
    "Numéro",
    "Type",
    "Facture d'origine",
    "Client",
    "Date d'émission",
    "Date d'échéance",
    "Statut",
    "Total HT",
    "Total TVA",
    "Total TTC",
    "Avoirs",
    "Encaissé net",
    "Reste à payer",
  ];
  const rows = factures.map((f) => [
    f.numero ?? "",
    LIBELLE_TYPE[f.type] ?? "Facture",
    f.origine_numero ?? "",
    clientsParId.get(f.client_id)?.nom ?? "",
    parseDate(f.date_emission),
    parseDate(f.date_echeance),
    LIBELLE_STATUT[statutCalcule(f)] ?? f.statut ?? "",
    totalHT(f),
    totalTVA(f),
    totalTTC(f),
    totalAvoirs(f),
    totalPaye(f),
    resteAPayer(f),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(neutraliserLignes([headers, ...rows]), { cellDates: true });
  ws["!cols"] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 30 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
  ];

  for (let r = 1; r <= rows.length; r++) {
    appliquerFormat(ws, [4, 5], r, "d", FMT_DATE);
    appliquerFormat(ws, [7, 8, 9, 10, 11, 12], r, "n", FMT_EURO);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Factures");
  XLSX.writeFile(wb, "factures.xlsx");
}

// Fichier d'erreurs d'un import : lignes déjà préparées par lignesFichierErreurs (utils/import.js).
export function exporterErreursImport(lignes, nomFichier) {
  const ws = XLSX.utils.aoa_to_sheet(neutraliserLignes(lignes));
  ws["!cols"] = lignes[0].map((_, i) => ({ wch: i === 0 ? 8 : i === lignes[0].length - 1 ? 60 : 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Erreurs");
  XLSX.writeFile(wb, nomFichier);
}
