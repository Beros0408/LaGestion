import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  List, Pencil, Download, Printer, Copy, CreditCard, Trash2, AlertCircle, Plus,
} from "lucide-react";
import { C, alpha, euroCentimes } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useDevis } from "../context/DevisContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import {
  totalHTBrut, remiseGlobale, totalHT, tvaParTaux, totalTTC, totalPaye, resteAPayer,
} from "../utils/facture";
import { genererFacturePdf } from "../utils/facturePdf";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";
import {
  BoutonSecondaire, CarteBloc, CarteClient, CarteLignes, CarteResume, MenuStatut, Panneau, Spinner,
} from "../components/document/CartesDocument.jsx";
import { STATUTS, LIBELLE_STATUT } from "../data/factures";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";

const MODE_PAIEMENT_LIBELLES = {
  virement: "Virement",
  carte: "Carte",
  cheque: "Chèque",
  especes: "Espèces",
  autre: "Autre",
};

const MODE_PAIEMENT_OPTIONS = [
  { value: "", label: "— Non précisé —" },
  { value: "virement", label: "Virement" },
  { value: "carte", label: "Carte" },
  { value: "cheque", label: "Chèque" },
  { value: "especes", label: "Espèces" },
  { value: "autre", label: "Autre" },
];

const OPTIONS_STATUT = STATUTS.map((s) => ({ value: s, label: LIBELLE_STATUT[s] }));

function formaterDateLongue(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formaterDateCourte(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function FactureDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    factures, chargement, changerStatut, ajouterPaiement, supprimerPaiement, dupliquerFacture,
  } = useFactures();
  const { clients, chargement: chargementClients } = useClients();
  const { peutEcrire, peutSupprimer, entreprise } = useEntreprise();
  const { devis } = useDevis();

  const facture = useMemo(() => factures.find((f) => f.id === id), [factures, id]);
  const client = useMemo(
    () => (facture ? clients.find((c) => c.id === facture.client_id) : null),
    [clients, facture]
  );
  const devisOrigine = useMemo(
    () => (facture?.devis_id ? devis.find((d) => d.id === facture.devis_id) : null),
    [devis, facture]
  );

  const recap = useMemo(() => {
    if (!facture) return null;
    return {
      htBrut: totalHTBrut(facture),
      remise: remiseGlobale(facture),
      ht: totalHT(facture),
      tvaDetail: tvaParTaux(facture),
      ttc: totalTTC(facture),
      paye: totalPaye(facture),
      reste: resteAPayer(facture),
    };
  }, [facture]);

  const [statutMenuOuvert, setStatutMenuOuvert] = useState(false);
  const [paiementFormOuvert, setPaiementFormOuvert] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [erreurAction, setErreurAction] = useState(null);

  if (chargement && !facture) {
    return <Panneau centre>
      <Spinner />
      <p className="text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
        Chargement de la facture…
      </p>
    </Panneau>;
  }

  if (!facture) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.textSecondary }}>Facture introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/factures")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const handleChangerStatut = async (nouveau) => {
    if (nouveau === facture.statut) {
      setStatutMenuOuvert(false);
      return;
    }
    setErreurAction(null);
    setActionEnCours(true);
    try {
      await changerStatut(facture.id, nouveau);
    } catch (err) {
      setErreurAction(err?.message ?? "Changement de statut impossible.");
    } finally {
      setActionEnCours(false);
      setStatutMenuOuvert(false);
    }
  };

  const handleDupliquer = async () => {
    setErreurAction(null);
    setActionEnCours(true);
    try {
      const cree = await dupliquerFacture(facture.id);
      navigate(`/factures/${cree.id}/modifier`);
    } catch (err) {
      setErreurAction(err?.message ?? "Duplication impossible.");
      setActionEnCours(false);
    }
  };

  const handleImprimer = () => window.print();

  return (
    <>
      {erreurAction && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: alpha(C.error, 0.06),
            color: C.errorText,
            border: `1px solid ${C.error}`,
          }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{erreurAction}</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2
              className="text-[28px] font-semibold leading-tight tabular-nums"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              {facture.numero}
            </h2>
            <MenuStatut
              badge={<BadgeStatutFacture statut={facture.statut} />}
              ariaLabel="Changer le statut de la facture"
              statutActuel={facture.statut}
              options={OPTIONS_STATUT}
              ouvert={statutMenuOuvert}
              onOuvrir={() => setStatutMenuOuvert((v) => !v)}
              onFermer={() => setStatutMenuOuvert(false)}
              onSelectionner={handleChangerStatut}
              disabled={actionEnCours || !peutEcrire}
            />
          </div>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Émise le {formaterDateLongue(facture.date_emission)} · Échéance le {formaterDateLongue(facture.date_echeance)}
          </p>
          {devisOrigine && (
            <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
              Issue du devis{" "}
              <Link
                to={`/devis/${devisOrigine.id}`}
                className="rounded font-medium underline focus:outline-none focus-visible:ring-2"
                style={{ color: C.primary }}
              >
                {devisOrigine.numero}
              </Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/factures"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            <List size={16} aria-hidden="true" />
            Toutes les factures
          </Link>
          <BoutonSecondaire
            onClick={() => genererFacturePdf(facture, client, recap, entreprise)}
            ariaLabel={`Télécharger la facture ${facture.numero} en PDF`}
            icon={Download}
          >
            Télécharger PDF
          </BoutonSecondaire>
          <BoutonSecondaire
            onClick={handleImprimer}
            ariaLabel={`Imprimer la facture ${facture.numero}`}
            icon={Printer}
          >
            Imprimer
          </BoutonSecondaire>
          {peutEcrire && (
            <>
              <BoutonSecondaire
                onClick={handleDupliquer}
                ariaLabel={`Dupliquer la facture ${facture.numero}`}
                icon={Copy}
                disabled={actionEnCours}
              >
                Dupliquer
              </BoutonSecondaire>
              <BoutonSecondaire
                onClick={() => setPaiementFormOuvert(true)}
                ariaLabel="Enregistrer un paiement"
                icon={CreditCard}
              >
                Enregistrer un paiement
              </BoutonSecondaire>
              <Link
                to={`/factures/${facture.id}/modifier`}
                className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: C.primary }}
              >
                <Pencil size={16} aria-hidden="true" />
                Modifier
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <CarteLignes lignes={facture.lignes} legende="Détail des lignes de la facture" />
          <CarteResume recap={recap}>
            <div className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>Déjà payé</dt>
              <dd className="tabular-nums" style={{ color: C.successText }}>{euroCentimes(recap.paye)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="font-semibold" style={{ color: C.textPrimary }}>Reste à payer</dt>
              <dd
                className="text-base font-bold tabular-nums"
                style={{ color: recap.reste > 0 ? C.errorText : C.successText }}
              >
                {euroCentimes(recap.reste)}
              </dd>
            </div>
          </CarteResume>
          <CartePaiements
            facture={facture}
            paiementFormOuvert={paiementFormOuvert}
            onOuvrirForm={() => setPaiementFormOuvert(true)}
            onFermerForm={() => setPaiementFormOuvert(false)}
            ajouterPaiement={ajouterPaiement}
            supprimerPaiement={supprimerPaiement}
            peutEcrire={peutEcrire}
            peutSupprimer={peutSupprimer}
          />
        </div>

        <div className="space-y-5">
          <CarteClient client={client} chargement={chargementClients} />
          <CarteMetaFacture facture={facture} />
          {facture.message_client && (
            <CarteBloc titre="Message client" contenu={facture.message_client} />
          )}
          {facture.notes_internes && (
            <CarteBloc
              titre="Notes internes"
              contenu={facture.notes_internes}
              chapeau="Non transmises au client"
            />
          )}
        </div>
      </div>
    </>
  );
}

function CartePaiements({
  facture, paiementFormOuvert, onOuvrirForm, onFermerForm, ajouterPaiement, supprimerPaiement,
  peutEcrire, peutSupprimer,
}) {
  const paiements = facture.paiements ?? [];
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Paiements</h3>
        {peutEcrire && !paiementFormOuvert && (
          <button
            type="button"
            onClick={onOuvrirForm}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
          >
            <Plus size={14} aria-hidden="true" />
            Enregistrer un paiement
          </button>
        )}
      </div>

      {paiementFormOuvert && (
        <FormulairePaiement
          factureId={facture.id}
          onAnnuler={onFermerForm}
          onEnregistrer={async (data) => {
            await ajouterPaiement(facture.id, data);
            onFermerForm();
          }}
        />
      )}

      {paiements.length === 0 ? (
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Aucun paiement enregistré pour cette facture.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Liste des paiements enregistrés</caption>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Date</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Montant</th>
                <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Mode</th>
                <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Référence</th>
                <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paiements.map((p) => (
                <LignePaiement
                  key={p.id}
                  paiement={p}
                  onSupprimer={peutSupprimer ? () => supprimerPaiement(p.id) : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormulairePaiement({ onAnnuler, onEnregistrer }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    montant: "",
    mode: "",
    reference: "",
  });
  const [errors, setErrors] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const definir = (cle) => (v) => {
    setForm((prev) => ({ ...prev, [cle]: v }));
    setErrors((prev) => {
      if (!prev[cle]) return prev;
      const next = { ...prev };
      delete next[cle];
      return next;
    });
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.date) errs.date = "La date est requise.";
    const m = Number(form.montant);
    if (form.montant === "" || Number.isNaN(m) || m <= 0) {
      errs.montant = "Le montant doit être positif.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setErreurEnvoi(null);
    setEnvoi(true);
    try {
      await onEnregistrer({
        date: form.date,
        montant: m,
        mode: form.mode || null,
        reference: form.reference,
      });
    } catch (err) {
      setErreurEnvoi(err?.message ?? "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form
      onSubmit={soumettre}
      noValidate
      className="mb-4 rounded-xl p-4"
      style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
    >
      {erreurEnvoi && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: alpha(C.error, 0.06),
            color: C.errorText,
            border: `1px solid ${C.error}`,
          }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{erreurEnvoi}</span>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          label="Date"
          type="date"
          required
          value={form.date}
          onChange={(e) => definir("date")(e.target.value)}
          error={errors.date}
        />
        <Input
          label="Montant (€)"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          required
          value={form.montant}
          onChange={(e) => definir("montant")(e.target.value)}
          error={errors.montant}
        />
        <Select
          label="Mode"
          value={form.mode}
          onChange={(e) => definir("mode")(e.target.value)}
          options={MODE_PAIEMENT_OPTIONS}
        />
        <Input
          label="Référence"
          value={form.reference}
          onChange={(e) => definir("reference")(e.target.value)}
          placeholder="N° virement, chèque…"
        />
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onAnnuler}
          className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={envoi}
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: C.primary }}
        >
          {envoi ? "Enregistrement…" : "Enregistrer le paiement"}
        </button>
      </div>
    </form>
  );
}

function LignePaiement({ paiement, onSupprimer }) {
  const [suppression, setSuppression] = useState(false);
  const [erreur, setErreur] = useState(null);

  const handleSupprimer = async () => {
    const ok = window.confirm(
      `Supprimer le paiement du ${formaterDateCourte(paiement.date)} (${euroCentimes(paiement.montant)}) ?`
    );
    if (!ok) return;
    setErreur(null);
    setSuppression(true);
    try {
      await onSupprimer();
    } catch (err) {
      setErreur(err?.message ?? "Suppression impossible.");
      setSuppression(false);
    }
  };

  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td className="px-3 py-3 tabular-nums" style={{ color: C.textPrimary }}>
        {formaterDateCourte(paiement.date)}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>
        {euroCentimes(paiement.montant)}
      </td>
      <td className="px-3 py-3 text-sm" style={{ color: C.textSecondary }}>
        {MODE_PAIEMENT_LIBELLES[paiement.mode] ?? "—"}
      </td>
      <td className="px-3 py-3 text-sm" style={{ color: C.textSecondary }}>
        {paiement.reference || "—"}
        {erreur && (
          <span className="ml-2 text-xs" style={{ color: C.errorText }}>{erreur}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
        {onSupprimer && (
          <button
            type="button"
            onClick={handleSupprimer}
            disabled={suppression}
            aria-label={`Supprimer le paiement du ${formaterDateCourte(paiement.date)}`}
            className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: C.error }}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        )}
      </td>
    </tr>
  );
}

function CarteMetaFacture({ facture }) {
  const items = [
    facture.mode_paiement && { label: "Mode de paiement", value: MODE_PAIEMENT_LIBELLES[facture.mode_paiement] ?? facture.mode_paiement },
    facture.conditions_paiement && { label: "Conditions de paiement", value: facture.conditions_paiement },
  ].filter(Boolean);

  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Conditions</h3>
      <dl className="space-y-3">
        {items.map((info) => (
          <div key={info.label}>
            <dt className="text-xs font-medium" style={{ color: C.textSecondary }}>{info.label}</dt>
            <dd className="mt-0.5 text-sm" style={{ color: C.textPrimary }}>{info.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

