import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Mail, Phone, MapPin, Download, Printer, Copy, CreditCard,
  ChevronDown, ExternalLink, Trash2, AlertCircle, Plus,
} from "lucide-react";
import { C, euro } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import {
  ligneHT, ligneTTC, totalHT, tvaParTaux, totalTTC, totalPaye, resteAPayer,
} from "../utils/facture";
import { genererFacturePdf } from "../utils/facturePdf";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";
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

  const facture = useMemo(() => factures.find((f) => f.id === id), [factures, id]);
  const client = useMemo(
    () => (facture ? clients.find((c) => c.id === facture.client_id) : null),
    [clients, facture]
  );

  const recap = useMemo(() => {
    if (!facture) return null;
    return {
      ht: totalHT(facture),
      tvaDetail: tvaParTaux(facture),
      ttc: totalTTC(facture),
      remise: Number(facture.remise) || 0,
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
          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
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
            backgroundColor: "rgba(231,76,60,0.08)",
            color: C.error,
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
              statutActuel={facture.statut}
              ouvert={statutMenuOuvert}
              onOuvrir={() => setStatutMenuOuvert((v) => !v)}
              onFermer={() => setStatutMenuOuvert(false)}
              onSelectionner={handleChangerStatut}
              disabled={actionEnCours}
            />
          </div>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Émise le {formaterDateLongue(facture.date_emission)} · Échéance le {formaterDateLongue(facture.date_echeance)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/factures"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Retour à la liste
          </Link>
          <BoutonSecondaire
            onClick={() => genererFacturePdf(facture, client, recap)}
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <CarteLignes facture={facture} />
          <CarteResume recap={recap} />
          <CartePaiements
            facture={facture}
            paiementFormOuvert={paiementFormOuvert}
            onOuvrirForm={() => setPaiementFormOuvert(true)}
            onFermerForm={() => setPaiementFormOuvert(false)}
            ajouterPaiement={ajouterPaiement}
            supprimerPaiement={supprimerPaiement}
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

function BoutonSecondaire({ onClick, ariaLabel, icon: Icon, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

function MenuStatut({ statutActuel, ouvert, onOuvrir, onFermer, onSelectionner, disabled }) {
  const conteneurRef = useRef(null);
  const boutonRef = useRef(null);

  useEffect(() => {
    if (!ouvert) return;
    const onClickExterieur = (e) => {
      if (!conteneurRef.current) return;
      if (!conteneurRef.current.contains(e.target)) onFermer();
    };
    const onEchap = (e) => {
      if (e.key === "Escape") {
        onFermer();
        boutonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickExterieur);
    document.addEventListener("keydown", onEchap);
    return () => {
      document.removeEventListener("mousedown", onClickExterieur);
      document.removeEventListener("keydown", onEchap);
    };
  }, [ouvert, onFermer]);

  return (
    <div ref={conteneurRef} className="relative">
      <button
        ref={boutonRef}
        type="button"
        onClick={onOuvrir}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label="Changer le statut de la facture"
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        <BadgeStatutFacture statut={statutActuel} />
        <ChevronDown size={14} aria-hidden="true" style={{ color: C.textSecondary }} />
      </button>
      {ouvert && (
        <div
          role="menu"
          aria-label="Choisir un statut"
          className="absolute left-0 top-9 z-20 w-56 overflow-hidden rounded-xl"
          style={{
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            boxShadow: "0 12px 28px rgba(45,52,54,0.10)",
          }}
        >
          {STATUTS.map((s) => {
            const actif = s === statutActuel;
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                aria-current={actif || undefined}
                onClick={() => onSelectionner(s)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                style={{ color: actif ? C.primary : C.textPrimary, fontWeight: actif ? 600 : 400 }}
              >
                {LIBELLE_STATUT[s]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CarteLignes({ facture }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Lignes d'articles</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Détail des lignes de la facture</caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Description</th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Référence</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Qté</th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Unité</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Prix U. HT</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Remise</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>TVA</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Total HT</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Total TTC</th>
            </tr>
          </thead>
          <tbody>
            {facture.lignes.map((l, i) => (
              <tr key={l.id ?? i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="px-3 py-3" style={{ color: C.textPrimary }}>{l.description || "—"}</td>
                <td className="px-3 py-3 text-xs" style={{ color: C.textSecondary }}>{l.reference || "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{l.quantite}</td>
                <td className="px-3 py-3 text-xs" style={{ color: C.textSecondary }}>{l.unite || "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{euro(l.prix_unitaire)}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>
                  {Number(l.remise) > 0 ? `− ${euro(l.remise)}` : "—"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{String(l.taux_tva).replace(".", ",")} %</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(ligneHT(l))}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{euro(ligneTTC(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CarteResume({ recap }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Résumé financier</h3>
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt style={{ color: C.textSecondary }}>Total HT</dt>
          <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ht)}</dd>
        </div>
        {recap.tvaDetail.length === 0 ? (
          <div className="flex items-center justify-between">
            <dt style={{ color: C.textSecondary }}>TVA</dt>
            <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euro(0)}</dd>
          </div>
        ) : (
          recap.tvaDetail.map((d) => (
            <div key={d.taux} className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>
                TVA {String(d.taux).replace(".", ",")} % <span>(base {euro(d.base)})</span>
              </dt>
              <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euro(d.tva)}</dd>
            </div>
          ))
        )}
        {recap.remise > 0 && (
          <div className="flex items-center justify-between">
            <dt style={{ color: C.textSecondary }}>Remise globale</dt>
            <dd className="tabular-nums" style={{ color: C.textPrimary }}>− {euro(recap.remise)}</dd>
          </div>
        )}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
          <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ttc)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt style={{ color: C.textSecondary }}>Déjà payé</dt>
          <dd className="tabular-nums" style={{ color: C.success }}>{euro(recap.paye)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-semibold" style={{ color: C.textPrimary }}>Reste à payer</dt>
          <dd
            className="text-base font-bold tabular-nums"
            style={{ color: recap.reste > 0 ? C.error : C.success }}
          >
            {euro(recap.reste)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function CartePaiements({
  facture, paiementFormOuvert, onOuvrirForm, onFermerForm, ajouterPaiement, supprimerPaiement,
}) {
  const paiements = facture.paiements ?? [];
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Paiements</h3>
        {!paiementFormOuvert && (
          <button
            type="button"
            onClick={onOuvrirForm}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
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
                <LignePaiement key={p.id} paiement={p} onSupprimer={() => supprimerPaiement(p.id)} />
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
            backgroundColor: "rgba(231,76,60,0.08)",
            color: C.error,
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
      `Supprimer le paiement du ${formaterDateCourte(paiement.date)} (${euro(paiement.montant)}) ?`
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
        {euro(paiement.montant)}
      </td>
      <td className="px-3 py-3 text-sm" style={{ color: C.textSecondary }}>
        {MODE_PAIEMENT_LIBELLES[paiement.mode] ?? "—"}
      </td>
      <td className="px-3 py-3 text-sm" style={{ color: C.textSecondary }}>
        {paiement.reference || "—"}
        {erreur && (
          <span className="ml-2 text-xs" style={{ color: C.error }}>{erreur}</span>
        )}
      </td>
      <td className="px-3 py-3 text-right">
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
      </td>
    </tr>
  );
}

function CarteClient({ client, chargement }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Client</h3>
      {client ? (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: C.textPrimary }}>
              {client.nom}
            </p>
            <p className="text-xs" style={{ color: C.textSecondary }}>
              {client.type === "entreprise" ? "Entreprise" : "Particulier"}
            </p>
          </div>

          {client.type === "entreprise" && (client.siren || client.tva_intra) && (
            <dl className="space-y-1 text-xs">
              {client.siren && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt style={{ color: C.textSecondary }}>SIREN</dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{client.siren}</dd>
                </div>
              )}
              {client.tva_intra && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt style={{ color: C.textSecondary }}>TVA intracom.</dt>
                  <dd className="truncate tabular-nums" style={{ color: C.textPrimary }}>{client.tva_intra}</dd>
                </div>
              )}
            </dl>
          )}

          {client.adresse && (
            <p className="flex items-start gap-2 text-sm" style={{ color: C.textSecondary }}>
              <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{client.adresse}</span>
            </p>
          )}
          {client.telephone && (
            <p className="flex items-center gap-2 text-sm tabular-nums" style={{ color: C.textSecondary }}>
              <Phone size={14} aria-hidden="true" />
              {client.telephone}
            </p>
          )}
          {client.email && (
            <p className="flex items-center gap-2 text-sm" style={{ color: C.textSecondary }}>
              <Mail size={14} aria-hidden="true" />
              <span className="truncate">{client.email}</span>
            </p>
          )}

          <Link
            to={`/clients/${client.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
            aria-label={`Voir la fiche de ${client.nom}`}
          >
            <ExternalLink size={12} aria-hidden="true" />
            Voir la fiche client
          </Link>
        </div>
      ) : chargement ? (
        <p className="text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
          Chargement du client…
        </p>
      ) : (
        <p className="text-sm" style={{ color: C.textSecondary }}>Client introuvable.</p>
      )}
    </div>
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

function CarteBloc({ titre, contenu, chapeau }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-1" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{titre}</h3>
      {chapeau && (
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>{chapeau}</p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: C.textPrimary }}>
        {contenu}
      </p>
    </div>
  );
}

function Panneau({ children, centre }) {
  return (
    <div
      className={`rounded-2xl p-8 ${centre ? "flex flex-col items-center gap-3 text-center" : ""}`}
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-8 w-8 animate-spin rounded-full border-2"
      style={{ borderColor: C.border, borderTopColor: C.primary }}
      aria-hidden="true"
    />
  );
}
