# LaGestion

## Cahier des charges fonctionnel et technique — Version 2.0

21 octobre 2026 | Document de cadrage à valider

CRM SaaS modulaire • TPE/PME • BTP • Agent IA IWa

Développement : Supabase + Vercel | Migration ultérieure étudiée

Langues : français et anglais

Objet de la V2 : mise à jour de la marque, architecture de développement, personnalisation par client, exigences BTP et agent IA proactif IWa.


## Sommaire
- 1. Synthèse exécutive
- 2. Objectifs, périmètre et indicateurs
- 3. Personas et parcours utilisateurs
- 4. Exigences fonctionnelles — socle CRM
- 5. Module BTP optionnel
- 6. IA — capacités, garde-fous et évaluation
- 7. UX/UI et accessibilité
- 8. Données et modèle relationnel
- 9. Architecture logicielle et intégrations
- 10. Sécurité, conformité et gouvernance
- 11. Exigences non fonctionnelles
- 12. Workflows et règles métier
- 13. Rôles et autorisations
- 14. Tests, recette et critères d’acceptation
- 15. Roadmap, lots et dépendances
- 16. Équipe, budget et risques
- 17. Modèle économique et lancement
- 18. Livrables attendus et gouvernance projet
- 19. Questions ouvertes à arbitrer
- 20. Architecture cible V2 : Supabase, Vercel et portabilité
- 21. Personnalisation par entreprise et utilisateur
- 22. IWa : agent IA proactif et assistant de configuration
- 23. BTP : parcours complets et exigences détaillées
- 24. Multilingue, UX et onboarding intelligent
- 25. Modèle de données additionnel et isolation
- 26. Plan de livraison révisé et critères de passage
- 27. Arbitrages, risques et décisions ouvertes V2


## 1. Synthèse exécutive
- LaGestion est une plateforme SaaS B2B multi-entreprises, modulaire et intuitive. Son socle généraliste réunit CRM, prospection, ventes, devis, facturation, e-mails, tâches, documents et pilotage. Un module BTP optionnel ajoute les chantiers, situations de travaux, sous-traitants, achats et comptes rendus.
- Promesse : centraliser les informations, limiter les doubles saisies, accélérer les processus et fournir des recommandations IA explicables, contrôlables et validées par l’utilisateur.
- Publics : indépendants, TPE/PME, équipes commerciales, sociétés de services et entreprises du BTP. Cible initiale recommandée : TPE/PME françaises de 2 à 50 collaborateurs.


## 2. Objectifs, périmètre et indicateurs
- Objectifs : adoption sans formation longue ; fiche client unique ; cycle prospect→devis→facture→paiement ; suivi commercial et financier ; assistance IA contextualisée ; extensibilité sectorielle.
- Périmètre MVP : multi-tenant, comptes et droits, clients/contacts, prospects/opportunités, pipeline, tâches, catalogue, devis, factures PDF, relances manuelles assistées, tableau de bord, assistant IA de rédaction avec validation.
- Hors MVP : comptabilité générale complète, paie, banque intégrée, marketplace, IA autonome engageant des dépenses, ERP complet et conformité de facturation électronique obtenue sans partenaire agréé.
- KPI cibles à valider en pilote : temps de création d’un devis < 5 minutes pour un cas simple ; 80 % des utilisateurs pilotes actifs chaque semaine ; 95 % des opérations métier courantes sans aide ; zéro fuite inter-tenant ; disponibilité cible 99,9 % hors maintenance planifiée.


## 3. Personas et parcours utilisateurs
- Administrateur entreprise : crée l’espace, configure les modules, invite les utilisateurs, gère rôles, paramètres et abonnement.
- Commercial : importe des prospects, suit son pipeline, prépare un devis, relance et consigne les interactions.
- Gestionnaire/administratif : valide devis et factures, suit échéances, prépare relances, exporte données et documents.
- Responsable BTP : transforme une affaire gagnée en chantier, suit planning, budgets, sous-traitants, réserves et rapports.
- Parcours clé : création entreprise → import clients → opportunité → devis validé → signature/acceptation → facture → suivi paiement → reporting.


## 4. Exigences fonctionnelles — socle CRM
- FR-001 (MUST) Organisations multi-tenant, équipes, invitations, rôles et permissions par module/action/objet.
- FR-002 (MUST) Sociétés, contacts, adresses, SIREN/SIRET si pertinent, tags, consentements, notes, pièces jointes et historique horodaté.
- FR-003 (MUST) Import CSV/XLSX avec prévisualisation, correspondance des champs, contrôle des erreurs et déduplication.
- FR-004 (MUST) Prospects, opportunités, pipelines configurables, étapes, montants, probabilités, sources et responsables.
- FR-005 (MUST) Activités : appels, rendez-vous, tâches, échéances, rappels et commentaires internes.
- FR-006 (MUST) Catalogue produits/services, unités, prix HT/TTC, remises, taux de TVA paramétrables, modèles de devis et numérotation.
- FR-007 (MUST) Devis → factures, avoirs, acomptes, échéanciers, statuts, PDF, historique et traçabilité.
- FR-008 (MUST) Suivi des règlements saisis ou synchronisés via intégration, rapprochement contrôlé et relances validées.
- FR-009 (SHOULD) E-mail Gmail/Microsoft 365 via OAuth, modèles, synchronisation sélective et journal des échanges.
- FR-010 (SHOULD) Tableaux de bord filtrables : chiffre d’affaires, encours, conversion, pipeline, retards, marges.
- FR-011 (SHOULD) Portail client, partage sécurisé de devis/documents et signature électronique via prestataire.
- FR-012 (COULD) Campagnes marketing, scoring, tickets support, SLA, formulaires web, API et webhooks.


## 5. Module BTP optionnel
- BTP-001 (MUST V2) Fiche chantier : client, site, intervenants, statut, dates, budget, documents et photos.
- BTP-002 (MUST V2) Bibliothèque d’ouvrages, quantités, unités, prix unitaires, déboursés, coefficients et marge.
- BTP-003 (MUST V2) Devis par lots/postes, variantes, avenants, acomptes et situations de travaux.
- BTP-004 (SHOULD) Planning jalons, tâches terrain, affectation des équipes et suivi d’avancement.
- BTP-005 (SHOULD) Sous-traitants, fournisseurs, commandes, achats, attestations et échéances documentaires.
- BTP-006 (SHOULD) Comptes rendus de chantier, photos géolocalisées uniquement avec consentement approprié, observations, réserves et procès-verbaux.
- BTP-007 (SHOULD) Comparaison budget initial/révisé/réalisé, alertes de dépassement et suivi de rentabilité.
- BTP-008 (COULD) Mode mobile hors ligne avec synchronisation et résolution de conflits.
- Règles métier françaises à spécifier avec experts : TVA et autoliquidation selon cas, retenue de garantie, sous-traitance, mentions légales et conservation documentaire.


## 6. IA — capacités, garde-fous et évaluation
- IA-001 : génération de brouillons d’e-mails, relances, propositions, comptes rendus et rapports à partir des données autorisées.
- IA-002 : synthèse d’une fiche client ou d’un chantier avec références aux éléments sources.
- IA-003 : suggestions de prochaine action commerciale, identification des prospects oubliés et opportunités à risque.
- IA-004 : détection de doublons, valeurs atypiques, écarts de marge, factures échues et incohérences entre devis/factures.
- IA-005 : analyse des données commerciales et financières avec filtres, graphiques et explication des hypothèses.
- IA-006 : recherche sémantique sur documents autorisés (RAG) avec citations, permissions appliquées à la récupération.
- Garde-fous obligatoires : validation humaine avant envoi, suppression, facturation ou engagement ; calculs financiers déterministes ; journalisation des propositions et actions ; contrôle des permissions ; prévention des injections de prompt ; pas d’entraînement sur données clients sans base légale/accord explicite.
- Évaluation : jeux de tests par cas d’usage, taux de réponses vérifiables, taux d’erreurs, hallucinations, coût par tâche, latence et satisfaction. Possibilité de désactiver l’IA par entreprise.


## 7. UX/UI et accessibilité
- Interface claire en français par défaut, mode clair prioritaire, palette bleu #489AF0 et gris, navigation latérale simple, recherche globale et actions principales visibles.
- Maximum trois niveaux de navigation pour les parcours courants ; formulaires courts ; autosauvegarde contrôlée ; messages d’erreur compréhensibles ; aides contextuelles.
- Tableau de bord personnalisé par rôle ; listes filtrables ; vues tableau/kanban/calendrier ; raccourcis ; fil d’activité ; panneau IA latéral.
- Responsive desktop/tablette/mobile ; objectif WCAG 2.2 AA pour les composants et parcours principaux ; tests utilisateurs avec profils peu technophiles.


## 8. Données et modèle relationnel
- Entités principales : tenants, users, memberships, roles, permissions, companies, contacts, addresses, leads, opportunities, pipelines, stages, activities, products, price_lists, quotes, quote_lines, invoices, invoice_lines, credit_notes, payments, reminders, documents, document_versions, audit_events, integrations, workflows, notifications, subscriptions, ai_requests.
- Entités BTP : projects, sites, work_packages, estimates, estimate_lines, milestones, subcontractors, suppliers, purchase_orders, progress_claims, site_reports, site_photos, defects, change_orders.
- Chaque donnée métier porte tenant_id ; clés étrangères et index tenant_id ; unicité contextualisée ; politiques Row Level Security PostgreSQL en défense supplémentaire ; tests automatiques anti-fuite inter-tenant.
- PostgreSQL comme source de vérité ; Redis pour cache/file de tâches ; stockage objet chiffré pour documents ; pgvector seulement pour index sémantique tenant-scopé.
- Qualité : validations de schéma, contraintes, transactions ACID, versionnement des devis/factures, déduplication assistée et politique d’archivage/suppression.


## 9. Architecture logicielle et intégrations
- Frontend : Next.js/React/TypeScript ; backend : FastAPI/Python ; API REST documentée OpenAPI ; tâches asynchrones Celery/Redis ; PostgreSQL ; stockage objet S3-compatible ; Docker et CI/CD.
- Architecture initiale recommandée : monolithe modulaire plutôt que microservices, avec domaines isolés (identity, CRM, sales, billing, BTP, AI, integrations, analytics).
- Intégrations : Gmail et Microsoft 365 via OAuth, calendrier, service e-signature, comptabilité, paiement PSP, facturation électronique via plateforme agréée, import/export CSV.
- Gestion des secrets centralisée ; environnements dev/test/préproduction/production ; migrations versionnées ; API idempotentes pour création de factures et événements financiers.
- Les traitements IA utilisent une couche d’orchestration avec outils strictement autorisés, quotas, masquage des données et suivi des coûts.


## 10. Sécurité, conformité et gouvernance
- Authentification OIDC/OAuth2, MFA, sessions sécurisées, mots de passe hachés, contrôle RBAC/ABAC et principe du moindre privilège.
- Chiffrement TLS en transit et au repos ; gestion des clés ; audit immuable des actions sensibles ; surveillance des accès ; limitation de débit ; protection contre CSRF/XSS/SQLi et tests OWASP.
- RGPD : registre des traitements, rôles responsable/sous-traitant, DPA, durées de conservation, droits d’accès/effacement, sous-traitants, transferts hors UE et analyse d’impact si nécessaire.
- Facturation France : anticiper réception des factures électroniques depuis septembre 2026 et émission pour PME/microentreprises depuis septembre 2027 ; vérifier le calendrier et intégrer une plateforme agréée plutôt que supposer qu’un PDF suffit.
- Sauvegardes chiffrées, tests de restauration, plan de reprise, RPO cible 24 h et RTO cible 8 h à affiner contractuellement ; gestion des incidents et notifications réglementaires.
- Ne pas promettre de conformité légale sans audit juridique et comptable ; valider les règles fiscales avec spécialistes.


## 11. Exigences non fonctionnelles
- NFR-001 Disponibilité cible 99,9 % mensuelle (après stabilisation), hors fenêtres annoncées.
- NFR-002 Temps de réponse cible p95 < 2 s sur consultations standard, hors génération IA/import massif.
- NFR-003 IA : réponse initiale cible < 10 s sur tâches simples, avec progression visible pour les tâches longues.
- NFR-004 Capacité initiale : 100 entreprises pilotes, évolutivité horizontale à tester en charge.
- NFR-005 Journalisation structurée, métriques, traces, alertes et supervision des tâches en erreur.
- NFR-006 Export complet des données client en formats standards et procédure de réversibilité.
- NFR-007 Localisation FR initiale, architecture prête pour langues/devises et paramètres régionaux.
- NFR-008 Compatibilité versions récentes Chrome, Edge, Firefox et navigateurs mobiles.


## 12. Workflows et règles métier
- Prospect créé → qualification → opportunité → devis brouillon → validation interne → envoi → accepté/refusé → facturation → paiement → clôture.
- Facture échue → règle de détection → suggestion IA → validation utilisateur → e-mail de relance → trace et prochaine échéance.
- Chantier : affaire gagnée → création projet → budget initial → planning → interventions → rapports → avenants/situations → réception.
- Workflow configurable avec déclencheur, conditions, actions, approbations, historique, mécanismes anti-boucle et possibilité de simulation.
- Numérotation des factures cohérente, chronologique et non réutilisable selon règles applicables ; factures finalisées non modifiables, correction par avoir si nécessaire.


## 13. Rôles et autorisations
- Super-admin éditeur : administration technique sans accès libre aux données clients ; accès support temporaire justifié et audité.
- Admin entreprise : paramètres, utilisateurs, abonnement, politiques et intégrations.
- Manager : visibilité équipe, approbation devis, analyses ; Commercial : portefeuille assigné ; Comptabilité : factures/règlements ; Chef de chantier : projets assignés ; Lecture seule : consultation limitée.
- Matrice d’autorisations par objet et action : lire/créer/modifier/supprimer/exporter/approuver, avec portée soi/équipe/entreprise.


## 14. Tests, recette et critères d’acceptation
- Tests unitaires et d’intégration, tests API, E2E des parcours clés, tests de charge, sécurité SAST/DAST, restauration et tests d’isolation multi-tenant.
- AC-01 Un administrateur crée une entreprise et invite un utilisateur ; celui-ci n’accède qu’aux données autorisées.
- AC-02 Import de 1 000 contacts avec rapport des erreurs, détection des doublons et aucune perte silencieuse.
- AC-03 Un commercial transforme une opportunité en devis puis en facture ; totaux et TVA sont calculés par règles déterministes.
- AC-04 Une facture finalisée ne peut être modifiée directement ; un avoir est traçable.
- AC-05 Une suggestion IA cite ses données et n’envoie aucun e-mail sans confirmation.
- AC-06 Un utilisateur d’un tenant A ne peut consulter, rechercher ou inférer les données du tenant B, y compris via IA et exports.
- AC-07 Sauvegarde restaurée en environnement isolé ; résultats et temps de reprise documentés.


## 15. Roadmap, lots et dépendances
- Lot 0 (2–4 semaines) : interviews de 15–25 utilisateurs, analyse concurrence, prototype UX, règles métier, architecture et backlog.
- Lot 1 (8–12 semaines indicatives) : identité, multi-tenant, contacts, pipeline, tâches, catalogue, devis/factures de base, tableaux de bord, tests.
- Lot 2 (6–10 semaines) : e-mails, relances, documents, automatisations, IA avec garde-fous, imports avancés.
- Lot 3 (8–12 semaines) : module BTP pilote, devis par lots, chantiers, rapports, budgets, sous-traitants.
- Lot 4 : intégrations réglementaires, application mobile, API partenaires, analytique avancée, industrialisation.
- Les durées supposent une petite équipe expérimentée et sont à recalibrer selon les ressources ; les phases peuvent se chevaucher partiellement.


## 16. Équipe, budget et risques
- Rôles nécessaires : product owner, UX/UI, développeur frontend, développeur backend, QA, DevSecOps, expert comptabilité/facturation, référent BTP, conseil RGPD/juridique.
- Budget : prototype développé principalement en interne potentiellement quelques milliers d’euros hors valorisation du temps ; MVP commercial sécurisé avec intégrations peut nécessiter plusieurs dizaines de milliers d’euros ou davantage. Chiffrage détaillé après spécifications et choix des partenaires.
- Risques majeurs : périmètre trop large, complexité réglementaire, faible adoption, coût IA, fuite inter-tenant, mauvaise qualité des données, dépendance API et coûts d’acquisition clients.
- Réponses : MVP strict, pilotes payants, audits sécurité, quotas IA, tests de restauration, intégrations contractuelles, suivi du coût de service et du churn.


## 17. Modèle économique et lancement
- Abonnements envisagés : Starter 19 €/mois, Business 49 €/mois, BTP Pro 89 €/mois par entreprise à titre exploratoire ; quotas utilisateurs/IA/stockage et options à préciser.
- Distribution : site vitrine, démonstrations, contenus YouTube, SEO ciblé, partenaires experts-comptables et consultants BTP, recommandations et essai limité.
- Go-to-market : 20 entretiens terrain → 5 entreprises pilotes → mesure activation/rétention → amélioration → 20 clients payants → élargissement.
- Mesures : activation J7, WAU/MAU, conversion essai→payant, MRR, churn, CAC, LTV, coût IA par client, temps gagné et NPS.


## 18. Livrables attendus et gouvernance projet
- Livrables : cahier des charges approuvé, parcours utilisateurs, wireframes, design system, schéma ERD, dictionnaire de données, spécification OpenAPI, backlog priorisé, stratégie de test, registre des risques, politique sécurité/RGPD, guide utilisateur et procédures d’exploitation.
- Pilotage : backlog versionné, sprint de 2 semaines, démonstration régulière, décisions documentées, gestion des changements, définition de terminé et jalons de recette.
- Critère de lancement : parcours critiques validés, sécurité testée, documents légaux prêts, sauvegardes vérifiées, support opérationnel, contrats prestataires signés.


## 19. Questions ouvertes à arbitrer
- Nom commercial final et identité de marque ; marché pilote exact ; nombre d’utilisateurs par formule ; hébergement et localisation des données ; partenaire facturation électronique ; prestataires e-mail et signature ; règles de TVA/BTP ; politique IA et données ; support et SLA ; prix validés par enquête.
- Décision de cadrage proposée : produit SaaS modulaire, France en premier, CRM généraliste MVP, module BTP V2/V3, IA assistive et non autonome, architecture monolithe modulaire.


## 20. Architecture cible V2 : Supabase, Vercel et portabilité
- Décision validée : durant le développement, le frontend Next.js est déployé sur Vercel ; PostgreSQL, Auth et Storage utilisent un abonnement Supabase. Les traitements Python FastAPI et les tâches asynchrones requièrent un hébergement d'exécution distinct, à choisir au jalon technique.
- Après validation commerciale, migration envisagée vers un hébergeur professionnel disposant de capacités suffisantes. Le choix final doit dépendre d'un audit de sécurité, du coût total, des SLA, de la localisation des données et de la réversibilité, et non du seul critère 'serveur dédié'.
- Isoler les dépendances Supabase derrière des services applicatifs ; utiliser des migrations SQL versionnées, des sauvegardes restaurables, des exportations de fichiers et des secrets gérés hors du dépôt.
- Prévoir un plan de migration : inventaire des services Supabase utilisés, export PostgreSQL, reprise des identités, migration des objets, bascule DNS, validation des intégrations, fenêtre de maintenance, tests de retour arrière.
- Critère d'acceptation : une instance de préproduction peut être reconstruite à partir du code, des migrations et d'une sauvegarde anonymisée ; la procédure de restauration est documentée.


## 21. Personnalisation par entreprise et utilisateur
- CFG-001 (MUST) Chaque entreprise dispose d'une configuration isolée : identité, logo, secteur, fuseau horaire, devise, langue, modules et règles d'accès.
- CFG-002 (MUST) Profils sectoriels initiaux : Standard, BTP, Services et configuration personnalisée. Les profils sont des modèles éditables, non des forks de code.
- CFG-003 (MUST) Activation de modules par entreprise, contrôlée côté serveur ; droits distincts de l'activation commerciale.
- CFG-004 (MUST) Champs personnalisés typés (texte, nombre, date, liste, booléen), validations, affichage, recherche et export, avec limites par formule.
- CFG-005 (SHOULD) Pipelines configurables, étapes, probabilités, motifs de perte et conditions de passage.
- CFG-006 (SHOULD) Tableaux de bord et widgets configurables par rôle et utilisateur, sans accès aux données non autorisées.
- CFG-007 (SHOULD) Modèles de documents, signatures, notifications et séquences de relance personnalisables.
- CFG-008 (SHOULD) Constructeur de workflows avec conditions, actions autorisées, approbations, simulation et journal d'exécution.
- CFG-009 (COULD) Marketplace de modules et connecteurs, soumise à contrôle de sécurité et compatibilité.
- Le modèle de configuration sera versionné ; chaque changement sensible est audité et réversible. Prévoir migration des paramètres lors des mises à jour.


## 22. IWa : agent IA proactif et assistant de configuration
- IWa est le nom de l'agent IA transversal de LaGestion. Il intervient dans CRM, prospection, facturation, reporting et BTP, en français et en anglais.
- IWA-001 (MUST) Assistant conversationnel tenant compte du rôle, du contexte métier et des données autorisées.
- IWA-002 (MUST) Rédaction assistée : e-mails, relances, comptes rendus, propositions et rapports ; chaque contenu externe reste un brouillon jusqu'à validation.
- IWA-003 (MUST) Détection d'anomalies à partir de règles déterministes : échéances, doublons, incohérences de prix, marges et champs incomplets.
- IWA-004 (SHOULD) Suggestions proactives déclenchées par événements ou analyses planifiées : suivi commercial oublié, risque de dépassement budgétaire, retard de chantier, baisse de conversion.
- IWA-005 (SHOULD) Chaque suggestion affiche motif, données sources, date, degré de confiance lorsque pertinent, bénéfice attendu et action de validation/refus.
- IWA-006 (SHOULD) IWa Smart Setup : questionnaire en langage naturel, proposition de profil sectoriel, modules, champs, tableau de bord et workflows ; aperçu puis approbation de l'administrateur.
- IWA-007 (SHOULD) Apprentissage des préférences par réglages et retours explicites, sans réentraînement automatique sur données confidentielles.
- IWA-008 (COULD) Prévision statistique des ventes et des risques de chantier après collecte de données suffisantes et validation des modèles.
- Autonomie limitée : aucune émission de facture définitive, suppression, modification de prix, envoi d'e-mail, engagement contractuel ou dépense sans autorisation explicite et traçable.
- Mesures : pertinence des suggestions, taux d'acceptation, faux positifs, temps économisé, hallucinations, latence, coût par tâche et absence de fuite inter-tenant.


## 23. BTP : parcours complets et exigences détaillées
- BTP-101 (MUST) Créer une affaire BTP, établir un devis par lots et postes avec quantités, unités, prix, déboursés et marges calculées.
- BTP-102 (MUST) Transformer une affaire gagnée en chantier lié au client, au devis et aux intervenants.
- BTP-103 (MUST) Gérer jalons, avancement, budget initial, avenants et suivi prévisionnel/réalisé.
- BTP-104 (SHOULD) Produire des situations de travaux et des factures d'acompte selon règles métier vérifiées.
- BTP-105 (SHOULD) Suivre fournisseurs, sous-traitants, attestations, commandes et échéances documentaires.
- BTP-106 (SHOULD) Produire un compte rendu depuis notes, photos et dictée ; IWa propose un texte structuré, soumis à validation.
- BTP-107 (SHOULD) Gérer réserves, non-conformités, responsables, délais et levée des réserves.
- BTP-108 (COULD) Application mobile terrain et synchronisation hors ligne.
- Scénario de recette BTP : un conducteur de travaux crée un chantier depuis un devis accepté, enregistre l'avancement, ajoute un avenant, constate un écart de budget et obtient d'IWa un rapport justifié.


## 24. Multilingue, UX et onboarding intelligent
- Langues du lancement : français et anglais. Toutes les chaînes de l'interface passent par un système i18n ; les modèles de documents et prompts IWa ont des variantes localisées.
- Prévoir formats locaux des nombres, dates, devises, taxes et fuseaux ; la langue de l'interface ne modifie pas les obligations juridiques applicables.
- Onboarding : choix du secteur, taille de l'entreprise, modules, import des données, rôles, préférences, puis proposition IWa Smart Setup.
- UX : navigation latérale simple, recherche globale, tableau de bord personnalisable, actions courantes accessibles rapidement, messages d'erreur compréhensibles.
- Accessibilité : viser WCAG 2.2 AA ; navigation clavier, contraste, focus visible, labels explicites et compatibilité mobile.


## 25. Modèle de données additionnel et isolation
- Ajouter les entités tenant_settings, tenant_modules, industry_templates, custom_field_definitions, custom_field_values, dashboard_layouts, widget_instances, workflow_definitions, workflow_runs, ai_suggestions, ai_suggestion_feedback, ai_policies, ai_tool_audit et configuration_versions.
- Chaque enregistrement sensible porte tenant_id ; toutes les lectures et écritures appliquent le périmètre tenant et les permissions de l'utilisateur, y compris les requêtes de recherche vectorielle.
- Supabase RLS : politiques de lecture/écriture testées, rôles serveur strictement séparés, service_role jamais exposé au navigateur ; validation métier maintenue dans l'API.
- Prévoir une politique d'export et de suppression des champs personnalisés et des configurations pour assurer la réversibilité.


## 26. Plan de livraison révisé et critères de passage
- Phase A — Cadrage : interviews utilisateurs généralistes et BTP, parcours, backlog, modèle de revenus et validation du MVP.
- Phase B — Fondation : monorepo, Vercel, Supabase, CI/CD, authentification, multi-tenant, permissions, journaux et i18n.
- Phase C — MVP commercial : clients, prospects, pipeline, tâches, catalogue, devis, factures, dashboard et premiers profils sectoriels.
- Phase D — Personnalisation : modules activables, champs personnalisés, modèles de documents, tableaux de bord et réglages d'entreprise.
- Phase E — IWa : rédaction assistée, règles d'anomalie, suggestions proactives, Smart Setup et évaluations.
- Phase F — BTP : chantiers, lots, budgets, rapports, sous-traitants et situations de travaux, avec pilotes métier.
- Phase G — Industrialisation : tests de charge, audit sécurité, conformité, supervision, sauvegardes, pilotes payants et étude de migration.
- Passage à la production uniquement après recette des parcours critiques, tests anti-fuite inter-tenant, restauration prouvée, documents contractuels et revue des obligations de facturation.


## 27. Arbitrages, risques et décisions ouvertes V2
- À décider : hébergement du service Python pendant le développement, fournisseur LLM, prestataire e-mail, solution de facturation électronique, signature électronique et politique de conservation des données.
- À préciser : personnalisation incluse dans chaque formule, quotas IA, nombre d'utilisateurs, tarification du module BTP, SLA et support.
- Risques spécifiques : coûts imprévisibles des modèles IA, workflows dangereux, personnalisation trop complexe, dépendance Supabase/Vercel, migrations d'identités et erreurs de calcul BTP.
- Réponses : limites et budgets par tenant, approbation humaine, configuration versionnée, tests de portabilité, calculs déterministes, contrôles métier et audit continu.
- Le présent document est une spécification de cadrage V2 : les règles fiscales, contractuelles et réglementaires doivent être validées par les professionnels compétents avant commercialisation.