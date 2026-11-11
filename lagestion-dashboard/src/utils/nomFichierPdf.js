// Nom du PDF d'un brouillon : BROUILLON-{TYPE}-{client}-{AAAA-MM-JJ}.pdf, date du jour du téléchargement (heure locale).
// Client : accents retirés, tout autre caractère que lettre ou chiffre remplacé par un tiret, 40 caractères au plus.
// Aucun caractère interdit sous Windows (< > : " / \ | ? * et caractères de contrôle) ; le préfixe exclut les noms réservés.
// Un document émis garde {numero}.pdf.
const TYPES = { facture: "FACTURE", acompte: "ACOMPTE", solde: "SOLDE", avoir: "AVOIR" };

export function nomFichierBrouillon(type, nomClient, date = new Date()) {
  const client = (nomClient ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  const jour = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return ["BROUILLON", TYPES[type] ?? "FACTURE", client, jour].filter(Boolean).join("-") + ".pdf";
}
