# 🎯 HARMONY — Document de passation (résumé complet)
> À coller au début d'une nouvelle conversation Claude pour reprendre le projet avec tout le contexte.
> **Date du résumé : 28 mai 2026** · Couvre les 3 derniers jours de travail (26-28 mai).

---

## 1. C'EST QUOI HARMONY ?

Application mobile **Flutter** (cross-platform iOS 16+ / Android 10+) de **filtrage d'appels et de messages + contrôle parental + bien-être**. Direction artistique « bien-être » émotionnellement touchante (style Calm / Headspace / Petit BamBou), féminine et apaisante, avec images douces de nature.

**Les modules :**
- **M1** — Filtrage des appels (entrants, sortants, SMS)
- **M2** — Listes (Blacklist / Whitelist)
- **M3** — Filtrage Messages (WhatsApp / SMS / Signal / Telegram)
- **M4** — Contrôle parental (géoloc, SOS)
- **M5** — Agenda & planification
- **M6** — Fitness & performance
- **M7** — Sécurité (SQLCipher, chiffrement)
- **M8** — Monétisation (Paywall, AdMob)
- **M9** — Méditation

**Rôles dans le projet :**
- **Beros** (l'utilisateur) : porteur du projet, testeur sur émulateur et smartphone
- **Claude (conversation)** : architecte, prépare les prompts, guide, vérifie
- **Claude Code** : agent qui code directement dans les fichiers du projet

---

## 2. ENVIRONNEMENT TECHNIQUE (à connaître absolument)

| Élément | Valeur |
|---|---|
| **Dossier projet** | `C:\Users\bkabe\Desktop\Harmony -mobile` (sous-dossier `mobile/` pour le code Flutter) |
| **Repo GitHub** | `Beros0408/harmony` |
| **Flutter** | `C:\src\flutter\bin\flutter.bat` (3.44.0) — NB : Claude Code utilise une autre copie dans `C:\Users\bkabe\Downloads\flutter_windows_3.44.0-stable\flutter\bin\` |
| **adb** | `C:\Users\bkabe\AppData\Local\Android\Sdk\platform-tools\adb.exe` |
| **Émulateur** | Pixel_7 AVD (Android 14, API 34, `emulator-5554`) |
| **Package Android** | `com.harmony.harmony` (ou `com.harmony.app`) |
| **Téléphone test** | Samsung S22 (transfert via Quick Share) |
| **Skill design** | `/mnt/skills/user/ui-ux-pro-max/SKILL.md` |

**Commandes pour lancer l'émulateur** (dans PowerShell, à recoller à chaque nouvelle fenêtre) :
```powershell
$env:Path += ";C:\src\flutter\bin;C:\Users\bkabe\AppData\Local\Android\Sdk\platform-tools"
cd "C:\Users\bkabe\Desktop\Harmony -mobile\mobile"
flutter run
```
Pendant que `flutter run` tourne : `r` = hot reload, `R` = hot restart (nouvelles routes), `q` = quitter.

---

## 3. WORKFLOW & RÈGLES IMPORTANTES (préférences de Beros)

1. **Tests = TOUJOURS sur l'émulateur Pixel_7.** Le S22 sert uniquement à voir le rendu visuel réel sur smartphone.
2. **APK** : ne fournir l'APK QUE lorsque Beros demande explicitement « sauvegarde de la journée + mise à jour des fichiers ». À ce moment-là, fournir l'APK complet avec toutes les modifications du jour. Jamais avant.
3. **Prompts pour Claude Code** : toujours prêts à copier-coller directement (jamais de fichiers).
4. **Français irréprochable** exigé (orthographe, ponctuation FR).
5. **Workflow git** : Claude Code fait commit + merge --no-ff + tag + push origin main --tags AUTOMATIQUEMENT à chaque sprint. Beros n'a rien à pousser manuellement.
6. **Vérification visuelle obligatoire** : « le code existe » ≠ « ça marche ». Toujours faire tester Beros sur l'émulateur avant de conclure qu'une fonctionnalité marche. (Leçon apprise : Claude Code a déjà conclu « déjà fait » à tort en voyant juste l'existence de fichiers.)
7. **Attention aux fenêtres** : Beros confond parfois la fenêtre PowerShell et le terminal Claude Code. Toujours préciser dans quelle fenêtre coller quoi.

---

## 4. ÉTAT GLOBAL DU PROJET

- **Version actuelle : v2.2.8-fix-agenda-rule-actions** (sur `main`, poussée sur GitHub)
- **Avancement : ~95 % du cahier des charges fonctionnel**
- **Tests : 320 tests Flutter verts** + 13 tests Kotlin · **~80 issues** de `flutter analyze` (baseline stable)
- **~15 tags majeurs** depuis v1.0.0

**État des modules :**
| Module | Avancement |
|---|---|
| M1 Filtrage appels | 100 % |
| M2 Listes | 100 % |
| M3 Messages | 100 % |
| M4 Parental | 90 % |
| M5 Agenda | 100 % |
| M6 Fitness | 80 % |
| M7 Sécurité | 100 % |
| M8 Monétisation | 100 % |
| M9 Méditation | 100 % |
| Direction Artistique | 100 % |

---

## 5. CE QUI A ÉTÉ FAIT CES 3 DERNIERS JOURS (26-28 mai 2026)

### Hotfixes & mini-sprints livrés
- **v2.2.2** — Dashboard : compléter les 8/8 cards avec images (cohérence visuelle)
- **v2.2.3** — Extraction de la démo design system hors du Dashboard utilisateur vers `/dev/components` (route cachée, gardée mais non visible)
- **v2.2.4** — Messages & SMS : correction overflow (bandeau jaune RenderFlex) + création de `message_detail_screen.dart` (tap sur message ouvre le détail) — route `/message-detail`
- **v2.2.5** — Welcome card du Dashboard rendue dynamique : salutation contextuelle (4 plages horaires × 5 locales), `PulsingDot` (pastille pulsante), `WigglingEmoji` (salut animé), 3 mini-stats. BONUS : 7 régressions latentes corrigées (auth, AdBanner, HarmonyAppBar, tests). Passage de 304 → 320 tests verts.
- **v2.2.6** — Date dynamique : remplacement de la date codée en dur par `DateTime.now()` avec formatage i18n (intl)
- **v2.2.7** — i18n du `MessageRuleFormSheet` (17 clés × 5 locales) + badge « Bloqué » traduit
- **v2.2.8** — **2 corrections fonctionnelles importantes** (voir détail ci-dessous)

### Détail v2.2.8 (le plus récent — EN COURS DE VALIDATION)
Beros avait constaté 2 bugs en testant sur l'émulateur :
- **BUG 1 — Agenda** : le bouton « Nouvel événement » ouvrait un écran « Détails / Bientôt disponible » au lieu du formulaire. **Cause** : dans `app_router.dart`, la route `/agenda/event/:id` était déclarée AVANT `/agenda/event/edit`, donc GoRouter capturait « edit » comme un `id` et ouvrait l'écran de détail (placeholder). **Fix** : routes spécifiques (`/edit`) remontées avant les routes paramétrées (`/:id`).
- **BUG 2 — Messages** : le bouton « Ajouter la règle » ne faisait rien. **Cause** : `_submit()` était synchrone et n'attendait pas `cubit.addRule()` ; si l'opération async échouait, `Navigator.pop()` n'était jamais atteint. **Fix** : `_submit()` rendu async avec `await`, garde `_submitting`, `try/finally` + `mounted` check, bouton désactivé pendant soumission. Aligné sur le pattern du formulaire blacklist (appels).

**Métriques v2.2.8** : flutter analyze 79 issues · flutter test 320/320 · tag `v2.2.8-fix-agenda-rule-actions` poussé.

> ⚠️ **À VALIDER EN PRIORITÉ DANS LA NOUVELLE CONVERSATION** : Beros doit retester sur l'émulateur que les 2 corrections v2.2.8 fonctionnent vraiment :
> 1. Agenda → « Nouvel événement » → un FORMULAIRE doit s'ouvrir (plus « Bientôt disponible »), saisir titre+date, enregistrer, vérifier que l'événement apparaît.
> 2. Messages → FAB « + » → formulaire → Type « Mot-clé » → « spam » → Action « Bloquer » → « Ajouter la règle » → le sheet doit se fermer et la règle apparaître dans la liste.
>
> Note de vigilance sur le BUG 2 : si le bouton ne fait TOUJOURS rien après le fix, c'est que le diagnostic « exception async » était incomplet — il faudrait alors vérifier que `addRule()` existe vraiment dans le cubit et que la validation ne bloque pas silencieusement.

---

## 6. INSTALLATION DOCKER (sujet en parallèle, partiellement résolu)

Beros installe **Docker Desktop 4.75.0** en prévision du **Sprint 9 (backend FastAPI)**. Parcours difficile :
- Erreur initiale « fichier déjà existant » (résidus d'install) → résolu par nettoyage + install silencieuse.
- **Docker Desktop.exe est installé** (confirmé par `Test-Path` = True).
- MAIS erreur **DISM 0x80240021** récurrente sur l'activation de `VirtualMachinePlatform` (WSL 2).
- **Cause racine identifiée** : Beros avait **désactivé Windows Update**, et DISM en a besoin. Le service a été réactivé (`wuauserv : Running`), puis activation WSL via `Enable-WindowsOptionalFeature` (méthode qui contourne DISM).
- **Statut au moment du résumé** : activation WSL en cours / à finaliser. Étapes restantes : laisser finir → redémarrer Windows → lancer Docker Desktop → vérifier l'icône verte → tester `docker --version`.

**Conseil donné à Beros** : laisser Windows Update en mode « Manuel » (pas « Désactivé ») pour ne pas casser les installations futures.

---

## 7. CE QUI RESTE À FAIRE

### Immédiat (à reprendre)
1. **Valider v2.2.8 sur l'émulateur** (les 2 corrections Agenda + Messages — voir section 5).
2. **Finaliser Docker** (terminer l'activation WSL + redémarrage + test).

### Sprint 9 — Backend FastAPI (le prochain gros morceau, ~8-10h, bloqué tant que Docker pas prêt)
Stack : FastAPI + PostgreSQL 16 + Redis 7 + JWT + WebSocket (géoloc temps réel) + FCM (push). 6 parties : infra Docker (~1h), auth JWT (~2h), WebSocket géoloc (~2h), sync cloud (~2h), FCM push (~1h), intégration Flutter Dio (~1-2h). Permet : sync cloud multi-appareils, géoloc temps réel parents/enfants, notifications SOS.

### Roadmap au-delà
- **S10** Sécurité critique (certificate pinning, anti-tampering)
- **S11** IA (détection spam, analyse comportementale)
- **S12** Fitness avancé (cardio, plans d'entraînement, Strava)
- **S13** Temps d'écran (limites apps, mode sommeil)
- **S14** Wearables (Apple Watch, Wear OS)
- **S15** RGPD final (consentement, export données, audit)
- **S16** Onboarding immersif
- **S17** Déploiement Play Store + App Store
- **Sprint Didacticiel Final** (vidéos d'aide intégrées)

---

## 8. LEÇONS TECHNIQUES CUMULÉES (à rappeler dans les futurs prompts Claude Code)

1. Éditer les fichiers `.arb` sources (`mobile/lib/l10n/app_*.arb`), JAMAIS les `.dart` générés. 5 locales : fr, en, es, it, pt. Après édition : `flutter gen-l10n` régénère les `.dart`.
2. Permissions runtime via `permission_handler`.
3. Pattern `DatabaseHelper.db` statique (pas `.instance`).
4. `ConflictAlgorithm.replace` (pas un entier).
5. Compter le total DB via `repository.getAll()`.
6. Capturer `GoRouter` AVANT `context.pop()` sur un BottomSheet.
7. Texte dans un badge/Row : toujours `Flexible` + `ellipsis` + `maxLines:1`.
8. À chaque modif → rebuild APK + désinstaller + réinstaller (pour test S22).
9. Hot reload (`r`) vs Hot restart (`R`) : `R` pour les nouvelles routes.
10. `Theme.of()` dans `initState()` crashe → utiliser `defaultTargetPlatform`.
11. `canPop()` sans GoRouter crashe → `GoRouter.maybeOf(context)?.canPop() ?? false`.
12. `Future.delayed()` laisse un timer pending en test → `addPostFrameCallback`.
13. Tests auth bloc → `MockTokenStorage` pour éviter `FlutterSecureStorage`.
14. Tests Cupertino → `GlobalCupertinoLocalizations.delegate` requis.
15. Date codée en dur → toujours `DateTime.now()` + intl pour i18n.
16. Erreur DISM 0x80240021 = Windows Update bloqué/désactivé → réactiver le service `wuauserv` puis `Enable-WindowsOptionalFeature` (contourne DISM).
17. **Ordre des routes GoRouter** : les routes spécifiques (`/edit`) DOIVENT être déclarées AVANT les routes paramétrées (`/:id`), sinon le paramètre capture le segment littéral.
18. **Bouton de formulaire** : `onPressed` doit être `async` + `await` l'opération de persistance + garde anti double-tap + `mounted` check avant `Navigator.pop()`.

---

## 9. PHRASE DE REPRISE SUGGÉRÉE POUR LA NOUVELLE CONVERSATION

> « Bonjour Claude. Je continue le développement de mon app Flutter Harmony (filtrage appels/messages + contrôle parental + bien-être). Voici le résumé complet de là où nous en sommes [coller ce document]. Nous venons de livrer le tag v2.2.8 avec 2 corrections (Agenda + règle Messages) que je dois encore valider sur l'émulateur. En parallèle je finalise l'installation de Docker pour le Sprint 9 (backend). Reprenons. »

---

*Document de passation généré le 28 mai 2026 — à jour jusqu'au tag v2.2.8-fix-agenda-rule-actions.*