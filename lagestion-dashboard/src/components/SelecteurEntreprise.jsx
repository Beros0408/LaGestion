import React, { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronsUpDown, Plus, AlertCircle } from "lucide-react";
import { C, AVATARS, OMBRE } from "../theme";
import { useEntreprise, LIBELLE_ROLE } from "../context/EntrepriseContext.jsx";
import { useImportEnCours, useQuitter } from "../context/GardeModificationsContext.jsx";
import { messageImportEnCours } from "../utils/entrepriseCourante";

const optionClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 hover:bg-lg-sidebar-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-lg-sidebar-focus";

// Carte utilisateur du bas de la barre latérale : ouvre la liste des entreprises de l'utilisateur
// et « Créer une entreprise » (même avec une seule entreprise). onAction ferme le tiroir mobile.
export default function SelecteurEntreprise({ onAction }) {
  const {
    appartenances, entrepriseId, entreprise, nomAffiche, initiales, libelleRole, basculerVers,
  } = useEntreprise();
  const quitter = useQuitter();
  const importEnCours = useImportEnCours();
  const navigate = useNavigate();
  const [ouvert, setOuvert] = useState(false);
  const [refus, setRefus] = useState("");
  const conteneurRef = useRef(null);
  const boutonRef = useRef(null);
  const idListe = useId();
  const sousTitre = [entreprise?.nom, libelleRole].filter(Boolean).join(" · ");

  const fermer = (rendreFocus) => {
    setOuvert(false);
    setRefus("");
    if (rendreFocus) boutonRef.current?.focus();
  };

  // Échap ferme la liste (focus rendu à la carte) ; un clic ailleurs la ferme aussi.
  useEffect(() => {
    if (!ouvert) return undefined;
    const surTouche = (e) => {
      if (e.key === "Escape") fermer(true);
    };
    const surClic = (e) => {
      if (!conteneurRef.current?.contains(e.target)) fermer(false);
    };
    document.addEventListener("keydown", surTouche);
    document.addEventListener("mousedown", surClic);
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("mousedown", surClic);
    };
  }, [ouvert]);

  // Pendant l'écriture d'un import : refus, avec le nom de l'entreprise où il s'exécute.
  const executer = (action) => {
    if (importEnCours) {
      setRefus(messageImportEnCours(entreprise?.nom ?? ""));
      return;
    }
    fermer(false);
    quitter(() => {
      onAction?.();
      action();
    });
  };

  const choisir = (id) => {
    if (id === entrepriseId) {
      fermer(true);
      return;
    }
    executer(() => basculerVers(id));
  };

  return (
    <div ref={conteneurRef} className="relative m-2 xl:m-3">
      <button
        ref={boutonRef}
        type="button"
        onClick={() => (ouvert ? fermer(false) : setOuvert(true))}
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-label={`${nomAffiche}, ${sousTitre}. Changer d'entreprise`}
        title={`${nomAffiche} — ${sousTitre}`}
        className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors duration-150 hover:bg-lg-sidebar-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-lg-sidebar-focus md:justify-center md:gap-0 xl:justify-start xl:gap-3 xl:p-3"
        style={{ backgroundColor: ouvert ? C.sidebarActiveBg : C.sidebarHover }}
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: AVATARS.vertEau }}
          aria-hidden="true"
        >
          {initiales}
        </span>
        <span className="min-w-0 flex-1 md:hidden xl:block">
          <span className="block truncate text-[15px] font-semibold" style={{ color: C.sidebarText }}>{nomAffiche}</span>
          <span className="block truncate text-xs" style={{ color: C.sidebarTextMuted }}>{sousTitre}</span>
        </span>
        <ChevronsUpDown size={16} aria-hidden="true" className="shrink-0 md:hidden xl:block" style={{ color: C.sidebarTextMuted }} />
      </button>

      {ouvert && (
        <div
          id={idListe}
          className="absolute bottom-full left-0 z-50 mb-2 w-full rounded-xl p-1.5 md:bottom-0 md:left-full md:mb-0 md:ml-2 md:w-60 xl:bottom-full xl:left-0 xl:mb-2 xl:ml-0 xl:w-full"
          style={{ backgroundColor: C.sidebarBg, border: `1px solid ${C.sidebarBorder}`, boxShadow: OMBRE.lg }}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium" style={{ color: C.sidebarTextMuted }}>
            Vos entreprises
          </p>
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {appartenances.map((a) => {
              const courante = a.entrepriseId === entrepriseId;
              return (
                <li key={a.entrepriseId}>
                  <button
                    type="button"
                    onClick={() => choisir(a.entrepriseId)}
                    aria-current={courante ? "true" : undefined}
                    className={optionClass}
                    style={courante ? { backgroundColor: C.sidebarActiveBg } : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium" style={{ color: courante ? C.sidebarAccent : C.sidebarText }}>
                        {a.nom}
                      </span>
                      <span className="block truncate text-xs" style={{ color: C.sidebarTextMuted }}>
                        {LIBELLE_ROLE[a.role]}
                      </span>
                    </span>
                    {courante && <Check size={16} aria-hidden="true" className="shrink-0" style={{ color: C.sidebarAccent }} />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="my-1.5" style={{ borderTop: `1px solid ${C.sidebarBorder}` }} />
          <button
            type="button"
            onClick={() => executer(() => navigate("/entreprises/nouvelle"))}
            className={optionClass}
            style={{ color: C.sidebarText }}
          >
            <Plus size={16} aria-hidden="true" className="shrink-0" />
            <span className="font-medium">Créer une entreprise</span>
          </button>
          {refus && (
            <p role="alert" className="mt-1.5 flex gap-2 px-2.5 py-2 text-xs" style={{ color: C.sidebarText }}>
              <AlertCircle size={16} aria-hidden="true" className="shrink-0" style={{ color: C.sidebarAccent }} />
              <span>{refus}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
