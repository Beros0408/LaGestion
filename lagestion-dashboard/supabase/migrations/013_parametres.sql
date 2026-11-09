-- 013_parametres.sql — LaGestion
-- Paramètres de l'entreprise (étape 13, temps 1 ; SAAS-01 du PRD, CFG-001) :
--   - entreprises : identité juridique (forme, capital, immatriculation RCS / RM, TVA intracommunautaire),
--     options de TVA (franchise art. 293 B, option sur les débits), conditions de paiement par défaut
--     (pénalités de retard, escompte, délai de 0 à 60 jours, mode et conditions), assurance, IBAN ;
--     ces valeurs sont saisies ici, puis figées sur les documents à la finalisation (migration 014) ;
--   - délai de paiement de l'entreprise appliqué aux brouillons créés en base (conversion d'un devis, acompte),
--     à la place des 30 jours codés en 008 et 010 ; 30 jours par défaut : rien ne change sans paramétrage ;
--   - logo : bucket privé « logos » (PNG ou JPEG, 1 Mo au plus), un dossier par entreprise,
--     lecture par les membres, écriture par l'admin ; chemin rangé dans entreprises.logo_url ;
--   - audit des modifications de l'entreprise (lisible par l'admin).
-- Modification de l'entreprise : admin seul (politique modification_admin de 002, inchangée).
-- Aucune facture existante n'est modifiée. S'applique après 012_taches_activites.sql. Rejouable sans erreur.

begin;

-- 1. Colonnes de l'entreprise
alter table public.entreprises
  add column if not exists forme_juridique text,
  add column if not exists capital_social numeric(15,2),
  add column if not exists immatriculation_type text,
  add column if not exists immatriculation_lieu text,
  add column if not exists tva_intra text,
  add column if not exists franchise_tva boolean not null default false,
  add column if not exists option_debits boolean not null default false,
  add column if not exists penalites_mode text not null default 'bce_10',
  add column if not exists penalites_taux numeric(5,2),
  add column if not exists escompte text not null default 'Pas d''escompte pour paiement anticipé.',
  add column if not exists delai_paiement_jours integer not null default 30,
  add column if not exists mode_paiement text,
  add column if not exists conditions_paiement text,
  add column if not exists assurance_pro text,
  add column if not exists iban text;

-- Contrôles de forme (le fond, comme la clé de la TVA ou le SIRET, est vérifié dans le formulaire).
alter table public.entreprises
  drop constraint if exists entreprises_forme_juridique,
  drop constraint if exists entreprises_capital,
  drop constraint if exists entreprises_immatriculation,
  drop constraint if exists entreprises_tva_intra,
  drop constraint if exists entreprises_penalites,
  drop constraint if exists entreprises_delai,
  drop constraint if exists entreprises_mode_paiement,
  drop constraint if exists entreprises_iban;
alter table public.entreprises
  add constraint entreprises_forme_juridique check (forme_juridique is null or length(trim(forme_juridique)) between 1 and 60),
  add constraint entreprises_capital check (capital_social is null or capital_social >= 0),
  add constraint entreprises_immatriculation check (immatriculation_type is null or immatriculation_type in ('rcs', 'rm', 'dispense')),
  add constraint entreprises_tva_intra check (tva_intra is null or tva_intra ~ '^[A-Z]{2}[0-9A-Z]{2,13}$'),
  add constraint entreprises_penalites check (
    penalites_mode in ('bce_10', 'trois_interet_legal', 'taux_fixe')
    and (penalites_mode <> 'taux_fixe' or (penalites_taux is not null and penalites_taux > 0 and penalites_taux <= 100))),
  add constraint entreprises_delai check (delai_paiement_jours between 0 and 60),
  add constraint entreprises_mode_paiement check (mode_paiement is null or mode_paiement in ('virement', 'carte', 'cheque', 'especes', 'autre')),
  add constraint entreprises_iban check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');

comment on column public.entreprises.logo_url is
  'Chemin du logo dans le bucket privé logos ({entreprise_id}/logo-{horodatage}.png|jpg), jamais une URL publique.';

-- 2. Délai de paiement par défaut : lu dans l'entreprise du devis, sous la RLS de l'appelant (il en est membre).

-- 3. Acompte : reprend la migration 010 ; échéance au délai de l'entreprise, mode et conditions par défaut.
create or replace function public.creer_acompte(p_devis_id uuid, p_mode text, p_valeur numeric) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_ent public.entreprises;
  v_calc jsonb;
  v_jour date;
  v_acompte uuid;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into d from public.devis where id = p_devis_id and deleted_at is null;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if not public.has_role(d.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de créer un acompte.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into d from public.devis where id = p_devis_id and deleted_at is null for update;
  if not found then
    raise exception 'Ce devis est introuvable.';
  end if;
  if d.statut <> 'accepte' then
    raise exception 'Un acompte ne peut porter que sur un devis accepté.';
  end if;
  if not exists (select 1 from public.clients c where c.id = d.client_id and c.deleted_at is null) then
    raise exception 'Le client de ce devis a été supprimé : acompte impossible.';
  end if;

  v_calc := public.calculer_acompte(p_devis_id, p_mode, p_valeur);
  perform public.controler_plafond_acompte(p_devis_id, v_calc->'tva_detail', (v_calc->>'total_ttc')::numeric);

  select * into v_ent from public.entreprises where id = d.entreprise_id;
  v_jour := public.date_du_jour_paris();
  insert into public.factures (entreprise_id, client_id, type, devis_id, acompte_mode, acompte_valeur, date_emission, date_echeance,
                               mode_paiement, conditions_paiement)
  values (d.entreprise_id, d.client_id, 'acompte', d.id, p_mode, p_valeur, v_jour, v_jour + coalesce(v_ent.delai_paiement_jours, 30),
          v_ent.mode_paiement, v_ent.conditions_paiement)
  returning id into v_acompte;

  insert into public.lignes_facture (entreprise_id, facture_id, description, quantite, prix_unitaire, taux_tva, remise, position)
  select d.entreprise_id, v_acompte,
    case when p_mode = 'pourcentage'
      then 'Acompte de ' || replace(trim_scale(p_valeur)::text, '.', ',') || ' % sur le devis ' || d.numero
      else 'Acompte sur le devis ' || d.numero end
      || ' (TVA ' || replace(trim_scale((e->>'taux')::numeric)::text, '.', ',') || ' %)',
    1, (e->>'base')::numeric, (e->>'taux')::numeric, 0, (ordinality - 1)::integer
  from jsonb_array_elements(v_calc->'tva_detail') with ordinality as t(e, ordinality);

  return v_acompte;
end $$;
revoke all on function public.creer_acompte(uuid, text, numeric) from public, anon;
grant execute on function public.creer_acompte(uuid, text, numeric) to authenticated;

-- 4. Conversion : reprend la migration 010 ; échéance au délai de l'entreprise, mode et conditions par défaut.
create or replace function public.convertir_devis(p_devis_id uuid) returns uuid
language plpgsql set search_path = public as $$
declare
  d public.devis;
  v_ent public.entreprises;
  v_jour date;
  v_type text;
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
  if exists (select 1 from public.factures a where a.devis_id = d.id and a.type = 'acompte'
             and a.statut = 'brouillon' and a.deleted_at is null) then
    raise exception 'Un acompte de ce devis est encore en brouillon : finalisez-le ou supprimez-le.';
  end if;

  select * into v_ent from public.entreprises where id = d.entreprise_id;
  v_type := case when jsonb_array_length(public.acomptes_nets(d.id)) > 0 then 'solde' else 'facture' end;
  v_jour := public.date_du_jour_paris();
  insert into public.factures (entreprise_id, client_id, type, date_emission, date_echeance, statut, remise, devis_id, acomptes_deduits,
                               mode_paiement, conditions_paiement)
  values (d.entreprise_id, d.client_id, v_type, v_jour, v_jour + coalesce(v_ent.delai_paiement_jours, 30), 'brouillon', d.remise, d.id,
          case when v_type = 'solde' then '[]'::jsonb end, v_ent.mode_paiement, v_ent.conditions_paiement)
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

-- 5. Audit des modifications de l'entreprise (audit_trigger lit entreprise_id, absent ici : fonction dédiée)
create or replace function public.audit_entreprise() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events(entreprise_id, user_id, action, table_name, record_id, old_data, new_data)
  values (new.id, auth.uid(), 'update', 'entreprises', new.id, to_jsonb(old), to_jsonb(new));
  return null;
end $$;
revoke all on function public.audit_entreprise() from public, anon, authenticated;
drop trigger if exists audit_entreprises on public.entreprises;
create trigger audit_entreprises after update on public.entreprises
  for each row when (old is distinct from new) execute function public.audit_entreprise();

-- 6. Logo : bucket privé et règles d'accès (Supabase uniquement ; ignoré si le schéma storage est absent)
--    Premier segment du chemin = entreprise_id ; un chemin mal formé ne donne accès à rien.
create or replace function public.entreprise_du_chemin(p_nom text) returns uuid
language sql immutable set search_path = public as $$
  select case when split_part(p_nom, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nom, '/', 1)::uuid end
$$;
grant execute on function public.entreprise_du_chemin(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'Schéma storage absent : bucket logos non créé (base locale).';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', false, 1048576, array['image/png', 'image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 1048576, allowed_mime_types = array['image/png', 'image/jpeg'];

  drop policy if exists logos_lecture_membres on storage.objects;
  drop policy if exists logos_ajout_admin on storage.objects;
  drop policy if exists logos_modification_admin on storage.objects;
  drop policy if exists logos_suppression_admin on storage.objects;
  create policy logos_lecture_membres on storage.objects for select to authenticated
    using (bucket_id = 'logos' and public.is_member(public.entreprise_du_chemin(name)));
  create policy logos_ajout_admin on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[]));
  create policy logos_modification_admin on storage.objects for update to authenticated
    using (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[]))
    with check (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[]));
  create policy logos_suppression_admin on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and public.has_role(public.entreprise_du_chemin(name), '{admin}'::public.app_role[]));
end $$;

-- 7. Contrôles finaux
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'entreprises'
     and column_name in ('forme_juridique', 'capital_social', 'immatriculation_type', 'immatriculation_lieu', 'tva_intra',
                         'franchise_tva', 'option_debits', 'penalites_mode', 'penalites_taux', 'escompte',
                         'delai_paiement_jours', 'mode_paiement', 'conditions_paiement', 'assurance_pro', 'iban');
  if n <> 15 then raise exception 'Contrôle : % colonne(s) de paramètres sur 15', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.entreprises'::regclass) then
    raise exception 'Contrôle : RLS inactive sur public.entreprises';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'entreprises' and cmd in ('INSERT', 'DELETE', 'ALL')) then
    raise exception 'Contrôle : création ou suppression d''entreprise ouverte par une politique';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'audit_entreprises' and tgrelid = 'public.entreprises'::regclass) then
    raise exception 'Contrôle : trigger audit_entreprises absent';
  end if;
  if to_regclass('storage.buckets') is not null then
    execute $q$select count(*) from storage.buckets where id = 'logos' and not public$q$ into n;
    if n <> 1 then raise exception 'Contrôle : bucket logos absent ou public'; end if;
    execute $q$select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'logos\_%'$q$ into n;
    if n <> 4 then raise exception 'Contrôle : % politique(s) logos sur storage.objects au lieu de 4', n; end if;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
