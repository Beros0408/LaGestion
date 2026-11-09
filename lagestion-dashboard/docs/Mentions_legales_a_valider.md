# LaGestion — Mentions légales à faire valider

Document à remettre à l'expert-comptable avant l'émission de la première vraie facture.
État au 9 novembre 2026 (migrations 013 et 014, étape 13).

- Toutes les mentions ci-dessous sont des **choix par défaut** de LaGestion. Elles doivent être validées, corrigées ou complétées : une colonne « Avis de l'expert-comptable » est prévue à cet effet.
- Le PDF produit par LaGestion **ne suffit pas** pour la facturation électronique obligatoire. Une plateforme agréée sera choisie plus tard.
- Les textes imprimés sont repris mot pour mot du code : `src/utils/mentions.js` pour le PDF et `src/data/relances.js` pour les relances. Les tests `tests/mentions.test.js` et `tests/relances.test.js` vérifient qu'ils restent identiques.

## Fonctionnement

- **Saisie** : les mentions de l'émetteur se règlent dans Paramètres, Entreprise. Les mentions propres à une facture se saisissent sur le brouillon.
- **Figement** : à la finalisation, les mentions de l'émetteur sont copiées dans le document (`emetteur_fige`), avec le logo. Modifier ensuite les paramètres ne change aucun document déjà émis.
- **Contrôle** : la base de données refuse la finalisation tant qu'une mention marquée « Bloquante » manque. Les autres mentions ne s'impriment que si elles sont renseignées.
- **Documents antérieurs** : un document émis avant le 9 novembre 2026 (avant la migration 014) n'imprime que ce qu'il avait figé, à savoir le nom, le SIRET et l'adresse. Aucun bloc « Mentions » ne s'y ajoute : ni pénalités, ni indemnité, ni conditions de paiement. La phrase « pénalités au taux légal en vigueur », imprimée en pied de page à l'époque, n'apparaît plus quand on régénère un ancien PDF.
- **Documents concernés** : la facture, la facture d'acompte et la facture de solde reçoivent toutes les mentions. L'avoir reçoit l'identité de l'émetteur et la franchise de TVA. Le devis reçoit l'identité, la franchise et l'assurance ; il n'est jamais figé.

## Exemple d'en-tête imprimé (émetteur)

```
Rénov Démo                      ← nom
SAS au capital de 10 000,00 €   ← forme et capital ; « Entrepreneur individuel (EI) » pour une EI
SIRET 12121212000012
RCS Paris 121 212 120           ← « RM 75 121 212 120 » ou « Dispensé d'immatriculation au RCS et au RM »
N° TVA intracommunautaire FR56121212120
12 rue des Lilas, 75011 Paris
```

## Mentions

**Repères pour le tableau**

| Colonne | Valeurs possibles |
|---|---|
| Où | E = paramètres de l'entreprise (figés à la finalisation) ; F = facture (saisie sur le brouillon) ; C = fiche client |
| Contrôle | Bloquante = finalisation refusée si absente ; Avertissement = signalée sans bloquer ; Facultative = imprimée si renseignée |
| Documents | Fac. = facture, Acpt = acompte, Sld = solde, Av. = avoir, Dev. = devis |

| # | Mention | Base indicative | Où | Contrôle | Choix par défaut | Texte exact imprimé | Documents | Avis de l'expert-comptable |
|---|---|---|---|---|---|---|---|---|
| 1 | Nom ou dénomination, adresse du siège | CGI ann. II art. 242 nonies A | E | Bloquante (adresse) | Saisis à l'onboarding et dans les paramètres | En-tête : nom, adresse | Tous | |
| 2 | SIRET | C. com. R123-237 | E | Bloquante | Contrôle de la clé à la saisie | `SIRET 12121212000012` | Tous | |
| 3 | Forme juridique | C. com. R123-237 | E | Bloquante | Liste : EI, EURL, SARL, SAS, SASU, SA, SNC, SCI, SCOP, SELARL, autre (texte libre) | `SAS au capital de …` ou `Entrepreneur individuel (EI)` | Tous | |
| 4 | Capital social | C. com. R123-237 | E | Bloquante pour EURL, SARL, SAS, SASU, SA, SELARL | Non demandé pour une EI ; facultatif pour SNC, SCI, SCOP et « autre » (à confirmer) | `au capital de 10 000,00 €` | Tous | |
| 5 | Immatriculation : RCS et ville du greffe, ou RM et département | C. com. R123-237 | E | Bloquante | RCS, RM ou « dispensé » ; lieu obligatoire pour RCS et RM | `RCS Paris 121 212 120`, `RM 75 121 212 120`, `Dispensé d'immatriculation au RCS et au RM` | Tous | |
| 6 | N° de TVA intracommunautaire de l'émetteur | CGI 242 nonies A | E | Bloquante, sauf franchise | Clé et SIREN contrôlés à la saisie | `N° TVA intracommunautaire FR56121212120` | Tous | |
| 7 | Franchise en base de TVA | CGI 293 B | E | Si cochée : finalisation refusée si une ligne n'est pas à 0 % | Non cochée | `TVA non applicable, art. 293 B du CGI.` | Tous | |
| 8 | Option pour le paiement de la TVA d'après les débits | CGI 242 nonies A (réforme) | E | Facultative | Non cochée | `Option pour le paiement de la taxe d'après les débits.` | Fac., Acpt, Sld | |
| 9 | Date de la prestation ou de la livraison | CGI 242 nonies A | F | Posée automatiquement | Vide au brouillon : **date d'émission** retenue à la finalisation ; pour un acompte, à confirmer (date d'encaissement ?) | `Date de la prestation ou de la livraison : 15 octobre 2026` | Fac., Acpt, Sld | |
| 10 | Adresse de livraison si elle diffère | Réforme de la facturation électronique | F | Facultative | Vide | `Adresse de livraison : 5 chantier des Lilas, 75011 Paris` | Fac., Acpt, Sld | |
| 11 | Catégorie de l'opération | Réforme de la facturation électronique | F | Posée automatiquement | « Prestation de services » ; sinon « Livraison de biens » ou « Opération mixte (biens et services) » | `Catégorie de l'opération : Prestation de services` | Fac., Acpt, Sld | |
| 12 | SIREN du client professionnel | Réforme de la facturation électronique | C | Avertissement, sans blocage tant que la date d'application n'est pas confirmée | Imprimé s'il est renseigné | `SIREN 552100554` (bloc client) | Tous | Date d'application à confirmer : |
| 13 | N° de TVA du client | CGI 242 nonies A | C | Facultative | Imprimé s'il est renseigné | `TVA FR…` (bloc client) | Tous | Obligatoire dans quels cas ? |
| 14 | Date d'échéance | C. com. L441-9 | F | Bloquante (déjà en place, étape 008) | Délai de l'entreprise : 30 jours par défaut, 60 au plus | `Échéance le …` (en-tête) | Fac., Acpt, Sld | |
| 15 | Conditions et mode de paiement | C. com. L441-9 | E puis F | Facultative | Repris des paramètres sur chaque nouvelle facture | `Conditions de paiement : 30 jours net`, `Mode de paiement : Virement` | Fac., Acpt, Sld | |
| 16 | Conditions d'escompte | C. com. L441-9 | E | Toujours imprimée | `Pas d'escompte pour paiement anticipé.` | `Escompte : Pas d'escompte pour paiement anticipé.` | Fac., Acpt, Sld | |
| 17 | Taux des pénalités de retard | C. com. L441-10 | E | Toujours imprimée | BCE + 10 points (taux appliqué à défaut de stipulation) ; autres choix : 3 × taux d'intérêt légal, ou taux annuel fixe | voir ci-dessous | Fac., Acpt, Sld | |
| 18 | Indemnité forfaitaire de 40 € pour frais de recouvrement | C. com. L441-10, D441-5 | — | Clients professionnels uniquement | Jamais pour un particulier | voir ci-dessous | Fac., Acpt, Sld | |
| 19 | IBAN | — (usage) | E | Facultative | Vide ; contrôle modulo 97 | `IBAN : FR76 3000 6000 0112 3456 7890 189` | Fac., Acpt, Sld | |
| 20 | Assurance professionnelle | Loi 2014-626 (artisans) ; décennale BTP | E | Facultative (obligatoire au module BTP) | Vide | `Assurance professionnelle : Assureur X, contrat 123456, France métropolitaine` | Fac., Acpt, Sld, Dev. | |
| 21 | Référence à la facture d'origine et motif (avoir) | CGI 242 nonies A | F | Bloquante (déjà en place, étape 009) | — | `Avoir sur la facture FAC-2026-0001 du …`, `Motif : …` | Av. | |
| 22 | Référence au devis (acompte, solde) | — | F | Automatique (étape 010) | — | `Acompte sur le devis DEV-…`, `Solde du devis DEV-…` | Acpt, Sld | |

### Pénalités et indemnité : texte exact

**Sur le PDF**, bloc « MENTIONS », pour un client professionnel. Pour un particulier, la première ligne seule.

```
Pénalités de retard : taux appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de 10 points de pourcentage, exigibles dès le lendemain de la date d'échéance.
Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 € (art. L. 441-10 et D. 441-5 du Code de commerce).
```

Variantes de la première ligne :

| Choix | Texte du taux |
|---|---|
| 3 × intérêt légal | `trois fois le taux d'intérêt légal` |
| Taux fixe | `taux annuel de 12,5 %` |

**Dans les relances**, client professionnel seulement. Le taux cité est celui qui a été figé sur la facture. Pour une facture émise avant la migration 014, le texte reste sans taux, comme à l'étape 011.

2e relance :
```
Nous vous rappelons qu'en cas de retard de paiement, des pénalités de retard (taux annuel de 12,5 %) et une indemnité forfaitaire de 40 € pour frais de recouvrement sont dues de plein droit.
```

Mise en demeure :
```
Conformément aux articles L. 441-10 et D. 441-5 du Code de commerce, des pénalités de retard (taux annuel de 12,5 %), exigibles depuis le lendemain de l'échéance, et une indemnité forfaitaire de 40 € pour frais de recouvrement sont dues de plein droit, en sus du principal.
```

Aucun montant de pénalités n'est calculé. Le délai de la mise en demeure est de 8 jours (étape 011).

## Questions ouvertes pour l'expert-comptable

| # | Question | Avis de l'expert-comptable |
|---|---|---|
| 1 | Date de prestation par défaut égale à la date d'émission : acceptable pour les prestations ponctuelles ? Pour un acompte, quelle date retenir ? | |
| 2 | Capital : à exiger aussi pour SNC, SCI, SCOP ? | |
| 3 | Taux de pénalités par défaut : BCE + 10 points convient-il ? | |
| 4 | Clients particuliers : faut-il une mention de pénalités différente, ou aucune ? | |
| 5 | Avoir : faut-il aussi les conditions de paiement, la date de l'opération d'origine ou la catégorie ? | |
| 6 | Devis : mentions complémentaires (devis gratuit ou payant, durée de validité déjà imprimée, mentions BTP) ? | |
| 7 | Réforme de la facturation électronique (SIREN du client, catégorie, adresse de livraison, option sur les débits) : dates d'application à retenir pour une entreprise de 2 à 50 personnes ? | |
| 8 | Hors étape 13, à traiter au module BTP : autoliquidation (art. 283-2 nonies du CGI), attestation de TVA réduite, mentions de la décennale. | |
| 9 | Exonérations (livraisons intracommunautaires, exportations) : mentions à prévoir ? | |

Signature et date de validation :
