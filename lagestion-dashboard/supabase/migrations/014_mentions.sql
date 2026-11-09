-- 014_mentions.sql — LaGestion
-- Mentions légales des documents (étape 13, temps 2 ; FAC-01 du PRD) :
--   - factures : date de la prestation ou de la livraison, adresse de livraison, catégorie d'opération
--     (biens, services, mixte) ; saisies au brouillon, verrouillées après l'émission ; à la finalisation d'un document
--     autre qu'un avoir, date de prestation = date d'émission et catégorie = services s'ils sont vides ;
--   - emetteur_fige étendu : identité juridique, options de TVA, conditions de paiement, assurance, IBAN, logo
--     (instantane_emetteur, appelée par la finalisation existante) ; les documents déjà émis gardent leur figement ;
--   - finalisation refusée si une mention obligatoire de l'émetteur manque (mentions_manquantes, aussi lisible par
--     l'interface) ou si une ligne porte de la TVA sous franchise en base ;
--   - le SIREN d'un client entreprise n'est pas exigé : l'interface avertit sans bloquer (date d'application à confirmer).
-- Mentions à faire valider par un expert-comptable : docs/Mentions_legales_a_valider.md.
-- Comme les migrations 003 et 007 à 013, les règles ne s'appliquent qu'à un utilisateur authentifié.
-- S'applique après 013_parametres.sql. Rejouable sans erreur.

begin;

-- 1. Colonnes de la facture
alter table public.factures
  add column if not exists date_prestation date,
  add column if not exists adresse_livraison text,
  add column if not exists categorie_operation text;
alter table public.factures drop constraint if exists factures_categorie_operation;
alter table public.factures
  add constraint factures_categorie_operation check (categorie_operation is null or categorie_operation in ('biens', 'services', 'mixte'));

-- 2. Identité figée de l'émetteur (reprend 008) ; les champs vides sont omis, mentions = 2 marque le nouveau format.
create or replace function public.instantane_emetteur(p_entreprise uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'mentions', 2,
    'nom', nom, 'siret', siret, 'adresse', adresse,
    'forme_juridique', forme_juridique, 'capital_social', capital_social,
    'immatriculation_type', immatriculation_type, 'immatriculation_lieu', immatriculation_lieu,
    'tva_intra', tva_intra, 'franchise_tva', franchise_tva, 'option_debits', option_debits,
    'penalites_mode', penalites_mode, 'penalites_taux', penalites_taux, 'escompte', escompte,
    'iban', iban, 'assurance_pro', assurance_pro, 'logo', logo_url))
  from public.entreprises where id = p_entreprise
$$;
revoke all on function public.instantane_emetteur(uuid) from public, anon;
grant execute on function public.instantane_emetteur(uuid) to authenticated;

-- 3. Mentions obligatoires de l'émetteur encore absentes (liste vide : finalisation possible)
create or replace function public.mentions_manquantes(p_entreprise uuid) returns text[]
language sql stable set search_path = public as $$
  select coalesce(array_remove(array[
    case when coalesce(trim(siret), '') = '' then 'SIRET' end,
    case when coalesce(trim(adresse), '') = '' then 'adresse du siège' end,
    case when forme_juridique is null then 'forme juridique' end,
    case when forme_juridique in ('EURL', 'SARL', 'SAS', 'SASU', 'SA', 'SELARL') and capital_social is null then 'capital social' end,
    case when immatriculation_type is null
           or (immatriculation_type in ('rcs', 'rm') and coalesce(trim(immatriculation_lieu), '') = '') then 'immatriculation (RCS ou RM et son lieu)' end,
    case when not franchise_tva and coalesce(trim(tva_intra), '') = '' then 'n° de TVA intracommunautaire (ou franchise de TVA)' end
  ], null), '{}')
  from public.entreprises where id = p_entreprise
$$;
revoke all on function public.mentions_manquantes(uuid) from public, anon;
grant execute on function public.mentions_manquantes(uuid) to authenticated;

-- 4. Règles des mentions : après trg_factures_regles (ordre alphabétique), qui a déjà daté et numéroté le document.
create or replace function public.verifier_mentions_facture() returns trigger
language plpgsql set search_path = public as $$
declare
  v_utilisateur constant boolean := auth.uid() is not null;
  v_manquantes text[];
  v_franchise boolean;
begin
  -- Sortie du brouillon : finalisation par un utilisateur, ou statut posé en rôle postgres (seed).
  if old.statut = 'brouillon' and new.statut <> 'brouillon' then
    if v_utilisateur then
      v_manquantes := public.mentions_manquantes(new.entreprise_id);
      if cardinality(v_manquantes) > 0 then
        raise exception 'Mentions obligatoires manquantes : %. Complétez Paramètres, Entreprise avant de finaliser.',
          array_to_string(v_manquantes, ', ');
      end if;
      select franchise_tva into v_franchise from public.entreprises where id = new.entreprise_id;
      if v_franchise and exists (select 1 from public.lignes_facture l where l.facture_id = new.id and l.taux_tva <> 0) then
        raise exception 'Franchise en base de TVA : toutes les lignes doivent être à 0 %% de TVA.';
      end if;
    end if;
    if new.type <> 'avoir' then
      new.date_prestation := coalesce(new.date_prestation, new.date_emission);
      new.categorie_operation := coalesce(new.categorie_operation, 'services');
    end if;
    return new;
  end if;

  if v_utilisateur and old.statut <> 'brouillon'
     and row(new.date_prestation, new.adresse_livraison, new.categorie_operation)
         is distinct from row(old.date_prestation, old.adresse_livraison, old.categorie_operation) then
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passe par un avoir.';
  end if;
  return new;
end $$;

drop trigger if exists trg_factures_regles_mentions on public.factures;
create trigger trg_factures_regles_mentions before update on public.factures
  for each row execute function public.verifier_mentions_facture();

-- 5. Enregistrement d'un brouillon : reprend la migration 010, avec les trois champs de l'opération.
create or replace function public.enregistrer_facture(p_id uuid, p_entete jsonb, p_lignes jsonb default null) returns void
language plpgsql set search_path = public as $$
declare
  f public.factures;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  select * into f from public.factures where id = p_id and deleted_at is null;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if not public.has_role(f.entreprise_id, '{admin,manager,commercial,comptable}'::public.app_role[]) then
    raise exception 'Votre rôle ne permet pas de modifier une facture.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into f from public.factures where id = p_id and deleted_at is null for update;
  if not found then
    raise exception 'Cette facture est introuvable.';
  end if;
  if f.statut <> 'brouillon' then
    raise exception 'Une facture finalisée ne peut plus être modifiée. Sa correction passe par un avoir.';
  end if;
  if f.avoir_total and p_lignes is not null then
    raise exception 'Les lignes d''un avoir total doivent rester celles de la facture d''origine.';
  end if;
  if f.type = 'acompte' and p_lignes is not null then
    raise exception 'Les lignes d''un acompte sont calculées : supprimez-le et recréez-le pour changer son montant.';
  end if;

  update public.factures set
    client_id = case when p_entete ? 'client_id' then (p_entete->>'client_id')::uuid else client_id end,
    date_emission = case when p_entete ? 'date_emission' then coalesce((p_entete->>'date_emission')::date, date_emission) else date_emission end,
    date_echeance = case when p_entete ? 'date_echeance' then (p_entete->>'date_echeance')::date else date_echeance end,
    remise = case when p_entete ? 'remise' then coalesce((p_entete->>'remise')::numeric, 0) else remise end,
    conditions_paiement = case when p_entete ? 'conditions_paiement' then p_entete->>'conditions_paiement' else conditions_paiement end,
    mode_paiement = case when p_entete ? 'mode_paiement' then p_entete->>'mode_paiement' else mode_paiement end,
    notes_internes = case when p_entete ? 'notes_internes' then p_entete->>'notes_internes' else notes_internes end,
    message_client = case when p_entete ? 'message_client' then p_entete->>'message_client' else message_client end,
    motif = case when p_entete ? 'motif' then p_entete->>'motif' else motif end,
    date_prestation = case when p_entete ? 'date_prestation' then (p_entete->>'date_prestation')::date else date_prestation end,
    adresse_livraison = case when p_entete ? 'adresse_livraison' then p_entete->>'adresse_livraison' else adresse_livraison end,
    categorie_operation = case when p_entete ? 'categorie_operation' then p_entete->>'categorie_operation' else categorie_operation end
  where id = p_id;

  if p_lignes is not null then
    delete from public.lignes_facture where facture_id = p_id;
    insert into public.lignes_facture (entreprise_id, facture_id, description, reference, unite,
                                       quantite, prix_unitaire, taux_tva, remise, position, produit_id)
    select f.entreprise_id, p_id, l.description, l.reference, l.unite,
           l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.position, l.produit_id
    from jsonb_to_recordset(p_lignes) as l(description text, reference text, unite text, quantite numeric,
      prix_unitaire numeric, taux_tva numeric, remise numeric, "position" integer, produit_id uuid);
  end if;
end $$;
revoke all on function public.enregistrer_facture(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.enregistrer_facture(uuid, jsonb, jsonb) to authenticated;

-- 6. Contrôles finaux
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'factures'
     and column_name in ('date_prestation', 'adresse_livraison', 'categorie_operation');
  if n <> 3 then raise exception 'Contrôle : % colonne(s) de l''opération sur 3', n; end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_factures_regles_mentions' and tgrelid = 'public.factures'::regclass) then
    raise exception 'Contrôle : trigger trg_factures_regles_mentions absent';
  end if;
  -- Ordre d'exécution : le contrôle des mentions suit celui des règles (numéro et date déjà posés).
  if 'trg_factures_regles' >= 'trg_factures_regles_mentions' then
    raise exception 'Contrôle : ordre des triggers inattendu';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.verifier_mentions_facture()'::regprocedure) then
    raise exception 'Contrôle : verifier_mentions_facture ne doit pas être en security definer';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
