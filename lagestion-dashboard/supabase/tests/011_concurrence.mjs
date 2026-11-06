// 011_concurrence.mjs — Lagestion
// Encaissements et relances réellement simultanés (sessions psql séparées), impossible à vérifier dans le SQL Editor.
// Attendu : encaissé jamais au-delà de TTC − avoirs, plafond tenu face à un avoir, niveaux de relance sans saut.
//
// Usage : node supabase/tests/011_concurrence.mjs
// Connexion : variables d'environnement de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), rôle postgres.
// À réserver à une base de test : crée une entreprise temporaire (préfixe a0118…), supprimée à la fin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const E = "a0118000-0000-4000-8000-0000000000e1";
const C = "a0118000-0000-4000-8000-0000000000c1";
const ADMIN = "a0118000-0000-4000-8000-000000000001";
const fid = (i) => `a0118f00-0000-4000-8000-${String(i).padStart(12, "0")}`;
const dossier = mkdtempSync(path.join(tmpdir(), "lagestion-011-"));
const env = { ...process.env, PGCLIENTENCODING: "UTF8" };
const AUTH = `select set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', false);\nset role authenticated;`;

function psql(sql, nom = "script") {
  const fichier = path.join(dossier, `${nom}.sql`);
  writeFileSync(fichier, sql);
  return new Promise((resolve) => {
    const p = spawn("psql", ["-q", "-At", "-f", fichier], { env });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    p.on("close", (code) => resolve({ code, sortie }));
  });
}

const nettoyage = `
  delete from public.audit_events where entreprise_id = '${E}';
  delete from public.factures where entreprise_id = '${E}' and type = 'avoir';
  delete from public.factures where entreprise_id = '${E}';
  delete from public.clients where entreprise_id = '${E}';
  delete from public.memberships where entreprise_id = '${E}';
  delete from public.entreprises where id = '${E}';
  delete from auth.users where id = '${ADMIN}';
`;

const creer = (i) => `insert into public.factures (id, entreprise_id, client_id, date_echeance) values ('${fid(i)}', '${E}', '${C}', public.date_du_jour_paris() + 30);
insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values ('${E}', '${fid(i)}', 'Ligne', 100, 20);
select public.finaliser_facture('${fid(i)}');`;

const preparation = `
\\set ON_ERROR_STOP on
${nettoyage}
insert into auth.users (id, email, aud, role) values ('${ADMIN}', 'concurrence-011@lagestion.invalid', 'authenticated', 'authenticated');
insert into public.entreprises (id, nom, siret, adresse) values ('${E}', 'Concurrence 011', '11111111100011', '1 rue du Test');
insert into public.memberships (entreprise_id, user_id, role) values ('${E}', '${ADMIN}', 'admin');
insert into public.clients (id, entreprise_id, nom) values ('${C}', '${E}', 'Client');
${AUTH}
${[1, 2, 3, 4, 5].map(creer).join("\n")}
select public.finaliser_facture(public.creer_avoir('${fid(2)}', 'Préparation', false, '[{"description":"X","quantite":1,"prix_unitaire":50,"taux_tva":20,"remise":0,"position":0}]'));
reset role;
select set_config('request.jwt.claims', '{}', false);
update public.factures set date_echeance = public.date_du_jour_paris() - 10 where id in ('${fid(4)}', '${fid(5)}');
`;

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${message}`);
  if (!ok) echecs += 1;
};
const sansErreur = (r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie);
const lire = async (sql, nom) => (await psql(sql, nom)).sortie.trim();
const uneDemande = (sql) => `${AUTH}\n${sql}\n`;
const encaisser = (i, montant) => `insert into public.paiements (entreprise_id, facture_id, montant) values ('${E}', '${fid(i)}', ${montant});`;

const prep = await psql(preparation, "preparation");
if (prep.code !== 0) {
  console.error(prep.sortie.slice(0, 1500));
  await psql(nettoyage, "nettoyage");
  process.exit(1);
}

// 1. 20 encaissements simultanés de 10 € sur 120 € : 12 passent, pas un de plus
const r1 = await Promise.all(Array.from({ length: 20 }, (_, i) => psql(uneDemande(encaisser(1, 10)), `a${i}`)));
verifier(r1.filter(sansErreur).length === 12, `20 encaissements de 10 € sur 120 € : ${r1.filter(sansErreur).length} réussis (12 attendus)`);
verifier(r1.filter((r) => /Encaissement refusé/.test(r.sortie)).length === 8, "les 8 autres sont refusés par le plafond");
verifier((await lire(`select encaisse_net = 120 and reste_a_payer = 0 and trop_percu = 0 and statut_calcule = 'payee' from public.factures_soldes where facture_id = '${fid(1)}';`, "l1")) === "t", "encaissé exact, facture payée");

// 2. Plafond net d'un avoir : 60 € restants, 8 encaissements de 20 €
const r2 = await Promise.all(Array.from({ length: 8 }, (_, i) => psql(uneDemande(encaisser(2, 20)), `b${i}`)));
verifier(r2.filter(sansErreur).length === 3, `8 encaissements de 20 € sur 60 € restants : ${r2.filter(sansErreur).length} réussis (3 attendus)`);
verifier((await lire(`select encaisse_net = 60 and trop_percu = 0 from public.factures_soldes where facture_id = '${fid(2)}';`, "l2")) === "t", "encaissé limité au dû net de l'avoir");

// 3. Encaissement contre avoir : le dû n'est jamais dépassé sans trop-perçu déclaré
const avoir3 = (await lire(uneDemande(`select public.creer_avoir('${fid(3)}', 'Course', false, '[{"description":"X","quantite":1,"prix_unitaire":50,"taux_tva":20,"remise":0,"position":0}]');`), "av3")).split(/\r?\n/).find((l) => /^[0-9a-f-]{36}$/.test(l));
const [rAv, rEnc] = await Promise.all([
  psql(uneDemande(`select public.finaliser_facture('${avoir3}');`), "c1"),
  psql(uneDemande(encaisser(3, 120)), "c2"),
]);
const etat3 = await lire(`select encaisse_net, avoirs_ttc, reste_a_payer, trop_percu from public.factures_soldes where facture_id = '${fid(3)}';`, "l3");
const [net3, av3, reste3, trop3] = etat3.split("|").map(Number);
verifier(sansErreur(rAv) && (
  (sansErreur(rEnc) && net3 === 120 && av3 === 60 && reste3 === 0 && trop3 === 60)
  || (!sansErreur(rEnc) && net3 === 0 && av3 === 60 && reste3 === 60 && trop3 === 0)
), `avoir et encaissement simultanés : encaissé ${net3} €, avoirs ${av3} €, reste ${reste3} €, trop-perçu ${trop3} € (${sansErreur(rEnc) ? "encaissement avant l'avoir" : "encaissement refusé après l'avoir"})`);

// 4. Remboursements simultanés face au plafond : déjà couvert à l'étape 09, revérifié avec le nouveau calcul
if (trop3 > 0) {
  const r4 = await Promise.all([1, 2, 3].map((i) => psql(uneDemande(`insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('${E}', '${fid(3)}', 60, 'remboursement');`), `d${i}`)));
  verifier(r4.filter(sansErreur).length === 1, `3 remboursements simultanés de 60 € : ${r4.filter(sansErreur).length} réussi (1 attendu)`);
}

// 5. Relances simultanées de niveau 2 sans niveau 1 : aucune. Niveau 1 répété : toutes passent, tracées.
const r5 = await Promise.all(Array.from({ length: 4 }, (_, i) => psql(uneDemande(`select public.preparer_relance('${fid(4)}', 2, 'O', 'T');`), `e${i}`)));
verifier(r5.filter(sansErreur).length === 0, "4 relances de niveau 2 sans niveau 1 : toutes refusées");
const r6 = await Promise.all(Array.from({ length: 4 }, (_, i) => psql(uneDemande(`select public.preparer_relance('${fid(4)}', 1, 'O', 'T');`), `f${i}`)));
verifier(r6.every(sansErreur), "4 relances de niveau 1 simultanées : toutes tracées");
verifier((await lire(`select count(*) from public.relances where facture_id = '${fid(4)}';`, "l5")) === "4", "4 traces, aucune perdue");

// 6. Relance contre encaissement du solde : la relance voit soit un reste, soit rien
const [rRel, rPay] = await Promise.all([
  psql(uneDemande(`select public.preparer_relance('${fid(5)}', 1, 'O', 'T');`), "g1"),
  psql(uneDemande(encaisser(5, 120)), "g2"),
]);
const etat6 = await lire(`select coalesce((select reste_a_payer from public.relances where facture_id = '${fid(5)}'), -1), (select reste_a_payer from public.factures_soldes where facture_id = '${fid(5)}');`, "l6");
const [tracee, reste6] = etat6.split("|").map(Number);
verifier(sansErreur(rPay) && reste6 === 0 && (sansErreur(rRel) ? tracee === 120 : tracee === -1),
  `relance et règlement simultanés : ${sansErreur(rRel) ? `relance tracée à ${tracee} € avant le règlement` : "relance refusée après le règlement"}`);

await psql(nettoyage, "nettoyage");
rmSync(dossier, { recursive: true, force: true });
console.log(echecs === 0 ? "Concurrence : tous les contrôles passent." : `Concurrence : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
