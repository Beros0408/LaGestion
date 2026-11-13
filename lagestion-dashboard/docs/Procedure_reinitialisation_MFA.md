# Réinitialiser la double authentification d'un utilisateur

Procédure réservée à Beros (accès au projet Supabase « lagestion »). Aucun admin d'entreprise ne peut la faire : un admin
pourrait sinon retirer la protection d'un autre admin, qui peut appartenir à d'autres entreprises.

Cas d'usage : téléphone perdu, volé, réinitialisé ou application d'authentification supprimée, **sans** appareil de secours
enregistré. Si l'utilisateur a un appareil de secours, il se connecte avec lui et retire lui-même l'appareil perdu
(Paramètres → Profil → Double authentification → Retirer) : aucune intervention.

Le TOTP de Supabase ne fournit pas de codes de secours : la réinitialisation est la seule issue.

## 1. Avant d'agir : vérifier l'identité

Une réinitialisation retire la seconde protection du compte : un attaquant qui connaît le mot de passe peut se faire passer
pour l'utilisateur. Ne rien supprimer tant que ces points ne sont pas tous vérifiés.

1. La demande arrive **depuis l'adresse e-mail du compte** (pas une autre adresse, pas seulement un appel).
2. Rappel de la personne à un numéro **déjà connu** (pas celui donné dans la demande), ou confirmation par un autre membre
   actif de son entreprise qui la connaît.
3. Elle cite au moins deux informations que seul un membre connaît : nom exact de l'entreprise dans LaGestion, son rôle,
   le numéro d'une facture récente, le nom d'un client.
4. Si le compte est **admin** : prévenir, si possible, un autre admin de la même entreprise.
5. En cas de doute (urgence pressante, informations approximatives, adresse inhabituelle) : ne rien faire, rappeler plus tard.

Noter dans le registre (fichier hors dépôt) : date, heure, compte, motif, vérifications faites.

## 2. Supprimer les facteurs

### Par l'interface (à confirmer à la première utilisation)

1. Tableau de bord Supabase → projet **lagestion** → **Authentication** → **Users**.
2. Rechercher l'utilisateur par son adresse e-mail, cliquer sur sa ligne.
3. Dans le panneau de l'utilisateur, section des facteurs MFA (*Multi-factor authentication* / *Factors*) : supprimer chaque
   facteur listé.

L'emplacement exact de ce bouton n'a pas pu être vérifié (l'interface de Supabase évolue). S'il n'apparaît pas, utiliser
la voie SQL ci-dessous.

### Par SQL (toujours possible)

Tableau de bord Supabase → **SQL Editor**, rôle postgres. Remplacer l'adresse, exécuter bloc par bloc.

```sql
-- a. Retrouver le compte (vérifier qu'il n'y a qu'une ligne, avec la bonne adresse)
select id, email, email_confirmed_at, last_sign_in_at from auth.users where email = lower('personne@exemple.fr');

-- b. Voir ses facteurs (factor_type totp, status verified ou unverified)
select id, friendly_name, factor_type, status, created_at
  from auth.mfa_factors where user_id = '<id du a>';

-- c. Supprimer ses facteurs
delete from auth.mfa_factors where user_id = '<id du a>';

-- d. Fermer ses sessions ouvertes (un appareil volé encore connecté perd son accès)
delete from auth.sessions where user_id = '<id du a>';

-- e. Contrôle : plus aucun facteur
select count(*) from auth.mfa_factors where user_id = '<id du a>';
```

## 3. Après

1. Si le mot de passe a pu être exposé (vol du téléphone déverrouillé, gestionnaire de mots de passe sur ce téléphone) :
   envoyer une réinitialisation du mot de passe (Authentication → Users → l'utilisateur → *Send password recovery*).
2. Prévenir l'utilisateur : il se connecte avec son mot de passe seul, puis **réactive aussitôt** la double authentification
   (Paramètres → Profil), de préférence avec **deux appareils** (téléphone et appareil de secours).
3. Compléter le registre : heure de la suppression, confirmation de la réactivation.

## Rappel

- Pendant la période sans facteur, le compte n'est protégé que par son mot de passe.
- Pour un admin, une fois la MFA obligatoire en place (temps 6 de la feuille de route), ses actions d'administration
  resteront refusées jusqu'à la réactivation.
