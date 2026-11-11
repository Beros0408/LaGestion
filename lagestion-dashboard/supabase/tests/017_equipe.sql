-- 017_equipe.sql — LaGestion
-- Vérifie la gestion de l'équipe (migration 017) :
--   - écriture directe sur memberships et invitations refusée, même pour un admin ;
--   - membres_equipe : e-mails pour l'admin seul, refus hors de l'entreprise ;
--   - fonctions de gestion réservées à l'admin ;
--   - garde du dernier admin actif : suspension, rétrogradation et retrait refusés, y compris sur soi-même
--     et en écriture directe par postgres ; un admin suspendu ne compte pas ; suppression de l'entreprise permise ;
--   - suspension : le membre ne lit plus rien (clients, entreprise, appartenances, profils des collègues),
--     n'écrit plus, ne peut plus être responsable d'une tâche ; ses données restent ; mes_acces_suspendus le signale ;
--     réactivation : tout redevient lisible ;
--   - réassignation des tâches à faire dans la même transaction, facultative ; tâches faites inchangées ;
--   - retrait : ligne supprimée, données conservées ;
--   - invitations : adresse normalisée, refus d'un membre existant et d'un doublon en attente, adresse invalide ;
--     lecture anonyme par jeton ; acceptation : autre adresse, adresse non confirmée, expirée, déjà utilisée refusées ;
--     membre existant : rôle et statut inchangés ; renouvellement (ancien lien mort) ; annulation ;
--   - audit des appartenances et des invitations.
-- À lancer après migrations/017_equipe.sql, dans le SQL Editor de Supabase (rôle postgres).
-- Transaction annulée à la fin : aucune donnée de test ne subsiste.
-- Lecture du résultat : aucune erreur = tous les tests passent ; sinon erreur « ÉCHEC : … ».
--
-- Identifiants fictifs (préfixe a0170…) : A1 …0001 et A2 …0002 (admins), C …0003 (commercial), L …0004 (lecture),
-- X …0005 (invité, adresse confirmée), Y …0006 (invité, adresse non confirmée) ; entreprise E …00e1, F …00e2 ;
-- client …00c1 ; tâches …07a1 (C, à faire), …07a2 (C, faite).

begin;

-- 1. Données de test (rôle postgres)
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('a0170000-0000-4000-8000-000000000001', 'test-017-a1@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0170000-0000-4000-8000-000000000002', 'test-017-a2@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0170000-0000-4000-8000-000000000003', 'test-017-c@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0170000-0000-4000-8000-000000000004', 'test-017-l@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0170000-0000-4000-8000-000000000005', 'test-017-x@lagestion.invalid', 'authenticated', 'authenticated', now()),
  ('a0170000-0000-4000-8000-000000000006', 'test-017-y@lagestion.invalid', 'authenticated', 'authenticated', null);
insert into public.profiles (id, nom) values
  ('a0170000-0000-4000-8000-000000000001', 'Admin Un'),
  ('a0170000-0000-4000-8000-000000000002', 'Admin Deux'),
  ('a0170000-0000-4000-8000-000000000003', 'Commercial Trois');
insert into public.entreprises (id, nom) values
  ('a0170000-0000-4000-8000-0000000000e1', 'Entreprise E (test 017)'),
  ('a0170000-0000-4000-8000-0000000000e2', 'Entreprise F (test 017)');
insert into public.memberships (entreprise_id, user_id, role) values
  ('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001', 'admin'),
  ('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002', 'admin'),
  ('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'commercial'),
  ('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000004', 'lecture'),
  ('a0170000-0000-4000-8000-0000000000e2', 'a0170000-0000-4000-8000-000000000003', 'admin');
insert into public.clients (id, entreprise_id, nom, type) values
  ('a0170000-0000-4000-8000-0000000000c1', 'a0170000-0000-4000-8000-0000000000e1', 'Client de E (test 017)', 'entreprise');
insert into public.taches (id, entreprise_id, titre, echeance, responsable, statut) values
  ('a0170000-0000-4000-8000-0000000007a1', 'a0170000-0000-4000-8000-0000000000e1', 'À faire par C', current_date, 'a0170000-0000-4000-8000-000000000003', 'a_faire'),
  ('a0170000-0000-4000-8000-0000000007a2', 'a0170000-0000-4000-8000-0000000000e1', 'Faite par C', current_date, 'a0170000-0000-4000-8000-000000000003', 'faite');

create function public._t017_refuse(p_sql text, p_extrait text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_extrait in sqlerrm) = 0 then
      raise exception 'ÉCHEC : message inattendu pour « % » : %', p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'ÉCHEC : refus attendu pour « % »', p_sql;
end $$;
grant execute on function public._t017_refuse(text, text) to authenticated, anon;

create function public._t017_lignes(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public._t017_lignes(text) to authenticated;

create function public._t017_en(p_user text) returns void
language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_user), true);
$$;
grant execute on function public._t017_en(text) to authenticated, anon;

-- 2. Écriture directe refusée, même pour un admin ; liste de l'équipe
set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000001');

do $$
declare n int;
begin
  perform public._t017_refuse($q$insert into public.memberships (entreprise_id, user_id, role) values
    ('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000005', 'admin')$q$, 'row-level security');
  if public._t017_lignes($q$update public.memberships set role = 'lecture'
       where user_id = 'a0170000-0000-4000-8000-000000000003'$q$) <> 0 then
    raise exception 'ÉCHEC : modification directe d''une appartenance';
  end if;
  if public._t017_lignes($q$delete from public.memberships where user_id = 'a0170000-0000-4000-8000-000000000004'$q$) <> 0 then
    raise exception 'ÉCHEC : suppression directe d''une appartenance';
  end if;
  perform public._t017_refuse($q$insert into public.invitations (entreprise_id, email, role) values
    ('a0170000-0000-4000-8000-0000000000e1', 'intrus@lagestion.invalid', 'admin')$q$, 'row-level security');

  select count(*) into n from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1') where email is not null;
  if n <> 4 then raise exception 'ÉCHEC : l''admin voit % e-mail(s) au lieu de 4', n; end if;
  if (select nom from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')
       where user_id = 'a0170000-0000-4000-8000-000000000003') is distinct from 'Commercial Trois' then
    raise exception 'ÉCHEC : nom du membre absent de la liste';
  end if;
  if (select taches_a_faire from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')
       where user_id = 'a0170000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'ÉCHEC : nombre de tâches à faire de C';
  end if;
  perform public._t017_refuse($q$select * from public.membres_equipe('a0170000-0000-4000-8000-0000000000e2')$q$, 'Accès refusé');
end $$;

-- 3. Non-admin : liste sans e-mail, gestion refusée
select public._t017_en('a0170000-0000-4000-8000-000000000003');
do $$
begin
  if exists (select 1 from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1') where email is not null) then
    raise exception 'ÉCHEC : un commercial lit les e-mails des collègues';
  end if;
  if (select count(*) from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')) <> 4 then
    raise exception 'ÉCHEC : un commercial ne lit pas la liste des membres';
  end if;
  perform public._t017_refuse($q$select public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000004', 'admin')$q$, 'Seul un administrateur');
  perform public._t017_refuse($q$select public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001')$q$, 'Seul un administrateur');
  perform public._t017_refuse($q$select public.retirer_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001')$q$, 'Seul un administrateur');
  perform public._t017_refuse($q$select public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'nouveau@lagestion.invalid', 'admin')$q$, 'Seul un administrateur');
  if (select count(*) from public.invitations) <> 0 then raise exception 'ÉCHEC : un commercial lit les invitations'; end if;
  perform public._t017_refuse($q$select public._reassigner_taches('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'a0170000-0000-4000-8000-000000000003')$q$, 'permission denied');
end $$;

-- 4. Garde du dernier admin
select public._t017_en('a0170000-0000-4000-8000-000000000001');
do $$
begin
  -- A2 suspendu : A1 reste le seul admin actif
  perform public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002');
  perform public._t017_refuse($q$select public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001')$q$, 'au moins un administrateur actif');
  perform public._t017_refuse($q$select public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001', 'manager')$q$, 'au moins un administrateur actif');
  perform public._t017_refuse($q$select public.retirer_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001')$q$, 'au moins un administrateur actif');
  perform public._t017_refuse($q$select public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002')$q$, 'déjà suspendu');

  -- A2 réactivé : A1 peut se rétrograder, puis A2 devient le dernier admin
  perform public.reactiver_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002');
  perform public._t017_refuse($q$select public.reactiver_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002')$q$, 'déjà actif');
  perform public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002', 'manager');
  perform public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002', 'admin');
  perform public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001', 'manager');
end $$;

-- A1 n'est plus admin : plus aucune gestion
do $$
begin
  perform public._t017_refuse($q$select public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001', 'admin')$q$, 'Seul un administrateur');
end $$;

select public._t017_en('a0170000-0000-4000-8000-000000000002');
do $$
begin
  perform public._t017_refuse($q$select public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000002', 'lecture')$q$, 'au moins un administrateur actif');
  perform public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000001', 'admin');
end $$;

-- Même en écriture directe par postgres, et un admin suspendu ne compte pas
reset role;
do $$
begin
  update public.memberships set statut = 'suspendu', suspendu_le = now()
   where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1' and user_id = 'a0170000-0000-4000-8000-000000000002';
  perform public._t017_refuse($q$update public.memberships set role = 'manager' where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1'
    and user_id = 'a0170000-0000-4000-8000-000000000001'$q$, 'au moins un administrateur actif');
  perform public._t017_refuse($q$delete from public.memberships where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1'
    and user_id = 'a0170000-0000-4000-8000-000000000001'$q$, 'au moins un administrateur actif');
end $$;
update public.memberships set statut = 'actif', suspendu_le = null
 where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1' and user_id = 'a0170000-0000-4000-8000-000000000002';

-- Suppression d'une entreprise : la cascade passe malgré la garde
do $$
begin
  insert into public.entreprises (id, nom) values ('a0170000-0000-4000-8000-0000000000e9', 'À supprimer (test 017)');
  insert into public.memberships (entreprise_id, user_id, role)
  values ('a0170000-0000-4000-8000-0000000000e9', 'a0170000-0000-4000-8000-000000000001', 'admin');
  delete from public.entreprises where id = 'a0170000-0000-4000-8000-0000000000e9';
  if exists (select 1 from public.memberships where entreprise_id = 'a0170000-0000-4000-8000-0000000000e9') then
    raise exception 'ÉCHEC : appartenance restée après suppression de l''entreprise';
  end if;
end $$;

-- 5. Suspension de C, avec réassignation de ses tâches à faire à A2
set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000001');
do $$
begin
  perform public._t017_refuse($q$select public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'a0170000-0000-4000-8000-000000000004')$q$, 'rôle qui écrit');
  if (select responsable from public.taches where id = 'a0170000-0000-4000-8000-0000000007a1') <> 'a0170000-0000-4000-8000-000000000003' then
    raise exception 'ÉCHEC : réassignation refusée mais suspension appliquée (transaction non atomique)';
  end if;
  if public.suspendre_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'a0170000-0000-4000-8000-000000000002') <> 1 then
    raise exception 'ÉCHEC : une tâche à faire réassignée attendue';
  end if;
  if (select responsable from public.taches where id = 'a0170000-0000-4000-8000-0000000007a1') <> 'a0170000-0000-4000-8000-000000000002'
     or (select responsable from public.taches where id = 'a0170000-0000-4000-8000-0000000007a2') <> 'a0170000-0000-4000-8000-000000000003' then
    raise exception 'ÉCHEC : réassignation (à faire → A2, faite inchangée)';
  end if;
  perform public._t017_refuse($q$insert into public.taches (entreprise_id, titre, echeance, responsable) values
    ('a0170000-0000-4000-8000-0000000000e1', 'Pour un suspendu', current_date, 'a0170000-0000-4000-8000-000000000003')$q$, 'membre de l''entreprise, actif');
  if (select statut from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')
       where user_id = 'a0170000-0000-4000-8000-000000000003') <> 'suspendu' then
    raise exception 'ÉCHEC : statut suspendu absent de la liste';
  end if;
end $$;

select public._t017_en('a0170000-0000-4000-8000-000000000003');
do $$
begin
  if (select count(*) from public.clients where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 0
     or (select count(*) from public.entreprises where id = 'a0170000-0000-4000-8000-0000000000e1') <> 0
     or (select count(*) from public.memberships where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 0
     or (select count(*) from public.taches where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 0
     or (select count(*) from public.profiles where id = 'a0170000-0000-4000-8000-000000000001') <> 0 then
    raise exception 'ÉCHEC : un membre suspendu lit encore des données de l''entreprise';
  end if;
  if (select count(*) from public.profiles where id = 'a0170000-0000-4000-8000-000000000003') <> 1 then
    raise exception 'ÉCHEC : le membre suspendu ne lit plus son propre profil';
  end if;
  perform public._t017_refuse($q$insert into public.clients (entreprise_id, nom) values ('a0170000-0000-4000-8000-0000000000e1', 'Par un suspendu')$q$, 'row-level security');
  perform public._t017_refuse($q$select * from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')$q$, 'Accès refusé');
  if (select count(*) from public.mes_acces_suspendus()) <> 1
     or (select nom from public.mes_acces_suspendus()) <> 'Entreprise E (test 017)' then
    raise exception 'ÉCHEC : mes_acces_suspendus';
  end if;
  -- Son autre entreprise reste accessible
  if (select count(*) from public.entreprises where id = 'a0170000-0000-4000-8000-0000000000e2') <> 1 then
    raise exception 'ÉCHEC : la suspension dans E coupe aussi F';
  end if;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.taches where id in ('a0170000-0000-4000-8000-0000000007a1', 'a0170000-0000-4000-8000-0000000007a2')) <> 2 then
    raise exception 'ÉCHEC : données du membre suspendu supprimées';
  end if;
end $$;

-- Réactivation
set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000001');
select public.reactiver_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003');
select public._t017_en('a0170000-0000-4000-8000-000000000003');
do $$
begin
  if (select count(*) from public.clients where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 1
     or (select count(*) from public.mes_acces_suspendus()) <> 0 then
    raise exception 'ÉCHEC : membre réactivé sans accès';
  end if;
end $$;

-- 6. Passage en lecture sans réassignation, puis retrait de L
select public._t017_en('a0170000-0000-4000-8000-000000000001');
do $$
begin
  update public.taches set responsable = 'a0170000-0000-4000-8000-000000000003' where id = 'a0170000-0000-4000-8000-0000000007a1';
  if public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'lecture') <> 0 then
    raise exception 'ÉCHEC : réassignation sans choix';
  end if;
  if (select responsable from public.taches where id = 'a0170000-0000-4000-8000-0000000007a1') <> 'a0170000-0000-4000-8000-000000000003' then
    raise exception 'ÉCHEC : « Ne pas réassigner » a changé la tâche';
  end if;
  perform public.changer_role('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'commercial');

  perform public._t017_refuse($q$select public.retirer_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000003', 'a0170000-0000-4000-8000-000000000003')$q$, 'autre membre');
  if public.retirer_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000004') <> 0 then
    raise exception 'ÉCHEC : retrait de L';
  end if;
  perform public._t017_refuse($q$select public.retirer_membre('a0170000-0000-4000-8000-0000000000e1', 'a0170000-0000-4000-8000-000000000004')$q$, 'n''appartient plus');
  if (select count(*) from public.membres_equipe('a0170000-0000-4000-8000-0000000000e1')) <> 3 then
    raise exception 'ÉCHEC : L encore dans la liste';
  end if;
end $$;

select public._t017_en('a0170000-0000-4000-8000-000000000004');
do $$
begin
  if (select count(*) from public.clients where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 0
     or (select count(*) from public.mes_acces_suspendus()) <> 0 then
    raise exception 'ÉCHEC : membre retiré lit encore l''entreprise';
  end if;
end $$;

-- 7. Invitations
select public._t017_en('a0170000-0000-4000-8000-000000000001');
do $$
declare inv public.invitations;
begin
  inv := public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', '  Test-017-X@Lagestion.INVALID ', 'commercial');
  if inv.email <> 'test-017-x@lagestion.invalid' or inv.expires_at < now() + interval '6 days 23 hours'
     or inv.invited_by <> 'a0170000-0000-4000-8000-000000000001' then
    raise exception 'ÉCHEC : invitation créée (adresse, expiration, auteur)';
  end if;
  perform set_config('t017.jeton_x', inv.token::text, true);
  perform public._t017_refuse($q$select public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'test-017-x@lagestion.invalid', 'manager')$q$, 'déjà en attente');
  perform public._t017_refuse($q$select public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'TEST-017-C@lagestion.invalid', 'manager')$q$, 'déjà membre de l''entreprise');
  perform public._t017_refuse($q$select public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'pas-une-adresse', 'manager')$q$, 'Adresse e-mail invalide');
  perform public._t017_refuse($q$select public.creer_invitation('a0170000-0000-4000-8000-0000000000e2', 'nouveau@lagestion.invalid', 'manager')$q$, 'Seul un administrateur');

  inv := public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'test-017-y@lagestion.invalid', 'manager');
  perform set_config('t017.jeton_y', inv.token::text, true);
  inv := public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'annulee@lagestion.invalid', 'lecture');
  perform set_config('t017.id_annulee', inv.id::text, true);
  if (select count(*) from public.invitations where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 3 then
    raise exception 'ÉCHEC : l''admin ne lit pas les invitations en attente';
  end if;
end $$;

-- Lecture anonyme par jeton
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if (select etat || '|' || entreprise_nom || '|' || email || '|' || role
        from public.lire_invitation(current_setting('t017.jeton_x')::uuid))
     is distinct from 'valide|Entreprise E (test 017)|test-017-x@lagestion.invalid|commercial' then
    raise exception 'ÉCHEC : aperçu anonyme de l''invitation';
  end if;
  if exists (select 1 from public.lire_invitation(gen_random_uuid())) then
    raise exception 'ÉCHEC : un jeton inconnu renvoie une invitation';
  end if;
  if (select count(*) from public.invitations) <> 0 then raise exception 'ÉCHEC : un visiteur lit les invitations'; end if;
  perform public._t017_refuse(format('select public.accept_invitation(%L)', current_setting('t017.jeton_x')), 'permission denied');
end $$;

-- Acceptation
set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000006');
do $$
begin
  perform public._t017_refuse(format('select public.accept_invitation(%L)', current_setting('t017.jeton_y')), 'Confirmez d''abord');
  perform public._t017_refuse(format('select public.accept_invitation(%L)', current_setting('t017.jeton_x')), 'autre adresse');
end $$;

select public._t017_en('a0170000-0000-4000-8000-000000000005');
do $$
begin
  if public.accept_invitation(current_setting('t017.jeton_x')::uuid) <> 'a0170000-0000-4000-8000-0000000000e1' then
    raise exception 'ÉCHEC : acceptation de X';
  end if;
  if (select count(*) from public.clients where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') <> 1 then
    raise exception 'ÉCHEC : X ne lit pas l''entreprise après acceptation';
  end if;
  perform public._t017_refuse(format('select public.accept_invitation(%L)', current_setting('t017.jeton_x')), 'déjà utilisée');
  perform public._t017_refuse(format('select public.accept_invitation(%L)', gen_random_uuid()), 'Invitation invalide');
  if (select etat from public.lire_invitation(current_setting('t017.jeton_x')::uuid)) <> 'acceptee' then
    raise exception 'ÉCHEC : état « acceptée »';
  end if;
end $$;

reset role;
do $$
begin
  if (select role::text || statut from public.memberships where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1'
       and user_id = 'a0170000-0000-4000-8000-000000000005') <> 'commercialactif' then
    raise exception 'ÉCHEC : rôle ou statut de X après acceptation';
  end if;
  -- Invitation déjà en base pour un membre existant (C, suspendu) : rôle et statut inchangés à l'acceptation
  update public.memberships set statut = 'suspendu', suspendu_le = now()
   where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1' and user_id = 'a0170000-0000-4000-8000-000000000003';
  insert into public.invitations (entreprise_id, email, role, token)
  values ('a0170000-0000-4000-8000-0000000000e1', 'test-017-c@lagestion.invalid', 'admin', 'a0170000-0000-4000-8000-00000000c0de');
  -- Invitation expirée
  insert into public.invitations (entreprise_id, email, role, token, expires_at)
  values ('a0170000-0000-4000-8000-0000000000e1', 'expiree-017@lagestion.invalid', 'lecture', 'a0170000-0000-4000-8000-0000000e0e0e', now() - interval '1 minute');
end $$;

set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000003');
select public.accept_invitation('a0170000-0000-4000-8000-00000000c0de');
select public._t017_en('a0170000-0000-4000-8000-000000000002');
do $$
begin
  perform public._t017_refuse($q$select public.accept_invitation('a0170000-0000-4000-8000-0000000e0e0e')$q$, 'Invitation expirée');
end $$;

reset role;
do $$
begin
  if (select role::text || statut from public.memberships where entreprise_id = 'a0170000-0000-4000-8000-0000000000e1'
       and user_id = 'a0170000-0000-4000-8000-000000000003') <> 'commercialsuspendu' then
    raise exception 'ÉCHEC : l''invitation a changé le rôle ou le statut d''un membre existant';
  end if;
end $$;

-- Renouvellement, annulation, invitation expirée remplacée
set local role authenticated;
select public._t017_en('a0170000-0000-4000-8000-000000000001');
do $$
declare inv public.invitations; n int;
begin
  inv := public.renouveler_invitation((select id from public.invitations where token = current_setting('t017.jeton_y')::uuid));
  if inv.token = current_setting('t017.jeton_y')::uuid or inv.expires_at < now() + interval '6 days 23 hours' then
    raise exception 'ÉCHEC : renouvellement (jeton ou échéance)';
  end if;
  if exists (select 1 from public.lire_invitation(current_setting('t017.jeton_y')::uuid)) then
    raise exception 'ÉCHEC : l''ancien lien fonctionne encore après renouvellement';
  end if;
  perform public._t017_refuse(format('select public.renouveler_invitation(%L)',
    (select id from public.invitations where token = current_setting('t017.jeton_x')::uuid)), 'déjà été acceptée');

  if public._t017_lignes(format('delete from public.invitations where id = %L', current_setting('t017.id_annulee'))) <> 1 then
    raise exception 'ÉCHEC : annulation d''une invitation en attente';
  end if;
  if public._t017_lignes(format('delete from public.invitations where token = %L', current_setting('t017.jeton_x'))) <> 0 then
    raise exception 'ÉCHEC : suppression d''une invitation acceptée';
  end if;
  if public._t017_lignes($q$update public.invitations set expires_at = now() + interval '1 year'$q$) <> 0 then
    raise exception 'ÉCHEC : modification directe d''une invitation';
  end if;

  inv := public.creer_invitation('a0170000-0000-4000-8000-0000000000e1', 'expiree-017@lagestion.invalid', 'manager');
  select count(*) into n from public.invitations where lower(email) = 'expiree-017@lagestion.invalid' and accepted_at is null;
  if n <> 1 then raise exception 'ÉCHEC : invitation expirée non remplacée (% en attente)', n; end if;
end $$;

-- 8. Audit
reset role;
do $$
begin
  if not exists (select 1 from public.audit_events where table_name = 'memberships' and action = 'delete'
                  and entreprise_id = 'a0170000-0000-4000-8000-0000000000e1')
     or not exists (select 1 from public.audit_events where table_name = 'invitations' and action = 'insert'
                  and entreprise_id = 'a0170000-0000-4000-8000-0000000000e1') then
    raise exception 'ÉCHEC : audit des appartenances ou des invitations';
  end if;
end $$;

rollback;
