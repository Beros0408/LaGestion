-- 007_devis.sql — Lagestion
-- Devis et conversion devis → facture (FR-007).
--   - tables devis et lignes_devis, mêmes règles que les tables métier de 002, 003 et 006 :
--     RLS, entreprise figée, audit, suppression logique réservée aux admin et manager ;
--   - numéro DEV-AAAA-NNNN attribué en base, unique par entreprise, jamais réutilisé
--     (seul le préfixe DEV-DEMO- peut être fourni : données de démonstration, hors compteur) ;
--   - statuts : un devis naît brouillon ; transitions contrôlées en base (verifier_devis) ;
--   - devis accepté verrouillé (en-tête et lignes) : seuls admin et manager le font sortir de ce statut ;
--   - devis converti : plus aucune modification ni suppression ;
--   - factures.devis_id : lien facultatif avec le devis d'origine, une seule facture par devis ;
--   - vue devis_totaux : même règle de calcul que factures_totaux (migration 005) ;
--   - convertir_devis : conversion dans une seule transaction, RLS appliquée à l'appelant.
-- Comme verifier_suppression_logique (003), les règles de statut ne s'appliquent qu'à un utilisateur
-- authentifié : le SQL Editor (rôle postgres, seed) reste libre.
-- S'applique après 006_catalogue.sql. Rejouable sans erreur.

begin;

-- 1. Tables
create table if not exists public.devis (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  numero text not null,
  date_emission date not null default current_date,
  date_validite date not null default (current_date + 30),
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'converti')),
  remise numeric(12,2) not null default 0 check (remise >= 0),
  notes_internes text,
  message_client text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint devis_validite_apres_emission check (date_validite >= date_emission)
);

create table if not exists public.lignes_devis (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  devis_id uuid not null references public.devis(id) on delete cascade,
  description text not null,
  reference text,
  unite text,
  quantite numeric(12,2) not null default 1 check (quantite > 0),
  prix_unitaire numeric(12,2) not null default 0 check (prix_unitaire >= 0),
  taux_tva numeric(4,2) not null default 20 check (taux_tva >= 0),
  remise numeric(12,2) not null default 0 check (remise >= 0),
  position integer not null default 0,
  produit_id uuid references public.produits(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.devis, public.lignes_devis to authenticated;

create index if not exists idx_devis_entreprise on public.devis(entreprise_id) where deleted_at is null;
create index if not exists idx_devis_client on public.devis(client_id);
create index if not exists idx_devis_statut on public.devis(statut) where deleted_at is null;
create index if not exists idx_lignes_devis on public.lignes_devis(devis_id);
create index if not exists idx_lignes_devis_produit on public.lignes_devis(produit_id) where produit_id is not null;
-- Sans filtre sur deleted_at : un numéro reste pris après suppression logique
create unique index if not exists uniq_devis_numero on public.devis (entreprise_id, numero);

-- 2. Numérotation : verrou par entreprise jusqu'à la fin de la transaction, devis supprimés compris
create or replace function public.prochain_numero_devis(p_entreprise uuid) returns text
language plpgsql set search_path = public as $$
declare
  v_prefixe constant text := 'DEV-' || to_char(current_date, 'YYYY') || '-';
  v_max bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('devis:' || p_entreprise::text, 0));
  select coalesce(max(substring(numero from length(v_prefixe) + 1)::bigint), 0) into v_max
    from public.devis
   where entreprise_id = p_entreprise and numero ~ ('^' || v_prefixe || '[0-9]+$');
  return v_prefixe || lpad((v_max + 1)::text, 4, '0');
end $$;
revoke all on function public.prochain_numero_devis(uuid) from public, anon;
grant execute on function public.prochain_numero_devis(uuid) to authenticated;

-- 3. Règles du devis : numéro, statut, verrouillage
create or replace function public.verifier_devis() returns trigger
language plpgsql set search_path = public as $$
declare
  v_contenu_modifie boolean;
begin
  if tg_op = 'DELETE' then
    if old.statut = 'converti' and auth.uid() is not null then
      raise exception 'Un devis converti ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.numero is null or new.numero not like 'DEV-DEMO-%' then
      new.numero := public.prochain_numero_devis(new.entreprise_id);
    end if;
    if auth.uid() is not null and new.statut <> 'brouillon' then
      raise exception 'Un nouveau devis commence toujours au statut brouillon.';
    end if;
    return new;
  end if;

  if new.numero is distinct from old.numero then
    raise exception 'Le numéro d''un devis ne peut pas être modifié.';
  end if;

  if auth.uid() is null then
    return new;
  end if;

  if old.statut = 'converti' then
    raise exception 'Un devis converti ne peut plus être modifié ni supprimé.';
  end if;

  v_contenu_modifie := new.client_id is distinct from old.client_id
    or new.date_emission is distinct from old.date_emission
    or new.date_validite is distinct from old.date_validite
    or new.remise is distinct from old.remise
    or new.notes_internes is distinct from old.notes_internes
    or new.message_client is distinct from old.message_client;
  if old.statut = 'accepte' and v_contenu_modifie then
    raise exception 'Un devis accepté ne peut plus être modifié. Un administrateur ou un manager doit d''abord le repasser en envoyé.';
  end if;

  if new.statut is distinct from old.statut then
    if not (
      (old.statut = 'brouillon' and new.statut = 'envoye')
      or (old.statut = 'envoye' and new.statut in ('accepte', 'refuse', 'expire', 'brouillon'))
      or (old.statut = 'accepte' and new.statut in ('envoye', 'refuse', 'converti'))
      or (old.statut = 'refuse' and new.statut = 'brouillon')
      or (old.statut = 'expire' and new.statut in ('brouillon', 'envoye'))
    ) then
      raise exception 'Ce changement de statut n''est pas autorisé.';
    end if;

    if new.statut = 'accepte' and new.date_validite < current_date then
      raise exception 'La date de validité de ce devis est dépassée. Prolongez-la avant de l''accepter.';
    end if;

    if new.statut = 'converti'
       and not exists (select 1 from public.factures f where f.devis_id = new.id) then
      raise exception 'Le statut converti est attribué uniquement par la transformation en facture.';
    end if;

    -- Sortir du verrouillage (y compris vers refusé, qui mènerait à brouillon) : direction uniquement
    if old.statut = 'accepte' and new.statut <> 'converti'
       and not public.has_role(new.entreprise_id, '{admin,manager}'::public.app_role[]) then
      raise exception 'Seul un administrateur ou un manager peut modifier le statut d''un devis accepté.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end $$;

-- 4. Lignes d'un devis accepté ou converti : aucune écriture
create or replace function public.verifier_ligne_devis() returns trigger
language plpgsql set search_path = public as $$
declare
  v_statut text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select statut into v_statut from public.devis
   where id = case when tg_op = 'DELETE' then old.devis_id else new.devis_id end;
  if v_statut in ('accepte', 'converti') then
    raise exception 'Les lignes d''un devis % ne peuvent plus être modifiées.',
      case when v_statut = 'accepte' then 'accepté' else 'converti' end;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

-- 5. Triggers : updated_at, entreprise figée et cohérente, suppression logique, audit, règles du devis
drop trigger if exists trg_devis_updated on public.devis;
create trigger trg_devis_updated before update on public.devis
  for each row execute function public.set_updated_at();

drop trigger if exists trg_devis_entreprise on public.devis;
create trigger trg_devis_entreprise before insert or update on public.devis
  for each row execute function public.verifier_entreprise('clients', 'client_id');

drop trigger if exists trg_devis_suppression_logique on public.devis;
create trigger trg_devis_suppression_logique before update on public.devis
  for each row execute function public.verifier_suppression_logique();

drop trigger if exists trg_devis_regles on public.devis;
create trigger trg_devis_regles before insert or update or delete on public.devis
  for each row execute function public.verifier_devis();

drop trigger if exists audit_devis on public.devis;
create trigger audit_devis after insert or update or delete on public.devis
  for each row execute function public.audit_trigger();

drop trigger if exists trg_lignes_devis_entreprise on public.lignes_devis;
create trigger trg_lignes_devis_entreprise before insert or update on public.lignes_devis
  for each row execute function public.verifier_entreprise('devis', 'devis_id');

drop trigger if exists trg_lignes_devis_produit on public.lignes_devis;
create trigger trg_lignes_devis_produit before insert or update of produit_id, entreprise_id on public.lignes_devis
  for each row when (new.produit_id is not null)
  execute function public.verifier_entreprise('produits', 'produit_id');

drop trigger if exists trg_lignes_devis_regles on public.lignes_devis;
create trigger trg_lignes_devis_regles before insert or update or delete on public.lignes_devis
  for each row execute function public.verifier_ligne_devis();

drop trigger if exists audit_lignes_devis on public.lignes_devis;
create trigger audit_lignes_devis after insert or update or delete on public.lignes_devis
  for each row execute function public.audit_trigger();

-- 6. RLS
alter table public.devis enable row level security;
drop policy if exists lecture_membres on public.devis;
drop policy if exists creation_equipe on public.devis;
drop policy if exists modification_equipe on public.devis;
drop policy if exists suppression_direction on public.devis;
create policy lecture_membres on public.devis for select to authenticated
  using (public.is_member(entreprise_id));
create policy creation_equipe on public.devis for insert to authenticated
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy modification_equipe on public.devis for update to authenticated
  using (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]))
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy suppression_direction on public.devis for delete to authenticated
  using (public.has_role(entreprise_id, '{admin,manager}'::public.app_role[]));

-- Comme lignes_facture (003) : la modification d'un devis supprime puis réinsère ses lignes
alter table public.lignes_devis enable row level security;
drop policy if exists lecture_membres on public.lignes_devis;
drop policy if exists creation_equipe on public.lignes_devis;
drop policy if exists modification_equipe on public.lignes_devis;
drop policy if exists suppression_equipe on public.lignes_devis;
create policy lecture_membres on public.lignes_devis for select to authenticated
  using (public.is_member(entreprise_id));
create policy creation_equipe on public.lignes_devis for insert to authenticated
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy modification_equipe on public.lignes_devis for update to authenticated
  using (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]))
  with check (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));
create policy suppression_equipe on public.lignes_devis for delete to authenticated
  using (public.has_role(entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]));

-- 7. Lien facture → devis d'origine (même entreprise, une seule facture par devis)
alter table public.factures
  add column if not exists devis_id uuid references public.devis(id) on delete set null;
create unique index if not exists uniq_factures_devis on public.factures(devis_id)
  where devis_id is not null;

drop trigger if exists trg_factures_devis on public.factures;
create trigger trg_factures_devis before insert or update of devis_id, entreprise_id on public.factures
  for each row when (new.devis_id is not null)
  execute function public.verifier_entreprise('devis', 'devis_id');

-- 8. Totaux : même règle que public.factures_totaux (migration 005) et calculerTotaux (src/utils/facture.js)
create or replace view public.devis_totaux with (security_invoker = on) as
with lignes as (
  select l.devis_id, l.taux_tva,
    greatest(0, round(l.quantite * l.prix_unitaire, 2) - l.remise) * 100 as ht_c
  from public.lignes_devis l
),
bases as (
  select devis_id, taux_tva, sum(ht_c) as base_c
  from lignes group by devis_id, taux_tva
),
dev as (
  select d.id as devis_id,
    coalesce(sum(b.base_c), 0) as ht_brut_c,
    least(d.remise * 100, coalesce(sum(b.base_c), 0)) as remise_c
  from public.devis d
  left join bases b on b.devis_id = d.id
  group by d.id, d.remise
),
parts as (
  select b.devis_id, b.taux_tva, b.base_c, de.remise_c,
    case when de.ht_brut_c = 0 then 0 else div(de.remise_c * b.base_c, de.ht_brut_c) end as part_c,
    case when de.ht_brut_c = 0 then 0 else mod(de.remise_c * b.base_c, de.ht_brut_c) end as reste
  from bases b join dev de on de.devis_id = b.devis_id
),
rangs as (
  select p.*,
    row_number() over (partition by devis_id order by reste desc, taux_tva desc) as rang,
    remise_c - sum(part_c) over (partition by devis_id) as a_repartir
  from parts p
),
nettes as (
  select devis_id, taux_tva,
    base_c - part_c - case when rang <= a_repartir then 1 else 0 end as base_nette_c
  from rangs
),
tva as (
  select devis_id, sum(round(base_nette_c * taux_tva / 100)) as tva_c
  from nettes group by devis_id
)
select de.devis_id,
  round((de.ht_brut_c - de.remise_c) / 100, 2) as total_ht,
  round(coalesce(t.tva_c, 0) / 100, 2) as total_tva,
  round((de.ht_brut_c - de.remise_c + coalesce(t.tva_c, 0)) / 100, 2) as total_ttc,
  round(de.ht_brut_c / 100, 2) as total_ht_brut,
  round(de.remise_c / 100, 2) as remise_appliquee
from dev de
left join tva t on t.devis_id = de.devis_id;
grant select on public.devis_totaux to authenticated;

-- 9. Conversion : tout réussit ou rien. SECURITY INVOKER : la RLS et les triggers s'appliquent à l'appelant.
--    Le verrou FOR UPDATE fait attendre une conversion simultanée, qui échoue ensuite sur le statut.
create or replace function public.convertir_devis(p_devis_id uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_prefixe constant text := 'FAC-' || to_char(current_date, 'YYYY') || '-';
  v_max bigint;
  v_numero text;
  v_facture uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;

  select * into d from public.devis where id = p_devis_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if not public.has_role(d.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de transformer un devis en facture.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into d from public.devis where id = p_devis_id and deleted_at is null for update;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if d.statut = 'converti' then
    raise exception 'Ce devis a déjà été converti.';
  end if;
  if d.statut <> 'accepte' then
    raise exception 'Seul un devis accepté peut être transformé en facture.';
  end if;
  if not exists (select 1 from public.clients c where c.id = d.client_id and c.deleted_at is null) then
    raise exception 'Le client de ce devis a été supprimé : transformation impossible.';
  end if;
  if not exists (select 1 from public.lignes_devis l where l.devis_id = d.id) then
    raise exception 'Ce devis ne contient aucune ligne.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('factures:' || d.entreprise_id::text, 0));
  select coalesce(max(substring(numero from length(v_prefixe) + 1)::bigint), 0) into v_max
    from public.factures
   where entreprise_id = d.entreprise_id and numero ~ ('^' || v_prefixe || '[0-9]+$');
  v_numero := v_prefixe || lpad((v_max + 1)::text, 4, '0');

  insert into public.factures (entreprise_id, client_id, numero, date_emission, statut, remise, devis_id)
  values (d.entreprise_id, d.client_id, v_numero, current_date, 'brouillon', d.remise, d.id)
  returning id into v_facture;

  insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                     quantite, prix_unitaire, taux_tva, remise, position, produit_id)
  select l.entreprise_id, v_facture, l.description, l.reference, l.unite,
         l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
  from public.lignes_devis l
  where l.devis_id = d.id;

  update public.devis set statut = 'converti' where id = d.id;

  return v_facture;
end $$;
revoke all on function public.convertir_devis(uuid) from public, anon;
grant execute on function public.convertir_devis(uuid) to authenticated;

-- 10. Contrôles finaux
do $$
declare t text; n int;
begin
  foreach t in array array['devis', 'lignes_devis'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'Contrôle : RLS inactive sur public.%', t;
    end if;
    select count(*) into n from pg_policies where schemaname = 'public' and tablename = t;
    if n <> 4 then
      raise exception 'Contrôle : public.% a % politique(s) au lieu de 4', t, n;
    end if;
  end loop;

  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.devis'::regclass
     and tgname in ('trg_devis_updated', 'trg_devis_entreprise', 'trg_devis_suppression_logique',
                    'trg_devis_regles', 'audit_devis');
  if n <> 5 then
    raise exception 'Contrôle : % trigger(s) sur public.devis au lieu de 5', n;
  end if;
  select count(*) into n from pg_trigger
   where not tgisinternal and tgrelid = 'public.lignes_devis'::regclass
     and tgname in ('trg_lignes_devis_entreprise', 'trg_lignes_devis_produit',
                    'trg_lignes_devis_regles', 'audit_lignes_devis');
  if n <> 4 then
    raise exception 'Contrôle : % trigger(s) sur public.lignes_devis au lieu de 4', n;
  end if;
  if not exists (select 1 from pg_trigger where not tgisinternal
                 and tgrelid = 'public.factures'::regclass and tgname = 'trg_factures_devis') then
    raise exception 'Contrôle : trigger trg_factures_devis absent';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    cross join lateral pg_options_to_table(c.reloptions) o
    where ns.nspname = 'public' and c.relname = 'devis_totaux'
      and o.option_name = 'security_invoker' and lower(o.option_value) in ('on', 'true', '1', 'yes')
  ) then
    raise exception 'Contrôle : la vue public.devis_totaux n''est pas en security_invoker';
  end if;

  if (select prosecdef from pg_proc where oid = 'public.convertir_devis(uuid)'::regprocedure) then
    raise exception 'Contrôle : public.convertir_devis ne doit pas être en security definer';
  end if;
end $$;

-- 11. Supabase : nouvelles tables et fonction visibles immédiatement par l'API (cache de schéma)
notify pgrst, 'reload schema';

commit;
