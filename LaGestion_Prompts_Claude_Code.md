# LaGestion — Prompts Claude Code prêts à l'emploi

2 novembre 2026 · Beros

## Mode d'emploi

1. Ouvrez un terminal dans `C:\Users\bkabe\Desktop\LaGestion_CRM-projet\lagestion-dashboard`, sur la branche `v2-multitenant`.
2. Lancez `claude`.
3. Copiez **un seul prompt** (tout le bloc gris, de la première à la dernière ligne) et collez-le dans Claude Code.
4. Lisez le plan proposé, répondez « go » s'il vous convient.
5. Testez, commitez, puis passez au prompt suivant.

Ordre : **prompt 0 → prompt 1 → exécution SQL par vous → prompt 2 → prompt 3 → prompt 4**.

Rien n'est à compléter : tout est déjà inclus. Le cahier des charges V2 est déjà sur votre disque, à la racine du dépôt ; le prompt 0 demande simplement à Claude Code de le ranger.

Seule décision encore ouverte : la palette. En attendant, on conserve #2D5B7F (design system actuel).

---

## Prompt 0 — Mise en place du cadre (aucun code)

```markdown
Lis CLAUDE.md en entier.

Tâche :
1. Crée le dossier docs/ dans lagestion-dashboard.
2. Déplace le fichier ..\LaGestion_Cahier_des_charges_V2.md (racine du dépôt) vers docs\LaGestion_Cahier_des_charges_V2.md.
3. Ajoute en tête de CLAUDE.md la section « Règles de travail — LaGestion » ci-dessous, mot pour mot, sans supprimer ni modifier le design system existant.
4. Ajoute juste après une section « Décisions V2 » :
   - Frontend : React + Vite conservé (pas de Next.js pour l'instant).
   - Backend : Supabase Edge Functions avant FastAPI.
   - Clé d'isolation : entreprise_id (et non tenant_id).
   - Rôles : admin, manager, commercial, comptable, lecture.
   - Palette : à trancher entre #2D5B7F (actuel) et #489AF0 (V2) ; #2D5B7F reste en vigueur en attendant.
5. Ne touche à aucun fichier de code. N'ajoute pas les dossiers FONGOLA -SUP/ et my-video/ à Git.

Vérifie point par point : CLAUDE.md est lisible, aucune section existante perdue, docs/ contient le cahier des charges. Montre-moi le diff de CLAUDE.md, propose un message de commit et arrête-toi.

--- Début de la section à insérer dans CLAUDE.md ---

# Règles de travail — LaGestion

## Objectif
Construire LaGestion, un SaaS CRM multi-entreprises pour TPE/PME françaises (2 à 50 personnes) :
clients, prospects, pipeline, devis, factures, paiements, tableau de bord, puis IWa (agent IA) et module BTP.
Référence fonctionnelle : docs/LaGestion_Cahier_des_charges_V2.md.

## Contexte
- Développeur solo, Windows (cmd), projet dans C:\Users\bkabe\Desktop\LaGestion_CRM-projet\lagestion-dashboard
- Dépôt GitHub : Beros0408/LaGestion ; branche de travail v2-multitenant ; main reste stable
- Stack : React 18 + Vite + Tailwind + React Router + Recharts + lucide-react + Supabase (Auth, Postgres, Storage)
- Déploiement prévu : Vercel (frontend) + Supabase
- Supabase : projet lagestion (réf. vzpuewzjlrbwqxwadsle), variables dans .env.local
- Clé d'isolation : entreprise_id sur toute donnée métier ; RLS par appartenance (table memberships)
- Schéma : supabase/schema.sql (base) + supabase/migrations/NNN_nom.sql (évolutions, numérotées)
- Écritures centralisées dans src/context : ClientsContext.jsx, OpportunitesContext.jsx, FacturesContext.jsx
- Suppression logique via deleted_at

## Contraintes
- Aucune nouvelle dépendance npm sans mon accord explicite. Si une librairie semble utile, propose-la et attends.
- Pas de Framer Motion : animations en CSS uniquement. Graphiques : Recharts uniquement.
- Respecte le design system décrit dans ce fichier ; aucune couleur codée en dur hors des tokens.
- Jamais de clé service_role ou sb_secret_ côté navigateur. Seule la clé publishable est dans .env.local.
- Toute requête de lecture ou d'écriture respecte entreprise_id ; ne jamais contourner la RLS.
- Calculs financiers (HT, TVA, TTC, totaux) déterministes, arrondis au centime, jamais délégués à l'IA.
- Textes d'interface en français correct (accents, espaces insécables avant : ; ! ?), prêts pour l'i18n.
- Ne modifie jamais schema.sql pour une évolution : crée une migration numérotée.
- N'exécute jamais npm audit fix --force.

## Méthode
- Une étape à la fois. Avant de coder : reformule l'objectif de l'étape, liste les fichiers touchés et le plan en 3 à 7 points, puis attends mon « go ».
- Changements petits et ciblés. Pas de refactor hors périmètre.
- Si une consigne est ambiguë ou contradictoire avec le cahier des charges, pose la question au lieu de deviner.
- À la fin de chaque étape : propose un message de commit, puis arrête-toi.

## Ton
- Pas de flatterie, pas de « excellente question ». Va droit au but.
- Sois franc : si mon idée est mauvaise, risquée ou trop coûteuse, dis-le et propose mieux.
- Signale ce que tu n'as pas pu vérifier au lieu de l'affirmer.

## Vérification avant de livrer (obligatoire, point par point)
1. npm run build passe sans erreur ni avertissement nouveau.
2. Relis ton diff fichier par fichier : rien d'inutile, aucun console.log oublié, aucun secret.
3. Les imports et chemins existent ; aucune dépendance ajoutée.
4. Pour du SQL : rejouable quand c'est possible, cohérent avec schema.sql, RLS active sur chaque nouvelle table.
5. Donne-moi les étapes de test manuel précises (URL, clics, résultat attendu).
6. Termine par un tableau « Vérifié / Non vérifié / À tester par Beros ».

--- Fin de la section à insérer ---
```

---

## Prompt 1 — Migration multi-tenant (SQL uniquement)

```markdown
Lis CLAUDE.md, puis supabase/schema.sql en entier.

Objectif de l'étape : isoler les données par entreprise (memberships, rôles, invitations, audit, RLS).
Je te fournis ci-dessous un brouillon de migration 002_multitenant.sql.

Tâche :
1. Compare le brouillon avec schema.sql : noms de tables et colonnes (nom, siret, email, siren, numero, deleted_at), types des id, colonnes NOT NULL sans défaut dans entreprises, nom exact de la vue des totaux, index uniques existants.
2. Liste chaque écart trouvé dans un tableau (élément / brouillon / schema.sql / correction).
3. Attends mon go, puis écris supabase/migrations/002_multitenant.sql corrigé. Ne modifie pas schema.sql.
4. Écris supabase/tests/002_isolation.sql : crée deux utilisateurs fictifs A et B dans deux entreprises, simule chacun avec set local role authenticated et set local request.jwt.claims, et vérifie que A ne voit, ne modifie ni ne supprime aucune ligne de B (clients, factures, memberships, audit_events). Le script se termine par rollback.
5. N'exécute rien sur la base : c'est moi qui lancerai les scripts dans le SQL Editor de Supabase.

Précision : les tables utilisent la suppression logique (deleted_at). Les index uniques par entreprise doivent ignorer les lignes supprimées ; le brouillon le gère déjà en vérifiant la présence de la colonne.

Avant de livrer, vérifie point par point : chaque table métier a RLS + 4 politiques ; aucune politique « tout utilisateur authentifié » ne subsiste ; les fonctions security definer ont search_path fixé ; la migration est rejouable. Termine par le tableau Vérifié / Non vérifié / À tester par Beros.

--- Brouillon 002_multitenant.sql ---

-- 002_multitenant.sql — LaGestion
-- Isolation par entreprise, rôles, invitations, audit.
-- Prérequis : base vide. Rejouable sans erreur.

begin;

-- 1. Rôles
do $$ begin
  create type public.app_role as enum ('admin','manager','commercial','comptable','lecture');
exception when duplicate_object then null; end $$;

-- 2. Appartenances utilisateur <-> entreprise
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'lecture',
  created_at timestamptz not null default now(),
  unique (entreprise_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);

-- 3. Invitations
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  email text not null,
  role public.app_role not null default 'lecture',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists invitations_en_attente_uniq
  on public.invitations(entreprise_id, lower(email)) where accepted_at is null;

-- 4. Journal d'audit
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  user_id uuid,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_entreprise_idx
  on public.audit_events(entreprise_id, created_at desc);

-- 5. Fonctions d'autorisation (security definer : évite la récursion RLS)
create or replace function public.is_member(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid());
$$;

create or replace function public.has_role(e uuid, roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise_id = e and m.user_id = auth.uid() and m.role = any(roles));
$$;

-- 6. entreprise_id obligatoire sur les tables métier
do $$
declare t text;
begin
  foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
    execute format('alter table public.%I add column if not exists entreprise_id uuid references public.entreprises(id) on delete cascade', t);
    execute format('alter table public.%I alter column entreprise_id set not null', t);
    execute format('create index if not exists %I on public.%I(entreprise_id)', t || '_entreprise_idx', t);
  end loop;
end $$;

-- 7. Unicités par entreprise (et non plus globales), en ignorant les lignes supprimées
do $$
declare r record;
begin
  for r in select conrelid::regclass::text as tbl, conname from pg_constraint
           where conrelid in ('public.clients'::regclass, 'public.factures'::regclass) and contype = 'u' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  for r in select indexname from pg_indexes
           where schemaname = 'public' and tablename in ('clients','factures')
             and indexdef ilike 'create unique index%' and indexname not like '%_pkey' loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;

do $$
declare c_del text; f_del text;
begin
  c_del := case when exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'clients' and column_name = 'deleted_at')
                then ' and deleted_at is null' else '' end;
  f_del := case when exists (select 1 from information_schema.columns
                             where table_schema = 'public' and table_name = 'factures' and column_name = 'deleted_at')
                then ' and deleted_at is null' else '' end;
  execute format('create unique index if not exists clients_entreprise_email_uniq on public.clients(entreprise_id, lower(email)) where email is not null and email <> %L%s', '', c_del);
  execute format('create unique index if not exists clients_entreprise_siren_uniq on public.clients(entreprise_id, siren) where siren is not null and siren <> %L%s', '', c_del);
  execute format('create unique index if not exists factures_entreprise_numero_uniq on public.factures(entreprise_id, numero) where numero is not null%s', f_del);
end $$;

-- 8. Création d'entreprise : l'auteur devient admin
create or replace function public.create_entreprise(p_nom text, p_siret text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  insert into public.entreprises(nom, siret) values (p_nom, p_siret) returning id into v_id;
  insert into public.memberships(entreprise_id, user_id, role) values (v_id, auth.uid(), 'admin');
  return v_id;
end $$;
revoke all on function public.create_entreprise(text, text) from public, anon;
grant execute on function public.create_entreprise(text, text) to authenticated;

-- 9. Acceptation d'une invitation
create or replace function public.accept_invitation(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invitations; v_email text;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into inv from public.invitations
   where token = p_token and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'Invitation invalide ou expirée'; end if;
  if lower(inv.email) <> lower(v_email) then raise exception 'Invitation destinée à une autre adresse'; end if;
  insert into public.memberships(entreprise_id, user_id, role)
  values (inv.entreprise_id, auth.uid(), inv.role)
  on conflict (entreprise_id, user_id) do update set role = excluded.role;
  update public.invitations set accepted_at = now() where id = inv.id;
  return inv.entreprise_id;
end $$;
revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- 10. Audit automatique
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_events(entreprise_id, user_id, action, table_name, record_id, old_data, new_data)
  values ((v_row->>'entreprise_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, (v_row->>'id')::uuid,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['clients','opportunites','factures','paiements'] loop
    execute format('drop trigger if exists audit_%I on public.%I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;

-- 11. RLS : suppression de toutes les anciennes politiques
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('entreprises','profiles','clients','contacts','opportunites','factures',
                               'lignes_facture','paiements','memberships','invitations','audit_events') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 12. RLS : tables métier (lecture = membres ; écriture = rôles actifs ; suppression = admin/manager)
do $$
declare t text;
begin
  foreach t in array array['clients','contacts','opportunites','factures','lignes_facture','paiements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture_membres on public.%I for select to authenticated using (public.is_member(entreprise_id))', t);
    execute format('create policy creation_equipe on public.%I for insert to authenticated with check (public.has_role(entreprise_id, array[''admin'',''manager'',''commercial'',''comptable'']::public.app_role[]))', t);
    execute format('create policy modification_equipe on public.%I for update to authenticated using (public.has_role(entreprise_id, array[''admin'',''manager'',''commercial'',''comptable'']::public.app_role[])) with check (public.has_role(entreprise_id, array[''admin'',''manager'',''commercial'',''comptable'']::public.app_role[]))', t);
    execute format('create policy suppression_direction on public.%I for delete to authenticated using (public.has_role(entreprise_id, array[''admin'',''manager'']::public.app_role[]))', t);
  end loop;
end $$;

-- 13. RLS : entreprises (création uniquement via create_entreprise)
alter table public.entreprises enable row level security;
create policy lecture_membres on public.entreprises for select to authenticated
  using (public.is_member(id));
create policy modification_admin on public.entreprises for update to authenticated
  using (public.has_role(id, array['admin']::public.app_role[]))
  with check (public.has_role(id, array['admin']::public.app_role[]));

-- 14. RLS : profils (soi-même + collègues)
alter table public.profiles enable row level security;
create policy lecture_profils on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.entreprise_id = m2.entreprise_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy creation_profil on public.profiles for insert to authenticated with check (id = auth.uid());
create policy modification_profil on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 15. RLS : appartenances, invitations, audit (gérés par l'admin)
alter table public.memberships enable row level security;
create policy lecture_membres on public.memberships for select to authenticated
  using (public.is_member(entreprise_id));
create policy gestion_admin_insert on public.memberships for insert to authenticated
  with check (public.has_role(entreprise_id, array['admin']::public.app_role[]));
create policy gestion_admin_update on public.memberships for update to authenticated
  using (public.has_role(entreprise_id, array['admin']::public.app_role[]))
  with check (public.has_role(entreprise_id, array['admin']::public.app_role[]));
create policy gestion_admin_delete on public.memberships for delete to authenticated
  using (public.has_role(entreprise_id, array['admin']::public.app_role[]));

alter table public.invitations enable row level security;
create policy gestion_admin on public.invitations for all to authenticated
  using (public.has_role(entreprise_id, array['admin']::public.app_role[]))
  with check (public.has_role(entreprise_id, array['admin']::public.app_role[]));

alter table public.audit_events enable row level security;
create policy lecture_admin on public.audit_events for select to authenticated
  using (public.has_role(entreprise_id, array['admin']::public.app_role[]));

-- 16. Les vues appliquent la RLS de l'utilisateur (sinon elles contournent l'isolation)
do $$
declare v record;
begin
  for v in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('alter view public.%I set (security_invoker = on)', v.table_name);
  end loop;
end $$;

commit;

--- Fin du brouillon ---

Point d'attention à me signaler dans ton analyse : rien n'empêche encore le dernier admin de se retirer lui-même ; ce sera traité avec l'écran de gestion des membres.
```

### Ensuite, de votre côté (pas de Claude Code)

1. Supabase → projet **lagestion** → **SQL Editor** → **New** → collez le contenu de `supabase\migrations\002_multitenant.sql` → **Run**.
2. Même chose avec `supabase\tests\002_isolation.sql`.
3. Copiez le résultat (ou l'erreur exacte) et donnez-le à Claude Code avant de lancer le prompt 2.

---

## Prompt 2 — Entreprise courante dans l'application

```markdown
Lis CLAUDE.md. La migration 002 est appliquée et les tests d'isolation passent.

Objectif de l'étape : que l'application fonctionne avec l'isolation par entreprise.

Tâche :
1. Crée un contexte React EntrepriseContext : après connexion, charge les memberships de l'utilisateur (entreprise + rôle) ; mémorise l'entreprise courante.
2. Si l'utilisateur n'a aucune entreprise : page /onboarding « Créer mon entreprise » (nom obligatoire, SIRET facultatif à 14 chiffres) qui appelle supabase.rpc('create_entreprise'), puis redirige vers le tableau de bord.
3. Toutes les créations (clients, contacts, opportunités, factures, lignes, paiements) envoient entreprise_id. Elles sont centralisées dans ClientsContext.jsx, OpportunitesContext.jsx et FacturesContext.jsx. Les lectures s'appuient sur la RLS, sans filtre redondant inutile.
4. Expose le rôle courant pour masquer les actions interdites (ex. suppression réservée à admin et manager).
5. Messages d'erreur clairs en français si une action est refusée par la RLS.
6. Aucune nouvelle dépendance.
7. Affiche le vrai nom de l'utilisateur dans Layout.jsx (avatar, initiales, « Bonjour … », lignes 152-158 et 226) à partir de profiles.nom, à la place de « Camille Lambert » codé en dur. Si le profil n'existe pas encore, crée-le à la première connexion (insertion avec id = auth.uid()) ; à défaut de nom, affiche la partie de l'e-mail avant le @. Le libellé « Plan Pro · Commercial » doit refléter le rôle réel issu de memberships.

Commence par lister les fichiers que tu vas toucher et ton plan, puis attends mon go.

Avant de livrer : npm run build passe ; aucune insertion sans entreprise_id (montre-moi la recherche que tu as faite pour le prouver) ; plus aucune occurrence de « Camille » dans src/ hors code mort ; parcours de test manuel détaillé : connexion → onboarding → création client → création facture. Termine par le tableau Vérifié / Non vérifié / À tester par Beros.
```

---

## Prompt 3 — Données de démonstration et test à deux comptes

```markdown
Lis CLAUDE.md.

Objectif de l'étape : pouvoir démontrer l'application et prouver l'isolation en conditions réelles.

Tâche :
1. Écris supabase/seed.sql, rejouable : une entreprise de démonstration rattachée à un utilisateur dont je fournis l'id dans une variable en tête de fichier ; 15 clients répartis sur plusieurs secteurs ; 10 opportunités réparties sur les étapes ; 12 factures sur les 12 derniers mois (statuts variés) avec lignes et paiements. Montants réalistes pour une PME française, TVA 20 % et 10 %.
2. Explique-moi où trouver l'id de mon utilisateur dans Supabase (Authentication → Users) et où le coller dans le fichier.
3. Donne-moi une procédure de test manuelle avec deux comptes dans deux entreprises : ce que je dois créer, ce que chaque compte doit voir et ne pas voir.

Vérifie que les totaux HT/TVA/TTC du seed sont cohérents (montre le calcul pour 2 factures) et que le script ne contient aucun id d'un autre environnement. Termine par le tableau Vérifié / Non vérifié / À tester par Beros.
```

---

## Prompt 4 — Tableau de bord 100 % réel (après le prompt 3)

```markdown
Lis CLAUDE.md. Le seed de démonstration est chargé.

Objectif de l'étape : un tableau de bord 100 % réel, sans aucune donnée fictive.

Tâche :
1. Remplace les données codées en dur de Dashboard.jsx (lignes 18-45 et 221-235) par des calculs à partir de Supabase : CA mensuel sur la période choisie (30 jours, 6 mois, 12 mois), nouveaux clients et variation réelle par rapport à la période précédente, répartition par secteur, activités récentes issues de audit_events.
2. Si une donnée est vide, affiche un état vide explicite (« Aucune facture sur la période »), jamais un chiffre inventé.
3. Calculs déterministes, arrondis au centime, centralisés dans un fichier utilitaire testable.
4. Supprime le code mort de data/ (clients.js, clientActivity.js et les tableaux inutilisés de opportunites.js), en conservant les constantes encore importées (statuts, libellés, TVA, étapes). Prouve-moi par une recherche que plus rien n'importe ce que tu supprimes.
5. Aucune nouvelle dépendance.

Présente ton plan et attends mon go.

Avant de livrer : npm run build passe ; tableau de bord testé base vide puis avec le seed ; explique comment tu as vérifié un chiffre (par exemple le CA d'un mois) contre les données du seed. Termine par le tableau Vérifié / Non vérifié / À tester par Beros.
```

---

## Ouverture des sessions suivantes

À chaque nouvelle session Claude Code, commencez par :

```markdown
Lis CLAUDE.md. Étape en cours : [numéro et nom du prompt]. Rappelle-moi où on en est, présente ton plan et attends mon go.
```

## Étapes suivantes (prompts à rédiger le moment venu)

1. i18n FR/EN — nécessite react-i18next : Claude Code doit d'abord demander votre accord.
2. Gestion des membres et invitations (écran admin, e-mail d'invitation plus tard).
3. Catalogue produits/services.
4. Devis et conversion devis → facture.
5. Numérotation légale et verrouillage des factures finalisées, avoirs.
6. Tâches et activités.
7. Import CSV/XLSX avec prévisualisation.
