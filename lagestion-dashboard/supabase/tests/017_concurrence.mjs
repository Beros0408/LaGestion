// 017_concurrence.mjs — LaGestion
// Garde du dernier admin face à des changements réellement simultanés (sessions psql séparées, transactions
// qui se chevauchent grâce à pg_sleep avant le commit), impossible à vérifier dans le SQL Editor.
// Attendu : jamais zéro administrateur actif ; une invitation n'est acceptée qu'une fois.
//
// Usage : node supabase/tests/017_concurrence.mjs
// Connexion : variables d'environnement de psql (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE), rôle postgres.
// À réserver à une base de test : crée une entreprise temporaire (préfixe a0178…), supprimée à la fin.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const E = "a0178000-0000-4000-8000-0000000000e1";
const A1 = "a0178000-0000-4000-8000-000000000001";
const A2 = "a0178000-0000-4000-8000-000000000002";
const X = "a0178000-0000-4000-8000-000000000005";
const dossier = mkdtempSync(path.join(tmpdir(), "lagestion-017-"));
const env = { ...process.env, PGCLIENTENCODING: "UTF8" };
const en = (u) => `select set_config('request.jwt.claims', '{"sub":"${u}","role":"authenticated"}', false);\nset role authenticated;`;

let n = 0;
function psql(sql) {
  const fichier = path.join(dossier, `s${(n += 1)}.sql`);
  writeFileSync(fichier, `\\set ON_ERROR_STOP on\n${sql}\n`);
  return new Promise((resolve) => {
    const p = spawn("psql", ["-q", "-At", "-f", fichier], { env });
    let sortie = "";
    p.stdout.on("data", (d) => (sortie += d));
    p.stderr.on("data", (d) => (sortie += d));
    p.on("close", (code) => resolve({ code, sortie }));
  });
}

// Suppression de l'entreprise d'abord (la cascade passe la garde), puis des comptes.
const nettoyage = `
  delete from public.audit_events where entreprise_id = '${E}';
  delete from public.entreprises where id = '${E}';
  delete from public.audit_events where entreprise_id = '${E}';
  delete from auth.users where id in ('${A1}', '${A2}', '${X}');
`;

const preparation = `
${nettoyage}
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('${A1}', 'concurrence-017-a1@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('${A2}', 'concurrence-017-a2@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('${X}', 'concurrence-017-x@lagestion.invalid', 'authenticated', 'authenticated', now());
insert into public.entreprises (id, nom) values ('${E}', 'Concurrence 017');
`;

// Deux admins actifs (sans passer par la garde : la mise à jour rend admin actif).
const remettre = `
insert into public.memberships (entreprise_id, user_id, role) values ('${E}', '${A1}', 'admin'), ('${E}', '${A2}', 'admin')
on conflict (entreprise_id, user_id) do update set role = 'admin', statut = 'actif', suspendu_le = null, suspendu_par = null;
`;

const chevauche = (u, appel) => `${en(u)}\nbegin;\nselect ${appel};\nselect pg_sleep(0.6);\ncommit;`;
const sansErreur = (r) => r.code === 0 && !/ERROR|ERREUR/.test(r.sortie);
const lire = async (sql) => (await psql(sql)).sortie.trim();
const adminsActifs = () => lire(`select count(*) from public.memberships where entreprise_id = '${E}' and role = 'admin' and statut = 'actif';`);

let echecs = 0;
const verifier = (ok, message) => {
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${message}`);
  if (!ok) echecs += 1;
};

const prep = await psql(preparation);
if (prep.code !== 0) {
  console.error(prep.sortie.slice(0, 1500));
  await psql(nettoyage);
  process.exit(1);
}

const scenarios = [
  ["rétrogradation croisée", `public.changer_role('${E}', '${A2}', 'manager')`, `public.changer_role('${E}', '${A1}', 'manager')`],
  ["suspension croisée", `public.suspendre_membre('${E}', '${A2}')`, `public.suspendre_membre('${E}', '${A1}')`],
  ["retrait croisé", `public.retirer_membre('${E}', '${A2}')`, `public.retirer_membre('${E}', '${A1}')`],
  ["chacun se rétrograde", `public.changer_role('${E}', '${A1}', 'lecture')`, `public.changer_role('${E}', '${A2}', 'lecture')`],
];

for (const [nom, appelA1, appelA2] of scenarios) {
  for (let tour = 1; tour <= 3; tour += 1) {
    await psql(remettre);
    const [r1, r2] = await Promise.all([psql(chevauche(A1, appelA1)), psql(chevauche(A2, appelA2))]);
    const reussis = [r1, r2].filter(sansErreur).length;
    const refusGarde = [r1, r2].filter((r) => /au moins un administrateur actif/.test(r.sortie)).length;
    const restants = await adminsActifs();
    verifier(reussis === 1 && refusGarde === 1 && restants === "1",
      `${nom}, tour ${tour} : ${reussis} réussi(s), ${refusGarde} refus de la garde, ${restants} admin(s) actif(s) (1, 1, 1 attendus)`);
  }
}

// Acceptation simultanée du même lien : une seule appartenance, un seul succès.
await psql(remettre);
const jeton = (await lire(`${en(A1)}\nselect token from public.creer_invitation('${E}', 'concurrence-017-x@lagestion.invalid', 'commercial');`))
  .split(/\r?\n/).find((l) => /^[0-9a-f-]{36}$/.test(l));
const acceptations = await Promise.all([1, 2, 3].map(() => psql(chevauche(X, `public.accept_invitation('${jeton}')`))));
verifier(acceptations.filter(sansErreur).length === 1, `3 acceptations simultanées du même lien : ${acceptations.filter(sansErreur).length} réussie (1 attendue)`);
verifier((await lire(`select count(*) from public.memberships where entreprise_id = '${E}' and user_id = '${X}';`)) === "1", "une seule appartenance créée");

// Deux invitations simultanées à la même adresse : une seule en attente.
const invitations = await Promise.all([1, 2].map(() => psql(`${en(A1)}\nselect public.creer_invitation('${E}', 'double-017@lagestion.invalid', 'lecture');`)));
verifier(invitations.filter(sansErreur).length === 1, `2 invitations simultanées à la même adresse : ${invitations.filter(sansErreur).length} créée (1 attendue)`);

await psql(nettoyage);
rmSync(dossier, { recursive: true, force: true });
console.log(echecs === 0 ? "Concurrence : tous les contrôles passent." : `Concurrence : ${echecs} contrôle(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
