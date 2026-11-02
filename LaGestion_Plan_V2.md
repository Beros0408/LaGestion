# LaGestion — Plan V2, migration multi-tenant et prompts Claude Code

31 octobre 2026 · Beros

## 1\. Analyse : existant et exigences V2

Le MVP actuel couvre environ 40 % du socle CRM de la V2 ; il manque surtout le multi-tenant réel, les devis, le catalogue et les rôles.

|Exigence V2|État au 31/10/2026|Écart|
|-|-|-|
|Clients, contacts, SIREN/SIRET, doublons (FR-002)|Fait, détection graduée|Consentements, pièces jointes, historique|
|Opportunités, pipeline (FR-004)|Kanban fait|Étapes et pipelines non configurables|
|Factures, TVA, paiements, PDF/Excel (FR-007, FR-008)|En grande partie fait|Devis, avoirs, acomptes, numérotation légale, verrouillage|
|Tableau de bord (FR-010)|Version de base|Filtres, marges, encours par rôle|
|Multi-tenant et RLS (FR-001, section 25)|RLS « tout utilisateur connecté voit tout »|Isolation par entreprise, rôles, tests anti-fuite|
|Catalogue produits/services (FR-006)|Absent|À créer|
|Activités et tâches (FR-005)|Absent|À créer|
|Import CSV/XLSX (FR-003)|Absent|À créer|
|i18n FR/EN (section 24)|Absent|À poser dès la fondation|
|Audit des actions sensibles (section 10)|Absent|À créer avec la migration 002|
|IWa (section 22)|Panneau d'aperçu statique|Tout le moteur|
|Module BTP (sections 5 et 23)|Absent|Phase F|

La base Supabase a été recréée vide le 31/10/2026 (projet `lagestion`, eu-north-1) : c'est le moment le moins coûteux pour passer au multi-tenant.

## 2\. Décisions à arbitrer avant de coder

Quatre choix conditionnent tout le reste ; mes recommandations servent de valeur par défaut dans les prompts.

|Sujet|V2 demande|Recommandation|Raison|
|-|-|-|-|
|Framework frontend|Next.js|Garder React + Vite|Vite se déploie sur Vercel ; migrer coûte des semaines sans gain utilisateur|
|Backend Python|FastAPI|Supabase Edge Functions d'abord|Suffisant pour PDF, relances et IWa v1 ; FastAPI quand une file de tâches deviendra nécessaire|
|Palette|Bleu #489AF0 + gris|À trancher|Contredit le design system figé (#2D5B7F) inscrit dans CLAUDE.md|
|Nom de la clé tenant|tenant\_id|Garder entreprise\_id|Déjà présent dans le schéma et le code|

À décider plus tard : prestataire e-mail (Resend ou Brevo), plateforme de facturation électronique agréée, fournisseur LLM pour IWa, signature électronique.

## 3\. Feuille de route priorisée

On ne passe à l'étape suivante qu'une fois la précédente vérifiée et commitée.

1. **Fondation** — migration multi-tenant, memberships, rôles, audit, création d'entreprise à l'inscription, i18n FR/EN, tests anti-fuite.
2. **MVP commercial** — catalogue, devis et conversion en facture, avoirs, acomptes, numérotation sans trou, facture finalisée non modifiable, tâches et activités, import CSV/XLSX, relances assistées.
3. **Personnalisation** — modules activables, champs personnalisés, pipelines configurables, modèles de documents.
4. **IWa** — brouillons, anomalies par règles déterministes, suggestions validées par l'utilisateur, quotas et coûts journalisés.
5. **BTP** — chantiers, devis par lots, budgets, situations de travaux, sous-traitants, réserves.
6. **Industrialisation** — Stripe Billing, e-mails transactionnels, Sentry, environnements dev/prod séparés, Supabase payant, pages légales, facturation électronique via plateforme agréée, site vitrine.

Hors V2 mais nécessaire à un SaaS professionnel : abonnements Stripe, e-mails transactionnels, pages légales, supervision et plan Supabase payant pour éviter toute mise en pause.

## 4\. Cadre de travail pour Claude Code

Ce bloc s'ajoute en tête de `CLAUDE.md` : Claude Code le relit à chaque session, il n'est donc plus nécessaire de le répéter dans chaque prompt.

```markdown
# Règles de travail — LaGestion

## Objectif
Construire LaGestion, un SaaS CRM multi-entreprises pour TPE/PME françaises (2 à 50 personnes) :
clients, prospects, pipeline, devis, factures, paiements, tableau de bord, puis IWa (agent IA) et module BTP.
Référence fonctionnelle : docs/LaGestion\_Cahier\_des\_charges\_V2.md.

## Contexte
- Développeur solo, Windows, projet dans C:\\Users\\bkabe\\Desktop\\LaGestion\_CRM-projet\\lagestion-dashboard
- Stack : React 18 + Vite + Tailwind + React Router + Recharts + lucide-react + Supabase (Auth, Postgres, Storage)
- Déploiement prévu : Vercel (frontend) + Supabase
- Clé d'isolation : entreprise\_id sur toute donnée métier ; RLS par appartenance (table memberships)
- Schéma : supabase/schema.sql (base) + supabase/migrations/NNN\_nom.sql (évolutions, numérotées)

## Contraintes
- Aucune nouvelle dépendance npm sans mon accord explicite. Si une librairie semble utile, propose-la et attends.
- Pas de Framer Motion : animations en CSS uniquement. Graphiques : Recharts uniquement.
- Respecte le design system décrit plus bas dans ce fichier ; aucune couleur codée en dur hors des tokens.
- Jamais de clé service\_role côté navigateur. Seule la clé anon est dans .env (VITE\_).
- Toute requête de lecture ou d'écriture respecte entreprise\_id ; ne jamais contourner la RLS.
- Calculs financiers (HT, TVA, TTC, totaux) déterministes, arrondis au centime, jamais délégués à l'IA.
- Textes d'interface en français correct (accents, espaces insécables avant : ; ! ?), prêts pour l'i18n.
- Ne modifie jamais schema.sql pour une évolution : crée une migration numérotée.

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
1. `npm run build` passe sans erreur ni avertissement nouveau.
2. Relis ton diff fichier par fichier : rien d'inutile, aucun console.log oublié, aucun secret.
3. Les imports et chemins existent ; aucune dépendance ajoutée.
4. Pour du SQL : idempotent quand c'est possible, cohérent avec schema.sql, RLS active sur chaque nouvelle table.
5. Donne-moi les étapes de test manuel précises (URL, clics, résultat attendu).
6. Termine par un tableau « Vérifié / Non vérifié / À tester par Beros ».
```

## 5\. Migration 002\_multitenant.sql

Cette migration isole chaque entreprise : un utilisateur ne voit que les données des entreprises dont il est membre, avec des droits selon son rôle.

Hypothèses à faire vérifier par Claude Code (prompt 1) avant exécution :

* la base est vide (sinon `set not null` échoue) ;
* les tables portent les noms du schéma actuel et leurs `id` sont des `uuid` ;
* `profiles.id` = `auth.users.id` ; `entreprises` a les colonnes `nom` et `siret` ; `clients` a `email` et `siren` ; `factures` a `numero`.

```sql
-- 002\_multitenant.sql — LaGestion
-- Isolation par entreprise, rôles, invitations, audit.
-- Prérequis : base vide. Rejouable sans erreur.

begin;

-- 1. Rôles
do $$ begin
  create type public.app\_role as enum ('admin','manager','commercial','comptable','lecture');
exception when duplicate\_object then null; end $$;

-- 2. Appartenances utilisateur <-> entreprise
create table if not exists public.memberships (
  id uuid primary key default gen\_random\_uuid(),
  entreprise\_id uuid not null references public.entreprises(id) on delete cascade,
  user\_id uuid not null references auth.users(id) on delete cascade,
  role public.app\_role not null default 'lecture',
  created\_at timestamptz not null default now(),
  unique (entreprise\_id, user\_id)
);
create index if not exists memberships\_user\_idx on public.memberships(user\_id);

-- 3. Invitations
create table if not exists public.invitations (
  id uuid primary key default gen\_random\_uuid(),
  entreprise\_id uuid not null references public.entreprises(id) on delete cascade,
  email text not null,
  role public.app\_role not null default 'lecture',
  token uuid not null unique default gen\_random\_uuid(),
  invited\_by uuid references auth.users(id) on delete set null,
  expires\_at timestamptz not null default now() + interval '7 days',
  accepted\_at timestamptz,
  created\_at timestamptz not null default now()
);
create unique index if not exists invitations\_en\_attente\_uniq
  on public.invitations(entreprise\_id, lower(email)) where accepted\_at is null;

-- 4. Journal d'audit
create table if not exists public.audit\_events (
  id bigint generated always as identity primary key,
  entreprise\_id uuid references public.entreprises(id) on delete cascade,
  user\_id uuid,
  action text not null,
  table\_name text not null,
  record\_id uuid,
  old\_data jsonb,
  new\_data jsonb,
  created\_at timestamptz not null default now()
);
create index if not exists audit\_events\_entreprise\_idx
  on public.audit\_events(entreprise\_id, created\_at desc);

-- 5. Fonctions d'autorisation (security definer : évite la récursion RLS)
create or replace function public.is\_member(e uuid) returns boolean
language sql stable security definer set search\_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise\_id = e and m.user\_id = auth.uid());
$$;

create or replace function public.has\_role(e uuid, roles public.app\_role\[]) returns boolean
language sql stable security definer set search\_path = public as $$
  select exists (select 1 from public.memberships m
                 where m.entreprise\_id = e and m.user\_id = auth.uid() and m.role = any(roles));
$$;

-- 6. entreprise\_id obligatoire sur les tables métier
do $$
declare t text;
begin
  foreach t in array array\['clients','contacts','opportunites','factures','lignes\_facture','paiements'] loop
    execute format('alter table public.%I add column if not exists entreprise\_id uuid references public.entreprises(id) on delete cascade', t);
    execute format('alter table public.%I alter column entreprise\_id set not null', t);
    execute format('create index if not exists %I on public.%I(entreprise\_id)', t || '\_entreprise\_idx', t);
  end loop;
end $$;

-- 7. Unicités par entreprise (et non plus globales)
do $$
declare r record;
begin
  for r in select conrelid::regclass::text as tbl, conname from pg\_constraint
           where conrelid in ('public.clients'::regclass, 'public.factures'::regclass) and contype = 'u' loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
  for r in select indexname from pg\_indexes
           where schemaname = 'public' and tablename in ('clients','factures')
             and indexdef ilike 'create unique index%' and indexname not like '%\_pkey' loop
    execute format('drop index if exists public.%I', r.indexname);
  end loop;
end $$;
create unique index if not exists clients\_entreprise\_email\_uniq
  on public.clients(entreprise\_id, lower(email)) where email is not null and email <> '';
create unique index if not exists clients\_entreprise\_siren\_uniq
  on public.clients(entreprise\_id, siren) where siren is not null and siren <> '';
create unique index if not exists factures\_entreprise\_numero\_uniq
  on public.factures(entreprise\_id, numero) where numero is not null;

-- 8. Création d'entreprise : l'auteur devient admin
create or replace function public.create\_entreprise(p\_nom text, p\_siret text default null)
returns uuid language plpgsql security definer set search\_path = public as $$
declare v\_id uuid;
begin
  if auth.uid() is null then raise exception 'Non authentifié'; end if;
  insert into public.entreprises(nom, siret) values (p\_nom, p\_siret) returning id into v\_id;
  insert into public.memberships(entreprise\_id, user\_id, role) values (v\_id, auth.uid(), 'admin');
  return v\_id;
end $$;
revoke all on function public.create\_entreprise(text, text) from public, anon;
grant execute on function public.create\_entreprise(text, text) to authenticated;

-- 9. Acceptation d'une invitation
create or replace function public.accept\_invitation(p\_token uuid)
returns uuid language plpgsql security definer set search\_path = public as $$
declare inv public.invitations; v\_email text;
begin
  select email into v\_email from auth.users where id = auth.uid();
  select \* into inv from public.invitations
   where token = p\_token and accepted\_at is null and expires\_at > now();
  if inv.id is null then raise exception 'Invitation invalide ou expirée'; end if;
  if lower(inv.email) <> lower(v\_email) then raise exception 'Invitation destinée à une autre adresse'; end if;
  insert into public.memberships(entreprise\_id, user\_id, role)
  values (inv.entreprise\_id, auth.uid(), inv.role)
  on conflict (entreprise\_id, user\_id) do update set role = excluded.role;
  update public.invitations set accepted\_at = now() where id = inv.id;
  return inv.entreprise\_id;
end $$;
revoke all on function public.accept\_invitation(uuid) from public, anon;
grant execute on function public.accept\_invitation(uuid) to authenticated;

-- 10. Audit automatique
create or replace function public.audit\_trigger() returns trigger
language plpgsql security definer set search\_path = public as $$
declare v\_row jsonb := case when tg\_op = 'DELETE' then to\_jsonb(old) else to\_jsonb(new) end;
begin
  insert into public.audit\_events(entreprise\_id, user\_id, action, table\_name, record\_id, old\_data, new\_data)
  values ((v\_row->>'entreprise\_id')::uuid, auth.uid(), lower(tg\_op), tg\_table\_name, (v\_row->>'id')::uuid,
          case when tg\_op in ('UPDATE','DELETE') then to\_jsonb(old) end,
          case when tg\_op in ('INSERT','UPDATE') then to\_jsonb(new) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array\['clients','opportunites','factures','paiements'] loop
    execute format('drop trigger if exists audit\_%I on public.%I', t, t);
    execute format('create trigger audit\_%I after insert or update or delete on public.%I for each row execute function public.audit\_trigger()', t, t);
  end loop;
end $$;

-- 11. RLS : suppression de toutes les anciennes politiques
do $$
declare r record;
begin
  for r in select policyname, tablename from pg\_policies
           where schemaname = 'public'
             and tablename in ('entreprises','profiles','clients','contacts','opportunites','factures',
                               'lignes\_facture','paiements','memberships','invitations','audit\_events') loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 12. RLS : tables métier (lecture = membres ; écriture = rôles actifs ; suppression = admin/manager)
do $$
declare t text;
begin
  foreach t in array array\['clients','contacts','opportunites','factures','lignes\_facture','paiements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lecture\_membres on public.%I for select to authenticated using (public.is\_member(entreprise\_id))', t);
    execute format('create policy creation\_equipe on public.%I for insert to authenticated with check (public.has\_role(entreprise\_id, array\[''admin'',''manager'',''commercial'',''comptable'']::public.app\_role\[]))', t);
    execute format('create policy modification\_equipe on public.%I for update to authenticated using (public.has\_role(entreprise\_id, array\[''admin'',''manager'',''commercial'',''comptable'']::public.app\_role\[])) with check (public.has\_role(entreprise\_id, array\[''admin'',''manager'',''commercial'',''comptable'']::public.app\_role\[]))', t);
    execute format('create policy suppression\_direction on public.%I for delete to authenticated using (public.has\_role(entreprise\_id, array\[''admin'',''manager'']::public.app\_role\[]))', t);
  end loop;
end $$;

-- 13. RLS : entreprises (création uniquement via create\_entreprise)
alter table public.entreprises enable row level security;
create policy lecture\_membres on public.entreprises for select to authenticated
  using (public.is\_member(id));
create policy modification\_admin on public.entreprises for update to authenticated
  using (public.has\_role(id, array\['admin']::public.app\_role\[]))
  with check (public.has\_role(id, array\['admin']::public.app\_role\[]));

-- 14. RLS : profils (soi-même + collègues)
alter table public.profiles enable row level security;
create policy lecture\_profils on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.memberships m1
    join public.memberships m2 on m1.entreprise\_id = m2.entreprise\_id
    where m1.user\_id = auth.uid() and m2.user\_id = profiles.id));
create policy creation\_profil on public.profiles for insert to authenticated with check (id = auth.uid());
create policy modification\_profil on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- 15. RLS : appartenances, invitations, audit (gérés par l'admin)
alter table public.memberships enable row level security;
create policy lecture\_membres on public.memberships for select to authenticated
  using (public.is\_member(entreprise\_id));
create policy gestion\_admin\_insert on public.memberships for insert to authenticated
  with check (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]));
create policy gestion\_admin\_update on public.memberships for update to authenticated
  using (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]))
  with check (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]));
create policy gestion\_admin\_delete on public.memberships for delete to authenticated
  using (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]));

alter table public.invitations enable row level security;
create policy gestion\_admin on public.invitations for all to authenticated
  using (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]))
  with check (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]));

alter table public.audit\_events enable row level security;
create policy lecture\_admin on public.audit\_events for select to authenticated
  using (public.has\_role(entreprise\_id, array\['admin']::public.app\_role\[]));

-- 16. Les vues appliquent la RLS de l'utilisateur (sinon elles contournent l'isolation)
do $$
declare v record;
begin
  for v in select table\_name from information\_schema.views where table\_schema = 'public' loop
    execute format('alter view public.%I set (security\_invoker = on)', v.table\_name);
  end loop;
end $$;

commit;
```

Point d'attention : rien n'empêche encore le dernier admin de se retirer lui-même ; à traiter lors de l'écran de gestion des membres.

## 6\. Prompts Claude Code, étape par étape

Collez un prompt à la fois, validez le plan proposé, testez, commitez, puis passez au suivant.

### Prompt 0 — Mise en place du cadre (aucun code)

```markdown
Lis CLAUDE.md en entier.

Tâche :
1. Crée le dossier docs/ à la racine du projet et place-y LaGestion\_Cahier\_des\_charges\_V2.md (je te le fournis ci-dessous).
2. Ajoute en tête de CLAUDE.md la section « Règles de travail — LaGestion » ci-dessous, sans supprimer le design system existant.
3. Ajoute une section « Décisions V2 » avec : frontend React + Vite conservé (pas de Next.js pour l'instant) ; Supabase Edge Functions avant FastAPI ; clé tenant = entreprise\_id ; palette : \[À COMPLÉTER].
4. Ne touche à aucun fichier de code.

Vérifie point par point : CLAUDE.md est lisible, aucune section existante perdue, docs/ contient le cahier des charges. Montre-moi le diff de CLAUDE.md, propose un message de commit et arrête-toi.

\[coller ici le bloc « Règles de travail » de la section 4]
\[coller ici le cahier des charges V2]
```

### Prompt 1 — Migration multi-tenant (SQL uniquement)

```markdown
Lis CLAUDE.md, puis supabase/schema.sql en entier.

Objectif de l'étape : isoler les données par entreprise (memberships, rôles, invitations, audit, RLS).
Je te fournis ci-dessous un brouillon de migration 002\_multitenant.sql.

Tâche :
1. Compare le brouillon avec schema.sql : noms de tables et colonnes (nom, siret, email, siren, numero), types des id, colonnes NOT NULL sans défaut dans entreprises, nom exact de la vue des totaux, index uniques existants.
2. Liste chaque écart trouvé dans un tableau (élément / brouillon / schema.sql / correction).
3. Attends mon go, puis écris supabase/migrations/002\_multitenant.sql corrigé. Ne modifie pas schema.sql.
4. Écris supabase/tests/002\_isolation.sql : crée deux utilisateurs fictifs A et B dans deux entreprises, simule chacun avec set local role authenticated et set local request.jwt.claims, et vérifie que A ne voit, ne modifie ni ne supprime aucune ligne de B (clients, factures, memberships, audit\_events). Le script se termine par rollback.
5. N'exécute rien sur la base : c'est moi qui lancerai les scripts dans le SQL Editor.

Avant de livrer, vérifie point par point : chaque table métier a RLS + 4 politiques ; aucune politique « tout utilisateur authentifié » ne subsiste ; les fonctions security definer ont search\_path fixé ; la migration est rejouable. Termine par le tableau Vérifié / Non vérifié / À tester par Beros.

Les tables utilisent la suppression logique (deleted\_at). Les index uniques par entreprise

(email, siren, numero) doivent ignorer les lignes supprimées : ajoute "and deleted\_at is null"

à leur clause where, si la colonne existe dans la table concernée.

\[coller ici le SQL de la section 5]
```

**Ensuite, de votre côté :** exécutez la migration dans le SQL Editor, puis le script de test. Rapportez le résultat à Claude Code avant le prompt 2.

### Prompt 2 — Entreprise courante dans l'application

```markdown
Lis CLAUDE.md. La migration 002 est appliquée et les tests d'isolation passent.

Objectif de l'étape : que l'application fonctionne avec l'isolation par entreprise.

Tâche :
1. Crée un contexte React EntrepriseContext : après connexion, charge les memberships de l'utilisateur (entreprise + rôle) ; mémorise l'entreprise courante.
2. Si l'utilisateur n'a aucune entreprise : page /onboarding « Créer mon entreprise » (nom obligatoire, SIRET facultatif à 14 chiffres) qui appelle supabase.rpc('create\_entreprise'), puis redirige vers le tableau de bord.
3. Toutes les créations (clients, contacts, opportunités, factures, lignes, paiements) envoient entreprise\_id. Les lectures s'appuient sur la RLS, sans filtre redondant inutile.
4. Expose le rôle courant pour masquer les actions interdites (ex. suppression réservée à admin et manager).
5. Messages d'erreur clairs en français si une action est refusée par la RLS.
6. Aucune nouvelle dépendance.

Commence par lister les fichiers qui insèrent des données et ton plan, puis attends mon go.
Avant de livrer : npm run build passe ; aucune insertion sans entreprise\_id (montre-moi la recherche que tu as faite pour le prouver) ; parcours de test manuel détaillé : inscription → onboarding → création client → création facture.
```
7. Affiche le vrai nom de l'utilisateur dans Layout.jsx (avatar, initiales, « Bonjour … ») à partir

&#x20;  de profiles.nom. Si le profil n'existe pas encore, crée-le à la première connexion

&#x20;  (insertion avec id = auth.uid()) ; à défaut de nom, affiche la partie de l'e-mail avant le @.

&#x20;  Le libellé « Plan Pro · Commercial » doit refléter le rôle réel issu de memberships.

Prompt 2 bis   ( A LANCER APRES LE PROMPT 3 )
=============================================
Lis CLAUDE.md.



Objectif de l'étape : un tableau de bord 100 % réel, sans aucune donnée fictive.



Tâche :

1\. Remplace les données codées en dur de Dashboard.jsx (lignes 18-45 et 221-235) par des calculs

&#x20;  à partir de Supabase : CA mensuel sur la période choisie (30 jours, 6 mois, 12 mois),

&#x20;  nouveaux clients et variation réelle par rapport à la période précédente, répartition par secteur,

&#x20;  activités récentes issues de audit\_events.

2\. Si une donnée est vide, affiche un état vide explicite (« Aucune facture sur la période »),

&#x20;  jamais un chiffre inventé.

3\. Calculs déterministes, arrondis au centime, centralisés dans un fichier utilitaire testable.

4\. Supprime le code mort de data/ (clients.js, clientActivity.js et les tableaux inutilisés),

&#x20;  en conservant les constantes encore importées. Prouve-moi par une recherche que plus rien

&#x20;  n'importe ce que tu supprimes.

5\. Aucune nouvelle dépendance.



Présente ton plan et attends mon go.

Avant de livrer : npm run build passe ; tableau de bord testé base vide puis avec seed ;

tableau Vérifié / Non vérifié / À tester par Beros.




### Prompt 3 — Données de démonstration et test à deux comptes

```markdown
Lis CLAUDE.md.

Objectif de l'étape : pouvoir démontrer l'application et prouver l'isolation en conditions réelles.

Tâche :
1. Écris supabase/seed.sql, rejouable : une entreprise de démonstration rattachée à un utilisateur dont je fournis l'id en variable en tête de fichier, 15 clients, 10 opportunités réparties sur les étapes, 12 factures (statuts variés) avec lignes et paiements. Montants réalistes pour une PME française, TVA 20 % et 10 %.
2. Donne-moi une procédure de test manuelle avec deux comptes dans deux entreprises : ce que je dois créer, ce que chaque compte doit voir et ne pas voir.

Vérifie que les totaux HT/TVA/TTC du seed sont cohérents (montre le calcul pour 2 factures) et que le script ne contient aucun id d'un autre environnement.
```

### Prompts suivants (à détailler le moment venu)

1. i18n FR/EN — nécessite react-i18next : Claude Code doit d'abord demander votre accord.
2. Gestion des membres et invitations (écran admin, e-mail d'invitation plus tard).
3. Catalogue produits/services.
4. Devis et conversion devis → facture.
5. Numérotation légale et verrouillage des factures finalisées, avoirs.
6. Tâches et activités.
7. Import CSV/XLSX avec prévisualisation.

Pour chaque nouvelle session, ouvrez avec : « Lis CLAUDE.md. Étape en cours : \[nom]. Présente ton plan et attends mon go. »

