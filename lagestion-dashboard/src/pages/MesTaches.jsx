import React, { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Check, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { C, alpha, couleurEtat } from "../theme";
import { useTaches } from "../context/TachesContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { useDevis } from "../context/DevisContext.jsx";
import { useFactures } from "../context/FacturesContext.jsx";
import { libelleNumero } from "../data/factures";
import { jourParis } from "../utils/facture";
import { etatTache, peutChangerStatut, peutModifierTache, trierTaches } from "../utils/taches";
import BadgeTache from "../components/BadgeTache.jsx";
import FenetreTache from "../components/FenetreTache.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const QUI = [
  { id: "moi", label: "Mes tâches" },
  { id: "toutes", label: "Toutes" },
];
const STATUTS = [
  { id: "a_faire", label: "À faire" },
  { id: "faite", label: "Faites" },
  { id: "toutes", label: "Toutes" },
];

const date = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

function Filtre({ titre, options, valeur, onChange }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>{titre}</p>
      <div role="group" aria-label={titre} className="flex flex-wrap items-center gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={valeur === o.id}
            className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: valeur === o.id ? C.onPrimary : C.textSecondary, backgroundColor: valeur === o.id ? C.primary : "transparent" }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActionsTache({ l, onBasculer, onModifier, onSupprimer }) {
  return (
    <div className="flex items-center justify-end gap-1">
      {l.statutModifiable && (
        <button
          type="button"
          onClick={() => onBasculer(l.t)}
          aria-label={l.t.statut === "faite" ? `Rouvrir la tâche « ${l.t.titre} »` : `Marquer comme faite : « ${l.t.titre} »`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          {l.t.statut === "faite" ? <RotateCcw size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
          {l.t.statut === "faite" ? "Rouvrir" : "Faite"}
        </button>
      )}
      {l.modifiable && (
        <>
          <button
            type="button"
            onClick={(e) => onModifier(l.t, e.currentTarget)}
            aria-label={`Modifier la tâche « ${l.t.titre} »`}
            title="Modifier"
            className="rounded-lg p-2 focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary }}
          >
            <Pencil size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => onSupprimer(l.t, e.currentTarget)}
            aria-label={`Supprimer la tâche « ${l.t.titre} »`}
            title="Supprimer"
            className="rounded-lg p-2 focus:outline-none focus-visible:ring-2"
            style={{ color: C.errorText }}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function ObjetLie({ objet }) {
  return objet
    ? <Link to={objet.lien} className="rounded underline focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>{objet.libelle}</Link>
    : <span style={{ color: C.textSecondary }}>—</span>;
}

export default function MesTaches() {
  const { taches, membres, chargement, erreur: erreurChargement, changerStatut, supprimerTache } = useTaches();
  const { user } = useAuth();
  const { role } = useEntreprise();
  const { clients } = useClients();
  const { opportunites } = useOpportunites();
  const { devis } = useDevis();
  const { factures } = useFactures();
  const jour = useMemo(() => jourParis(), []);
  const [qui, setQui] = useState("moi");
  const [statut, setStatut] = useState("a_faire");
  const [fenetre, setFenetre] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [annonce, setAnnonce] = useState("");
  const refListe = useRef(null);

  const noms = useMemo(() => new Map(membres.map((m) => [m.id, m.nom])), [membres]);
  const objets = useMemo(() => ({
    client_id: new Map(clients.map((c) => [c.id, { libelle: c.nom, lien: `/clients/${c.id}` }])),
    opportunite_id: new Map(opportunites.map((o) => [o.id, { libelle: o.nom, lien: `/opportunites/${o.id}/modifier` }])),
    devis_id: new Map(devis.map((d) => [d.id, { libelle: d.numero ?? "Brouillon de devis", lien: `/devis/${d.id}` }])),
    facture_id: new Map(factures.map((f) => [f.id, { libelle: libelleNumero(f), lien: `/factures/${f.id}` }])),
  }), [clients, opportunites, devis, factures]);

  // Lignes communes au tableau et aux cartes : mêmes filtres, même tri, mêmes droits.
  const lignes = useMemo(
    () => trierTaches(taches)
      .filter((t) => (qui === "toutes" || t.responsable === user?.id) && (statut === "toutes" || t.statut === statut))
      .map((t) => {
        const cle = ["client_id", "opportunite_id", "devis_id", "facture_id"].find((k) => t[k]);
        const etat = etatTache(t, jour);
        return {
          t,
          etat,
          objet: cle ? objets[cle].get(t[cle]) ?? null : null,
          responsable: noms.get(t.responsable) ?? "Ancien membre",
          moi: t.responsable === user?.id,
          statutModifiable: peutChangerStatut(role),
          modifiable: peutModifierTache(t, user?.id, role),
          lisere: etat === "en_retard" ? { boxShadow: `inset 4px 0 0 ${couleurEtat("en_retard").trait}` } : undefined,
        };
      }),
    [taches, qui, statut, user, jour, objets, noms, role]
  );

  const aFaire = taches.filter((t) => t.responsable === user?.id && t.statut === "a_faire");
  const enRetard = aFaire.filter((t) => etatTache(t, jour) === "en_retard").length;

  const basculer = async (t) => {
    setErreur(null);
    try {
      await changerStatut(t.id, t.statut === "faite" ? "a_faire" : "faite");
      setAnnonce(`« ${t.titre} » ${t.statut === "faite" ? "rouverte" : "marquée comme faite"}.`);
      // La ligne peut quitter le filtre : le focus revient sur la liste plutôt que sur la page.
      requestAnimationFrame(() => {
        if (!document.activeElement || document.activeElement === document.body) refListe.current?.focus();
      });
    } catch (e) {
      setErreur(e.message);
    }
  };
  const modifier = (t, element) => setFenetre({ tache: t, element });
  const demanderSuppression = (t, element) => setASupprimer({ t, element });
  const confirmerSuppression = async () => {
    const cible = aSupprimer;
    setASupprimer(null);
    setErreur(null);
    try {
      await supprimerTache(cible.t.id);
    } catch (e) {
      setErreur(e.message);
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>Mes tâches</h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {chargement ? "Chargement…" : (
              <>
                <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{aFaire.length}</span> à faire
                <span className="mx-1">·</span>
                <span className="font-semibold tabular-nums" style={{ color: enRetard > 0 ? C.errorText : C.textPrimary }}>{enRetard}</span> en retard
              </>
            )}
          </p>
        </div>
        {peutChangerStatut(role) && (
          <button
            type="button"
            onClick={(e) => setFenetre({ tache: null, element: e.currentTarget })}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            <Plus size={16} aria-hidden="true" />
            Nouvelle tâche
          </button>
        )}
      </div>

      {(erreur || erreurChargement) && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{erreur || erreurChargement}</span>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 rounded-2xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <Filtre titre="Responsable" options={QUI} valeur={qui} onChange={setQui} />
        <Filtre titre="Statut" options={STATUTS} valeur={statut} onChange={setStatut} />
      </div>

      <p role="status" className="sr-only">{annonce}</p>
      <div ref={refListe} tabIndex={-1} aria-label="Liste des tâches" className="mt-5 rounded-2xl focus:outline-none focus-visible:ring-2" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {lignes.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm" style={{ color: C.textSecondary }}>
            {chargement ? "Chargement des tâches…" : "Aucune tâche pour ces filtres."}
          </p>
        ) : (
          <>
            {/* Tableau à partir de 1 280 px ; en dessous, cartes. L'un des deux est toujours en display: none. */}
            <div className="relative hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Tâches, les plus anciennes échéances d'abord</caption>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Tâche", "Lié à", "Échéance", "État", "Responsable", ""].map((h, i) => (
                      <th key={i} scope="col" className={`px-2 py-2.5 text-xs font-semibold uppercase tracking-wider ${i === 5 ? "text-right" : "text-left"}`} style={{ color: C.textSecondary }}>
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.t.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="px-2 py-3 font-medium" style={{ ...l.lisere, color: C.textPrimary, paddingLeft: 12 }}>{l.t.titre}</td>
                      <td className="px-2 py-3"><ObjetLie objet={l.objet} /></td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums" style={{ color: C.textSecondary }}>{date(l.t.echeance)}</td>
                      <td className="px-2 py-3"><BadgeTache etat={l.etat} /></td>
                      <td className="px-2 py-3" style={{ color: C.textSecondary }}>{l.moi ? `${l.responsable} (moi)` : l.responsable}</td>
                      <td className="px-2 py-3"><ActionsTache l={l} onBasculer={basculer} onModifier={modifier} onSupprimer={demanderSuppression} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="xl:hidden" aria-label="Tâches, les plus anciennes échéances d'abord">
              {lignes.map((l, i) => (
                <li key={l.t.id} className="px-4 py-4" style={{ ...l.lisere, borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-medium" style={{ color: C.textPrimary }}>{l.t.titre}</p>
                    <BadgeTache etat={l.etat} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Échéance</dt>
                      <dd className="tabular-nums" style={{ color: C.textPrimary }}>{date(l.t.echeance)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Responsable</dt>
                      <dd style={{ color: C.textPrimary }}>{l.moi ? `${l.responsable} (moi)` : l.responsable}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Lié à</dt>
                      <dd><ObjetLie objet={l.objet} /></dd>
                    </div>
                  </dl>
                  <div className="mt-3"><ActionsTache l={l} onBasculer={basculer} onModifier={modifier} onSupprimer={demanderSuppression} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {fenetre && (
        <FenetreTache tache={fenetre.tache} elementRetour={fenetre.element} onFermer={() => setFenetre(null)} />
      )}
      <ConfirmDialog
        ouvert={Boolean(aSupprimer)}
        titre="Supprimer cette tâche ?"
        message={aSupprimer ? `« ${aSupprimer.t.titre} » disparaîtra des listes.` : ""}
        libelleAnnuler="Annuler"
        libelleConfirmer="Supprimer"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={confirmerSuppression}
        elementRetour={aSupprimer?.element}
      />
    </>
  );
}
