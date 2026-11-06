// 009_concurrence.mjs — Lagestion
// Avoirs réellement simultanés (sessions psql séparées), impossible à vérifier dans le SQL Editor.
// Attendu : série AV sans trou ni doublon, indépendante par entreprise et de la série FAC ; sur une même facture,
// plafonds respectés, un seul avoir total, annulation unique, remboursements plafonnés au trop-perçu.
//
// Usage : node supabase/tests/009_concurrence.mjs
// Connexion : variables d'environnement de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), rôle postgres.
// À réserver à une base de test : crée deux entreprises temporaires (préfixe a0098…), supprimées à la fin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SESSIONS = 8;
const PAR_SESSION = 10;
const ENTREPRISES = ["a0098000-0000-4000-8000-0000000000e1", "a0098000-0000-4000-8000-0000000000e2"];
const ADMIN = "a0098000-0000-4000-8000-000000000001";
const dossier = mkdtempSync(path.join(tmpdir(), "lagestion-009-"));
const client = (e) => e.replace(/e(\d)$/, "c$1");
const facture = (e, s, i) => `a0098${e.at(-1)}${String(s).padStart(2, "0")}-${String(i).padStart(4, "0")}-4000-8000-000000000000`;
const avoir = (e, s, i) => `a0098${e.at(-1)}${String(s).padStart(2, "0")}-${String(i).padStart(4, "0")}-4000-8000-00000000000a`;
const PARTIELS = "a0098900-0000-4000-8000-000000000001"; // reçoit des avoirs partiels simultanés
const TOTAUX = "a0098900-0000-4000-8000-000000000002"; // reçoit des avoirs totaux simultanés
const CUMUL = "a0098900-0000-4000-8000-000000000003"; // cumul exact en deux avoirs simultanés
const REMB = "a0098900-0000-4000-8000-000000000004"; // remboursements simultanés
const E0 = ENTREPRISES[0];
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
  delete from public.audit_events where entreprise_id::text like 'a0098000-%';
  delete from public.factures where entreprise_id::text like 'a0098000-%';
  delete from public.clients where entreprise_id::text like 'a0098000-%';
  delete from public.memberships where entreprise_id::text like 'a0098000-%';
  delete from public.entreprises where id::text like 'a0098000-%';
  delete from auth.users where id = '${ADMIN}';
`;

// Facture à finaliser en rôle authentifié : 100 € HT à 20 %, 120 € TTC ; p_ht pour varier le montant.
const creerFacture = (id, e, ht = 100) => `insert into public.factures (id, entreprise_id, client_id, date_echeance) values ('${id}', '${e}', '${client(e)}', public.date_du_jour_paris() + 30);
insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire, taux_tva) values ('${e}', '${id}', 'Ligne', ${ht}, 20);
select public.finaliser_facture('${id}');`;

const lignesAvoir = (ht) => `'[{"description":"Partiel","quantite":1,"prix_unitaire":${ht},"taux_tva":20,"remise":0,"position":0}]'`;

const preparation = `
\\set ON_ERROR_STOP on
${nettoyage}
insert into auth.users (id, email, aud, role) values ('${ADMIN}', 'concurrence-009@lagestion.invalid', 'authenticated', 'authenticated');
${ENTREPRISES.map((e) => `insert into public.entreprises (id, nom, siret, adresse) values ('${e}', 'Concurrence 009', '11111111100011', '1 rue du Test');
insert into public.memberships (entreprise_id, user_id, role) values ('${e}', '${ADMIN}', 'admin');
insert into public.clients (id, entreprise_id, nom) values ('${client(e)}', '${e}', 'Client');`).join("\n")}
${AUTH}
${ENTREPRISES.flatMap((e) => Array.from({ length: SESSIONS }, (_, s) => Array.from({ length: PAR_SESSION }, (_, i) => creerFacture(facture(e, s, i), e)).join("\n"))).join("\n")}
${creerFacture(PARTIELS, E0, 100)}
${creerFacture(TOTAUX, E0, 100)}
${creerFacture(CUMUL, E0, 100)}
${creerFacture(REMB, E0, 100)}
insert into public.paiements (entreprise_id, facture_id, montant) values ('${E0}', '${REMB}', 120);
select public.finaliser_facture(public.creer_avoir('${REMB}', 'Trop-perçu', false, ${lignesAvoir(50)}));
`;

// Série : chaque session crée et finalise ses avoirs ; une demande sur cinq échoue (à 0 €) et ne doit consommer aucun numéro.
const session = (s) => `
${AUTH}
do $$
declare ok int := 0; refus int := 0; v_id uuid; v_ht numeric; i int;
begin
  foreach v_id in array array[${ENTREPRISES.flatMap((e) => Array.from({ length: PAR_SESSION }, (_, i) => `'${facture(e, s, i)}'::uuid`)).join(",")}] loop
    i := coalesce(i, -1) + 1;
    v_ht := case when i % 5 = 4 then 0 else 10 end;
    begin
      perform public.finaliser_facture(public.creer_avoir(v_id, 'Série', false,
        jsonb_build_array(jsonb_build_object('description', 'Partiel', 'quantite', 1, 'prix_unitaire', v_ht, 'taux_tva', 20, 'remise', 0, 'position', 0))));
      ok := ok + 1;
    exception when others then
      if position('doit être positif' in sqlerrm) = 0 then raise; end if;
      refus := refus + 1;
    end;
    commit;
  end loop;
  raise notice 'session ${s} : % réussis, % refusés', ok, refus;
end $$;
`;

const uneDemande = (sql) => `${AUTH}\n${sql}\n`;

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${message}`);
  if (!ok) echecs += 1;
};
const sansErreur = (r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie);
const lire = async (sql, nom) => (await psql(sql, nom)).sortie.trim();

const prep = await psql(preparation, "preparation");
if (prep.code !== 0) {
  console.error(prep.sortie.slice(0, 1500));
  await psql(nettoyage, "nettoyage");
  process.exit(1);
}

// 1. Série AV
const debut = Date.now();
const resultats = await Promise.all(Array.from({ length: SESSIONS }, (_, s) => psql(session(s), `session${s}`)));
console.log(`${SESSIONS} sessions, ${SESSIONS * PAR_SESSION * ENTREPRISES.length} avoirs demandés, ${Date.now() - debut} ms`);
verifier(resultats.every(sansErreur), "aucune session en erreur inattendue");
resultats.filter((r) => !sansErreur(r)).slice(0, 2).forEach((r) => console.log(r.sortie.slice(0, 400)));
const parEntreprise = await lire(`
select f.entreprise_id, count(f.numero), count(distinct f.numero), coalesce(max(substring(f.numero from 9)::int), 0),
       (select count(*) from generate_series(1, greatest(coalesce(max(substring(f.numero from 9)::int), 0), 1)) g
         where not (lpad(g::text, 4, '0') = any (array_agg(substring(f.numero from 9)))))
from public.factures f
where f.entreprise_id in ('${ENTREPRISES.join("','")}') and f.type = 'avoir' and f.numero is not null
  and f.facture_origine_id not in ('${PARTIELS}','${TOTAUX}','${CUMUL}','${REMB}')
group by f.entreprise_id order by f.entreprise_id;
`, "lecture");
// Un avoir supplémentaire existe déjà dans l'entreprise 0 (celui de la facture de remboursement) : numéro 0001.
const attendus = SESSIONS * (PAR_SESSION - Math.floor(PAR_SESSION / 5));
parEntreprise.split(/\r?\n/).forEach((ligne, i) => {
  const [e, numeros, distincts, max, trous] = ligne.split("|");
  const nom = `entreprise …${e.at(-2)}${e.at(-1)}`;
  const decalage = i === 0 ? 1 : 0;
  verifier(Number(numeros) === attendus, `${nom} : ${numeros} numéros AV attribués (${attendus} attendus)`);
  verifier(numeros === distincts, `${nom} : aucun doublon (${distincts} distincts)`);
  verifier(Number(max) === attendus + decalage, `${nom} : numéro maximum ${max} (${attendus + decalage} attendu)`);
  verifier(Number(trous) === decalage, `${nom} : aucun trou (${trous} manquant(s) dans cette lecture, dont ${decalage} attribué(s) hors lecture)`);
});
const seriesFac = await lire(`
select count(*), max(substring(numero from 10)::int) from public.factures where entreprise_id = '${ENTREPRISES[1]}' and numero like 'FAC-%';
`, "fac");
const [nbFac, maxFac] = seriesFac.split("|");
verifier(nbFac === maxFac, `série FAC intacte (${nbFac} numéros, maximum ${maxFac})`);

// 2. 8 avoirs partiels simultanés de 30 € HT sur 100 € HT : 3 passent, le plafond refuse les autres
const brouillonsPartiels = await lire(`${AUTH}\n${Array.from({ length: 8 }, () => `select public.creer_avoir('${PARTIELS}', 'Partiel simultané', false, ${lignesAvoir(30)});`).join("\n")}`, "bp");
const idsPartiels = brouillonsPartiels.split(/\r?\n/).filter((l) => /^[0-9a-f-]{36}$/.test(l));
const partiels = await Promise.all(idsPartiels.map((id, i) => psql(uneDemande(`select public.finaliser_facture('${id}');`), `p${i}`)));
verifier(partiels.filter(sansErreur).length === 3, `8 avoirs partiels simultanés : ${partiels.filter(sansErreur).length} réussis (3 attendus)`);
verifier(partiels.filter((r) => /il reste/.test(r.sortie)).length === 5, "les 5 autres sont refusés par le plafond");
verifier((await lire(`select sum(-total_ttc), count(*) from public.factures where facture_origine_id = '${PARTIELS}' and statut <> 'brouillon';`, "lp")) === "108.00|3", "cumul de 108 € TTC sur 120 €, facture non annulée");

// 3. 4 avoirs totaux simultanés : un seul passe, annulation unique
const brouillonsTotaux = await lire(`${AUTH}\n${Array.from({ length: 4 }, () => `select public.creer_avoir('${TOTAUX}', 'Total simultané', true);`).join("\n")}`, "bt");
const idsTotaux = brouillonsTotaux.split(/\r?\n/).filter((l) => /^[0-9a-f-]{36}$/.test(l));
const totaux = await Promise.all(idsTotaux.map((id, i) => psql(uneDemande(`select public.finaliser_facture('${id}');`), `t${i}`)));
verifier(totaux.filter(sansErreur).length === 1, `4 avoirs totaux simultanés : ${totaux.filter(sansErreur).length} réussi (1 attendu)`);
verifier((await lire(`select statut from public.factures where id = '${TOTAUX}';`, "lt")) === "annulee", "facture annulée une seule fois");
verifier((await lire(`select count(*) from public.audit_events where table_name = 'factures' and record_id = '${TOTAUX}' and new_data->>'statut' = 'annulee';`, "lt2")) === "1", "une seule annulation dans audit_events");

// 4. Cumul exact en deux avoirs simultanés : la facture passe annulée
const brouillonsCumul = await lire(`${AUTH}\n${[60, 40].map((ht) => `select public.creer_avoir('${CUMUL}', 'Cumul', false, ${lignesAvoir(ht)});`).join("\n")}`, "bc");
const idsCumul = brouillonsCumul.split(/\r?\n/).filter((l) => /^[0-9a-f-]{36}$/.test(l));
const cumul = await Promise.all(idsCumul.map((id, i) => psql(uneDemande(`select public.finaliser_facture('${id}');`), `c${i}`)));
verifier(cumul.every(sansErreur), "60 € et 40 € HT simultanés : les deux réussissent");
verifier((await lire(`select f.statut = 'annulee' and s.reste_a_payer = 0 and s.trop_percu = 0 from public.factures f join public.factures_soldes s on s.facture_id = f.id where f.id = '${CUMUL}';`, "lc")) === "t", "cumul exact : facture annulée, reste nul");

// 5. 4 remboursements simultanés du trop-perçu de 60 € : un seul passe
const rembours = await Promise.all([1, 2, 3, 4].map((i) => psql(uneDemande(`insert into public.paiements (entreprise_id, facture_id, montant, sens) values ('${E0}', '${REMB}', 60, 'remboursement');`), `r${i}`)));
verifier(rembours.filter(sansErreur).length === 1, `4 remboursements simultanés : ${rembours.filter(sansErreur).length} réussi (1 attendu)`);
verifier((await lire(`select trop_percu = 0 and encaisse_net = 60 from public.factures_soldes where facture_id = '${REMB}';`, "lr")) === "t", "trop-perçu soldé, encaissé net de 60 €");

await psql(nettoyage, "nettoyage");
rmSync(dossier, { recursive: true, force: true });
console.log(echecs === 0 ? "Concurrence : tous les contrôles passent." : `Concurrence : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
