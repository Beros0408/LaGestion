import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, Download, ExternalLink, FileSpreadsheet,
  MinusCircle, PlusCircle, RefreshCw, Upload,
} from "lucide-react";
import { C, COULEURS_ETAT, alpha } from "../theme";
import { useClients } from "../context/ClientsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { useGardeModifications, useSignalerImport } from "../context/GardeModificationsContext.jsx";
import Select from "../components/form/Select.jsx";
import {
  DELAI_LECTURE_MS, LIMITE_LIGNES, LIMITE_OCTETS, compterRapport, detecterEntete, estVide, issuesFinales,
  lignesFichierErreurs, motifDoublon, nettoyer, planifier, preparerTableau, proposerCorrespondance,
} from "../utils/import.js";
import { CHAMPS_CLIENTS, analyserClients } from "../utils/importClients.js";
import { CHAMPS_ARTICLES, analyserArticles } from "../utils/importArticles.js";
import { useProduits } from "../context/ProduitsContext.jsx";
import { exporterErreursImport } from "../utils/excel";

const CONFIG = {
  clients: {
    titre: "Importer des clients",
    champs: CHAMPS_CLIENTS,
    analyser: analyserClients,
    cible: "client",
    lien: (id) => `/clients/${id}`,
    retour: "/clients",
    libelleRetour: "Voir les clients",
    fichierErreurs: "erreurs-import-clients.xlsx",
  },
  articles: {
    titre: "Importer des articles",
    champs: CHAMPS_ARTICLES,
    analyser: analyserArticles,
    cible: "produit",
    lien: (id) => `/catalogue/${id}/modifier`,
    retour: "/catalogue",
    libelleRetour: "Voir le catalogue",
    fichierErreurs: "erreurs-import-articles.xlsx",
  },
};

const ETAPES = ["Fichier", "Colonnes", "Prévisualisation", "Import"];
const PAR_PAGE = 25;
const LIBELLE_ACTION = { creer: "Créer", mettre_a_jour: "Mettre à jour", ignorer: "Ignorer" };
const FORMATS = ".csv,.txt,.xlsx,.xls,.ods";

const mo = (octets) => `${(octets / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
const nombre = (n) => n.toLocaleString("fr-FR");
const pluriel = (n, un, plusieurs) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

// Lecture dans un Web Worker, interrompue après DELAI_LECTURE_MS.
function lireDansWorker(fichier, feuille) {
  return new Promise((resolve, reject) => {
    fichier.arrayBuffer().then((octets) => {
      const w = new Worker(new URL("../utils/lectureFichier.worker.js", import.meta.url), { type: "module" });
      const minuterie = setTimeout(() => {
        w.terminate();
        reject(new Error(`Lecture interrompue : l'analyse du fichier dépasse ${DELAI_LECTURE_MS / 1000} secondes. Vérifiez son contenu ou découpez-le.`));
      }, DELAI_LECTURE_MS);
      const finir = () => { clearTimeout(minuterie); w.terminate(); };
      w.onmessage = (e) => { finir(); if (e.data.ok) resolve(e.data.resultat); else reject(new Error(e.data.message)); };
      w.onerror = () => { finir(); reject(new Error("Lecture impossible : le fichier n'a pas pu être analysé.")); };
      w.postMessage({ octets, nom: fichier.name, feuille }, [octets]);
    }, () => reject(new Error("Lecture impossible : le fichier n'a pas pu être ouvert.")));
  });
}

// Catégorie affichée d'une ligne, selon l'action choisie (prévisualisation) ou son issue (rapport).
function etatLigne(l) {
  const issue = l.issue;
  if (issue === "importee") return { etat: "succes", libelle: "Importée", Icone: CheckCircle2 };
  if (issue === "mise_a_jour") return { etat: "info", libelle: "Mise à jour", Icone: RefreshCw };
  if (issue === "erreur" || (!issue && l.categorie === "erreur")) return { etat: "erreur", libelle: "Erreur", Icone: AlertCircle };
  if (issue === "vide" || l.categorie === "vide") return { etat: "neutre", libelle: "Ligne vide", Icone: MinusCircle };
  if (issue === "total" || l.categorie === "total") return { etat: "neutre", libelle: "Total ignoré", Icone: MinusCircle };
  if (issue === "deja_a_jour") return { etat: "neutre", libelle: "Déjà à jour", Icone: MinusCircle };
  if (issue === "ignoree_doublon" || l.action === "ignorer") return { etat: "neutre", libelle: "Ignorée", Icone: Copy };
  if (l.action === "mettre_a_jour") return { etat: "info", libelle: "À mettre à jour", Icone: RefreshCw };
  return { etat: "succes", libelle: "À créer", Icone: PlusCircle };
}

export default function Import({ type = "clients" }) {
  const config = CONFIG[type];
  const { peutEcrire } = useEntreprise();
  const { clients, importerClients } = useClients();
  const { produits, importerProduits } = useProduits();
  const [existants, importerLignes] = type === "articles" ? [produits, importerProduits] : [clients, importerClients];

  const [etape, setEtape] = useState(1);
  const [fichier, setFichier] = useState(null);
  const [lecture, setLecture] = useState({ etat: "repos", message: "" });
  const [brut, setBrut] = useState(null);
  const [entete, setEntete] = useState({ index: 0, certaine: true });
  const [correspondance, setCorrespondance] = useState([]);
  const [lignes, setLignes] = useState([]);
  const [progression, setProgression] = useState(null);
  const [final, setFinal] = useState(null);
  const titreRef = useRef(null);

  const tableau = useMemo(() => (brut ? preparerTableau(brut, entete.index) : null), [brut, entete.index]);

  // Colonnes, prévisualisation ou import en cours : quitter la page (barre latérale, Retour, onglet) demande confirmation.
  useGardeModifications(etape === 2 || etape === 3 || (etape === 4 && !final));
  // Écriture en cours : changement et création d'entreprise refusés (sélecteur).
  useSignalerImport(etape === 4 && !final);

  // Focus sur le titre de chaque étape (lecteurs d'écran, clavier).
  useEffect(() => { titreRef.current?.focus(); }, [etape]);

  const charger = useCallback(async (f, feuille = null) => {
    if (f.size > LIMITE_OCTETS) {
      setLecture({ etat: "erreur", message: `Fichier trop volumineux (${mo(f.size)}) : ${mo(LIMITE_OCTETS)} au plus par import. Découpez-le en plusieurs fichiers.` });
      return;
    }
    setLecture({ etat: "lecture", message: "" });
    try {
      const r = await lireDansWorker(f, feuille);
      if (r.lignes.length === 0) throw new Error("Le fichier est vide : aucune cellule remplie.");
      const e = detecterEntete(r.lignes, config.champs);
      const t = preparerTableau(r, e.index);
      setFichier(f);
      setBrut(r);
      setEntete(e);
      setCorrespondance(proposerCorrespondance(t.entetes, config.champs));
      setLecture({ etat: "repos", message: "" });
      setEtape(2);
    } catch (err) {
      setLecture({ etat: "erreur", message: err.message });
    }
  }, [config.champs]);

  const changerEntete = (index) => {
    const t = preparerTableau(brut, index);
    setEntete({ index, certaine: true });
    setCorrespondance(proposerCorrespondance(t.entetes, config.champs));
  };

  const previsualiser = () => {
    setLignes(config.analyser(tableau, correspondance, existants));
    setEtape(3);
  };

  const importer = async () => {
    const plan = planifier(lignes, config.cible);
    setEtape(4);
    setProgression({ faits: 0, total: plan.creations.length + plan.majs.length });
    const resultats = await importerLignes(plan, (faits, total) => setProgression({ faits, total }));
    const issues = issuesFinales(lignes, plan, resultats);
    setFinal({ issues, rapport: compterRapport(issues) });
    setProgression(null);
  };

  const recommencer = () => {
    setEtape(1); setFichier(null); setBrut(null); setLignes([]); setFinal(null); setLecture({ etat: "repos", message: "" });
  };

  if (!peutEcrire) {
    return (
      <>
        <EnTete titre={config.titre} />
        <Encadre etat="erreur" Icone={AlertCircle}>Votre rôle ne permet pas d'importer des données.</Encadre>
      </>
    );
  }

  return (
    <>
      <EnTete titre={config.titre} />
      <Etapes etape={etape} />
      <section aria-labelledby="titre-etape" className="mt-5 rounded-2xl p-4 sm:p-6" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {etape === 1 && <EtapeFichier titreRef={titreRef} lecture={lecture} onFichier={(f) => charger(f)} />}
        {etape === 2 && tableau && (
          <EtapeColonnes
            titreRef={titreRef} config={config} fichier={fichier} brut={brut} tableau={tableau} entete={entete}
            correspondance={correspondance} setCorrespondance={setCorrespondance} lecture={lecture}
            onEntete={changerEntete} onFeuille={(n) => charger(fichier, n)} onRetour={recommencer} onSuite={previsualiser}
          />
        )}
        {etape === 3 && (
          <EtapePrevisualisation
            titreRef={titreRef} config={config} lignes={lignes} setLignes={setLignes}
            onRetour={() => setEtape(2)} onImporter={importer}
          />
        )}
        {etape === 4 && (
          <EtapeImport
            titreRef={titreRef} config={config} progression={progression} final={final} tableau={tableau} onRecommencer={recommencer}
          />
        )}
      </section>
    </>
  );
}

// ---------- Briques ----------

function EnTete({ titre }) {
  return (
    <div className="mb-5">
      <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>{titre}</h2>
      <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
        Fichier CSV ou Excel, {mo(LIMITE_OCTETS)} et {nombre(LIMITE_LIGNES)}&nbsp;lignes au plus.
      </p>
    </div>
  );
}

function Etapes({ etape }) {
  return (
    <ol className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Étapes de l'import">
      {ETAPES.map((libelle, i) => {
        const n = i + 1;
        const faite = n < etape;
        const courante = n === etape;
        return (
          <li key={libelle} aria-current={courante ? "step" : undefined} className="flex items-center gap-2 text-sm">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={{
                backgroundColor: courante || faite ? C.primary : "transparent",
                color: courante || faite ? C.onPrimary : C.textSecondary,
                border: `1px solid ${courante || faite ? C.primary : C.borderInput}`,
              }}
              aria-hidden="true"
            >
              {faite ? <Check size={13} /> : n}
            </span>
            <span style={{ color: courante ? C.textPrimary : C.textSecondary, fontWeight: courante ? 600 : 400 }}>
              {libelle}
              {faite && <span className="sr-only"> (terminée)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TitreEtape({ titreRef, children, sousTitre }) {
  return (
    <div className="mb-4">
      <h3 id="titre-etape" ref={titreRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none" style={{ color: C.textPrimary }}>
        {children}
      </h3>
      {sousTitre && <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>{sousTitre}</p>}
    </div>
  );
}

function Bouton({ primaire, icon: Icon, iconeApres, children, ...rest }) {
  return (
    <button
      type="button"
      className="inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      style={primaire
        ? { backgroundColor: C.primary, color: C.onPrimary, border: `1px solid ${C.primary}` }
        : { color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
      {...rest}
    >
      {Icon && !iconeApres && <Icon size={16} aria-hidden="true" />}
      {children}
      {Icon && iconeApres && <Icon size={16} aria-hidden="true" />}
    </button>
  );
}

function Encadre({ etat, Icone, children, role }) {
  const e = COULEURS_ETAT[etat];
  return (
    <div role={role} className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: e.badge, color: e.texte }}>
      <Icone size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Badge({ etat, libelle, Icone }) {
  const e = COULEURS_ETAT[etat];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: e.texte, backgroundColor: e.badge }}>
      <Icone size={13} aria-hidden="true" />
      {libelle}
    </span>
  );
}

function Pied({ children }) {
  return <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>{children}</div>;
}

// Mêmes actions en haut de l'étape : le bouton principal est visible sans faire défiler une longue liste.
// Pas de barre fixe : aucun élément flottant au-dessus du contenu (CLAUDE.md §7, WCAG 2.4.11).
function ActionsHaut({ children, aide }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 pb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
      {children}
      {aide && <p className="w-full text-xs" style={{ color: C.textSecondary }}>{aide}</p>}
    </div>
  );
}

// ---------- 1. Fichier ----------

function EtapeFichier({ titreRef, lecture, onFichier }) {
  const inputRef = useRef(null);
  const [survol, setSurvol] = useState(false);
  const enCours = lecture.etat === "lecture";
  return (
    <>
      <TitreEtape titreRef={titreRef} sousTitre="Formats acceptés : CSV (séparateur « ; » ou « , », UTF-8 ou Windows-1252), XLSX, XLS et ODS.">
        1. Choisir le fichier
      </TitreEtape>
      <div
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f && !enCours) onFichier(f); }}
        className="flex flex-col items-center gap-3 rounded-2xl px-4 py-10 text-center"
        style={{ border: `2px dashed ${survol ? C.primary : C.borderInput}`, backgroundColor: survol ? alpha(C.primary, 0.06) : C.bgMain }}
      >
        <FileSpreadsheet size={32} aria-hidden="true" style={{ color: C.textSecondary }} />
        <p className="text-sm" style={{ color: C.textPrimary }}>Déposez le fichier ici, ou</p>
        <input
          ref={inputRef}
          id="fichier-import"
          type="file"
          accept={FORMATS}
          className="sr-only"
          disabled={enCours}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFichier(f); }}
        />
        <Bouton primaire icon={Upload} disabled={enCours} onClick={() => inputRef.current?.click()} aria-describedby="aide-fichier">
          {enCours ? "Lecture en cours…" : "Choisir un fichier"}
        </Bouton>
        <p id="aide-fichier" className="text-xs" style={{ color: C.textSecondary }}>
          {mo(LIMITE_OCTETS)} et {nombre(LIMITE_LIGNES)}&nbsp;lignes au plus. La ligne de titres est détectée automatiquement.
        </p>
      </div>
      <div className="mt-4" aria-live="polite">
        {enCours && <p className="text-sm" role="status" style={{ color: C.textSecondary }}>Lecture du fichier…</p>}
        {lecture.etat === "erreur" && <Encadre etat="erreur" Icone={AlertCircle} role="alert">{lecture.message}</Encadre>}
      </div>
    </>
  );
}

// ---------- 2. Colonnes ----------

function EtapeColonnes({ titreRef, config, fichier, brut, tableau, entete, correspondance, setCorrespondance, lecture, onEntete, onFeuille, onRetour, onSuite }) {
  const numeroEntete = entete.index + 1 + (brut.ligneDebut ?? 0);
  const donnees = tableau.lignes.filter((l) => !l.vide).length;
  const parCle = new Map(config.champs.map((c) => [c.cle, c]));

  const problemes = [];
  const requis = config.champs.filter((c) => c.requis && !correspondance.includes(c.cle));
  requis.forEach((c) => problemes.push(`Associez une colonne au champ obligatoire « ${c.libelle} ».`));
  config.champs.filter((c) => !c.multiple && correspondance.filter((k) => k === c.cle).length > 1)
    .forEach((c) => problemes.push(`« ${c.libelle} » est associé à plusieurs colonnes : gardez-en une seule.`));

  const options = [{ value: "", label: "Ne pas importer" }, ...config.champs.map((c) => ({ value: c.cle, label: c.requis ? `${c.libelle} (obligatoire)` : c.libelle }))];
  const exemples = (c) => tableau.lignes.map((l) => l.valeurs[c]).filter((v) => !estVide(v)).slice(0, 2).map((v) => nettoyer(v).slice(0, 40));

  const details = [
    brut.format,
    brut.feuille && `feuille « ${brut.feuille} »`,
    brut.encodage && `encodage ${brut.encodage}`,
    brut.separateur && `séparateur « ${brut.separateur === "\t" ? "tabulation" : brut.separateur} »`,
    pluriel(tableau.lignes.length, "ligne sous les titres", "lignes sous les titres"),
  ].filter(Boolean).join(" · ");

  const actions = (
    <>
      <Bouton icon={ArrowLeft} onClick={onRetour}>Changer de fichier</Bouton>
      <Bouton primaire icon={ArrowRight} iconeApres disabled={problemes.length > 0 || donnees === 0} onClick={onSuite}>
        Prévisualiser
      </Bouton>
    </>
  );

  return (
    <>
      <TitreEtape titreRef={titreRef} sousTitre={<><strong className="font-medium" style={{ color: C.textPrimary }}>{fichier.name}</strong> · {details}</>}>
        2. Associer les colonnes
      </TitreEtape>
      <ActionsHaut aide={problemes.length > 0 ? "Prévisualisation impossible : corrigez les associations signalées sous la liste des colonnes." : null}>
        {actions}
      </ActionsHaut>

      <div className="flex flex-wrap items-start gap-4">
        {brut.feuilles.length > 1 && (
          <Select
            label="Feuille"
            className="w-full sm:w-56"
            value={brut.feuille}
            onChange={(e) => onFeuille(e.target.value)}
            options={brut.feuilles.map((n) => ({ value: n, label: n }))}
          />
        )}
        <div className="w-full sm:w-56">
          <label htmlFor="ligne-entete" className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>Ligne des titres de colonnes</label>
          <input
            id="ligne-entete"
            type="number"
            min={1 + (brut.ligneDebut ?? 0)}
            max={brut.lignes.length + (brut.ligneDebut ?? 0)}
            value={numeroEntete}
            onChange={(e) => {
              const i = Number(e.target.value) - 1 - (brut.ligneDebut ?? 0);
              if (Number.isInteger(i) && i >= 0 && i < brut.lignes.length) onEntete(i);
            }}
            aria-describedby="aide-entete"
            className="w-full rounded-xl px-3 py-2 text-sm tabular-nums focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.bgCard, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
          />
          <p id="aide-entete" className="mt-1 text-xs" style={{ color: C.textSecondary }}>
            Les lignes au-dessus (titre, logo) ne sont pas importées.
          </p>
        </div>
      </div>

      {!entete.certaine && (
        <div className="mt-4">
          <Encadre etat="avertissement" Icone={AlertTriangle}>
            Titres de colonnes non reconnus : indiquez la ligne qui les contient, puis vérifiez les associations.
          </Encadre>
        </div>
      )}
      {lecture.etat === "erreur" && <div className="mt-4"><Encadre etat="erreur" Icone={AlertCircle} role="alert">{lecture.message}</Encadre></div>}

      <ul className="mt-5 divide-y" style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderColor: C.border }} aria-label="Colonnes du fichier">
        {tableau.entetes.map((e) => {
          const cle = correspondance[e.index] ?? "";
          const ex = exemples(e.index);
          return (
            <li key={e.index} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,15rem)] sm:items-center sm:gap-4" style={{ borderColor: C.border }}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" style={{ color: e.vide ? C.textSecondary : C.textPrimary }} title={e.libelle}>{e.libelle}</p>
              </div>
              <p className="min-w-0 truncate text-xs" style={{ color: C.textSecondary }} title={ex.join(" · ")}>
                {ex.length > 0 ? <>Ex. : {ex.join(" · ")}</> : "Colonne vide"}
              </p>
              <Select
                aria-label={`Champ LaGestion pour la colonne « ${e.libelle} »`}
                value={cle}
                onChange={(ev) => setCorrespondance((prev) => prev.map((k, i) => (i === e.index ? ev.target.value : k)))}
                options={options}
                hint={cle && parCle.get(cle)?.multiple && correspondance.filter((k) => k === cle).length > 1
                  ? `Colonnes réunies dans « ${parCle.get(cle).libelle} »` : undefined}
              />
            </li>
          );
        })}
      </ul>

      {problemes.length > 0 && (
        <div className="mt-4">
          <Encadre etat="erreur" Icone={AlertCircle}>
            <ul className="space-y-1">{problemes.map((p) => <li key={p}>{p}</li>)}</ul>
          </Encadre>
        </div>
      )}

      <Pied>{actions}</Pied>
    </>
  );
}

// ---------- 3. Prévisualisation ----------

const FILTRES = [
  { id: "toutes", libelle: "Toutes", garder: () => true },
  { id: "erreurs", libelle: "Erreurs", garder: (l) => l.categorie === "erreur" },
  { id: "doublons", libelle: "Doublons", garder: (l) => l.categorie === "doublon" },
  { id: "avertissements", libelle: "Avertissements", garder: (l) => l.avertissements.length > 0 },
  { id: "ignorees", libelle: "Vides et totaux", garder: (l) => l.categorie === "vide" || l.categorie === "total" },
];

function EtapePrevisualisation({ titreRef, config, lignes, setLignes, onRetour, onImporter }) {
  const [filtre, setFiltre] = useState("toutes");
  const [page, setPage] = useState(1);

  const plan = useMemo(() => planifier(lignes, config.cible), [lignes, config.cible]);
  const compte = useMemo(() => {
    const c = { erreurs: 0, ignorees: 0, dejaAJour: 0, vides: 0 };
    for (const v of plan.issues.values()) {
      if (v.issue === "erreur") c.erreurs++;
      else if (v.issue === "ignoree_doublon") c.ignorees++;
      else if (v.issue === "deja_a_jour") c.dejaAJour++;
      else c.vides++;
    }
    return c;
  }, [plan]);

  const certains = lignes.filter((l) => l.categorie === "doublon" && l.doublon.confiance >= 90);
  const possibles = lignes.filter((l) => l.categorie === "doublon" && l.doublon.confiance < 90);
  const appliquer = (groupe, action) => {
    const numeros = new Set(groupe.filter((l) => l.actions.includes(action)).map((l) => l.numero));
    setLignes((prev) => prev.map((l) => (numeros.has(l.numero) ? { ...l, action } : l)));
  };
  const choisir = (numero, action) => setLignes((prev) => prev.map((l) => (l.numero === numero ? { ...l, action } : l)));

  const f = FILTRES.find((x) => x.id === filtre);
  const visibles = lignes.filter(f.garder);
  const pages = Math.max(1, Math.ceil(visibles.length / PAR_PAGE));
  const pageSure = Math.min(page, pages);
  const affichees = visibles.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE);
  const aTraiter = plan.creations.length + plan.majs.length;

  const actions = (
    <>
      <Bouton icon={ArrowLeft} onClick={onRetour}>Colonnes</Bouton>
      <Bouton primaire icon={Upload} disabled={aTraiter === 0} onClick={onImporter}>
        {aTraiter === 0 ? "Aucune ligne à importer" : `Importer ${pluriel(aTraiter, "ligne", "lignes")}`}
      </Bouton>
    </>
  );

  return (
    <>
      <TitreEtape titreRef={titreRef} sousTitre="Vérifiez chaque ligne. Rien n'est enregistré avant de cliquer sur « Importer ».">
        3. Prévisualiser
      </TitreEtape>
      <ActionsHaut>{actions}</ActionsHaut>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Compteur libelle="Lignes lues" valeur={lignes.length} />
        <Compteur libelle="À créer" valeur={plan.creations.length} etat="succes" />
        <Compteur libelle="À mettre à jour" valeur={plan.majs.length} etat="info" />
        <Compteur libelle="Doublons ignorés" valeur={compte.ignorees + compte.dejaAJour} etat="neutre" />
        <Compteur libelle="Vides et totaux" valeur={compte.vides} etat="neutre" />
        <Compteur libelle="En erreur" valeur={compte.erreurs} etat="erreur" />
      </dl>

      {(certains.length > 0 || possibles.length > 0) && (
        <div className="mt-4 flex flex-wrap gap-4 rounded-xl p-3" style={{ backgroundColor: C.bgMain }}>
          {certains.length > 0 && (
            <ChoixGroupe
              libelle={`Doublons quasi certains (${nombre(certains.length)})`}
              groupe={certains}
              actions={["ignorer", "mettre_a_jour"]}
              onAppliquer={(a) => appliquer(certains, a)}
            />
          )}
          {possibles.length > 0 && (
            <ChoixGroupe
              libelle={`Doublons possibles (${nombre(possibles.length)})`}
              groupe={possibles}
              actions={["creer", "mettre_a_jour", "ignorer"]}
              onAppliquer={(a) => appliquer(possibles, a)}
            />
          )}
        </div>
      )}

      <div role="group" aria-label="Filtrer les lignes" className="mt-5 flex flex-wrap gap-1.5">
        {FILTRES.map((x) => {
          const n = lignes.filter(x.garder).length;
          const actif = x.id === filtre;
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={actif}
              onClick={() => { setFiltre(x.id); setPage(1); }}
              className="rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2"
              style={{ color: actif ? C.onPrimary : C.textSecondary, backgroundColor: actif ? C.primary : C.bgMain, border: `1px solid ${actif ? C.primary : C.border}` }}
            >
              {x.libelle} <span className="tabular-nums">({nombre(n)})</span>
            </button>
          );
        })}
      </div>

      {affichees.length === 0 ? (
        <p className="mt-6 text-sm" style={{ color: C.textSecondary }}>Aucune ligne dans ce filtre.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Lignes du fichier">
          {affichees.map((l) => <LignePrevisualisation key={l.numero} ligne={l} config={config} onChoisir={choisir} />)}
        </ul>
      )}

      <Pagination page={pageSure} pages={pages} total={visibles.length} onPage={setPage} />

      <Pied>{actions}</Pied>
    </>
  );
}

function Compteur({ libelle, valeur, etat }) {
  const e = etat ? COULEURS_ETAT[etat] : null;
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: C.bgMain, borderLeft: e ? `4px solid ${e.trait}` : `4px solid ${C.border}` }}>
      <dt className="text-xs" style={{ color: C.textSecondary }}>{libelle}</dt>
      <dd className="text-xl font-semibold tabular-nums" style={{ color: C.textPrimary }}>{nombre(valeur)}</dd>
    </div>
  );
}

function ChoixGroupe({ libelle, groupe, actions, onAppliquer }) {
  const communes = new Set(groupe.map((l) => l.action));
  const valeur = communes.size === 1 ? [...communes][0] : "";
  return (
    <Select
      label={libelle}
      className="w-full sm:w-64"
      value={valeur}
      onChange={(e) => e.target.value && onAppliquer(e.target.value)}
      options={[...(valeur ? [] : [{ value: "", label: "Choix différents selon les lignes" }]), ...actions.map((a) => ({ value: a, label: `${LIBELLE_ACTION[a]} pour toutes` }))]}
    />
  );
}

function nomLigne(l) {
  return l.donnees?.nom || l.valeurs.map(nettoyer).find(Boolean) || "—";
}

function Messages({ ligne }) {
  const motifs = ligne.motifs ?? [];
  const erreurs = ligne.issue ? (ligne.issue === "erreur" ? motifs : []) : ligne.erreurs;
  return (
    <>
      {erreurs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {erreurs.map((m) => (
            <li key={m} className="flex items-start gap-1.5 text-xs" style={{ color: C.errorText }}>
              <AlertCircle size={13} aria-hidden="true" className="mt-0.5 shrink-0" /><span><span className="sr-only">Erreur : </span>{m}</span>
            </li>
          ))}
        </ul>
      )}
      {ligne.avertissements.length > 0 && (
        <ul className="mt-2 space-y-1">
          {ligne.avertissements.map((m) => (
            <li key={m} className="flex items-start gap-1.5 text-xs" style={{ color: C.warningText }}>
              <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" /><span><span className="sr-only">Avertissement : </span>{m}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function LignePrevisualisation({ ligne: l, config, onChoisir }) {
  const { cible } = config;
  const { etat, libelle, Icone } = etatLigne(l);
  const e = COULEURS_ETAT[etat];
  const erreur = l.categorie === "erreur";
  return (
    <li
      className="rounded-xl p-3"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: erreur ? `4px solid ${e.trait}` : `1px solid ${C.border}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm">
          <span className="tabular-nums" style={{ color: C.textSecondary }}>Ligne {l.numero}</span>
          <span style={{ color: C.textSecondary }}> · </span>
          <span className="font-medium break-words" style={{ color: C.textPrimary }}>{nomLigne(l)}</span>
        </p>
        <Badge etat={etat} libelle={libelle} Icone={Icone} />
      </div>
      <Messages ligne={l} />
      {/* Doublon quasi certain : ligne d'information ; doublon possible : l'avertissement le dit déjà, seul le lien s'ajoute. */}
      {l.doublon && (l.doublon.confiance >= 90 || l.doublon.source === "base") && (
        <p className="mt-2 flex items-start gap-1.5 text-xs" style={{ color: C.infoText }}>
          {l.doublon.confiance >= 90 && <Copy size={13} aria-hidden="true" className="mt-0.5 shrink-0" />}
          <span>
            {l.doublon.confiance >= 90 && <>{motifDoublon(l.doublon, cible)}, confiance {l.doublon.confiance}&nbsp;%</>}
            {l.doublon.source === "base" && l.doublon[cible]?.id && (
              <>
                {l.doublon.confiance >= 90 && " · "}
                {/* Nouvel onglet : la prévisualisation en cours reste intacte. */}
                <Link
                  to={config.lien(l.doublon[cible].id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline focus:outline-none focus-visible:ring-2"
                  style={{ color: C.infoText }}
                >
                  {l.doublon.confiance >= 90 ? "voir la fiche" : `Voir la fiche de « ${l.doublon[cible].nom} »`} (nouvel onglet)
                  <ExternalLink size={12} aria-hidden="true" className="ml-1 inline align-[-1px]" />
                </Link>
              </>
            )}
          </span>
        </p>
      )}
      {l.actions.length > 1 && (
        <fieldset className="mt-3">
          <legend className="sr-only">Action pour la ligne {l.numero}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {l.actions.map((a) => (
              <label key={a} className="inline-flex cursor-pointer items-center gap-2 text-sm" style={{ color: C.textPrimary }}>
                <input
                  type="radio"
                  name={`action-${l.numero}`}
                  value={a}
                  checked={l.action === a}
                  onChange={() => onChoisir(l.numero, a)}
                  className="h-4 w-4 focus-visible:ring-2"
                  style={{ accentColor: C.primary }}
                />
                {LIBELLE_ACTION[a]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {l.action === "mettre_a_jour" && <Differences differences={l.differences} />}
    </li>
  );
}

function Differences({ differences }) {
  if (differences.length === 0) {
    return <p className="mt-3 text-xs" style={{ color: C.textSecondary }}>Aucune valeur nouvelle : la ligne sera comptée « Déjà à jour ».</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">Modifications prévues</caption>
        <thead>
          <tr style={{ color: C.textSecondary, borderBottom: `1px solid ${C.border}` }}>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">Champ</th>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">Valeur actuelle</th>
            <th scope="col" className="py-1.5 text-left font-medium">Nouvelle valeur</th>
          </tr>
        </thead>
        <tbody>
          {differences.map((d) => (
            <tr key={d.cle} style={{ borderBottom: `1px solid ${C.border}` }}>
              <th scope="row" className="py-1.5 pr-3 text-left font-medium" style={{ color: C.textPrimary }}>{d.libelle}</th>
              <td className="py-1.5 pr-3 break-words" style={{ color: C.textSecondary }}>{d.ancienne || "—"}</td>
              <td className="py-1.5 break-words font-medium" style={{ color: C.textPrimary }}>{d.nouvelle}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ page, pages, total, onPage }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination des lignes" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs tabular-nums" style={{ color: C.textSecondary }}>
        {nombre((page - 1) * PAR_PAGE + 1)}–{nombre(Math.min(page * PAR_PAGE, total))} sur {nombre(total)}
      </p>
      <div className="flex items-center gap-2">
        <Bouton icon={ArrowLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Page précédente">Précédente</Bouton>
        <span className="text-xs tabular-nums" style={{ color: C.textPrimary }}>Page {page} / {pages}</span>
        <Bouton icon={ArrowRight} iconeApres disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Page suivante">Suivante</Bouton>
      </div>
    </nav>
  );
}

// ---------- 4. Import et rapport ----------

function EtapeImport({ titreRef, config, progression, final, tableau, onRecommencer }) {
  const [page, setPage] = useState(1);
  if (!final) {
    const { faits = 0, total = 0 } = progression ?? {};
    const pct = total ? Math.round((faits / total) * 100) : 0;
    return (
      <>
        <TitreEtape titreRef={titreRef}>4. Import en cours</TitreEtape>
        <div
          role="progressbar"
          aria-label="Avancement de l'import"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={faits}
          aria-valuetext={`${nombre(faits)} sur ${nombre(total)} lignes`}
          className="h-2.5 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
        >
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: C.primary }} />
        </div>
        <p className="mt-2 text-sm tabular-nums" style={{ color: C.textSecondary }}>
          {nombre(faits)} / {nombre(total)} lignes traitées. Restez sur cette page jusqu'à la fin.
        </p>
      </>
    );
  }

  const { rapport: r, issues } = final;
  const nonImportees = issues.filter((l) => l.issue !== "importee" && l.issue !== "mise_a_jour");
  const pages = Math.max(1, Math.ceil(nonImportees.length / PAR_PAGE));
  const pageSure = Math.min(page, pages);
  const somme = r.importees + r.misesAJour + r.ignorees + r.erreurs;

  return (
    <>
      <TitreEtape titreRef={titreRef} sousTitre={`Aucune ligne n'est perdue : ${nombre(somme)} lignes classées sur ${nombre(r.lues)} lues.`}>
        4. Rapport d'import
      </TitreEtape>
      <div aria-live="polite" className="sr-only">
        Import terminé : {pluriel(r.importees, "ligne importée", "lignes importées")}, {pluriel(r.misesAJour, "mise à jour", "mises à jour")}, {pluriel(r.ignorees, "ignorée", "ignorées")}, {pluriel(r.erreurs, "en erreur", "en erreur")}.
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Compteur libelle="Lignes lues" valeur={r.lues} />
        <Compteur libelle="Importées" valeur={r.importees} etat="succes" />
        <Compteur libelle="Mises à jour" valeur={r.misesAJour} etat="info" />
        <Compteur libelle="Ignorées" valeur={r.ignorees} etat="neutre" />
        <Compteur libelle="En erreur" valeur={r.erreurs} etat="erreur" />
      </dl>
      {r.ignorees > 0 && (
        <p className="mt-3 text-xs" style={{ color: C.textSecondary }}>
          Ignorées : {pluriel(r.ignoreesDoublon, "doublon", "doublons")} · {nombre(r.dejaAJour)} déjà à jour · {pluriel(r.vides, "ligne vide", "lignes vides")} · {pluriel(r.totaux, "ligne de total", "lignes de total")}.
        </p>
      )}

      {r.erreurs > 0 && (
        <div className="mt-4">
          <Encadre etat="erreur" Icone={AlertCircle}>
            <p>{pluriel(r.erreurs, "ligne n'a pas été importée", "lignes n'ont pas été importées")}. Le fichier d'erreurs reprend leurs valeurs d'origine et le motif ; corrigez-le puis importez-le à nouveau.</p>
            <div className="mt-2">
              <Bouton icon={Download} onClick={() => exporterErreursImport(lignesFichierErreurs(tableau.entetes, issues), config.fichierErreurs)}>
                Télécharger le fichier d'erreurs
              </Bouton>
            </div>
          </Encadre>
        </div>
      )}

      {nonImportees.length > 0 && (
        <>
          <h4 className="mt-6 text-sm font-semibold" style={{ color: C.textPrimary }}>Lignes non importées ({nombre(nonImportees.length)})</h4>
          <ul className="mt-3 space-y-2">
            {nonImportees.slice((pageSure - 1) * PAR_PAGE, pageSure * PAR_PAGE).map((l) => {
              const { etat, libelle, Icone } = etatLigne(l);
              const e = COULEURS_ETAT[etat];
              return (
                <li key={l.numero} className="rounded-xl p-3" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, borderLeft: l.issue === "erreur" ? `4px solid ${e.trait}` : `1px solid ${C.border}` }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 text-sm">
                      <span className="tabular-nums" style={{ color: C.textSecondary }}>Ligne {l.numero}</span>
                      <span style={{ color: C.textSecondary }}> · </span>
                      <span className="font-medium break-words" style={{ color: C.textPrimary }}>{nomLigne(l)}</span>
                    </p>
                    <Badge etat={etat} libelle={libelle} Icone={Icone} />
                  </div>
                  {l.issue === "erreur" ? <Messages ligne={{ ...l, avertissements: [] }} /> : (
                    <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>{l.motifs.join(" ; ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
          <Pagination page={pageSure} pages={pages} total={nonImportees.length} onPage={setPage} />
        </>
      )}

      <Pied>
        <Bouton icon={Upload} onClick={onRecommencer}>Importer un autre fichier</Bouton>
        <Link
          to={config.retour}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ backgroundColor: C.primary, color: C.onPrimary }}
        >
          {config.libelleRetour}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </Pied>
    </>
  );
}
