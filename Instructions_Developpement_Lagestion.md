# Instructions de Développement — Projet Lagestion

> **Document produit par analyse expert du Cahier des Charges Technique et Fonctionnel — Version 1.0 | Mai 2026**

---

## 📋 Résumé Exécutif

Ce document synthétise les 10 instructions stratégiques pour le développement du projet **Lagestion**, une plateforme tout-en-un de gestion commerciale pour PME. Ces instructions découlent d'une analyse approfondie du cahier des charges, identifiant ses forces, ses faiblesses, et les ajustements nécessaires pour assurer la réussite du projet.

---

## 🔍 Analyse du Cahier des Charges

### Forces du document
- **Vision claire** : positionnement "tout-en-un" pour PME avec différenciation IA + Excel intégré
- **Architecture technique cohérente** : stack moderne (React 18, NestJS/FastAPI, PostgreSQL, Redis)
- **Roadmap structurée** en 4 phases sur 18 mois avec livrables précis
- **Modèle économique freemium bien pensé** avec 4 plans tarifaires et stratégie de conversion
- **Conformité RGPD et sécurité** dès la conception (hébergement UE, chiffrement AES-256)

### Faiblesses et risques identifiés
- **Scope très large** : CRM + comptabilité + stock + marketing + IA dans un MVP de 4 mois = risque de dilution
- **Dépendance aux APIs tierces** (OpenAI, Stripe) sans plan de fallback
- **Équipe recommandée sous-dimensionnée** : seulement 5 développeurs permanents pour un scope aussi large
- **Manque de spécifications techniques profondes** : pas de détail sur les API contracts, rate limiting, caching strategy
- **Modèle économique optimiste** : objectif 5% de conversion gratuit→payant en 6 mois est ambitieux sans référence marché validée

---

## 🎯 Les 10 Instructions de Développement

---

### Instruction 1 : Prioriser radicalement le MVP — Couper le scope de 50%

> **Instruction** : Le MVP (Phase 1, 4 mois) ne doit contenir que **CRM de base + Facturation simple + Tableau de bord basique**. Supprimer de la Phase 1 : comptabilité avancée, stock, marketing, IA conversationnelle, mobile app. Ces modules passent en Phase 2+.

**Pourquoi** : Le cahier des charges vise trop large. Un MVP réussi = 3 fonctionnalités parfaites plutôt que 10 bancales. Salesforce a mis 5 ans à ajouter la facturation.

**Actions concrètes** :
- Définir une liste de fonctionnalités "must-have" vs "nice-to-have" pour le MVP
- Geler le scope du MVP et ne pas ajouter de nouvelles fonctionnalités pendant la Phase 1
- Documenter les fonctionnalités reportées avec leur priorité pour les phases suivantes

---

### Instruction 2 : Valider l'architecture data avant tout code métier

> **Instruction** : Avant le premier composant React, produire un **schéma de base de données normalisé (3NF)** avec migrations versionnées (TypeORM/Prisma), incluant les indexes, contraintes d'intégrité référentielle, et stratégie de soft-delete. Tester les requêtes les plus fréquentes (fiche client complète, CA par période) avec 100k lignes de données.

**Pourquoi** : Le cahier mentionne PostgreSQL mais ne détaille pas les relations complexes (client → opportunités → factures → paiements). Une mauvaise modélisation initiale coûte 10x plus cher à corriger.

**Actions concrètes** :
- Produire le diagramme Entité-Relation (ERD) complet
- Définir les indexes sur les champs de recherche fréquente (email, nom, date)
- Implémenter le soft-delete sur toutes les tables métier
- Créer un jeu de données de test (100k lignes) et profiler les requêtes critiques

---

### Instruction 3 : Implémenter l'authentification et le RBAC comme fondation, pas comme feature

> **Instruction** : Dès le jour 1, mettre en place **OAuth 2.0 + JWT refresh tokens + MFA (TOTP)** avec un système de rôles granulaires (admin, commercial, comptable, lecture seule). Chaque endpoint API doit vérifier les permissions dès le MVP.

**Pourquoi** : Le cahier cite le RBAC mais ne le place pas en priorité. Ajouter la sécurité a posteriori sur un CRM = refactor total. Les données clients sont sensibles (RGPD).

**Actions concrètes** :
- Implémenter l'authentification JWT avec refresh tokens rotatifs
- Ajouter la MFA via TOTP (Google Authenticator, Authy)
- Définir les rôles et permissions dans la base de données
- Créer un middleware de vérification des permissions pour chaque route API

---

### Instruction 4 : Construire une API REST documentée et versionnée dès le départ

> **Instruction** : Utiliser **OpenAPI 3.0 (Swagger)** pour documenter chaque endpoint. Versionner l'API (`/v1/`, `/v2/`). Implémenter rate limiting par utilisateur (100 req/min gratuit, 1000 req/min payant). Générer automatiquement les types TypeScript côté frontend.

**Pourquoi** : Le cahier mentionne une API ouverte au plan Pro mais ne précise pas la qualité. Une API mal documentée = support technique coûteux + intégrations tierces impossibles.

**Actions concrètes** :
- Configurer Swagger/OpenAPI sur le backend
- Versionner toutes les routes API (`/api/v1/...`)
- Implémenter le rate limiting avec Redis (throttling par plan)
- Générer les types TypeScript automatiquement depuis la spec OpenAPI

---

### Instruction 5 : Créer un Design System réutilisable avant la première page

> **Instruction** : Avant de coder les écrans métier, produire une **librairie de composants Storybook** avec : palette de couleurs du cahier (#2D5B7F, #4A9B8E, #F4A261), typographie, boutons, formulaires, tableaux, modales, skeletons. Chaque composant doit être accessible (WCAG 2.1 AA) et responsive.

**Pourquoi** : Le cahier détaille les couleurs mais pas les composants. Sans design system, chaque développeur recrée ses propres boutons = interface incohérente = dette technique UI.

**Actions concrètes** :
- Installer et configurer Storybook
- Créer les composants fondamentaux (Button, Input, Table, Modal, Toast)
- Appliquer la palette de couleurs définie dans le cahier
- Tester l'accessibilité de chaque composant (contraste, navigation clavier)

---

### Instruction 6 : Intégrer l'IA de manière "optionnelle et progressive", pas "obligatoire et bloquante"

> **Instruction** : L'IA (OpenAI GPT-4o) doit être **débranchable** via feature flag. Implémenter un cache Redis pour les réponses fréquentes. Prévoir un fallback si l'API OpenAI est indisponible (réponses basiques sans IA). Ne pas facturer l'IA comme "illimitée" au plan Pro — mettre des quotas réalistes.

**Pourquoi** : Le cahier sur-utilise l'IA comme différenciant. Coût OpenAI GPT-4o : ~$0.03/requête. 1000 utilisateurs Pro "illimités" = coût explosif. L'IA est un plus, pas un cœur de métier.

**Actions concrètes** :
- Mettre en place un système de feature flags (LaunchDarkly ou solution maison)
- Implémenter le caching Redis pour les requêtes IA fréquentes
- Créer un fallback "mode dégradé" sans IA
- Définir des quotas par plan (10/jour Gratuit, 100/jour Pro, illimité Business+)

---

### Instruction 7 : Développer l'intégration Excel comme produit à part entière

> **Instruction** : Allouer **2 semaines dédiées** à l'import/export Excel avec : détection automatique des colonnes (mapping intelligent), prévisualisation avec erreurs surlignées, gestion des formats de date/monnaie FR/EN, export avec formules Excel natives. Tester avec 10 fichiers Excel réels fournis par des PME.

**Pourquoi** : C'est le **différenciant clé** du cahier ("Excel intégré + structuré"). Si ça ne marche pas parfaitement dès le lancement, l'argument de vente s'effondre. Les PME ont des fichiers Excel sales et complexes.

**Actions concrètes** :
- Intégrer SheetJS (xlsx) pour la lecture/écriture Excel
- Développer l'algorithme de mapping intelligent des colonnes
- Créer l'interface de prévisualisation avec surlignage des erreurs
- Collecter et tester avec des fichiers Excel réels de PME

---

### Instruction 8 : Mettre en place le monitoring, le logging et les tests dès le MVP

> **Instruction** : Intégrer **Sentry** (erreurs), **Datadog** (métriques), et **Cypress + Jest** (tests E2E + unitaires) dès la Phase 1. Objectif : couverture de tests > 70% sur le backend, > 50% sur le frontend. Chaque bug en production doit être traçable (utilisateur, action, timestamp, stack trace).

**Pourquoi** : Le cahier mentionne le monitoring mais en annexe. Sans tests automatisés, chaque nouvelle feature casse 2 anciennes. Sans monitoring, on découvre les bugs par les clients.

**Actions concrètes** :
- Configurer Sentry pour le tracking des erreurs frontend et backend
- Mettre en place Datadog pour les métriques de performance
- Écrire les tests unitaires Jest pour le backend (objectif 70%)
- Écrire les tests E2E Cypress pour les parcours critiques (création client, facturation)

---

### Instruction 9 : Planifier la scalabilité "juste suffisante" — pas over-engineering

> **Instruction** : Utiliser **Docker + Docker Compose** en développement. En production (Phase 1), hébergement cloud managé (Railway, Render, ou AWS ECS simple) — pas Kubernetes. Passer à K8s uniquement en Phase 3+ quand > 1000 utilisateurs actifs. Mettre en place le caching Redis dès le début pour les données fréquemment lues (liste clients, KPIs du dashboard).

**Pourquoi** : Le cahier propose Kubernetes dès le départ. C'est du over-engineering pour un MVP. K8s ajoute 30% de complexité ops pour 0 bénéfice à 100 utilisateurs. Cependant, le caching est essentiel dès le début.

**Actions concrètes** :
- Dockeriser l'application (Dockerfile + docker-compose.yml)
- Choisir un hébergement managé simple pour le MVP (Railway/Render)
- Configurer Redis pour le caching des données fréquentes
- Planifier la migration vers K8s uniquement à partir de la Phase 3

---

### Instruction 10 : Valider le modèle économique avec des données réelles avant d'investir dans l'Enterprise

> **Instruction** : Avant de développer le plan Enterprise (SSO, audit trail, white-label), lancer les plans **Gratuit + Pro + Business** et mesurer : taux de conversion gratuit→Pro, churn à 3 mois, coût d'acquisition client (CAC), temps moyen d'onboarding. Ne pas coder le plan Enterprise tant que le taux de conversion Pro n'atteint pas 3%.

**Pourquoi** : Le cahier prévoit 4 plans sur 18 mois avec des objectifs agressifs (5% conversion en 6 mois). Le plan Enterprise (199€/mois) représente 50% du développement (SSO, SAML, audit trail) pour probablement <5% des revenus. Valider le marché d'abord.

**Actions concrètes** :
- Implémenter les plans Gratuit, Pro et Business uniquement
- Mettre en place le tracking des métriques clés (conversion, churn, CAC, onboarding)
- Définir les KPIs de validation du marché (taux de conversion > 3%)
- Reporter le développement du plan Enterprise à la validation du marché

---

## 📊 Synthèse : Priorité d'exécution

| Phase | Ce qu'il faut vraiment faire | Ce qu'il faut reporter |
|-------|---------------------------|----------------------|
| **Mois 1-2** | Auth, BDD, API, Design System | IA, Mobile, Marketing |
| **Mois 3-4** | CRM, Facturation, Dashboard, Excel | Stock, Compta avancée, Workflows |
| **Mois 5-8** | Stock, Compta, Email marketing, IA v1 | OCR, Prédictions avancées |
| **Mois 9-12** | IA prédictive, Intégrations tierces, API publique | White-label, Module RH |
| **Mois 13-18** | International, Marketplace, Enterprise | — |

---

## 🏁 Verdict Final

Le cahier des charges est **ambitieux et bien structuré**, mais il faut **couper drastiquement le scope du MVP** et **valider chaque hypothèse économique avant d'investir dans la complexité**. Lagestion a le potentiel de devenir un excellent produit — à condition de ne pas essayer de tout construire en même temps.

> **Rappel** : Un bon produit se construit par itérations, pas par spécifications exhaustives.

---

*Document généré le 25 Juin 2026 — Analyse Expert*
