-- seed.sql — Lagestion
-- Données de démonstration pour UNE entreprise existante (créée depuis l'onboarding).
-- S'applique après 012_taches_activites.sql, dans le SQL Editor (rôle postgres).
--
-- Ce que fait le script :
--   - ne crée aucune entreprise et ne touche ni à entreprises, ni à memberships, ni à profiles ;
--   - écrit en se faisant passer pour un admin de l'entreprise : RLS et triggers des migrations 002/003 s'appliquent ;
--     seules exceptions, en rôle postgres : la suppression de la démo précédente (une facture émise ne peut pas être
--     supprimée par un utilisateur) et la pose des statuts des factures et des devis (ils ne peuvent pas être créés
--     tels quels par un utilisateur) ;
--   - rejouable : supprime puis recrée les seules données de démonstration de l'entreprise.
--
-- Marquage des données de démonstration :
--   - clients : tag « démo » ;
--   - factures : numéro « DEMO-NNNN », hors de la séquence légale ; totaux figés dès la pose du statut
--     (lignes et paiements suivent la facture). Une finalisation dans l'application attribue un vrai numéro
--     FAC-AAAA-NNNN et consomme la séquence : réservé à une base de test ;
--   - avoirs : numéro « DEMO-AV-NNNN », hors de la série AV (1 total qui annule DEMO-0004, 1 partiel sur DEMO-0005,
--     remboursé) ; un avoir créé dans l'application sur une facture de démo est de la démo et disparaît au rejeu ;
--   - acomptes et soldes : numéros « DEMO-ACP-NNNN » et « DEMO-SLD-NNNN », hors série, rattachés à DEV-DEMO-0008
--     (1 750 € TTC : acompte de 30 % à 525 €, solde à 1 225 €) ; DEV-DEMO-0009, accepté et libre, sert aux tests ;
--   - relances : suivent la facture à sa suppression en rôle postgres ; 1 relance sur DEMO-0008, il y a 20 jours ;
--   - activités et tâches (migration 012) : rattachées à un client, une opportunité, un devis ou une facture de démo,
--     elles disparaissent avec eux au rejeu (suppression en cascade), y compris celles créées dans l'application ;
--     4 activités (Delmas, Transports Guérin) et 4 tâches à dates relatives : en retard (hier), aujourd'hui,
--     à venir (dans 3 jours), faite ;
--   - statuts : payée, partiellement payée et en retard sont calculés ; le seed ne pose que le cycle de vie ;
--   - opportunités : rattachées à un client de démo et portant un nom de la liste ci-dessous ;
--   - catalogue : référence « DEMO-ART-NN » (10 articles, dont 1 inactif ; 9 lignes de facture y sont reliées) ;
--   - devis : numéro « DEV-DEMO-NNNN » (9 devis, 17 lignes) ; une facture issue d'un de ces devis est de la démo
--     et disparaît au rejeu, y compris celles créées depuis l'application par « Transformer en facture ».
--
-- Refus (rien n'est modifié) si l'entreprise n'existe pas, n'a pas d'admin, ou si une donnée
-- saisie à la main (facture, devis, opportunité, contact) est rattachée à un client de démo, ou si une
-- ligne de facture ou de devis saisie à la main est reliée à un article de démo.
--
-- Montants : vendeur = entreprise de rénovation et d'aménagement.
--   TVA 10 % : travaux dans des logements ; TVA 20 % : locaux professionnels et fournitures.
--   Aucune remise sur les factures, une remise globale sur le devis DEV-DEMO-0003 (règle de calcul : migrations/005_totaux_remises.sql).
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
   where f.entreprise_id = v_ent and c.tags @> array['démo'] and coalesce(f.numero, '') not like 'DEMO-%'
     and not exists (select 1 from public.devis d where d.id = f.devis_id and d.numero like 'DEV-DEMO-%')
     and not exists (select 1 from public.factures o where o.id = f.facture_origine_id
                       and (o.numero like 'DEMO-%' or exists (select 1 from public.devis d where d.id = o.devis_id and d.numero like 'DEV-DEMO-%')));
  if n > 0 then
    raise exception 'Seed interrompu : % facture(s) hors démonstration référence(nt) un client de démo. Base de test uniquement : supprimez-la(les) dans le SQL Editor avec « delete from public.factures f using public.clients c where c.id = f.client_id and c.tags @> array[''démo''] and coalesce(f.numero, '''') not like ''DEMO-%%'' ; » puis relancez.', n;
  end if;

  select count(*) into n from public.devis d
   join public.clients c on c.id = d.client_id
   where d.entreprise_id = v_ent and c.tags @> array['démo'] and d.numero not like 'DEV-DEMO-%';
  if n > 0 then
    raise exception 'Seed interrompu : % devis saisi(s) à la main référence(nt) un client de démo. Rattachez-le(s) à un autre client ou retirez le tag « démo » de ce client.', n;
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

  select count(*) into n from public.lignes_facture l
   join public.produits p on p.id = l.produit_id
   join public.factures f on f.id = l.facture_id
   where p.entreprise_id = v_ent and p.reference like 'DEMO-ART-%' and coalesce(f.numero, '') not like 'DEMO-%'
     and not exists (select 1 from public.devis d where d.id = f.devis_id and d.numero like 'DEV-DEMO-%');
  if n > 0 then
    raise exception 'Seed interrompu : % ligne(s) de facture saisie(s) à la main sont reliée(s) à un article de démo.', n;
  end if;

  select count(*) into n from public.lignes_devis l
   join public.produits p on p.id = l.produit_id
   join public.devis d on d.id = l.devis_id
   where p.entreprise_id = v_ent and p.reference like 'DEMO-ART-%' and d.numero not like 'DEV-DEMO-%';
  if n > 0 then
    raise exception 'Seed interrompu : % ligne(s) de devis saisie(s) à la main sont reliée(s) à un article de démo.', n;
  end if;

  -- 1 bis. Suppression de la démo de factures et de devis précédente (rôle postgres : une facture émise ou un
  -- devis converti ne peut pas être supprimé par un utilisateur). Les factures issues de ces devis partent avec eux,
  -- et les avoirs de ces factures d'abord : un avoir retient sa facture d'origine.
  delete from public.factures a
   using public.factures o
   where o.id = a.facture_origine_id and a.entreprise_id = v_ent
     and (o.numero like 'DEMO-%' or exists (select 1 from public.devis d where d.id = o.devis_id and d.numero like 'DEV-DEMO-%'));
  delete from public.factures f
   using public.devis d
   where d.id = f.devis_id and d.entreprise_id = v_ent and d.numero like 'DEV-DEMO-%';
  delete from public.factures
   where entreprise_id = v_ent and numero like 'DEMO-%';
  delete from public.devis
   where entreprise_id = v_ent and numero like 'DEV-DEMO-%';

  -- 2. Bascule sur l'admin : toutes les écritures suivantes passent par la RLS
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  if auth.uid() is distinct from v_admin then
    raise exception 'Seed interrompu : impossible d''agir au nom de l''administrateur.';
  end if;

  -- 3. Suppression de la démo précédente
  delete from public.opportunites o
   using public.clients c
   where c.id = o.client_id and o.entreprise_id = v_ent and c.tags @> array['démo'];
  delete from public.clients
   where entreprise_id = v_ent and tags @> array['démo'];
  delete from public.produits
   where entreprise_id = v_ent and reference like 'DEMO-ART-%';

  -- 3 bis. Catalogue (10 articles, dont 1 inactif)
  insert into public.produits (entreprise_id, type, reference, nom, description, unite, prix_unitaire_ht, taux_tva, actif)
  select v_ent, v.type, v.reference, v.nom, v.description, v.unite, v.prix, v.tva, v.actif
  from (values
    ('service', 'DEMO-ART-01', 'Main-d''œuvre — heure',                 'Taux horaire compagnon, locaux professionnels', 'h',        45.00, 20, true),
    ('produit', 'DEMO-ART-02', 'Rayonnages métalliques',                'Élément 100 × 40 × 200 cm, 5 tablettes',          'u',       189.00, 20, true),
    ('service', 'DEMO-ART-03', 'Entretien hotte et extraction',         'Dégraissage et contrôle, intervention semestrielle', 'forfait', 1250.00, 20, true),
    ('produit', 'DEMO-ART-04', 'Filtres à graisse inox',                'Filtre à chicanes 500 × 400 mm',                  'u',        85.00, 20, true),
    ('produit', 'DEMO-ART-05', 'Faux plafond acoustique',               'Dalles minérales 600 × 600, fourni posé',         'm²',       62.00, 20, true),
    ('produit', 'DEMO-ART-06', 'Carrelage et faïence',                  'Grès cérame et faïence murale, fourni posé (logement)', 'm²', 48.50, 10, true),
    ('service', 'DEMO-ART-07', 'Sol résine époxy',                      'Préparation du support et deux couches',          'm²',       32.00, 20, true),
    ('produit', 'DEMO-ART-08', 'Éclairage LED',                         'Spot encastré 12 W, fourni posé',                 'u',        74.90, 20, true),
    ('produit', 'DEMO-ART-09', 'Porte coupe-feu EI 30',                 'Bloc-porte 93 × 204 cm, fourni posé',             'u',      1150.00, 20, true),
    ('service', 'DEMO-ART-10', 'Peinture murale (ancien tarif)',        'Remplacé par un forfait : article désactivé',     'm²',       24.00, 10, false)
  ) as v(type, reference, nom, description, unite, prix, tva, actif);


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

  -- 6. Factures (12), créées brouillons : statuts posés à l'étape 7 bis, une fois les lignes en place
  --    Émise il y a k mois (et 3 jours), échéance à émission + délai
  insert into public.factures (entreprise_id, client_id, numero, date_emission, date_echeance,
                               conditions_paiement, mode_paiement)
  select v_ent, c.id, v.numero, e.emission, e.emission + v.delai,
         v.delai || ' jours', 'virement'
  from (values
    ('DEMO-0001', 'Librairie Les Mots Passants',   11, 30),
    ('DEMO-0002', 'Agence immobilière Delmas',     10, 30),
    ('DEMO-0003', 'Le Comptoir des Halles',         9, 30),
    ('DEMO-0004', 'Pharmacie du Marché',            8, 30),
    ('DEMO-0005', 'Cabinet dentaire Lemoine',       7, 30),
    ('DEMO-0006', 'Claire Bonnet',                  6, 30),
    ('DEMO-0007', 'Morel Conseil & Stratégie',      5, 30),
    ('DEMO-0008', 'Transports Guérin',              4, 30),
    ('DEMO-0009', 'Boulangerie Fournier',           3, 30),
    ('DEMO-0010', 'Mécanique de précision Arnaud',  2, 30),
    ('DEMO-0011', 'Agence immobilière Delmas',      1, 45),
    ('DEMO-0012', 'Le Comptoir des Halles',         0, 30)
  ) as v(numero, client, k, delai)
  cross join lateral (select (current_date - make_interval(months => v.k) - interval '3 days')::date as emission) e
  join public.clients c
    on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo'];

  -- 7. Lignes de facture (23)
  insert into public.lignes_facture (entreprise_id, facture_id, position, description, unite,
                                     quantite, prix_unitaire, taux_tva, reference, produit_id)
  select v_ent, f.id, v.pos, v.description, v.unite, v.quantite, v.prix, v.tva, p.reference, p.id
  from (values
    ('DEMO-0001', 0, 'Aménagement de la réserve — main d''œuvre',          'h',       24,    45.00, 20, 'DEMO-ART-01'),
    ('DEMO-0001', 1, 'Rayonnages métalliques',                             'u',        6,   189.00, 20, 'DEMO-ART-02'),
    ('DEMO-0002', 0, 'Remise en peinture appartement T3 — main d''œuvre',  'forfait',  1,  2400.00, 10, null),
    ('DEMO-0002', 1, 'Peintures et fournitures',                           'forfait',  1,   640.00, 10, null),
    ('DEMO-0003', 0, 'Entretien hotte et extraction — semestre',           'forfait',  1,  1250.00, 20, 'DEMO-ART-03'),
    ('DEMO-0003', 1, 'Filtres à graisse inox',                             'u',        4,    85.00, 20, 'DEMO-ART-04'),
    ('DEMO-0004', 0, 'Réaménagement de l''officine — acompte',             'forfait',  1,  4500.00, 20, null),
    ('DEMO-0005', 0, 'Cloisonnement de la salle de soins',                 'forfait',  1,  3850.00, 20, null),
    ('DEMO-0005', 1, 'Faux plafond acoustique',                            'm²',      18,    62.00, 20, 'DEMO-ART-05'),
    ('DEMO-0006', 0, 'Rénovation salle de bains — main d''œuvre',          'forfait',  1,  4200.00, 10, null),
    ('DEMO-0006', 1, 'Carrelage et faïence',                               'm²',      22,    48.50, 10, 'DEMO-ART-06'),
    ('DEMO-0007', 0, 'Aménagement open space — main d''œuvre',             'forfait',  1,  7600.00, 20, null),
    ('DEMO-0007', 1, 'Postes de travail équipés',                          'u',        8,   412.50, 20, null),
    ('DEMO-0008', 0, 'Réfection du sol de l''atelier — résine époxy',      'm²',     240,    32.00, 20, 'DEMO-ART-07'),
    ('DEMO-0008', 1, 'Marquage au sol',                                    'forfait',  1,   950.00, 20, null),
    ('DEMO-0009', 0, 'Mise aux normes électriques du fournil',             'forfait',  1,  2980.00, 20, null),
    ('DEMO-0009', 1, 'Éclairage LED de la vitrine',                        'u',       12,    74.90, 20, 'DEMO-ART-08'),
    ('DEMO-0010', 0, 'Maintenance préventive du bâtiment — trimestre',     'forfait',  1,  1800.00, 20, null),
    ('DEMO-0010', 1, 'Remplacement de portes coupe-feu',                   'u',        2,  1150.00, 20, 'DEMO-ART-09'),
    ('DEMO-0011', 0, 'Rafraîchissement des parties communes — main d''œuvre','forfait', 1,  3600.00, 10, null),
    ('DEMO-0011', 1, 'Éclairage du hall avec détecteurs',                  'u',        6,    95.00, 10, null),
    ('DEMO-0012', 0, 'Création d''un bar en chêne massif',                 'forfait',  1,  5400.00, 20, null),
    ('DEMO-0012', 1, 'Pose et finitions',                                  'forfait',  1,  1200.00, 20, null)
  ) as v(numero, pos, description, unite, quantite, prix, tva, article)
  join public.factures f on f.entreprise_id = v_ent and f.numero = v.numero
  left join public.produits p on p.entreprise_id = v_ent and p.reference = v.article and p.deleted_at is null;

  -- 7 bis. Statuts des factures (rôle postgres, sans utilisateur) : le trigger fige totaux et identités ;
  -- DEMO-NNNN reste hors séquence, seule une vraie finalisation attribue un numéro.
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
  update public.factures f set statut = v.statut
    from (values
      ('DEMO-0001', 'envoyee'),
      ('DEMO-0002', 'envoyee'),
      ('DEMO-0003', 'envoyee'),
      ('DEMO-0004', 'envoyee'),
      ('DEMO-0005', 'envoyee'),
      ('DEMO-0006', 'envoyee'),
      ('DEMO-0007', 'envoyee'),
      ('DEMO-0008', 'envoyee'),
      ('DEMO-0009', 'envoyee'),
      ('DEMO-0010', 'envoyee'),
      ('DEMO-0011', 'envoyee')
    ) as v(numero, statut)
   where f.entreprise_id = v_ent and f.numero = v.numero;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 8. Paiements (9) : TTC réglé, acompte en retard (DEMO-0007), acompte à échoir (DEMO-0011)
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
    ('DEMO-0009', 18, 4654.56, 'carte',    'CB 0918'),
    ('DEMO-0011',  5, 1000.00, 'virement', 'Acompte')
  ) as v(numero, jours, montant, mode, reference)
  join public.factures f on f.entreprise_id = v_ent and f.numero = v.numero;

  -- 8 bis. Devis (7), créés brouillons : statuts posés à l'étape 8 ter
  -- DEV-DEMO-0006 : émis 10 jours avant DEMO-0009, la facture qui en est issue
  insert into public.devis (entreprise_id, client_id, numero, date_emission, date_validite, remise, message_client, notes_internes)
  select v_ent, c.id, v.numero, e.emission, e.emission + v.validite, v.remise, v.message, v.notes
  from (values
    ('DEV-DEMO-0001', 'Hôtel des Remparts',                 2, 30,   0.00, null, 'Attente des plans de l''architecte.'),
    ('DEV-DEMO-0002', 'Thomas Girard',                      5, 30,   0.00, 'Travaux dans un logement de plus de deux ans : TVA à 10 %.', null),
    ('DEV-DEMO-0003', 'Cabinet dentaire Lemoine',          12, 30, 150.00, 'Remise commerciale accordée pour la seconde salle de soins.', 'Accord donné par téléphone.'),
    ('DEV-DEMO-0004', 'Menuiserie Chevalier',               8, 30,   0.00, null, 'Budget trop élevé pour le client.'),
    ('DEV-DEMO-0005', 'Clinique vétérinaire des Tilleuls', 40, 30,   0.00, null, null),
    ('DEV-DEMO-0007', 'Agence immobilière Delmas',         35, 30,   0.00, null, 'À relancer : validité dépassée.')
  ) as v(numero, client, age, validite, remise, message, notes)
  cross join lateral (select (current_date - v.age) as emission) e
  join public.clients c
    on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo'];

  insert into public.devis (entreprise_id, client_id, numero, date_emission, date_validite, remise)
  select v_ent, f.client_id, 'DEV-DEMO-0006', f.date_emission - 10, f.date_emission + 20, f.remise
  from public.factures f
  where f.entreprise_id = v_ent and f.numero = 'DEMO-0009';

  insert into public.lignes_devis (entreprise_id, devis_id, position, description, unite,
                                   quantite, prix_unitaire, taux_tva, reference, produit_id)
  select v_ent, d.id, v.pos, v.description, v.unite, v.quantite, v.prix, v.tva, p.reference, p.id
  from (values
    ('DEV-DEMO-0001', 0, 'Rénovation de 12 chambres — main-d''œuvre',    'forfait',  1, 24000.00, 10, null),
    ('DEV-DEMO-0001', 1, 'Carrelage et faïence des salles d''eau',       'm²',      96,    48.50, 10, 'DEMO-ART-06'),
    ('DEV-DEMO-0002', 0, 'Dépose et rénovation de la cuisine',           'forfait',  1,  6200.00, 10, null),
    ('DEV-DEMO-0002', 1, 'Carrelage et faïence',                         'm²',      14,    48.50, 10, 'DEMO-ART-06'),
    ('DEV-DEMO-0003', 0, 'Aménagement de la seconde salle de soins',     'forfait',  1,  8900.00, 20, null),
    ('DEV-DEMO-0003', 1, 'Faux plafond acoustique',                      'm²',      20,    62.00, 20, 'DEMO-ART-05'),
    ('DEV-DEMO-0003', 2, 'Éclairage LED',                                'u',        8,    74.90, 20, 'DEMO-ART-08'),
    ('DEV-DEMO-0004', 0, 'Mise aux normes accessibilité PMR',            'forfait',  1,  7200.00, 20, null),
    ('DEV-DEMO-0005', 0, 'Agrandissement de la salle d''attente',        'forfait',  1, 15400.00, 20, null),
    ('DEV-DEMO-0007', 0, 'Rénovation de 3 logements locatifs',           'forfait',  1, 28000.00, 10, null),
    ('DEV-DEMO-0007', 1, 'Peinture murale (ancien tarif)',               'm²',     120,    24.00, 10, 'DEMO-ART-10')
  ) as v(numero, pos, description, unite, quantite, prix, tva, article)
  join public.devis d on d.entreprise_id = v_ent and d.numero = v.numero
  left join public.produits p on p.entreprise_id = v_ent and p.reference = v.article and p.deleted_at is null;

  -- DEV-DEMO-0006 : mêmes lignes que sa facture
  insert into public.lignes_devis (entreprise_id, devis_id, position, description, reference, unite,
                                   quantite, prix_unitaire, taux_tva, remise, produit_id)
  select v_ent, d.id, l.position, l.description, l.reference, l.unite,
         l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.produit_id
  from public.lignes_facture l
  join public.factures f on f.id = l.facture_id and f.entreprise_id = v_ent and f.numero = 'DEMO-0009'
  join public.devis d on d.entreprise_id = v_ent and d.numero = 'DEV-DEMO-0006';

  execute 'reset role';

  -- 8 ter. Lien de la facture émise et statuts des devis (rôle postgres, sans utilisateur : règles non appliquées)
  perform set_config('request.jwt.claims', '{}', true);
  update public.factures f set devis_id = d.id
    from public.devis d
   where d.entreprise_id = v_ent and d.numero = 'DEV-DEMO-0006'
     and f.entreprise_id = v_ent and f.numero = 'DEMO-0009';

  update public.devis d set statut = v.statut
    from (values
      ('DEV-DEMO-0002', 'envoye'),
      ('DEV-DEMO-0003', 'accepte'),
      ('DEV-DEMO-0004', 'refuse'),
      ('DEV-DEMO-0005', 'expire'),
      ('DEV-DEMO-0006', 'converti'),
      ('DEV-DEMO-0007', 'envoye')
    ) as v(numero, statut)
   where d.entreprise_id = v_ent and d.numero = v.numero;

  -- 8 quater. Avoirs (rôle postgres, sans utilisateur) : créés brouillons, le statut fige leurs totaux négatifs.
  -- DEMO-AV-0001 : total, annule DEMO-0004 ; DEMO-AV-0002 : partiel sur DEMO-0005, déjà payée, puis remboursé.
  insert into public.factures (entreprise_id, client_id, numero, type, facture_origine_id, avoir_total, motif, remise, date_emission)
  select v_ent, f.client_id, v.numero, 'avoir', f.id, v.total, v.motif, case when v.total then f.remise else 0 end, f.date_emission + v.jours
  from (values
    ('DEMO-AV-0001', 'DEMO-0004', true,  'Commande annulée par le client avant le démarrage du chantier.', 20),
    ('DEMO-AV-0002', 'DEMO-0005', false, 'Geste commercial : reprise de finitions.', 35)
  ) as v(numero, origine, total, motif, jours)
  join public.factures f on f.entreprise_id = v_ent and f.numero = v.origine;

  insert into public.lignes_facture (entreprise_id, facture_id, position, description, unite, quantite, prix_unitaire, taux_tva, remise, reference, produit_id)
  select v_ent, a.id, l.position, l.description, l.unite, l.quantite, l.prix_unitaire, l.taux_tva, l.remise, l.reference, l.produit_id
  from public.factures a
  join public.lignes_facture l on l.facture_id = a.facture_origine_id
  where a.entreprise_id = v_ent and a.numero = 'DEMO-AV-0001';

  insert into public.lignes_facture (entreprise_id, facture_id, position, description, quantite, prix_unitaire, taux_tva)
  select v_ent, a.id, 0, 'Reprise de finitions sur la salle de soins', 1, 200, 20
  from public.factures a
  where a.entreprise_id = v_ent and a.numero = 'DEMO-AV-0002';

  update public.factures set statut = 'envoyee'
   where entreprise_id = v_ent and numero in ('DEMO-AV-0001', 'DEMO-AV-0002');

  insert into public.paiements (entreprise_id, facture_id, date, montant, mode, reference, sens)
  select v_ent, f.id, a.date_emission + 5, 240.00, 'virement', 'Remboursement DEMO-AV-0002', 'remboursement'
  from public.factures f
  join public.factures a on a.facture_origine_id = f.id and a.numero = 'DEMO-AV-0002'
  where f.entreprise_id = v_ent and f.numero = 'DEMO-0005';

  -- 8 quinquies. Acompte et solde sur DEV-DEMO-0008 (1 750 € TTC) ; DEV-DEMO-0009 reste accepté et libre.
  insert into public.devis (entreprise_id, client_id, numero, date_emission, date_validite, statut)
  select v_ent, c.id, v.numero, current_date - v.age, current_date - v.age + 60, 'accepte'
  from (values
    ('DEV-DEMO-0008', 'Bâtiments Rénov''Est', 30),
    ('DEV-DEMO-0009', 'Hôtel des Remparts',    5)
  ) as v(numero, client, age)
  join public.clients c on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo'];

  insert into public.lignes_devis (entreprise_id, devis_id, position, description, quantite, prix_unitaire, taux_tva)
  select v_ent, d.id, v.pos, v.description, 1, v.prix, v.tva
  from (values
    (0, 'Second œuvre — bâtiment professionnel', 1000.00, 20),
    (1, 'Second œuvre — logements',               500.00, 10)
  ) as v(pos, description, prix, tva)
  join public.devis d on d.entreprise_id = v_ent and d.numero in ('DEV-DEMO-0008', 'DEV-DEMO-0009');

  insert into public.factures (entreprise_id, client_id, numero, type, devis_id, acompte_mode, acompte_valeur, date_emission, date_echeance)
  select v_ent, d.client_id, 'DEMO-ACP-0001', 'acompte', d.id, 'pourcentage', 30, d.date_emission + 2, current_date + 10
  from public.devis d where d.entreprise_id = v_ent and d.numero = 'DEV-DEMO-0008';

  insert into public.lignes_facture (entreprise_id, facture_id, position, description, quantite, prix_unitaire, taux_tva)
  select v_ent, f.id, v.pos, v.description, 1, v.prix, v.tva
  from (values
    (0, 'Acompte de 30 % sur le devis DEV-DEMO-0008 (TVA 20 %)', 300.00, 20),
    (1, 'Acompte de 30 % sur le devis DEV-DEMO-0008 (TVA 10 %)', 150.00, 10)
  ) as v(pos, description, prix, tva)
  join public.factures f on f.entreprise_id = v_ent and f.numero = 'DEMO-ACP-0001';

  update public.factures set statut = 'envoyee' where entreprise_id = v_ent and numero = 'DEMO-ACP-0001';
  insert into public.paiements (entreprise_id, facture_id, date, montant, mode, reference)
  select v_ent, f.id, f.date_emission + 3, 525.00, 'virement', 'VIR DEMO-ACP-0001'
  from public.factures f where f.entreprise_id = v_ent and f.numero = 'DEMO-ACP-0001';

  insert into public.factures (entreprise_id, client_id, numero, type, devis_id, date_emission, date_echeance)
  select v_ent, d.client_id, 'DEMO-SLD-0001', 'solde', d.id, current_date - 5, current_date + 25
  from public.devis d where d.entreprise_id = v_ent and d.numero = 'DEV-DEMO-0008';

  insert into public.lignes_facture (entreprise_id, facture_id, position, description, quantite, prix_unitaire, taux_tva)
  select v_ent, f.id, l.position, l.description, l.quantite, l.prix_unitaire, l.taux_tva
  from public.factures f
  join public.lignes_devis l on l.devis_id = f.devis_id
  where f.entreprise_id = v_ent and f.numero = 'DEMO-SLD-0001';

  update public.factures set statut = 'envoyee' where entreprise_id = v_ent and numero = 'DEMO-SLD-0001';
  update public.devis set statut = 'converti' where entreprise_id = v_ent and numero = 'DEV-DEMO-0008';

  -- 8 sexies. Une relance déjà préparée sur DEMO-0008 : le niveau 2 est proposé, 15 jours étant passés
  insert into public.relances (entreprise_id, facture_id, niveau, objet, corps, destinataire, reste_a_payer, auteur, auteur_nom, created_at)
  select v_ent, f.id, 1, 'Rappel de paiement : facture DEMO-0008',
         'Bonjour, sauf erreur de notre part, le règlement de la facture DEMO-0008 ne nous est pas encore parvenu.',
         c.email, f.total_ttc, v_admin, 'Démonstration', now() - interval '20 days'
  from public.factures f join public.clients c on c.id = f.client_id
  where f.entreprise_id = v_ent and f.numero = 'DEMO-0008';

  -- 8 septies. Activités et tâches (migration 012), au nom de l'admin : RLS et triggers s'appliquent.
  -- Dates relatives : les quatre états d'une tâche (en retard, aujourd'hui, à venir, faite) restent visibles à chaque rejeu.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.activites (entreprise_id, type, client_id, opportunite_id, date_activite, commentaire)
  select v_ent, v.type, c.id, o.id, now() - make_interval(days => v.jours), v.commentaire
  from (values
    ('Agence immobilière Delmas', 'appel',       null::text,                            2, 'Point sur le paiement de DEMO-0011 : virement du solde annoncé pour la fin du mois.'),
    ('Agence immobilière Delmas', 'rendez_vous', 'Rénovation de 3 logements locatifs', 10, 'Visite des trois logements avec le gestionnaire ; métrés relevés.'),
    ('Agence immobilière Delmas', 'email',       null,                                  5, 'Envoi du devis DEV-DEMO-0007 pour les trois logements.'),
    ('Transports Guérin',         'note',        null,                                  1, 'Comptabilité du client injoignable ; rappeler en début de semaine.')
  ) as v(client, type, opportunite, jours, commentaire)
  join public.clients c on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo']
  left join public.opportunites o on o.entreprise_id = v_ent and o.client_id = c.id and o.nom = v.opportunite;

  insert into public.taches (entreprise_id, titre, echeance, responsable, statut, client_id, opportunite_id, devis_id, facture_id, origine)
  select v_ent, v.titre, public.date_du_jour_paris() + v.jours, v_admin, v.statut,
         c.id, o.id, d.id, f.id, v.origine
  from (values
    ('Relancer la facture DEMO-0008' || chr(160) || ': 2e relance', -1, 'a_faire', null::text,                  null::text,                      null::text,      'DEMO-0008', 'relance'),
    ('Appeler l''agence Delmas pour le solde de DEMO-0011',    0, 'a_faire', 'Agence immobilière Delmas', null,                            null,            null,        null),
    ('Préparer le chiffrage de la terrasse couverte',          3, 'a_faire', null,                         'Terrasse couverte et chauffée', null,            null,        null),
    ('Envoyer le devis DEV-DEMO-0003',                        -4, 'faite',   null,                         null,                            'DEV-DEMO-0003', null,        null)
  ) as v(titre, jours, statut, client, opportunite, devis, facture, origine)
  left join public.clients c on c.entreprise_id = v_ent and c.nom = v.client and c.tags @> array['démo']
  left join public.opportunites o on o.entreprise_id = v_ent and o.nom = v.opportunite
  left join public.devis d on d.entreprise_id = v_ent and d.numero = v.devis
  left join public.factures f on f.entreprise_id = v_ent and f.numero = v.facture;

  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
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

  select count(*) into n from public.factures where entreprise_id = v_ent and numero like 'DEMO-%' and type = 'facture';
  if n <> 12 then raise exception 'Contrôle seed : % facture(s) de démo au lieu de 12', n; end if;

  -- Avoirs : montants au centime, DEMO-0004 annulée par son avoir total, DEMO-0005 payée et remboursée
  select count(*) into n from public.factures a join public.factures o on o.id = a.facture_origine_id
   where a.entreprise_id = v_ent and a.type = 'avoir' and a.statut = 'envoyee'
     and ((a.numero = 'DEMO-AV-0001' and a.avoir_total and o.numero = 'DEMO-0004' and o.statut = 'annulee' and a.total_ttc = -o.total_ttc)
       or (a.numero = 'DEMO-AV-0002' and not a.avoir_total and o.numero = 'DEMO-0005' and o.statut = 'envoyee' and a.total_ttc = -240));
  if n <> 2 then raise exception 'Contrôle seed : % avoir(s) de démo cohérent(s) au lieu de 2', n; end if;
  select count(*) into n from public.factures_soldes s join public.factures f on f.id = s.facture_id
   where f.entreprise_id = v_ent and f.numero in ('DEMO-0004', 'DEMO-0005') and s.reste_a_payer = 0 and s.trop_percu = 0;
  if n <> 2 then raise exception 'Contrôle seed : soldes de DEMO-0004 et DEMO-0005 incohérents'; end if;

  select count(*) into n from public.lignes_facture l join public.factures f on f.id = l.facture_id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%' and f.type = 'facture';
  if n <> 23 then raise exception 'Contrôle seed : % ligne(s) de facture au lieu de 23', n; end if;

  select count(*) into n from public.paiements p join public.factures f on f.id = p.facture_id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%';
  if n <> 11 then raise exception 'Contrôle seed : % paiement(s) au lieu de 11', n; end if;

  -- Statuts calculés : un cas de chaque, au jour du seed
  select count(*) into n from public.factures f join public.factures_soldes s on s.facture_id = f.id
   where f.entreprise_id = v_ent
     and ((f.numero in ('DEMO-0001', 'DEMO-0002', 'DEMO-0003', 'DEMO-0005', 'DEMO-0006', 'DEMO-0009', 'DEMO-ACP-0001') and s.statut_calcule = 'payee')
       or (f.numero in ('DEMO-0007', 'DEMO-0008', 'DEMO-0010') and s.statut_calcule = 'en_retard' and s.jours_retard > 0)
       or (f.numero = 'DEMO-0011' and s.statut_calcule = 'partiellement_payee')
       or (f.numero = 'DEMO-SLD-0001' and s.statut_calcule = 'envoyee')
       or (f.numero = 'DEMO-0004' and s.statut_calcule = 'annulee')
       or (f.numero = 'DEMO-0012' and s.statut_calcule = 'brouillon'));
  if n <> 14 then raise exception 'Contrôle seed : % statut(s) calculé(s) attendu(s) au lieu de 14', n; end if;

  select count(*) into n from public.relances rel join public.factures f on f.id = rel.facture_id
   where f.entreprise_id = v_ent and f.numero = 'DEMO-0008' and rel.niveau = 1;
  if n <> 1 then raise exception 'Contrôle seed : % relance(s) de démo au lieu de 1', n; end if;

  -- Acompte et solde : 525 + 1 225 = 1 750, au centime
  select count(*) into n
    from public.factures a
    join public.factures s on s.devis_id = a.devis_id and s.numero = 'DEMO-SLD-0001' and s.type = 'solde' and s.statut = 'envoyee'
    join public.devis_totaux t on t.devis_id = a.devis_id
   where a.entreprise_id = v_ent and a.numero = 'DEMO-ACP-0001' and a.type = 'acompte' and a.statut = 'envoyee'
     and a.total_ttc = 525 and s.total_ttc = 1225 and t.total_ttc = 1750 and jsonb_array_length(s.acomptes_deduits) = 1;
  if n <> 1 then raise exception 'Contrôle seed : acompte et solde de démo incohérents'; end if;

  -- Totaux figés sur les 11 factures émises, les 2 avoirs, l'acompte et le solde, égaux à la vue ; un seul brouillon
  select count(*) into n from public.factures f join public.factures_totaux t on t.facture_id = f.id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%' and f.statut <> 'brouillon'
     and f.total_ttc = t.total_ttc and f.tva_detail is not null and f.client_fige is not null and f.emetteur_fige is not null;
  if n <> 15 then raise exception 'Contrôle seed : % document(s) émis figé(s) au lieu de 15', n; end if;
  select count(*) into n from public.factures
   where entreprise_id = v_ent and numero like 'DEMO-%' and statut = 'brouillon' and total_ttc is null;
  if n <> 1 then raise exception 'Contrôle seed : % brouillon(s) de démo au lieu de 1', n; end if;

  select count(*) into n from public.produits where entreprise_id = v_ent and reference like 'DEMO-ART-%' and deleted_at is null;
  if n <> 10 then raise exception 'Contrôle seed : % article(s) de démo au lieu de 10', n; end if;

  select count(*) into n from public.lignes_facture l join public.factures f on f.id = l.facture_id
   join public.produits p on p.id = l.produit_id
   where f.entreprise_id = v_ent and f.numero like 'DEMO-%' and f.type = 'facture' and p.actif and p.entreprise_id = v_ent;
  if n <> 9 then raise exception 'Contrôle seed : % ligne(s) reliée(s) à un article actif au lieu de 9', n; end if;

  select count(*) into n from public.devis where entreprise_id = v_ent and numero like 'DEV-DEMO-%';
  if n <> 9 then raise exception 'Contrôle seed : % devis de démo au lieu de 9', n; end if;

  select count(*) into n from public.lignes_devis l join public.devis d on d.id = l.devis_id
   where d.entreprise_id = v_ent and d.numero like 'DEV-DEMO-%';
  if n <> 17 then raise exception 'Contrôle seed : % ligne(s) de devis au lieu de 17', n; end if;

  select count(distinct statut) into n from public.devis where entreprise_id = v_ent and numero like 'DEV-DEMO-%';
  if n <> 6 then raise exception 'Contrôle seed : % statut(s) de devis au lieu de 6', n; end if;

  -- Devis converti : relié à sa facture, totaux identiques ; aucun autre devis de démo relié
  select count(*) into n from public.factures f join public.devis d on d.id = f.devis_id
   where d.entreprise_id = v_ent and d.numero like 'DEV-DEMO-%' and f.type = 'facture';
  if n <> 1 then raise exception 'Contrôle seed : % devis de démo relié(s) à une facture au lieu de 1', n; end if;
  select count(*) into n
    from public.devis d
    join public.factures f on f.devis_id = d.id
    join public.devis_totaux dt on dt.devis_id = d.id
    join public.factures_totaux ft on ft.facture_id = f.id
   where d.entreprise_id = v_ent and d.numero = 'DEV-DEMO-0006' and d.statut = 'converti' and f.numero = 'DEMO-0009'
     and dt.total_ttc = ft.total_ttc and dt.total_ht = ft.total_ht and dt.total_tva = ft.total_tva;
  if n <> 1 then raise exception 'Contrôle seed : DEV-DEMO-0006 incohérent avec sa facture DEMO-0009'; end if;

  -- Validité : cohérente avec le statut ; DEV-DEMO-0007 démontre la validité dépassée
  select count(*) into n from public.devis
   where entreprise_id = v_ent and numero like 'DEV-DEMO-%'
     and ((statut = 'expire' and date_validite >= current_date)
       or (statut = 'accepte' and date_validite < current_date)
       or (numero = 'DEV-DEMO-0007' and date_validite >= current_date)
       or (numero = 'DEV-DEMO-0002' and date_validite < current_date));
  if n > 0 then raise exception 'Contrôle seed : % devis aux dates de validité incohérentes', n; end if;

  -- Chronologie : aucun devis antérieur à la création de son client
  select count(*) into n from public.devis d join public.clients c on c.id = d.client_id
   where d.entreprise_id = v_ent and d.numero like 'DEV-DEMO-%' and d.date_emission < c.created_at::date;
  if n > 0 then raise exception 'Contrôle seed : % devis antérieur(s) à la création du client', n; end if;

  -- Cohérence paiements / statut, au centime
  for r in
    select f.numero, s.statut_calcule as statut, s.total_ttc - s.avoirs_ttc as total_ttc, s.encaisse_net as paye
    from public.factures f join public.factures_soldes s on s.facture_id = f.id
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
    if r.statut in ('finalisee', 'envoyee') and r.paye > 0 then
      raise exception 'Contrôle seed : % au statut % porte des paiements', r.numero, r.statut;
    end if;
  end loop;

  -- Brouillon de démo : échéance à venir, pour pouvoir le finaliser
  select count(*) into n from public.factures
   where entreprise_id = v_ent and numero like 'DEMO-%' and type <> 'avoir' and statut = 'brouillon' and date_echeance < current_date;
  if n > 0 then raise exception 'Contrôle seed : % brouillon(s) déjà échu(s)', n; end if;

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

  -- Activités et tâches : auteur figé, quatre états de tâche au jour du seed, tous liés à la démo
  select count(*) into n from public.activites a join public.clients c on c.id = a.client_id
   where a.entreprise_id = v_ent and c.tags @> array['démo'] and a.auteur is not null and a.deleted_at is null;
  if n <> 4 then raise exception 'Contrôle seed : % activité(s) de démo au lieu de 4', n; end if;
  select count(*) into n from public.taches t
   where t.entreprise_id = v_ent and t.deleted_at is null
     and ((t.statut = 'a_faire' and t.echeance = public.date_du_jour_paris() - 1 and t.origine = 'relance')
       or (t.statut = 'a_faire' and t.echeance = public.date_du_jour_paris() and t.client_id is not null)
       or (t.statut = 'a_faire' and t.echeance = public.date_du_jour_paris() + 3 and t.opportunite_id is not null)
       or (t.statut = 'faite' and t.faite_le is not null and t.devis_id is not null));
  if n <> 4 then raise exception 'Contrôle seed : % tâche(s) de démo dans les états attendus au lieu de 4', n; end if;

  raise notice 'Seed terminé : 15 clients, 10 opportunités, 12 factures (23 lignes), 2 avoirs, 1 acompte, 1 solde, 11 paiements dont 1 remboursement, 1 relance, 10 articles, 9 devis (17 lignes), 4 activités, 4 tâches.';
end $$;

commit;
