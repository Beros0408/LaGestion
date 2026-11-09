import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AlertCircle, CheckCircle2, ImageOff, Lock, Upload } from "lucide-react";
import { C, alpha } from "../theme";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";
import {
  DELAI_MAX_JOURS, FORMES_JURIDIQUES, FORME_AUTRE, IMMATRICULATIONS, MODES_PAIEMENT, PENALITES, TAILLE_MAX_LOGO, TYPES_LOGO,
  normaliserIban, normaliserTva, validerParametres,
} from "../utils/parametres";

const ESCOMPTE_DEFAUT = "Pas d'escompte pour paiement anticipé.";
const N = " ";

const SECTIONS = [
  { to: "/parametres/profil", label: "Profil" },
  { to: "/parametres/entreprise", label: "Entreprise" },
];

const FORME_OPTIONS = [
  { value: "", label: "— Non renseignée —" },
  ...FORMES_JURIDIQUES.map((f) => ({ value: f, label: f })),
  { value: FORME_AUTRE, label: "Autre (à préciser)" },
];

function normaliser(e) {
  const forme = e?.forme_juridique ?? "";
  const connue = forme === "" || FORMES_JURIDIQUES.includes(forme);
  return {
    nom: e?.nom ?? "",
    forme_juridique: connue ? forme : FORME_AUTRE,
    forme_autre: connue ? "" : forme,
    capital_social: e?.capital_social != null ? String(e.capital_social) : "",
    siret: e?.siret ?? "",
    adresse: e?.adresse ?? "",
    immatriculation_type: e?.immatriculation_type ?? "",
    immatriculation_lieu: e?.immatriculation_lieu ?? "",
    tva_intra: e?.tva_intra ?? "",
    franchise_tva: Boolean(e?.franchise_tva),
    option_debits: Boolean(e?.option_debits),
    delai_paiement_jours: String(e?.delai_paiement_jours ?? 30),
    mode_paiement: e?.mode_paiement ?? "",
    conditions_paiement: e?.conditions_paiement ?? "",
    penalites_mode: e?.penalites_mode ?? "bce_10",
    penalites_taux: e?.penalites_taux != null ? String(e.penalites_taux) : "",
    escompte: e?.escompte ?? ESCOMPTE_DEFAUT,
    iban: e?.iban ?? "",
    assurance_pro: e?.assurance_pro ?? "",
  };
}

const texte = (s) => (String(s ?? "").trim() === "" ? null : String(s).trim());

function versPatch(f) {
  const forme = f.forme_juridique === FORME_AUTRE ? texte(f.forme_autre) : texte(f.forme_juridique);
  const avecLieu = f.immatriculation_type === "rcs" || f.immatriculation_type === "rm";
  return {
    nom: f.nom.trim(),
    forme_juridique: forme,
    capital_social: forme === "EI" || f.capital_social === "" ? null : Number(f.capital_social),
    siret: texte(String(f.siret).replace(/\s/g, "")),
    adresse: texte(f.adresse),
    immatriculation_type: texte(f.immatriculation_type),
    immatriculation_lieu: avecLieu ? texte(f.immatriculation_lieu) : null,
    tva_intra: texte(normaliserTva(f.tva_intra)),
    franchise_tva: f.franchise_tva,
    option_debits: f.option_debits,
    delai_paiement_jours: Number(f.delai_paiement_jours),
    mode_paiement: texte(f.mode_paiement),
    conditions_paiement: texte(f.conditions_paiement),
    penalites_mode: f.penalites_mode,
    penalites_taux: f.penalites_mode === "taux_fixe" ? Number(f.penalites_taux) : null,
    escompte: texte(f.escompte) ?? ESCOMPTE_DEFAUT,
    iban: texte(normaliserIban(f.iban)),
    assurance_pro: texte(f.assurance_pro),
  };
}

function Carte({ titre, description, children }) {
  return (
    <section className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="text-[18px] font-semibold" style={{ color: C.textPrimary }}>{titre}</h3>
      {description && <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Case({ label, hint, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm" style={{ color: C.textPrimary }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded focus-visible:ring-2"
        style={{ accentColor: C.primary }}
      />
      <span>
        {label}
        {hint && <span className="mt-0.5 block text-xs" style={{ color: C.textSecondary }}>{hint}</span>}
      </span>
    </label>
  );
}

function Message({ type, children }) {
  const erreur = type === "erreur";
  const Icone = erreur ? AlertCircle : CheckCircle2;
  const couleur = erreur ? C.errorText : C.successText;
  return (
    <div
      role={erreur ? "alert" : "status"}
      className="flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ backgroundColor: alpha(erreur ? C.error : C.success, 0.06), color: couleur, border: `1px solid ${erreur ? C.error : C.success}` }}
    >
      <Icone size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

const boutonPrimaire =
  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const boutonSecondaire =
  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

function Profil() {
  const { nomProfil, email, enregistrerNom } = useEntreprise();
  const [nom, setNom] = useState(nomProfil);
  const [etat, setEtat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  useGardeModifications(nom.trim() !== nomProfil.trim());

  const soumettre = async (e) => {
    e.preventDefault();
    setEtat(null);
    setEnvoi(true);
    try {
      await enregistrerNom(nom.trim() || null);
      setNom(nom.trim());
      setEtat({ type: "ok", texte: "Votre nom est enregistré." });
    } catch (err) {
      setEtat({ type: "erreur", texte: err?.message ?? "Enregistrement impossible." });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      <Carte titre="Mon profil" description="Votre nom apparaît dans le menu, l'historique des activités et les tâches.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Nom affiché" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} hint="Laissé vide : la partie de l'e-mail avant @ est affichée." />
          <Input label="E-mail de connexion" value={email} readOnly disabled hint="Modification de l'e-mail : à venir." />
        </div>
      </Carte>
      {etat && <Message type={etat.type}>{etat.texte}</Message>}
      <div className="flex justify-end">
        <button type="submit" disabled={envoi} className={boutonPrimaire} style={{ backgroundColor: C.primary }}>
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

function Logo({ entreprise, modifiable }) {
  const { enregistrerLogo, enregistrerEntreprise, lienLogo } = useEntreprise();
  const [lien, setLien] = useState(null);
  const [etat, setEtat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const champ = useRef(null);
  const chemin = entreprise?.logo_url ?? null;

  useEffect(() => {
    let actif = true;
    setLien(null);
    lienLogo(chemin).then((l) => actif && setLien(l)).catch(() => actif && setLien(null));
    return () => { actif = false; };
  }, [chemin, lienLogo]);

  const choisir = async (e) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    if (!TYPES_LOGO.includes(fichier.type)) return setEtat({ type: "erreur", texte: "Format refusé : PNG ou JPEG uniquement." });
    if (fichier.size > TAILLE_MAX_LOGO) return setEtat({ type: "erreur", texte: `Fichier trop lourd : 1${N}Mo au plus.` });
    setEtat(null);
    setEnvoi(true);
    try {
      await enregistrerLogo(fichier);
      setEtat({ type: "ok", texte: "Logo enregistré." });
    } catch (err) {
      setEtat({ type: "erreur", texte: err?.message ?? "Envoi du logo impossible." });
    } finally {
      setEnvoi(false);
    }
  };

  const retirer = async () => {
    setEtat(null);
    setEnvoi(true);
    try {
      await enregistrerEntreprise({ logo_url: null });
      setEtat({ type: "ok", texte: "Logo retiré des prochains documents." });
    } catch (err) {
      setEtat({ type: "erreur", texte: err?.message ?? "Retrait impossible." });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Carte titre="Logo" description={`PNG ou JPEG, 1${N}Mo au plus. Stocké dans un espace privé ; les documents déjà émis gardent le logo de leur émission.`}>
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-xl"
          style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
        >
          {lien ? (
            <img src={lien} alt={`Logo de ${entreprise?.nom ?? "l'entreprise"}`} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}>
              <ImageOff size={16} aria-hidden="true" /> {chemin ? "Aperçu indisponible" : "Aucun logo"}
            </span>
          )}
        </div>
        {modifiable && (
          <div className="flex flex-wrap gap-2">
            <input ref={champ} type="file" accept={TYPES_LOGO.join(",")} onChange={choisir} className="sr-only" tabIndex={-1} aria-hidden="true" />
            <button type="button" disabled={envoi} onClick={() => champ.current?.click()} className={boutonSecondaire} style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}>
              <Upload size={16} aria-hidden="true" /> {envoi ? "Envoi…" : chemin ? "Remplacer le logo" : "Ajouter un logo"}
            </button>
            {chemin && (
              <button type="button" disabled={envoi} onClick={retirer} className={boutonSecondaire} style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>
                Retirer
              </button>
            )}
          </div>
        )}
      </div>
      {etat && <div className="mt-3"><Message type={etat.type}>{etat.texte}</Message></div>}
    </Carte>
  );
}

function Entreprise() {
  const { entreprise, estAdmin, enregistrerEntreprise } = useEntreprise();
  const initial = useMemo(() => normaliser(entreprise), [entreprise]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [etat, setEtat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  useGardeModifications(estAdmin && JSON.stringify(form) !== JSON.stringify(initial));

  const definir = (cle) => (valeur) => {
    setForm((p) => ({ ...p, [cle]: valeur }));
    setErrors((p) => {
      if (!p[cle]) return p;
      const n = { ...p };
      delete n[cle];
      return n;
    });
    setEtat(null);
  };
  const champ = (cle) => ({ value: form[cle], onChange: (e) => definir(cle)(e.target.value), error: errors[cle] });

  const soumettre = async (e) => {
    e.preventDefault();
    const errs = validerParametres(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setEtat({ type: "erreur", texte: `${Object.keys(errs).length} champ(s) à corriger.` });
      return;
    }
    setEtat(null);
    setEnvoi(true);
    try {
      const ligne = await enregistrerEntreprise(versPatch(form));
      setForm(normaliser(ligne));
      setEtat({ type: "ok", texte: "Informations de l'entreprise enregistrées. Elles s'appliquent aux prochains documents ; les factures déjà émises ne changent pas." });
    } catch (err) {
      setEtat({ type: "erreur", texte: err?.message ?? "Enregistrement impossible." });
    } finally {
      setEnvoi(false);
    }
  };

  const lieuLibelle = form.immatriculation_type === "rm" ? "Département de la chambre de métiers" : "Ville du greffe";
  const avecLieu = form.immatriculation_type === "rcs" || form.immatriculation_type === "rm";

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      {!estAdmin && (
        <p role="note" className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.textSecondary }}>
          <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Seul un administrateur peut modifier ces informations.
        </p>
      )}
      <fieldset disabled={!estAdmin || envoi} className="space-y-4">
        <legend className="sr-only">Informations de l'entreprise</legend>
        <Carte titre="Identité" description="Mentions de l'émetteur reprises sur les devis, factures, avoirs et acomptes.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="Nom de l'entreprise" required autoComplete="organization" className="md:col-span-2" {...champ("nom")} />
            <Select label="Forme juridique" options={FORME_OPTIONS} {...champ("forme_juridique")} />
            {form.forme_juridique === FORME_AUTRE && <Input label="Forme juridique (précision)" placeholder="Ex : SELAS" {...champ("forme_autre")} />}
            {form.forme_juridique !== "EI" && (
              <Input label={`Capital social (€)`} type="number" inputMode="decimal" min="0" step="0.01" hint="Obligatoire pour une société." {...champ("capital_social")} />
            )}
            <Input label="SIRET" inputMode="numeric" hint="14 chiffres (siège)." {...champ("siret")} />
            <Select label="Immatriculation" options={IMMATRICULATIONS} {...champ("immatriculation_type")} />
            {avecLieu && <Input label={lieuLibelle} placeholder={form.immatriculation_type === "rm" ? "Ex : 75" : "Ex : Paris"} {...champ("immatriculation_lieu")} />}
            <Textarea label="Adresse du siège" rows={2} className="md:col-span-2" {...champ("adresse")} />
          </div>
        </Carte>

        <Carte titre="TVA">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input label="N° de TVA intracommunautaire" placeholder="FR32123456789" hint="Clé et SIREN contrôlés." {...champ("tva_intra")} />
            <div className="space-y-3">
              <Case
                label="Franchise en base de TVA"
                hint={`Mention « TVA non applicable, art.${N}293${N}B du CGI ».`}
                checked={form.franchise_tva}
                onChange={definir("franchise_tva")}
              />
              <Case
                label="Option pour le paiement de la TVA d'après les débits"
                hint="Prestations de services uniquement ; mention ajoutée aux factures."
                checked={form.option_debits}
                onChange={definir("option_debits")}
              />
            </div>
          </div>
        </Carte>

        <Carte titre="Paiement" description="Proposé sur chaque nouvelle facture, modifiable facture par facture.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Délai de paiement (jours)"
              required
              type="number"
              inputMode="numeric"
              min="0"
              max={String(DELAI_MAX_JOURS)}
              step="1"
              hint={`À compter de l'émission ; ${DELAI_MAX_JOURS}${N}jours au plus entre professionnels.`}
              {...champ("delai_paiement_jours")}
            />
            <Select label="Mode de paiement" options={MODES_PAIEMENT} {...champ("mode_paiement")} />
            <Input label="Conditions de paiement" placeholder="Ex : 30 jours net" className="md:col-span-2" {...champ("conditions_paiement")} />
            <Select
              label="Pénalités de retard"
              options={PENALITES}
              className="md:col-span-2"
              hint="BCE + 10 points : taux appliqué si rien n'est stipulé (art. L. 441-10 du Code de commerce)."
              {...champ("penalites_mode")}
            />
            {form.penalites_mode === "taux_fixe" && (
              <Input label="Taux annuel des pénalités (%)" type="number" inputMode="decimal" min="0" step="0.01" hint="Au moins trois fois le taux d'intérêt légal." {...champ("penalites_taux")} />
            )}
            <Input label="Escompte pour paiement anticipé" className="md:col-span-2" {...champ("escompte")} />
            <Input label="IBAN" placeholder="FR76 …" hint="Facultatif ; imprimé en pied de facture." className="md:col-span-2" {...champ("iban")} />
          </div>
        </Carte>

        <Carte titre="Assurance professionnelle" description="Facultative ici ; obligatoire sur les documents de certaines activités (décennale du BTP).">
          <Input label="Assureur, n° de contrat et couverture géographique" placeholder="Ex : Assureur X, contrat 123456, France métropolitaine" {...champ("assurance_pro")} />
        </Carte>
      </fieldset>

      {etat && <Message type={etat.type}>{etat.texte}</Message>}
      {estAdmin && (
        <div className="flex justify-end">
          <button type="submit" disabled={envoi} className={boutonPrimaire} style={{ backgroundColor: C.primary }}>
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      )}
      <Logo entreprise={entreprise} modifiable={estAdmin} />
    </form>
  );
}

export default function Parametres({ section }) {
  const navigate = useNavigate();
  const quitter = useQuitter();
  // Changement de section : même confirmation qu'un lien de la barre latérale si le formulaire est modifié.
  const versSection = (to) => (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    quitter(() => navigate(to));
  };
  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>Paramètres</h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>Votre profil et les informations de l'entreprise courante.</p>
      </div>
      <nav aria-label="Sections des paramètres" className="mb-5 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            onClick={versSection(s.to)}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={({ isActive }) =>
              isActive
                ? { color: C.onPrimary, backgroundColor: C.primary }
                : { color: C.textPrimary, backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      {section === "entreprise" ? <Entreprise /> : <Profil />}
    </>
  );
}
