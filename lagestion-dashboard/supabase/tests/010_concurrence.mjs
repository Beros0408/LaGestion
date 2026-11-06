// 010_concurrence.mjs — Lagestion
// Acomptes et conversions réellement simultanés (sessions psql séparées), impossible à vérifier dans le SQL Editor.
// Attendu : plafond respecté, série FAC sans trou ni doublon, un seul solde, jamais d'acompte hors déductions,
// jamais d'avoir qui croise une conversion.
//
// Usage : node supabase/tests/010_concurrence.mjs
// Connexion : variables d'environnement de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), rôle postgres.
// À réserver à une base de test : crée une entreprise temporaire (préfixe a0108…), supprimée à la fin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const E = "a0108000-0000-4000-8000-0000000000e1";
const C = "a0108000-0000-4000-8000-0000000000c1";
const ADMIN = "a0108000-0000-4000-8000-000000000001";
const devisId = (i) => `a0108d00-0000-4000-8000-${String(i).padStart(12, "0")}`;
const SERIE = 40; // devis de la série : un acompte et un solde chacun, en parallèle
const dossier = mkdtempSync(path.join(tmpdir(), "lagestion-010-"));
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
  delete from public.devis where entreprise_id = '${E}';
  delete from public.clients where entreprise_id = '${E}';
  delete from public.memberships where entreprise_id = '${E}';
  delete from public.entreprises where id = '${E}';
  delete from auth.users where id = '${ADMIN}';
`;

const creerDevis = (id) => `insert into public.devis (id, entreprise_id, client_id) values ('${id}', '${E}', '${C}');
insert into public.lignes_devis (entreprise_id, devis_id, description, prix_unitaire, taux_tva, position) values
  ('${E}', '${id}', 'A', 1000, 20, 0), ('${E}', '${id}', 'B', 500, 10, 1);
update public.devis set statut = 'envoye' where id = '${id}';
update public.devis set statut = 'accepte' where id = '${id}';`;

const preparation = `
\\set ON_ERROR_STOP on
${nettoyage}
insert into auth.users (id, email, aud, role) values ('${ADMIN}', 'concurrence-010@lagestion.invalid', 'authenticated', 'authenticated');
insert into public.entreprises (id, nom, siret, adresse) values ('${E}', 'Concurrence 010', '11111111100011', '1 rue du Test');
insert into public.memberships (entreprise_id, user_id, role) values ('${E}', '${ADMIN}', 'admin');
insert into public.clients (id, entreprise_id, nom) values ('${C}', '${E}', 'Client');
${AUTH}
${Array.from({ length: SERIE + 5 }, (_, i) => creerDevis(devisId(i + 1))).join("\n")}
`;

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${message}`);
  if (!ok) echecs += 1;
};
const sansErreur = (r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie);
const lire = async (sql, nom) => (await psql(sql, nom)).sortie.trim();
const uuids = (s) => s.split(/\r?\n/).filter((l) => /^[0-9a-f-]{36}$/.test(l));
const uneDemande = (sql) => `${AUTH}\n${sql}\n`;

const prep = await psql(preparation, "preparation");
if (prep.code !== 0) {
  console.error(prep.sortie.slice(0, 1500));
  await psql(nettoyage, "nettoyage");
  process.exit(1);
}

// 1. Série FAC : acompte finalisé puis solde finalisé pour chaque devis, sur 8 sessions
const SESSIONS = 8;
const session = (s) => `${AUTH}
do $$
declare v_id uuid; i int := 0;
begin
  foreach v_id in array array[${Array.from({ length: SERIE }, (_, i) => i + 1).filter((i) => i % SESSIONS === s).map((i) => `'${devisId(i)}'::uuid`).join(",")}] loop
    perform public.finaliser_facture(public.creer_acompte(v_id, 'pourcentage', 30));
    commit;
    perform public.finaliser_facture(public.convertir_devis(v_id));
    commit;
  end loop;
end $$;
`;
const debut = Date.now();
const resultats = await Promise.all(Array.from({ length: SESSIONS }, (_, s) => psql(session(s), `session${s}`)));
console.log(`${SESSIONS} sessions, ${SERIE} devis, ${SERIE * 2} finalisations, ${Date.now() - debut} ms`);
verifier(resultats.every(sansErreur), "aucune session en erreur");
resultats.filter((r) => !sansErreur(r)).slice(0, 2).forEach((r) => console.log(r.sortie.slice(0, 400)));
const serie = await lire(`
select count(f.numero), count(distinct f.numero), max(substring(f.numero from 10)::int),
       (select count(*) from generate_series(1, max(substring(f.numero from 10)::int)) g
         where not (lpad(g::text, 4, '0') = any (array_agg(substring(f.numero from 10))))),
       count(*) filter (where f.type = 'acompte' and f.total_ttc = 525),
       count(*) filter (where f.type = 'solde' and f.total_ttc = 1225)
from public.factures f where f.entreprise_id = '${E}' and f.numero like 'FAC-%';`, "serie");
const [nb, distincts, max, trous, acomptes, soldes] = serie.split("|");
verifier(Number(nb) === SERIE * 2 && nb === distincts, `${nb} numéros FAC, ${distincts} distincts (${SERIE * 2} attendus)`);
verifier(Number(max) === SERIE * 2 && Number(trous) === 0, `séquence 1 à ${max}, ${trous} trou(s)`);
verifier(Number(acomptes) === SERIE && Number(soldes) === SERIE, `${acomptes} acomptes à 525 € et ${soldes} soldes à 1 225 €`);

// 2. Plafond à la création : 8 créations simultanées de 40 % ; à la finalisation : 2 passent sur 8
const d1 = devisId(SERIE + 1);
const brouillons = await Promise.all(Array.from({ length: 8 }, (_, i) => psql(uneDemande(`select public.creer_acompte('${d1}', 'pourcentage', 40);`), `c${i}`)));
verifier(brouillons.every(sansErreur), "8 brouillons d'acompte simultanés créés (rien de finalisé)");
const ids = brouillons.flatMap((r) => uuids(r.sortie));
const finalisations = await Promise.all(ids.map((id, i) => psql(uneDemande(`select public.finaliser_facture('${id}');`), `f${i}`)));
verifier(finalisations.filter(sansErreur).length === 2, `8 finalisations simultanées de 40 % : ${finalisations.filter(sansErreur).length} réussies (2 attendues)`);
verifier(finalisations.filter((r) => /cumul des acomptes/.test(r.sortie)).length === 6, "les 6 autres sont refusées par le plafond");
verifier((await lire(`select sum(total_ttc) from public.factures where devis_id = '${d1}' and statut <> 'brouillon';`, "l1")) === "1400.00", "cumul de 1 400 € sur 1 750 €");

// 3. Acompte contre conversion : 4 finalisations d'acompte et une conversion en même temps
const d2 = devisId(SERIE + 2);
const pretes = uuids(await lire(`${AUTH}\n${Array.from({ length: 4 }, () => `select public.creer_acompte('${d2}', 'pourcentage', 10);`).join("\n")}`, "bd2"));
await psql(uneDemande(`select public.finaliser_facture('${pretes[0]}');`), "premier");
const courses = await Promise.all([
  ...pretes.slice(1).map((id, i) => psql(uneDemande(`select public.finaliser_facture('${id}');`), `a${i}`)),
  psql(uneDemande(`select public.convertir_devis('${d2}');`), "conv"),
]);
const conv = courses.at(-1);
const etat = await lire(`
select (select coalesce(sum(total_ttc), 0) from public.factures where devis_id = '${d2}' and type = 'acompte' and statut <> 'brouillon') as finalises,
       (select count(*) from public.factures where devis_id = '${d2}' and type = 'acompte' and statut = 'brouillon') as brouillons,
       (select coalesce((select sum((n->>'total_ttc')::numeric) from jsonb_array_elements(s.acomptes_deduits) n), -1) from public.factures s where s.devis_id = '${d2}' and s.type = 'solde') as deduits,
       (select statut from public.devis where id = '${d2}') as statut;`, "l2");
const [finalises, brouillonsRestants, deduits, statutD2] = etat.split("|");
// Soit la conversion passe avant une finalisation (qui échoue alors), soit elle est refusée pour brouillon restant.
if (sansErreur(conv)) {
  verifier(statutD2 === "converti" && Number(finalises) === Number(deduits), `conversion réussie : acomptes finalisés (${finalises} €) = déductions (${deduits} €)`);
} else {
  verifier(/encore en brouillon/.test(conv.sortie) && statutD2 === "accepte", `conversion refusée pour acompte en brouillon (${brouillonsRestants} restant(s))`);
}

// Acompte finalisé après une conversion déjà faite : refusé
const d3 = devisId(SERIE + 3);
const [a3] = uuids(await lire(uneDemande(`select public.creer_acompte('${d3}', 'pourcentage', 10);`), "a3"));
await psql(uneDemande(`select public.finaliser_facture('${a3}');`), "a3f");
const [a3b] = uuids(await lire(uneDemande(`select public.creer_acompte('${d3}', 'pourcentage', 10);`), "a3b"));
await psql(uneDemande(`update public.factures set deleted_at = now() where id = '${a3b}';`), "a3s");

// 4. 4 conversions simultanées : une seule
const convs = await Promise.all([1, 2, 3, 4].map((i) => psql(uneDemande(`select public.convertir_devis('${d3}');`), `v${i}`)));
verifier(convs.filter(sansErreur).length === 1, `4 conversions simultanées : ${convs.filter(sansErreur).length} réussie (1 attendue)`);
verifier((await lire(`select count(*) from public.factures where devis_id = '${d3}' and type = 'solde';`, "l3")) === "1", "un seul solde");

// 5. Avoir sur acompte contre conversion : le solde déduit l'avoir, ou l'avoir est refusé. Jamais les deux à tort.
const d4 = devisId(SERIE + 4);
const [a4] = uuids(await lire(uneDemande(`select public.creer_acompte('${d4}', 'pourcentage', 30);`), "a4"));
await psql(uneDemande(`select public.finaliser_facture('${a4}');`), "a4f");
const [av4] = uuids(await lire(uneDemande(`select public.creer_avoir('${a4}', 'Course', false, '[{"description":"X","quantite":1,"prix_unitaire":100,"taux_tva":20,"remise":0,"position":0}]');`), "av4"));
const [rAvoir, rConv] = await Promise.all([
  psql(uneDemande(`select public.finaliser_facture('${av4}');`), "r1"),
  psql(uneDemande(`select public.convertir_devis('${d4}');`), "r2"),
]);
const croise = await lire(`
select coalesce((select -total_ttc from public.factures where id = '${av4}' and statut <> 'brouillon'), 0),
       (select (s.acomptes_deduits->0->>'total_ttc')::numeric from public.factures s where s.devis_id = '${d4}' and s.type = 'solde');`, "l4");
const [avoirFinalise, deduit] = croise.split("|").map(Number);
verifier(sansErreur(rConv) && Math.round((525 - avoirFinalise) * 100) === Math.round(deduit * 100),
  `avoir et conversion simultanés : déduction ${deduit} € = 525 € − avoir ${avoirFinalise} € (avoir ${sansErreur(rAvoir) ? "passé avant" : "refusé"})`);

await psql(nettoyage, "nettoyage");
rmSync(dossier, { recursive: true, force: true });
console.log(echecs === 0 ? "Concurrence : tous les contrôles passent." : `Concurrence : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
