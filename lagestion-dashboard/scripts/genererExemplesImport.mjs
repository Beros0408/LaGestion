// Génère les fichiers d'exemple de l'import (docs/exemples-import/).
//   node scripts/genererExemplesImport.mjs              → fichiers d'exemple
//   node scripts/genererExemplesImport.mjs --mille F    → F : 1 000 clients fictifs (CSV UTF-8, « ; »), pour le test de charge
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

XLSX.set_fs(fs);
const DOSSIER = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "docs", "exemples-import");

const csv = (lignes, sep) =>
  lignes.map((l) => l.map((v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /["\n\r]/.test(s) || s.includes(sep) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(sep)).join("\r\n") + "\r\n";

// 1 000 clients fictifs, sans doublon entre eux ni avec la démo (domaine .example).
export function milleClients(n = 1000) {
  const secteurs = ["BTP", "Commerce", "Conseil", "Santé", "Industrie", "Transport", "Restauration"];
  const lignes = [["Nom", "Type", "E-mail", "Téléphone", "Adresse", "Secteur", "Statut", "Tags"]];
  for (let i = 1; i <= n; i++) {
    const num = String(i).padStart(4, "0");
    lignes.push([
      `Client essai ${num}`, i % 5 === 0 ? "Particulier" : "Entreprise", `essai${num}@charge.example`,
      `01 ${String(10 + (i % 90)).padStart(2, "0")} ${num.slice(0, 2)} ${num.slice(2)} 00`,
      `${i} rue de l'Essai, 75011 Paris`, secteurs[i % secteurs.length], i % 3 === 0 ? "Actif" : "Prospect", "import, charge",
    ]);
  }
  return csv(lignes, ";");
}

function propre() {
  const lignes = [
    ["Nom", "Type", "E-mail", "Téléphone", "Adresse", "Secteur", "Statut", "Tags", "SIREN", "Date de naissance", "Informations internes"],
    ["Atelier Bois & Design", "Entreprise", "contact@bois-design.example", "02 41 55 10 20", "3 rue des Ébénistes, 49000 Angers", "BTP", "Actif", "artisan, fidèle", "443061841", "", "Paiement à 30 jours"],
    ["Café de la Gare", "Entreprise", "bonjour@cafe-gare.example", "03 26 47 12 98", "1 place de la Gare, 51100 Reims", "Restauration", "Prospect", "salon 2026", "", "", ""],
    ["Soins Infirmiers Rivière", "Entreprise", "cabinet@infirmier-riviere.example", "04 73 90 11 42", "22 avenue des Thermes, 63000 Clermont-Ferrand", "Santé", "Actif", "", "", "", ""],
    ["Martel Ressources Humaines", "Entreprise", "contact@rh-martel.example", "01 53 20 44 87", "18 rue La Boétie, 75008 Paris", "Conseil", "Actif", "rh", "", "", "Rappeler en septembre"],
    ["Épicerie fine Laurent", "Entreprise", "epicerie@fine-laurent.example", "05 61 22 98 31", "9 rue d'Alsace-Lorraine, 31000 Toulouse", "Commerce", "Prospect", "", "", "", ""],
    ["Fonderie du Rhône", "Entreprise", "commercial@fonderie-rhone.example", "04 72 18 55 60", "ZI Sud, 69200 Vénissieux", "Industrie", "Actif", "industrie", "", "", ""],
    ["Gîtes de la Vallée", "Entreprise", "reservation@gites-vallee.example", "04 75 30 12 45", "Le Village, 07200 Aubenas", "Hôtellerie", "Prospect", "", "", "", ""],
    ["Perrin Immobilier", "Entreprise", "agence@immo-perrin.example", "02 97 40 66 18", "5 rue du Port, 56100 Lorient", "Immobilier", "Actif", "", "", "", ""],
    ["Jardins & Paysages Roux", "Entreprise", "devis@paysages-roux.example", "04 94 20 31 77", "Chemin des Oliviers, 83000 Toulon", "BTP", "Actif", "saisonnier", "", "", ""],
    ["Kiné Sport Bertin", "Entreprise", "accueil@kine-bertin.example", "03 81 50 22 64", "14 rue de Belfort, 25000 Besançon", "Santé", "Prospect", "", "", "", ""],
    ["Logistique Ouest Express", "Entreprise", "exploitation@ouest-express.example", "02 51 82 47 30", "Parc d'activités, 85000 La Roche-sur-Yon", "Transport", "Actif", "", "", "", ""],
    ["Maison Vidal Traiteur", "Entreprise", "commandes@vidal-traiteur.example", "04 68 35 12 09", "7 rue Mailly, 66000 Perpignan", "Restauration", "Inactif", "", "", "", "Ne plus démarcher"],
    ["Optique Mercier", "Entreprise", "magasin@optique-mercier.example", "03 87 75 41 23", "30 rue Serpenoise, 57000 Metz", "Commerce", "Actif", "", "", "", ""],
    ["Pressing Étoile", "Entreprise", "pressing@etoile.example", "01 47 63 20 18", "12 avenue de Wagram, 75017 Paris", "Autre", "Prospect", "", "", "", ""],
    ["Studio Graphique Noé", "Entreprise", "hello@studio-noe.example", "05 49 41 30 72", "2 rue Carnot, 86000 Poitiers", "Conseil", "Actif", "créatif", "", "", ""],
    ["Amélie Faure", "Particulier", "amelie.faure@mail.example", "06 12 45 78 90", "4 allée des Pins, 40100 Dax", "", "Prospect", "", "", "14/02/1986", ""],
    ["Hugo Lambert", "Particulier", "hugo.lambert@mail.example", "06 98 76 54 32", "27 rue Nationale, 59800 Lille", "", "Actif", "", "", "03/09/1979", "Chantier salle de bains"],
    ["Inès Moreau", "Particulier", "ines.moreau@mail.example", "07 61 23 45 67", "8 place Kléber, 67000 Strasbourg", "", "Prospect", "", "", "21/11/1992", ""],
    ["Julien Roche", "Particulier", "julien.roche@mail.example", "06 33 21 45 98", "15 cours Mirabeau, 13100 Aix-en-Provence", "", "Actif", "", "", "30/06/1970", ""],
    ["Nadia Benali", "Particulier", "nadia.benali@mail.example", "07 45 12 36 89", "3 rue Sainte-Catherine, 33000 Bordeaux", "", "Prospect", "", "", "07/04/1988", ""],
  ];
  fs.writeFileSync(path.join(DOSSIER, "clients_propre.csv"), "﻿" + csv(lignes, ";"), "utf8");
}

// Séparateur « , », champs entre guillemets, accents en Windows-1252 (latin1 suffit pour ces caractères).
function windows1252() {
  const lignes = [
    ["Société", "Mail", "Tél", "Adresse", "CP", "Ville", "Statut"],
    ["Brasserie Le Général", "contact@brasserie-general.example", "03 20 57 41 88", "12, rue Esquermoise", "59000", "Lille", "Prospect"],
    ["Crèche Petits Écureuils", "direction@ecureuils.example", "02 99 31 45 70", "5, allée Émile-Zola", "35000", "Rennes", "Actif"],
    ["Élagage Forêt Verte", "elagage@foret-bois.example", "05 55 34 12 76", "Lieu-dit « La Côte »", "87000", "Limoges", "Actif"],
    ["Garçon Coiffure", "salon@garcon-coiffure.example", "04 91 33 20 14", "18, rue Paradis", "13001", "Marseille", "Prospect"],
    ["Château d'Ô Réceptions", "reception@chateau-o.example", "04 67 52 18 30", "Route de Mende", "34000", "Montpellier", "Prospect"],
  ];
  fs.writeFileSync(path.join(DOSSIER, "clients_windows1252.csv"), Buffer.from(csv(lignes, ","), "latin1"));
}

// Classeur « sale » : titre, ligne de groupes fusionnés, lignes vides, secteur fusionné sur 3 lignes, total en bas,
// erreurs (SIREN à 8 chiffres, e-mail invalide, statut inconnu avec une formule dans les remarques), doublons.
// Attendu sur 14 lignes de données : 5 à créer, 3 doublons ignorés, 2 vides, 1 total, 3 erreurs.
function sale() {
  const aoa = [
    ["Export CRM — Liste des clients 2026"],
    ["Édité le 03/11/2026 par le service commercial"],
    [],
    ["Identité", null, null, "Coordonnées", null, null, null, null, "Suivi", null, null],
    ["Raison sociale", "Type", "N° SIREN", "E-mail", "Tél.", "Adresse", "Code postal", "Ville", "Secteur d'activité", "Statut", "Remarques"],
    ["Plomberie Martin & Fils", "Entreprise", "532145678", "contact@plomberie-martin.example", 388123456, "4 rue des Artisans", 67000, "Strasbourg", "Plomberie", "Client", "Contrat annuel"],
    ["Céramiques Dubois", "Société", null, "atelier@ceramique-dubois.example", "04 72 11 22 33", "10 quai Saint-Vincent", 69001, "Lyon", "Commerce", "Prospect", null],
    [],
    ["Cabinet Roussel Avocats", "Entreprise", 12345678, "cabinet@roussel-avocats.example", "01 42 60 11 22", "8 rue de Castiglione", 75001, "Paris", "Conseil", "Actif", null],
    ["Expertise Comptable Viala", "Entreprise", null, "contact@viala-expertise.example", "05 61 21 33 44", "2 rue d'Alsace", 31000, "Toulouse", null, "Actif", null],
    ["Pixelia Création Web", "Entreprise", null, "bonjour@pixelia.example", "04 93 80 70 60", "11 avenue Jean-Médecin", 6000, "Nice", null, "Prospect", null],
    ["Garage Lefèvre", "Entreprise", null, "garage.lefevre@", "02 35 71 20 30", "ZA du Mont", 76000, "Rouen", "Transport", "Actif", null],
    ["Bâtiments Rénov'Est", "Entreprise", null, "contact@renov-est.example", "03 88 41 27 99", "12 rue du Faubourg", 67000, "Strasbourg", "BTP", "Actif", "Nouveau contact : M. Weber"],
    ["Hôtel Remparts Plage", "Entreprise", null, "plage@remparts-plage.example", "02 99 56 00 11", "1 digue de la Plage", 35800, "Dinard", "Hôtellerie", "Prospect", null],
    ["Plomberie Martin et Fils", "Entreprise", null, "contact@plomberie-martin.example", "03 88 12 34 56", null, null, "Strasbourg", "BTP", "Actif", "Saisi deux fois"],
    ["Claire Bonnet", "Particulier", null, "claire.b@autre.example", "06 21 48 73 05", "18 rue des Lilas", 31000, "Toulouse", null, "Actif", null],
    ["Société Fantôme", "Entreprise", null, "fantome@exemple.example", "01 00 00 00 00", null, null, null, "Autre", "VIP", "=1+1"],
    [],
    ["Total", null, null, null, null, null, null, null, null, null, "11 clients"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    XLSX.utils.decode_range("A1:K1"),
    XLSX.utils.decode_range("A4:C4"),
    XLSX.utils.decode_range("D4:H4"),
    XLSX.utils.decode_range("I4:K4"),
    XLSX.utils.decode_range("I9:I11"),
  ];
  ws["!cols"] = [30, 12, 12, 34, 16, 26, 12, 14, 20, 10, 26].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Clients");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Notes internes, à ne pas importer"]]), "Notes");
  XLSX.writeFile(wb, path.join(DOSSIER, "clients_sale.xlsx"));
}

// Exécuté directement seulement (les tests importent milleClients sans rien écrire).
const direct = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(DOSSIER, "..", "..", "scripts", "genererExemplesImport.mjs");
const i = process.argv.indexOf("--mille");
if (direct && i > 0) {
  fs.writeFileSync(process.argv[i + 1], milleClients(), "utf8");
  console.log(`1 000 clients écrits dans ${process.argv[i + 1]}`);
} else if (direct) {
  fs.mkdirSync(DOSSIER, { recursive: true });
  propre();
  windows1252();
  sale();
  console.log(`Exemples écrits dans ${DOSSIER}`);
}
