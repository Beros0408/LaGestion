-- seed.sql — Lagestion
-- Données de démonstration pour UNE entreprise existante (créée depuis l'onboarding).
-- S'applique après 004_secteur_clients.sql, dans le SQL Editor (rôle postgres).
--
-- Ce que fait le script :
--   - ne crée aucune entreprise et ne touche ni à entreprises, ni à memberships, ni à profiles ;
--   - écrit en se faisant passer pour un admin de l'entreprise : RLS et triggers des migrations 002/003 s'appliquent ;
--   - rejouable : supprime puis recrée les seules données de démonstration de l'entreprise.
--
-- Marquage des données de démonstration :
--   - clients : tag « démo » ;
--   - factures : numéro « DEMO-NNNN » (lignes et paiements suivent la facture) ;
--   - opportunités : rattachées à un client de démo et portant un nom de la liste ci-dessous.
--
-- Refus (rien n'est modifié) si l'entreprise n'existe pas, n'a pas d'admin, ou si une donnée
-- saisie à la main (facture, opportunité, contact) est rattachée à un client de démo.
--
-- Montants : vendeur = entreprise de rénovation et d'aménagement.
--   TVA 10 % : travaux dans des logements ; TVA 20 % : locaux professionnels et fournitures.
--   Aucune remise : la vue factures_totaux ne les prend pas en compte.
-- Dates calculées depuis current_date : 12 factures, une par mois sur les 12 derniers mois.
-- created_at / updated_at étalés sur 12 mois (âges fixes en jours) : chaque client est créé avant
-- sa première facture ; 3 opportunités ouvertes sont sans mouvement depuis plus de 30 jours.

begin;

-- Entreprise cible : seul identifiant d'environnement du script
select set_config('seed.entreprise_id', '79ad1773-647f-4c10-b15e-c6b2f8263b4f', true);

do $$
declare
  v_ent uuid := current_setting('seed.entreprise_id')::uuid;
  v_admin uuid;
  v_noms_opportunites constant text[] := array[
    'Rénovation de 12 chambres',
    'Agrandissement de la salle d''attente',
    'Second œuvre — chantier groupe scolaire',
    'Rénovation complète de la cuisine',
    'Terrasse couverte et chauffée',
    'Aménagement d''une seconde salle de soins',
    'Contrat de maintenance annuel',
    'Mise aux normes accessibilité PMR',
    'Rénovation de 3 logements locatifs',
    'Isolation de la toiture de l''atelier'];
  n int;
begin
  -- 1. Garde-fous (rôle postgres)
  if not exists (select 1 from public.entreprises where id = v_ent and deleted_at is null) then
    raise exception 'Seed interrompu : l''entreprise % n''existe pas ou a été supprimée. Créez-la depuis l''onboarding, puis reportez son id en tête de seed.sql.', v_ent;
  end if;

  select user_id into v_admin from public.memberships
   where entreprise_id = v_ent and role = 'admin'
   order by created_at limit 1;
  if v_admin is null then
    raise exception 'Seed interrompu : l''entreprise % n''a aucun administrateur.', v_ent;
  end if;

  select count(*) into n from public.factures f
   join public.clients c on c.id = f.client_id
   where f.entreprise_id = v_ent and c.tags @> array['démo'] and f.numero not like 'DEMO-%';
  if n > 0 then
    raise exception 'Seed interrompu : % facture(s) saisie(s) à la main référence(nt) un client de démo. Rattachez-la(les) à un autre client ou retirez le tag « démo » de ce client.', n;
  end if;

  select count(*) into n from public.opportunites o
   join public.clients c on c.id = o.client_id
   where o.entreprise_id = v_ent and c.tags @> array['démo'] and not (o.nom = any(v_noms_opportunites));
  if n > 0 then
    raise exception 'Seed interrompu : % opportunité(s) saisie(s) à la main est(sont) rattachée(s) à un client de démo. Rattachez-la(les) à un autre client ou retirez le tag « démo » de ce client.', n;
  end if;

  select count(*) into n from public.contacts ct
   join public.clients c on c.id = ct.client_id
   where ct.entreprise_id = v_ent and c.tags @> array['démo'];
  if n > 0 then
    raise exception 'Seed interrompu : % contact(s) rattaché(s) à un client de démo seraient supprimés.', n;
  end if;

  -- 2. Bascule sur l'admin : toutes les écritures suivantes passent par la RLS
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  if auth.uid() is distinct from v_admin then
    raise exception 'Seed interrompu : impossible d''agir au nom de l''administrateur.';
  end if;

  -- 3. Suppression de la démo précédente (lignes et paiements suivent la facture)
  delete from public.factures
   where entreprise_id = v_ent and numero like 'DEMO-%';
  delete from public.opportunites o
   using public.clients c
   where c.id = o.client_id and o.entreprise_id = v_ent and c.tags @> array['démo'];
  delete from public.clients
   where entreprise_id = v_ent and tags @> array['démo'];

  -- 4. Clients (15)
  insert into public.clients (entreprise_id, type, nom, secteur, email, telephone, adresse, statut, tags, score,
                              created_at, updated_at)
  select v_ent, v.type, v.nom, v.secteur, v.email, v.telephone, v.adresse, v.statut, array['démo'], v.score,
         (current_date - v.age) + time '09:00', (current_date - v.age) + time '09:00'
  from (values
    ('entreprise',  'Bâtiments Rénov''Est',                'BTP',          'contact@renov-est.example',          '03 88 41 27 65', '12 rue du Faubourg, 67000 Strasbourg',            'actif',    78,  55),
    ('entreprise',  'Le Comptoir des Halles',             'Restauration', 'reservation@comptoir-halles.example','04 78 62 19 40', '8 place des Halles, 69002 Lyon',                  'actif',    85, 300),
    ('entreprise',  'Cabinet dentaire Lemoine',           'Santé',        'accueil@dentaire-lemoine.example',   '02 40 35 18 72', '27 boulevard Guist''hau, 44000 Nantes',          'actif',    74, 240),
    ('entreprise',  'Morel Conseil & Stratégie',          'Conseil',      'direction@morel-conseil.example',    '01 45 22 80 13', '54 rue de Rivoli, 75004 Paris',                   'actif',    82, 175),
    ('entreprise',  'Boulangerie Fournier',               'Commerce',     'boulangerie@fournier.example',       '05 56 44 21 09', '3 cours Victor-Hugo, 33000 Bordeaux',             'actif',    69, 120),
    ('entreprise',  'Mécanique de précision Arnaud',      'Industrie',    'atelier@meca-arnaud.example',        '04 77 31 56 28', 'ZI du Clos, 42000 Saint-Étienne',                 'actif',    71,  90),
    ('entreprise',  'Agence immobilière Delmas',          'Immobilier',   'gestion@delmas-immo.example',        '04 67 58 33 90', '15 avenue de Toulouse, 34000 Montpellier',        'actif',    88, 330),
    ('entreprise',  'Transports Guérin',                  'Transport',    'exploitation@transports-guerin.example','02 35 07 64 11','ZA des Docks, 76600 Le Havre',                 'actif',    58, 150),
    ('entreprise',  'Hôtel des Remparts',                 'Hôtellerie',   'direction@hotel-remparts.example',   '02 99 40 12 57', '2 rue des Remparts, 35400 Saint-Malo',            'prospect', 63,  25),
    ('entreprise',  'Clinique vétérinaire des Tilleuls',  'Santé',        'contact@veto-tilleuls.example',      '03 80 66 21 48', '41 allée des Tilleuls, 21000 Dijon',              'prospect', 55,  45),
    ('entreprise',  'Menuiserie Chevalier',               'BTP',          'menuiserie@chevalier.example',       '02 47 20 85 36', '9 route de Vouvray, 37000 Tours',                 'prospect', 47,  12),
    ('entreprise',  'Librairie Les Mots Passants',        'Commerce',     'librairie@motspassants.example',     '03 20 54 72 18', '6 rue Esquermoise, 59000 Lille',                  'inactif',  36, 360),
    ('particulier', 'Claire Bonnet',                      null,           'claire.bonnet@mail.example',         '06 21 48 73 05', '18 rue des Lilas, 31000 Toulouse',                'actif',    66, 200),
    ('particulier', 'Thomas Girard',                      null,           'thomas.girard@mail.example',         '06 74 12 39 58', '5 impasse du Moulin, 13100 Aix-en-Provence',      'prospect', 52,  20),
    ('entreprise',  'Pharmacie du Marché',                'Santé',        'officine@pharmacie-marche.example',  '04 93 85 26 41', '1 place du Marché, 06000 Nice',                   'inactif',  40, 270)
  ) as v(type, nom, secteur, email, telephone, adresse, statut, score, age);

  -- 5. Opportunités (10) : 3 Qualification, 3 Proposition, 2 Négociation, 2 Conclusion
  -- cree / modifie : âge en jours de created_at / updated_at (> 30 j sans mouvement : Tilleuls, Comptoir, Delmas)
  insert into public.opportunites (entreprise_id, client_id, nom, montant, probabilite, etape, date_cloture,
                                   created_at, updated_at)
  select v_ent, c.id, v.nom, v.montant, v.probabilite, v.etape, current_date + v.jours,
         (current_date - v.cree) + time '10:00', (current_date - v.modifie) + time '10:00'
  from (values
    ('Hôtel des Remparts',                'Rénovation de 12 chambres',                 42000.00, 20, 'Qualification', 120,  22,  5),
    ('Clinique vétérinaire des Tilleuls', 'Agrandissement de la salle d''attente',     18500.00, 40, 'Proposition',    75,  40, 35),
    ('Bâtiments Rénov''Est',              'Second œuvre — chantier groupe scolaire',   26000.00, 60, 'Négociation',    45,  50, 12),
    ('Thomas Girard',                     'Rénovation complète de la cuisine',          9800.00, 50, 'Proposition',    40,  18,  3),
    ('Le Comptoir des Halles',            'Terrasse couverte et chauffée',             15600.00, 70, 'Négociation',    30,  70, 45),
    ('Cabinet dentaire Lemoine',          'Aménagement d''une seconde salle de soins', 12400.00, 90, 'Conclusion',     15,  90,  8),
    ('Morel Conseil & Stratégie',         'Contrat de maintenance annuel',              6000.00, 85, 'Conclusion',     10, 120, 20),
    ('Menuiserie Chevalier',              'Mise aux normes accessibilité PMR',          7200.00, 15, 'Qualification',  90,  10, 10),
    ('Agence immobilière Delmas',         'Rénovation de 3 logements locatifs',        31500.00, 45, 'Proposition',    60, 100, 62),
    ('Mécanique de précision Arnaud',     'Isolation de la toiture de l''atelier',     23800.00, 25, 'Qualification', 150,  80, 15)
  ) as v(client, nom, montant, probabilite, etape, jours, cree, modifie)
  join public.clients c
    on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo'];

  -- 6. Factures (12) : émise il y a k mois (et 3 jours), échéance à émission + délai
  insert into public.factures (entreprise_id, client_id, numero, date_emission, date_echeance,
                               statut, conditions_paiement, mode_paiement)
  select v_ent, c.id, v.numero, e.emission, e.emission + v.delai,
         v.statut, v.delai || ' jours', 'virement'
  from (values
    ('DEMO-0001', 'Librairie Les Mots Passants',   11, 'payee',               30),
    ('DEMO-0002', 'Agence immobilière Delmas',     10, 'payee',               30),
    ('DEMO-0003', 'Le Comptoir des Halles',         9, 'payee',               30),
    ('DEMO-0004', 'Pharmacie du Marché',            8, 'annulee',             30),
    ('DEMO-0005', 'Cabinet dentaire Lemoine',       7, 'payee',               30),
    ('DEMO-0006', 'Claire Bonnet',                  6, 'payee',               30),
    ('DEMO-0007', 'Morel Conseil & Stratégie',      5, 'partiellement_payee', 30),
    ('DEMO-0008', 'Transports Guérin',              4, 'en_retard',           30),
    ('DEMO-0009', 'Boulangerie Fournier',           3, 'payee',               30),
    ('DEMO-0010', 'Mécanique de précision Arnaud',  2, 'en_retard',           30),
    ('DEMO-0011', 'Agence immobilière Delmas',      1, 'envoyee',             45),
    ('DEMO-0012', 'Le Comptoir des Halles',         0, 'brouillon',           30)
  ) as v(numero, client, k, statut, delai)
  cross join lateral (select (current_date - make_interval(months => v.k) - interval '3 days')::date as emission) e
  join public.clients c
    on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo'];

  -- 7. Lignes de facture (23)
  insert into public.lignes_facture (entreprise_id, facture_id, position, description, unite,
                                     quantite, prix_unitaire, taux_tva)
  select v_ent, f.id, v.pos, v.description, v.unite, v.quantite, v.prix, v.tva
  from (values
    ('DEMO-0001', 0, 'Aménagement de la réserve — main d''œuvre',          'h',       24,    45.00, 20),
    ('DEMO-0001', 1, 'Rayonnages métalliques',                             'u',        6,   189.00, 20),
    ('DEMO-0002', 0, 'Remise en peinture appartement T3 — main d''œuvre',  'forfait',  1,  2400.00, 10),
    ('DEMO-0002', 1, 'Peintures et fournitures',                           'forfait',  1,   640.00, 10),
    ('DEMO-0003', 0, 'Entretien hotte et extraction — semestre',           'forfait',  1,  1250.00, 20),
    ('DEMO-0003', 1, 'Filtres à graisse inox',                             'u',        4,    85.00, 20),
    ('DEMO-0004', 0, 'Réaménagement de l''officine — acompte',             'forfait',  1,  4500.00, 20),
    ('DEMO-0005', 0, 'Cloisonnement de la salle de soins',                 'forfait',  1,  3850.00, 20),
    ('DEMO-0005', 1, 'Faux plafond acoustique',                            'm²',      18,    62.00, 20),
    ('DEMO-0006', 0, 'Rénovation salle de bains — main d''œuvre',          'forfait',  1,  4200.00, 10),
    ('DEMO-0006', 1, 'Carrelage et faïence',                               'm²',      22,    48.50, 10),
    ('DEMO-0007', 0, 'Aménagement open space — main d''œuvre',             'forfait',  1,  7600.00, 20),
    ('DEMO-0007', 1, 'Postes de travail équipés',                          'u',        8,   412.50, 20),
    ('DEMO-0008', 0, 'Réfection du sol de l''atelier — résine époxy',      'm²',     240,    32.00, 20),
    ('DEMO-0008', 1, 'Marquage au sol',                                    'forfait',  1,   950.00, 20),
    ('DEMO-0009', 0, 'Mise aux normes électriques du fournil',             'forfait',  1,  2980.00, 20),
    ('DEMO-0009', 1, 'Éclairage LED de la vitrine',                        'u',       12,    74.90, 20),
    ('DEMO-0010', 0, 'Maintenance préventive du bâtiment — trimestre',     'forfait',  1,  1800.00, 20),
    ('DEMO-0010', 1, 'Remplacement de portes coupe-feu',                   'u',        2,  1150.00, 20),
    ('DEMO-0011', 0, 'Rafraîchissement des parties communes — main d''œuvre','forfait', 1,  3600.00, 10),
    ('DEMO-0011', 1, 'Éclairage du hall avec détecteurs',                  'u',        6,    95.00, 10),
    ('DEMO-0012', 0, 'Création d''un bar en chêne massif',                 'forfait',  1,  5400.00, 20),
    ('DEMO-0012', 1, 'Pose et finitions',                                  'forfait',  1,  1200.00, 20)
  ) as v(numero, pos, description, unite, quantite, prix, tva)
  join public.factures f on f.entreprise_id = v_ent and f.numero = v.numero;

  -- 8. Paiements (8) : payée = TTC réglé ; partiellement payée = acompte
  insert into public.paiements (entreprise_id, facture_id, date, montant, mode, reference)
  select v_ent, f.id, f.date_emission + v.jours, v.montant, v.mode, v.reference
  from (values
    ('DEMO-0001', 21, 2656.80, 'virement', 'VIR DEMO-0001'),
    ('DEMO-0002', 28, 3344.00, 'virement', 'VIR DEMO-0002'),
    ('DEMO-0003', 15, 1908.00, 'cheque',   'CHQ 4471203'),
    ('DEMO-0005', 30, 5959.20, 'virement', 'VIR DEMO-0005'),
    ('DEMO-0006',  0, 1738.11, 'cheque',   'Acompte 30 %'),
    ('DEMO-0006', 25, 4055.59, 'virement', 'Solde'),
    ('DEMO-0007', 10, 5000.00, 'virement', 'Acompte'),
    ('DEMO-0009', 18, 4654.56, 'carte',    'CB 0918')
  ) as v(numero, jours, montant, mode, reference)
  join public.factures f on f.entreprise_id = v_ent and f.numero = v.numero;

  execute 'reset role';
end $$;

-- 9. Contrôles finaux (rôle postgres) : toute anomalie annule le seed
do $$
declare
  v_ent uuid := current_setting('seed.entreprise_id')::uuid;
  n int;
  r record;
begin
  select count(*) into n from public.clients where entreprise_id = v_ent and tags @> array['démo'];
  if n <> 15 then raise exception 'Contrôle seed : % client(s) de démo au lieu de 15', n; end if;

  select count(*) into n from public.opportunites o join public.clients c on c.id = o.client_id
   where o.entreprise_id = v_ent and c.tags @> array['démo'];
  if n <> 10 then raise exception 'Contrôle seed : % opportunité(s) de démo au lieu de 10', n; end if;

  select count(*) into n from public.factures where entreprise_id = v_ent and numero like 'DEMO-%';
  if n <> 12 then raise exception 'Contrôle seed : % facture(s) de démo au lieu de 12', n; end if;

  select count(*) into n from public.lignes_facture l join public.factures f on f.id = l.facture_id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%';
  if n <> 23 then raise exception 'Contrôle seed : % ligne(s) de facture au lieu de 23', n; end if;

  select count(*) into n from public.paiements p join public.factures f on f.id = p.facture_id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%';
  if n <> 8 then raise exception 'Contrôle seed : % paiement(s) au lieu de 8', n; end if;

  -- Cohérence paiements / statut, au centime
  for r in
    select f.numero, f.statut, t.total_ttc,
           coalesce((select sum(p.montant) from public.paiements p where p.facture_id = f.id), 0) as paye
    from public.factures f join public.factures_totaux t on t.facture_id = f.id
    where f.entreprise_id = v_ent and f.numero like 'DEMO-%'
  loop
    if round(r.total_ttc, 2) <> r.total_ttc then
      raise exception 'Contrôle seed : % a un TTC non arrondi au centime (%)', r.numero, r.total_ttc;
    end if;
    if r.paye > r.total_ttc then
      raise exception 'Contrôle seed : % payée au-delà du TTC (% > %)', r.numero, r.paye, r.total_ttc;
    end if;
    if r.statut = 'payee' and r.paye <> r.total_ttc then
      raise exception 'Contrôle seed : % payée mais réglée % au lieu de %', r.numero, r.paye, r.total_ttc;
    end if;
    if r.statut = 'partiellement_payee' and not (r.paye > 0 and r.paye < r.total_ttc) then
      raise exception 'Contrôle seed : % partiellement payée incohérente (% sur %)', r.numero, r.paye, r.total_ttc;
    end if;
    if r.statut not in ('payee', 'partiellement_payee') and r.paye > 0 then
      raise exception 'Contrôle seed : % au statut % porte des paiements', r.numero, r.statut;
    end if;
  end loop;

  -- Statut « en retard » : échéance dépassée ; « envoyée » et « brouillon » : échéance à venir
  select count(*) into n from public.factures
   where entreprise_id = v_ent and numero like 'DEMO-%'
     and ((statut = 'en_retard' and date_echeance >= current_date)
       or (statut in ('envoyee', 'brouillon') and date_echeance < current_date));
  if n > 0 then raise exception 'Contrôle seed : % facture(s) au statut incohérent avec l''échéance', n; end if;

  -- Chronologie : aucune facture ni opportunité antérieure à la création de son client
  select count(*) into n from (
    select 1 from public.factures f join public.clients c on c.id = f.client_id
     where f.entreprise_id = v_ent and f.numero like 'DEMO-%' and f.date_emission < c.created_at::date
    union all
    select 1 from public.opportunites o join public.clients c on c.id = o.client_id
     where o.entreprise_id = v_ent and c.tags @> array['démo']
       and (o.created_at < c.created_at or o.updated_at < o.created_at)
  ) s;
  if n > 0 then raise exception 'Contrôle seed : % ligne(s) aux dates incohérentes avec la création du client', n; end if;

  -- Lignes et paiements rattachés à l'entreprise de leur facture
  select count(*) into n from (
    select l.entreprise_id, f.entreprise_id as fe from public.lignes_facture l join public.factures f on f.id = l.facture_id
     where f.entreprise_id = v_ent and f.numero like 'DEMO-%'
    union all
    select p.entreprise_id, f.entreprise_id from public.paiements p join public.factures f on f.id = p.facture_id
     where f.entreprise_id = v_ent and f.numero like 'DEMO-%'
  ) s where s.entreprise_id is distinct from s.fe;
  if n > 0 then raise exception 'Contrôle seed : % ligne(s) ou paiement(s) hors de l''entreprise', n; end if;

  raise notice 'Seed terminé : 15 clients, 10 opportunités, 12 factures (23 lignes, 8 paiements).';
end $$;

commit;
