# LaGestion — Feuille de route et prompts Claude Code (V3.2)

6 novembre 2026 · Beros

Cette version réunit en un seul plan :
- la feuille de route V3.1 (état réel du projet, prompts à venir) ;
- le **PRD V3.0.2** (exigences MVP SAAS-01 à SUB-01, parcours de recette, politique IWa) ;
- les prompts **V3.0.2** et le `CLAUDE.md` qui les accompagne ;
- l'historique des prompts 0 à 4 (`LaGestion_Prompts_Claude_Code.md`).

**Ce qui change par rapport à la V3.1 :**
- Une section **Hiérarchie des sources** tranche les contradictions entre ces documents.
- Une **matrice de couverture du PRD** indique, pour chaque exigence, ce qui est fait et quel prompt la termine.
- Un nouveau **prompt 11-0** (aucun code) intègre au `CLAUDE.md` du dépôt les bonnes règles du `CLAUDE.md` V3.0.2, sans ses contradictions.
- Les exigences du PRD encore absentes (MFA des admins, suspension de membres, changement d'entreprise, devis en attente au tableau de bord, exports côté serveur, rate limiting, droits RGPD, rôle chef de chantier) sont ajoutées aux prompts 13 à 22.
- La numérotation des prompts 11 bis à 22 ne change pas : les références déjà notées restent valables.

## 1. Mode d'emploi

1. Ouvrez VS Code sur `C:\Users\bkabe\Desktop\LaGestion_CRM-projet`, branche `v2-multitenant`.
2. Collez **un seul prompt** dans Claude Code (tout le bloc gris).
3. Lisez son plan ; demandez une relecture si besoin, puis répondez « go ».
4. Exécutez dans Supabase les fichiers SQL qu'il livre, dans l'ordre indiqué (migration, puis test, puis seed s'il a changé).
5. Testez dans l'application, puis demandez-lui de pousser sur GitHub.

**Règle d'or :** on ne passe à l'étape suivante qu'une fois la précédente testée, commitée et poussée.

**Avant de copier un fichier SQL dans Supabase :** rechargez-le depuis le disque (*File : Revert File* dans VS Code) si l'onglet était ouvert pendant que Claude Code travaillait, pour ne jamais coller une version périmée.

## 2. Hiérarchie des sources

| Rang | Document | Rôle |
| --- | --- | --- |
| 1 | `CLAUDE.md` **du dépôt** | Règles de travail, design system, décisions techniques. Seule source pour Claude Code. |
| 2 | `docs/PRD_LaGestion_V3.0.2.md` | Exigences fonctionnelles du MVP (SAAS-01 à SUB-01) et critères d'acceptation. |
| 3 | `docs/LaGestion_Cahier_des_charges_V2.md` | Détail fonctionnel historique ; complété par le PRD. |
| 4 | Cette feuille de route | Ordre d'exécution et prompts. |
| — | `CLAUDE.md` V3.0.2 (fourni avec les prompts V3.0.2) | **Ne pas copier dans le dépôt.** Seules certaines règles sont reprises (prompt 11-0). |
| — | `LaGestion_Prompts_Claude_Code.md` | Historique des prompts 0 à 4 ; à conserver, mais plus à utiliser. |

**Contradictions tranchées :** en cas de désaccord entre le PRD et une décision déjà mise en œuvre, la décision en vigueur l'emporte ; Claude Code signale l'écart et demande un arbitrage.

| Sujet | PRD / `CLAUDE.md` V3.0.2 | Décision en vigueur | Pourquoi |
| --- | --- | --- | --- |
| Framework | Next.js + TypeScript strict | React 18 + Vite, JavaScript | 11 étapes déjà livrées ; une migration coûterait des semaines sans gain pour le MVP |
| Clé d'isolation | `tenant_id` | `entreprise_id` | Même rôle, déjà en place dans toutes les tables et la RLS |
| Noms des tables | anglais (`quotes`, `invoices`…) | français (`devis`, `factures`…) | Déjà en place ; aucun intérêt à renommer |
| Rôles | propriétaire, administrateur, commercial, gestion/comptabilité, chef de chantier, lecteur/auditeur | admin, manager, commercial, comptable, lecture | Correspondance : propriétaire et administrateur → admin ; gestion → comptable ; lecteur/auditeur → lecture. **Chef de chantier : à ajouter au prompt 18** |
| Palette | #489AF0, #245A8D, #F7F9FC, #243247, #C8A55A | Primaire #2D5B7F, thème gris perle, barre latérale sombre | Design system appliqué et contrastes vérifiés ; **à clore définitivement** (voir section 3) |
| Accessibilité | WCAG 2.2 AA | WCAG 2.1 AA jusqu'ici | **Cible relevée à 2.2 AA** à partir du prompt 11-0 |
| Exports | Générés côté serveur, jobs idempotents | Excel généré dans le navigateur | Acceptable pour le pilote ; **passage côté serveur au prompt 15** pour les exports lourds et audités |
| Tests E2E | Unitaires, intégration, E2E | Tests SQL, mutations, concurrence, banc local Edge | **Outil E2E à arbitrer au prompt 21** (Playwright, avec votre accord) |

## 3. Décisions

### Décisions qui restent valables

| Sujet | Décision |
| --- | --- |
| Backend | Supabase (Postgres, Auth, RLS, fonctions SQL), Edge Functions avant tout serveur Python |
| Isolation | `entreprise_id` + table `memberships`, RLS sur chaque table métier |
| Calculs financiers | Une seule règle (migration 005), identique en JS et en SQL, au centime, jamais confiée au LLM |
| Statut de paiement | Calculé à la lecture (`statutCalcule` en JS, `statut_paiement` en SQL), jamais stocké ni choisi à la main |
| Documents émis | Numérotation légale sous verrou, contenu, totaux et identités figés à la finalisation ; correction uniquement par avoir |
| Interface | Thème gris perle, barre latérale sombre, tokens uniquement |
| Graphiques et animations | Recharts uniquement, animations en CSS sur transform et opacity |
| Actions externes | Aucun envoi d'e-mail, paiement réel ou déploiement en production sans accord explicite |
| Méthode | Plan → « go » → livraison testée → commit séparé → push après validation sur Supabase |

### Décisions encore ouvertes

| Sujet | Options | Quand trancher |
| --- | --- | --- |
| Palette | Garder #2D5B7F (recommandé) ou passer à #489AF0 | Avant le prompt 11 bis |
| Devise | Euro seul pour le MVP (recommandé) ou colonne devise explicite (demandée par le PRD) | Prompt 13 |
| Rôle chef de chantier | Nouveau rôle ou droits par chantier | Prompt 18 |
| Fournisseurs LLM, e-mail, paiement | À comparer | Prompts 19 et 20 |
| Tarifs et quotas | Starter, Business IA, BTP Pro | Prompt 20 |
| Plateforme de facturation électronique | Plateformes agréées | Prompt 22 |
| Politique de conservation des données | Durées légales, suppression, archivage | Prompt 22 |

## 4. Couverture du PRD V3.0.2

| ID | Exigence | Fait à ce jour | Reste à faire (prompt) |
| --- | --- | --- | --- |
| SAAS-01 | Auth, tenants, memberships, invitations, rôles, plans, quotas | Auth, isolation, rôles, table invitations, tests d'accès croisé | Écran Équipe, invitations, suspension, dernier admin, changement d'entreprise, MFA (13) ; plans et quotas (20) |
| CRM-01 | Clients, contacts, prospects, pipeline, notes, activités | Clients (statut prospect), opportunités, étapes | Notes, activités, tâches (11 ter) ; recherche et pagination côté base (14) ; gagnée/perdue (17) |
| VEN-01 | Catalogue, taxes, remises, devis, conversion | Fait (étapes 005 à 007) | Lien opportunité → devis (17) |
| FAC-01 | Factures, avoirs, acomptes, échéances, PDF, numérotation | Fait (étapes 008 à 010) | Mentions légales complètes (13) |
| PAY-01 | Paiements manuels, solde, impayés, brouillon de relance | Fait (étape 011) | Couleurs d'état (11 bis) |
| BTP-01 | Chantier, budget, dépenses, pièces, marge | — | Module BTP (18) |
| KPI-01 | CA, devis en attente, impayés, budgets chantier | CA, impayés, encaissements, pipeline | Devis en attente et objectifs (17) ; budgets chantier (18) |
| IWA-01 | IA hybride en lecture, brouillons, alertes | — | IWa (19) |
| EXP-01 | CSV, XLSX, PDF côté serveur, audités | Export Excel des factures et des clients (navigateur) | Exports complets, côté serveur, audités (15) |
| UX-01 | FR/EN, responsive, accessible, navigation clavier | FR, responsive, contrastes AA, focus | i18n FR/EN (16) ; finitions mobile (14) |
| SUB-01 | Abonnements, essais, suspension, quotas | — | Abonnements (20) |

**Parcours de recette du PRD :** le parcours généraliste est déjà réalisable de bout en bout ; le parcours BTP le sera après le prompt 18 ; le parcours sécurité est couvert par les tests SQL d'isolation et sera repris au prompt 21 (UI, API, base, Storage, IWa et exports).

## 5. État d'avancement (6 novembre 2026)

| Étape | Commit | Statut |
| --- | --- | --- |
| 0 à 4 — Cadre, multi-entreprise (002, 003), onboarding, seed, tableau de bord réel | — | Fait |
| Secteur des clients (004), thème gris perle, barre latérale sombre | — | Fait |
| Bouton « Retour », fenêtre « Quitter sans enregistrer ? » | `deb459b` | Fait |
| 05 — Remises, règle de calcul unique (005) | — | Fait |
| 06 — Catalogue produits et services (006) | `a306620` | Fait |
| 07 — Devis et conversion en facture (007) | `1a7628b` | Fait, validé sur Supabase, poussé |
| 08 — Numérotation légale, verrouillage, totaux et identités figés (008) | `6d0492f` | Fait, validé sur Supabase, poussé |
| 09 — Avoirs, annulation, remboursement du trop-perçu (009) | `fb3800b` | Fait, validé sur Supabase, poussé |
| 10 — Factures d'acompte et facture de solde (010) | `e5dd81f` | Fait, validé sur Supabase, poussé |
| 11 — Règlements, statut calculé, écran Impayés, relances (011) | `1ca6ec2` | Fait en local, **à valider sur Supabase puis à pousser** |

**Rappel :** aucune vraie facture ne doit être émise avant l'ajout et la validation des mentions légales (prompt 13).

## 6. Prompts à venir, dans l'ordre

### Prompt 11-0 — Mise à jour du cadre (aucun code)

```markdown
Lis CLAUDE.md en entier. Étape de cadrage, aucun fichier de code ne doit changer.

Je te fournis le PRD V3.0.2 et un CLAUDE.md V3.0.2 écrit pour un autre contexte (Next.js, tenant_id). Ne remplace pas notre CLAUDE.md.

Tâche :
1. Range le PRD dans docs/PRD_LaGestion_V3.0.2.md (il est à la racine du dépôt) ; s'il n'y est pas, dis-le-moi et arrête-toi.
2. Dans CLAUDE.md, section « Références » : le PRD devient la référence des exigences MVP (SAAS-01 à SUB-01), le cahier des charges V2 reste le détail fonctionnel ; en cas de contradiction avec une décision déjà mise en œuvre (React + Vite, entreprise_id, tables en français, rôles actuels, palette en vigueur), signaler et demander un arbitrage.
3. Ajoute à CLAUDE.md, sans dupliquer ce qui existe déjà, ces règles reprises du CLAUDE.md V3.0.2 :
   - ne jamais présenter les PDF comme suffisants pour la facturation électronique française ;
   - aucun changement destructif ni action externe réelle (e-mail, paiement, déploiement en production) sans mon accord explicite ;
   - un choix non spécifié est marqué « à arbitrer », avec options et compromis ;
   - IWa : lecture seule par outils métier, références aux données sources, aucune écriture ni envoi sans approbation, audit, quotas, désactivation par entreprise, protection contre l'injection de prompt ;
   - logs sans données sensibles, jobs idempotents, URLs de fichiers privées ou signées ;
   - cible d'accessibilité relevée à WCAG 2.2 AA.
4. Ajoute un tableau de correspondance des rôles du PRD avec les nôtres (propriétaire et administrateur → admin, gestion/comptabilité → comptable, lecteur/auditeur → lecture, chef de chantier → à arbitrer au module BTP).
5. Dans CLAUDE.md, section « Références », ajoute : docs/LaGestion_Feuille_de_route_V3.md donne l'ordre des étapes et les prompts ; consulte-la au début de chaque étape. Si ce fichier n'est pas dans docs/, dis-le-moi et arrête-toi.

Montre-moi le diff de CLAUDE.md, propose un message de commit et arrête-toi.
```

### Prompt 11 bis — Couleurs d'état des paiements

```markdown
Lis CLAUDE.md en entier et confirme-le avant toute modification. Prérequis : l'étape 011 est validée sur Supabase et poussée.

Objectif : rendre visible le statut de paiement calculé à l'étape 011, par une couleur porteuse de sens (inspiration Stripe / Linear : la couleur informe, elle ne décore pas). Aucune modification de la base.

Règles :
- Le statut vient uniquement de statutCalcule (utils/facture.js), aligné sur statut_paiement en SQL. Ne crée aucune autre fonction de statut.
- Réutilise les jetons fonctionnels existants de theme.js (success, warning, error, info et leurs variantes …Text). N'ajoute une couleur que si un contraste l'impose, et justifie-la.
- La couleur n'est jamais seule porteuse du sens : icône lucide-react et libellé toujours présents.
- Aucune dépendance ajoutée, aucune couleur en dur hors des jetons, transitions limitées à transform et opacity, prefers-reduced-motion respecté.

ÉTAPE 0 — État des lieux (aucune modification)
Liste où le statut de paiement s'affiche aujourd'hui (BadgeStatutFacture, liste des factures, fiche facture, Impayés, carte « Factures liées » de la fiche client, tableau de bord, liste des clients) et ce que chaque écran sait déjà calculer (reste à payer, encaissé net, avoirs).

ÉTAPE 1 — Correspondance statut → jetons (dans CLAUDE.md, section « Couleurs d'état »)
Précise qu'il s'agit de couleurs sémantiques, distinctes de la palette de marque :
- Payée → succès ; Partiellement payée → avertissement ; Finalisée ou envoyée (à échoir) → information ; En retard → erreur ;
- Brouillon, annulée et avoirs → neutre.
Pour chaque statut : couleur de base (liseré, barre), teinte de fond (environ 6 % d'opacité) et couleur de texte.
Donne un tableau des contrastes texte/fond réellement calculés : au moins 4,5:1 pour le texte, 3:1 pour les icônes et le liseré.

ÉTAPE 2 — Composants
- Fais évoluer BadgeStatutFacture (sans en créer un second) : icône (CheckCircle2, CircleDashed, Clock, AlertCircle ou équivalents) + libellé + jetons.
- Barre de progression « X € réglés sur Y € » pour une facture partiellement payée ou en retard avec un encaissement : role="progressbar", aria-valuenow, aria-valuemin, aria-valuemax, aria-label, chiffres tabulaires. Montants issus des fonctions existantes (encaissé net, TTC − avoirs), jamais recalculés à part.

ÉTAPE 3 — Application
- Carte « Factures liées » de la fiche client et écran Impayés : liseré de 4 px à gauche, fond teinté, badge et barre de progression.
- Liste des factures (tableau) : propose ce qui reste lisible dans un tableau (badge seul, ou liseré sur la première cellule) ; pas de lignes entièrement teintées sans mon accord.
- Liste des clients : badge résumant le solde du client (à jour, partiellement réglé, en retard), calculé à partir de ses factures avec les mêmes règles.

Présente ton plan pour ces étapes, avec les fichiers touchés, et attends mon go. Après chaque étape, montre une capture et attends ma validation à l'œil avant la suivante.

Avant de livrer : npm run build et npm test (ajoute des tests JS sur la correspondance statut → jetons et sur le résumé client) ; tableau des contrastes ; navigation au clavier et focus visibles ; rendu à 400, 768 et 1440 px (le débordement connu de /factures reste pour le prompt 14) ; aucune erreur en console ; CLAUDE.md mis à jour (section « Couleurs d'état », composants). Commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 11 ter — Tâches, notes et activités

```markdown
Lis CLAUDE.md. Nouvelle étape : tâches, notes et activités (CRM-01 du PRD, FR-005).

1. Activités et notes : appels, rendez-vous, e-mails, notes, liés à un client ou à une opportunité, avec date, auteur et commentaire. Elles remplissent le bloc « Historique des interactions » de la fiche client, aujourd'hui vide. Les relances préparées (table relances, étape 011) y apparaissent aussi, en lecture seule.
2. Tâches : titre, échéance, responsable, statut (à faire, faite), liées à un client, une opportunité, un devis ou une facture. Page « Mes tâches » et compteur des tâches en retard dans l'en-tête.
3. Tableau de bord : une action suggérée (« Relancer la facture… », « Finaliser le brouillon… », opportunité inactive) peut créer une tâche en un clic.
4. Prochaine migration numérotée libre et son test (droits, isolation) ; seed mis à jour et toujours rejouable.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests SQL 002 à la nouvelle migration en local ; parcours de test ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 12 — Import CSV/XLSX

```markdown
Lis CLAUDE.md. Nouvelle étape : import de clients et d'articles depuis un fichier CSV ou XLSX (FR-003, AC-02).

1. Parcours en 4 temps : choix du fichier → correspondance des colonnes (détection automatique, modifiable) → prévisualisation avec erreurs surlignées ligne par ligne → import.
2. Formats français : dates jj/mm/aaaa, montants avec virgule, encodage UTF-8 et Windows-1252, séparateur ; ou ,.
3. Doublons : réutilise la détection existante (e-mail, SIREN, nom) ; l'utilisateur choisit ignorer, mettre à jour ou créer.
4. Rapport final : nombre de lignes importées, ignorées et en erreur, avec un fichier d'erreurs téléchargeable. Aucune perte silencieuse.
5. Import de 1 000 lignes testé ; insertion par lots, entreprise_id sur chaque ligne.
6. La bibliothèque xlsx est déjà utilisée par utils/excel.js pour l'export : réutilise-la pour la lecture. N'en ajoute aucune autre sans mon accord.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; parcours de test avec un fichier d'exemple fourni dans docs/ ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 13 — Paramètres, mentions légales, équipe et sécurité des comptes

```markdown
Lis CLAUDE.md. Nouvelle étape : paramètres, mentions légales, gestion de l'équipe et sécurité des comptes (SAAS-01 du PRD, FR-001, CFG-001).

Avant de coder, liste les mentions à faire valider par l'expert-comptable et propose tes choix par défaut. Aucune vraie facture n'a encore été émise : c'est la dernière étape avant la première.

1. Paramètres → Profil : modifier son nom.
2. Paramètres → Entreprise (admin) : nom, SIRET, adresse (saisis jusqu'ici en SQL), logo (Supabase Storage, URL privée ou signée), conditions de paiement par défaut.
3. Mentions légales, saisies dans les paramètres et figées dans emetteur_fige à la finalisation :
   - émetteur : forme juridique, capital, RCS ou RM avec la ville, n° de TVA intracommunautaire, mention de franchise de TVA si elle s'applique ;
   - paiement : taux exact des pénalités de retard (remplace la phrase actuelle « taux légal en vigueur » du PDF), indemnité forfaitaire de 40 € pour les clients professionnels, conditions d'escompte ;
   - client : n° de TVA si assujetti ; opération : date de la prestation ou de la livraison, adresse de livraison si elle diffère.
   Ces mentions alimentent le PDF des factures, avoirs, acomptes et soldes, et les modèles de relance (taux des pénalités dans la 2e relance et la mise en demeure).
4. Paramètres → Équipe (admin) : liste des membres et de leur rôle, changement de rôle, suspension et retrait d'un membre, invitations par lien (la table invitations existe déjà). Interdiction en base de retirer, suspendre ou rétrograder le dernier admin. L'envoi d'e-mail d'invitation viendra plus tard : pour l'instant, l'admin copie le lien. Quand un membre passe au rôle lecture ou est retiré, proposer de réassigner ses tâches ouvertes (depuis la migration 012, le responsable d'une tâche doit avoir un rôle qui écrit).
5. Changement d'entreprise : un utilisateur membre de plusieurs entreprises choisit l'entreprise courante dans l'en-tête, sans aucune fuite de données entre elles (test à deux entreprises).
6. Sécurité des comptes : MFA (TOTP de Supabase Auth) proposée à tous et exigée pour les admins ; propose le parcours et attends mon accord avant de rendre la MFA obligatoire.
7. Devise : propose de rester en euro seul pour le MVP ou d'ajouter une devise explicite (PRD) ; à arbitrer avant de coder.
8. Supprime les colonnes doublons profiles.role et profiles.entreprise_id (memberships est la seule source de vérité), après vérification qu'aucun code ne les lit.
9. Prochaine migration numérotée libre et son test ; les factures déjà émises gardent leur emetteur_fige d'origine.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests SQL en local ; parcours de test avec deux comptes et deux entreprises ; PDF d'une facture, d'un avoir, d'un acompte et d'un solde vérifiés ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 14 — Finitions de navigation et d'affichage

```markdown
Lis CLAUDE.md. Nouvelle étape : finitions de navigation et d'affichage (UX-01 du PRD).

1. Remplace les 4 window.confirm restants (suppressions dans Clients.jsx, Opportunites.jsx, Factures.jsx, et suppression d'un paiement dans FactureDetail.jsx) par ConfirmDialog.
2. Migre vers createBrowserRouter et utilise useBlocker, pour que la barre latérale et le bouton « Précédent » du navigateur demandent aussi confirmation quand un formulaire est modifié.
3. Supprime le fil d'Ariane en doublon dans les fiches, puisque l'en-tête affiche désormais le bon.
4. Débordement horizontal à 400 px : /factures (356 px) et /clients (730 px à 400 px, 457 px à 768 px, colonne « Solde » comprise, mesuré à l'étape 12), puis mesure et corrige /catalogue. Cause probable : le texte sr-only « Actions » hors d'un conteneur relatif (correctif déjà appliqué dans Devis.jsx et Impayes.jsx).
5. Bouton « Aperçu » du PDF avant téléchargement, sur les factures, avoirs, acomptes, soldes et devis.
6. Pagination et recherche côté base pour les listes clients, factures et devis (au-delà de quelques centaines de lignes).
7. États vides, de chargement et d'erreur homogènes sur toutes les listes ; navigation complète au clavier (WCAG 2.2 AA).
8. Titres : depuis l'étape 11 quater, le h1 de Layout est masqué (sr-only, libellePage) hors du tableau de bord ; passe le h2 visible de chaque page en h1 et retire le h1 masqué (16 pages).
9. Défilements mesurés à l'étape 11 quater (banc, défilement de page / défilement interne du tableau, en px), à corriger page par page, au besoin en cartes comme Impayés :
   - /clients : 89 / 141 à 1 280 ; 457 / 509 à 768 ; 740 / 769 à 390.
   - /factures : 108 / 160 à 768 ; 392 / 420 à 390.
   - /catalogue : 86 / 168 à 768 ; 369 / 428 à 390.
   - /devis : 0 / 157 à 768 ; 0 / 432 à 390.
   - Fiche facture : 0 / 50 à 1 280 ; 0 / 83 à 768 ; 75 / 343 à 390.
   - Fiche devis : 0 / 31 à 1 280 ; 0 / 59 à 768 ; 0 / 334 à 390.
   - Fiche client : 0 / 4 à 1 280.
10. Texte indicatif des champs de formulaire : couleur Tailwind par défaut #9CA3AF, 2,20:1 sur la carte (#ECEFF2), sous 4,5:1 ; le passer en textSecondary (déjà fait pour la recherche de l'en-tête, étape 11 quater).
11. Relevés pendant les tests de l'étape 11 ter :
   - LIBELLE_NIVEAU (src/data/relances.js) : espace insécable entre « 1re » / « 2e » et « relance », pour éviter une coupure en fin de ligne (vérifier les tests et le titre de la tâche du seed qui reprennent ce libellé) ;
   - actions suggérées du tableau de bord : la ligne de détail est coupée dans les colonnes étroites (« 36 j… ») ;
   - formulaire client, champ « Informations internes » : le texte indicatif parle encore d'« historique commercial », alors que l'historique est désormais tenu par les activités.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; parcours de navigation repassés ; rendu à 390, 768, 1 280 et 1 845 px sur toutes les listes et fiches ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 15 — Exports et rapports

```markdown
Lis CLAUDE.md. Nouvelle étape : exports (EXP-01 du PRD, FR-010, NFR-006).

1. Exports CSV UTF-8 (avec BOM pour Excel), XLSX et PDF des clients, factures, devis, paiements, impayés et du grand livre des ventes, avec filtres de période. L'export Excel des factures existe déjà (utils/excel.js) : étends-le plutôt que de le dupliquer.
2. Génération : propose ce qui reste dans le navigateur et ce qui passe par une Edge Function (exports lourds, job idempotent, contrôle d'accès côté serveur), comme le demande le PRD. Attends mon accord sur ce partage.
3. Export pour l'expert-comptable : factures, avoirs, acomptes et soldes finalisés de la période, totaux par taux de TVA, à partir des totaux figés.
4. Les totaux exportés sont identiques au centime à ceux de l'application (test de concordance) ; mêmes filtres que les écrans.
5. Chaque export est tracé dans audit_events (qui, quoi, quand, filtres).
6. Export complet des données de l'entreprise (réversibilité, NFR-006) et export des données d'un client (droit d'accès RGPD).

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests de concordance ; test d'accès croisé sur les exports ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 16 — Français et anglais (i18n)

```markdown
Lis CLAUDE.md. Nouvelle étape : interface en français et en anglais (UX-01 du PRD, section 24 du cahier V2).

1. Propose une solution (react-i18next ou équivalent) et attends mon accord avant d'ajouter la dépendance.
2. Toutes les chaînes de l'interface passent par l'i18n ; français par défaut, sélecteur de langue dans Paramètres → Profil.
3. Formats locaux : dates, nombres, montants en euros.
4. Les documents (PDF) et les modèles de relance restent dans la langue choisie pour le document, pas dans celle de l'interface.
5. Recherche finale : aucune chaîne française en dur restante dans src/ hors fichiers de traduction.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; captures FR et EN ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 17 — Opportunités, objectifs et pilotage

```markdown
Lis CLAUDE.md. Nouvelle étape : suivi des opportunités, objectifs commerciaux et indicateurs (KPI-01 et VEN-01 du PRD).

1. Opportunités : statut gagnée / perdue, avec motif de perte (CFG-005).
2. Lien opportunité → devis : bouton « Créer un devis » sur une opportunité, qui préremplit le client ; le devis garde le lien vers son opportunité, et l'acceptation du devis propose de passer l'opportunité à « gagnée ».
3. Objectifs par période (mois, trimestre, année) et par commercial, saisis par un admin ou un manager.
4. Tableau de bord : jauges « objectif atteint » par commercial et pour l'entreprise ; vrai taux de conversion (gagnées / clôturées) à la place de « Part en conclusion » ; tuile « Devis en attente » (envoyés, montant total, validité dépassée).
5. Prochaine migration numérotée libre et son test.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests SQL en local ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 18 — Module BTP (MVP)

```markdown
Lis CLAUDE.md. Nouvelle étape : module BTP, version minimale (BTP-01 du PRD, sections 5 et 23 du cahier V2).

Parcours visé : client → devis main-d'œuvre, matériaux et quantités → chantier → dépenses et documents → écart budget / réalisé → acompte et solde (mécanique de l'étape 010).

1. Module activable par entreprise (désactivé par défaut).
2. Chantier créé depuis un devis accepté : client, adresse du site, dates, statut, budget initial issu du devis.
3. Dépenses et coûts du chantier (achats, sous-traitance, main-d'œuvre) ; marge estimée et écart budget / réalisé, calculés au centime.
4. Documents privés du chantier (Supabase Storage, URLs signées, accès limité à l'entreprise).
5. Rôle chef de chantier : propose un nouveau rôle ou des droits par chantier, et attends mon arbitrage.
6. Tableau de bord : budgets chantier (budget, réalisé, écart).
7. Hors périmètre de cette étape : planning complexe, situations de travaux avancées, autoliquidation et retenue de garantie (à valider avec un expert).
8. Prochaine migration numérotée libre et son test (calculs, isolation, droits, Storage).

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests SQL en local ; parcours complet ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 19 — IWa, agent IA sécurisé

```markdown
Lis CLAUDE.md. Nouvelle étape : IWa, première version (IWA-01 du PRD, section 22 du cahier V2).

Avant de coder, propose l'architecture : outils métier en lecture seule (factures, devis, impayés, KPI, clients, chantiers), autorisés selon l'entreprise et le rôle ; appel du modèle depuis une Edge Function (jamais de clé côté navigateur) ; table ai_requests pour le journal et les coûts ; fournisseur LLM à me faire choisir.

1. Questions en langage naturel sur les données de l'entreprise, avec références aux enregistrements sources. Tous les calculs sont faits par l'application (statut calculé, reste à payer, totaux figés), jamais par le modèle.
2. Brouillons : relances (à partir des modèles de l'étape 011), synthèse d'une fiche client, explication du tableau de bord, alertes sur devis, factures et chantiers. Toute écriture ou tout envoi exige une validation explicite de l'utilisateur.
3. Garde-fous : journal des requêtes et des actions, quotas et plafond de dépense par entreprise, rate limiting, désactivation par entreprise, aucune donnée d'une autre entreprise accessible.
4. Tests : injection de prompt (instructions cachées dans une fiche client ou une note), tentative d'accès inter-entreprise, dépassement de quota.
5. Réintroduire le bouton de l'assistant sans masquer aucun contrôle (critère 2.4.11 de WCAG 2.2) ; retiré de Layout à l'étape 11 quater tant que l'assistant n'existe pas.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests de sécurité ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 20 — Abonnements et quotas

```markdown
Lis CLAUDE.md. Nouvelle étape : abonnements (SUB-01 du PRD, section 17 du cahier V2).

Propose une intégration de prestataire (Stripe Billing ou autre, à me faire choisir) sans rien facturer réellement avant ma validation (mode test uniquement).

1. Formules : Starter, Business IA, BTP Pro (tarifs à arbitrer), période d'essai.
2. Quotas contrôlés côté base : nombre d'utilisateurs, requêtes IA, stockage ; modules activés selon la formule.
3. Cycle de vie : essai, actif, impayé, suspendu, résilié ; accès en lecture seule en cas de suspension.
4. Webhooks vérifiés et idempotents, traités par une Edge Function.
5. Tests des contrôles côté base et des webhooks.

Présente ton plan et attends mon go.
Avant de livrer : npm run build et npm test ; tests ; commit séparé sans push ; tableau Vérifié / Non vérifié / À tester par Beros.
```

### Prompt 21 — Recette et pilote

```markdown
Lis CLAUDE.md. Nouvelle étape : recette avant pilote (parcours de recette du PRD).

1. Rejoue et complète les tests des trois parcours du PRD : généraliste (prospect → devis → facture → paiement → KPI, avec acompte, relance et avoir), BTP (client → devis → chantier → dépenses → budget/réel → acompte/solde) et sécurité (deux entreprises, accès croisé refusé via UI, API, base, Storage, IWa et exports).
2. Propose un outil de tests E2E (Playwright ou équivalent) et attends mon accord avant de l'ajouter ; le banc local actuel peut servir de base.
3. Documente clairement les tests réellement exécutés et ceux qui ne l'ont pas été.
4. Vérifie la sauvegarde et la restauration de la base Supabase (procédure écrite et testée sur un projet séparé) ; revue des dépendances (npm audit sans --force).
5. Liste les vulnérabilités trouvées, les points de conformité à faire valider (RGPD, facturation) et propose un plan de pilote avec 5 entreprises.
6. Ne déploie rien en production sans mon feu vert.
7. Traite les 11 alertes npm audit restantes après l'étape 12 (vite, esbuild, react-router, dompurify…), en priorité celles qui finissent dans le bundle livré, sans npm audit fix --force.
```

### Prompt 22 — Revue finale et mise en production

```markdown
Lis CLAUDE.md. Nouvelle étape : revue finale.

1. Revue de sécurité (MFA des admins, rate limiting, secrets, logs sans données sensibles), performance, accessibilité FR/EN (WCAG 2.2 AA), sauvegarde et restauration, supervision (Sentry), coûts IA, RGPD (minimisation, conservation, droits des personnes) et réversibilité.
2. Préparation de la production : projet Supabase payant (pas de mise en pause), environnements de développement et de production séparés, base de production repartie à zéro (aucune donnée ni numérotation de démonstration), déploiement Vercel, nom de domaine, pages légales (CGU, CGV, mentions légales, confidentialité).
3. Facturation électronique : état des obligations (réception depuis septembre 2026, émission PME à partir de septembre 2027), types de documents pour la facture, l'avoir, l'acompte et le solde, et choix d'une plateforme agréée, à valider.
4. Checklist Go / No-Go et registre des décisions ouvertes. Ne déclare jamais la conformité légale acquise sans validation par un professionnel.
```

## 7. Ouverture de chaque session

```markdown
Lis CLAUDE.md. Étape en cours : [numéro et nom du prompt]. Rappelle-moi où on en est, présente ton plan et attends mon go.
```

## 8. Hors du code : validation du marché (PRD, section 12)

À mener en parallèle du développement, sans attendre la fin du MVP :
- 10 à 15 entretiens avec des dirigeants de TPE/PME et d'entreprises du BTP ;
- 5 entreprises pilotes après le prompt 21 ;
- mesures : temps des tâches clés, adoption, incidents, rétention, disposition à payer.

## 9. Points à faire valider par des professionnels

- **Expert-comptable :**
  - numérotation (format FAC-AAAA-NNNN, remise à zéro annuelle, série AV distincte pour les avoirs, série FAC commune aux factures, acomptes et soldes) ;
  - mentions obligatoires des factures, avoirs, acomptes et soldes (prompt 13) ;
  - remise globale répartie au prorata des taux de TVA ;
  - TVA sur acomptes : exigibilité à l'encaissement, option sur les débits, présentation de la facture de solde ;
  - refus d'un avoir sur un acompte déjà déduit (correction par le solde) ;
  - taux des pénalités de retard (BCE + 10 points ou 3 fois l'intérêt légal) et indemnité de 40 €.
- **Avocat ou expert-comptable :** les trois modèles de relance, surtout la mise en demeure (texte, délai de 8 jours, envoi recommandé, prescription).
- **Expert BTP :** autoliquidation, retenue de garantie, situations de travaux, TVA à 10 %.
- **Juriste :** RGPD (conservation, droits des personnes), CGU/CGV, contrat de sous-traitance des données.
- **Facturation électronique :** plateforme agréée.
