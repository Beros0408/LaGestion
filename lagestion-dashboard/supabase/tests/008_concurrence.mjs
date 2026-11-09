// 008_concurrence.mjs — Lagestion
// Finalisations réellement simultanées (sessions psql séparées), impossible à vérifier dans le SQL Editor.
// Attendu : aucun trou, aucun doublon, séquences indépendantes par entreprise, un seul succès sur une même facture.
//
// Usage : node supabase/tests/008_concurrence.mjs
// Connexion : variables d'environnement de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), rôle postgres.
// À réserver à une base de test : crée deux entreprises temporaires (préfixe a0088…), supprimées à la fin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SESSIONS = 8;
const PAR_SESSION = 10;
const ENTREPRISES = ["a0088000-0000-4000-8000-0000000000e1", "a0088000-0000-4000-8000-0000000000e2"];
const ADMIN = "a0088000-0000-4000-8000-000000000001";
const dossier = mkdtempSync(path.join(tmpdir(), "lagestion-008-"));
const client = (e) => e.replace(/e(\d)$/, "c$1");
const facture = (e, s, i) => `a0088${e.at(-1)}${String(s).padStart(2, "0")}-${String(i).padStart(4, "0")}-4000-8000-000000000000`;
const ISOLE = `a0088900-0000-4000-8000-000000000000`;
const env = { ...process.env, PGCLIENTENCODING: "UTF8" };

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
  delete from public.audit_events where entreprise_id::text like 'a0088000-%';
  delete from public.factures where entreprise_id::text like 'a0088000-%';
  delete from public.clients where entreprise_id::text like 'a0088000-%';
  delete from public.memberships where entreprise_id::text like 'a0088000-%';
  delete from public.entreprises where id::text like 'a0088000-%';
  delete from auth.users where id = '${ADMIN}';
`;

const brouillons = ENTREPRISES.flatMap((e) =>
  Array.from({ length: SESSIONS }, (_, s) =>
    Array.from({ length: PAR_SESSION }, (_, i) => {
      const id = facture(e, s, i);
      // Une facture sur cinq échoue (échéance absente) : elle ne doit consommer aucun numéro.
      const echeance = i % 5 === 4 ? "null" : "public.date_du_jour_paris() + 30";
      return `insert into public.factures (id, entreprise_id, client_id, date_echeance) values ('${id}', '${e}', '${client(e)}', ${echeance});
insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva) values ('${e}', '${id}', 'Ligne', 1, 100, 20);`;
    })
  ).flat()
);

const preparation = `
\\set ON_ERROR_STOP on
${nettoyage}
insert into auth.users (id, email, aud, role) values ('${ADMIN}', 'concurrence-008@lagestion.invalid', 'authenticated', 'authenticated');
${ENTREPRISES.map((e) => `insert into public.entreprises (id, nom, siret, adresse, forme_juridique, immatriculation_type, tva_intra) values ('${e}', 'Concurrence 008', '11111111100011', '1 rue du Test', 'EI', 'dispense', 'FR00000000000');
insert into public.memberships (entreprise_id, user_id, role) values ('${e}', '${ADMIN}', 'admin');
insert into public.clients (id, entreprise_id, nom) values ('${client(e)}', '${e}', 'Client');`).join("\n")}
${brouillons.join("\n")}
insert into public.factures (id, entreprise_id, client_id, date_echeance) values ('${ISOLE}', '${ENTREPRISES[0]}', '${client(ENTREPRISES[0])}', public.date_du_jour_paris() + 30);
insert into public.lignes_facture (entreprise_id, facture_id, description, prix_unitaire) values ('${ENTREPRISES[0]}', '${ISOLE}', 'Ligne', 100);
`;

// Chaque session alterne les deux entreprises et valide chaque finalisation dans sa propre transaction.
const session = (s) => `
select set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', false);
set role authenticated;
do $$
declare ok int := 0; refus int := 0; v_id uuid;
begin
  foreach v_id in array array[${ENTREPRISES.flatMap((e) => Array.from({ length: PAR_SESSION }, (_, i) => `'${facture(e, s, i)}'::uuid`)).join(",")}] loop
    begin
      perform public.finaliser_facture(v_id);
      ok := ok + 1;
    exception when others then
      if position('date d''échéance' in sqlerrm) = 0 then raise; end if;
      refus := refus + 1;
    end;
    commit;
  end loop;
  raise notice 'session ${s} : % réussies, % refusées', ok, refus;
end $$;
`;

const memeFacture = `
select set_config('request.jwt.claims', '{"sub":"${ADMIN}","role":"authenticated"}', false);
set role authenticated;
select public.finaliser_facture('${ISOLE}');
`;

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${message}`);
  if (!ok) echecs += 1;
};

const prep = await psql(preparation, "preparation");
if (prep.code !== 0) {
  console.error(prep.sortie);
  process.exit(1);
}

const debut = Date.now();
const resultats = await Promise.all(
  Array.from({ length: SESSIONS }, (_, s) => psql(session(s), `session${s}`))
);
console.log(`${SESSIONS} sessions, ${SESSIONS * PAR_SESSION * ENTREPRISES.length} finalisations demandées, ${Date.now() - debut} ms`);
verifier(resultats.every((r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie)), "aucune session en erreur inattendue");
resultats.filter((r) => /ERROR|ERREUR/.test(r.sortie)).slice(0, 2).forEach((r) => console.log(r.sortie.slice(0, 400)));

const lire = await psql(`
select e.id, count(f.numero), count(distinct f.numero),
       coalesce(max(substring(f.numero from 10)::int), 0),
       count(*) filter (where f.statut = 'brouillon' and f.numero is null),
       count(*) filter (where f.statut = 'finalisee' and f.total_ttc = 120 and f.date_emission = public.date_du_jour_paris()),
       (select count(*) from generate_series(1, greatest(coalesce(max(substring(f.numero from 10)::int), 0), 1)) g
         where coalesce(max(substring(f.numero from 10)::int), 0) > 0
           and not (lpad(g::text, 4, '0') = any (array_agg(substring(f.numero from 10)))))
from public.entreprises e join public.factures f on f.entreprise_id = e.id
where e.id in ('${ENTREPRISES.join("','")}') and f.id <> '${ISOLE}'
group by e.id order by e.id;
`, "lecture");
const attendues = SESSIONS * (PAR_SESSION - Math.floor(PAR_SESSION / 5));
for (const ligne of lire.sortie.trim().split(/\r?\n/)) {
  const [e, numeros, distincts, max, brouillonsRestants, figees, trous] = ligne.split("|");
  const nom = `entreprise …${e.at(-2)}${e.at(-1)}`;
  verifier(Number(numeros) === attendues, `${nom} : ${numeros} numéros attribués (${attendues} attendus)`);
  verifier(numeros === distincts, `${nom} : aucun doublon (${distincts} distincts)`);
  verifier(Number(max) === attendues && Number(trous) === 0, `${nom} : séquence 1 à ${max}, ${trous} trou(s)`);
  verifier(Number(figees) === attendues, `${nom} : ${figees} factures figées à 120 €, datées du jour`);
  verifier(Number(brouillonsRestants) === SESSIONS * Math.floor(PAR_SESSION / 5), `${nom} : ${brouillonsRestants} brouillons refusés, toujours sans numéro`);
}

const quatre = await Promise.all([1, 2, 3, 4].map((i) => psql(memeFacture, `meme${i}`)));
const succes = quatre.filter((r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie)).length;
verifier(succes === 1, `même facture finalisée par 4 sessions : ${succes} succès`);
verifier(quatre.filter((r) => /déjà finalisée/.test(r.sortie)).length === 3, "les 3 autres sessions reçoivent « déjà finalisée »");

await psql(nettoyage, "nettoyage");
rmSync(dossier, { recursive: true, force: true });
console.log(echecs === 0 ? "Concurrence : tous les contrôles passent." : `Concurrence : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
