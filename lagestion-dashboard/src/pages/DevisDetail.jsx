import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { List, Pencil, Download, Trash2, AlertCircle, FileOutput, Lock, ExternalLink, HandCoins } from "lucide-react";
import { C, alpha, euroCentimes } from "../theme";
import { useDevis } from "../context/DevisContext.jsx";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { totalHTBrut, remiseGlobale, totalHT, tvaParTaux, totalTTC, totalAvoirs, statutCalcule } from "../utils/facture";
import { genererDevisPdf } from "../utils/facturePdf";
import { acomptesDuDevis, devisModifiable, factureDuDevis, LIBELLE_STATUT_DEVIS, statutsSuivants, validiteDepassee } from "../data/devis";
import BadgeStatutDevis from "../components/BadgeStatutDevis.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { libelleNumero } from "../data/factures";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";
import {
  BoutonSecondaire, CarteBloc, CarteClient, CarteLignes, CarteResume, MenuStatut, Panneau, Spinner,
} from "../components/document/CartesDocument.jsx";

function formaterDateLongue(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function DevisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devis: tous, chargement, changerStatutDevis, deleteDevis, convertirDevis } = useDevis();
  const { factures, chargement: chargementFactures } = useFactures();
  const { clients, chargement: chargementClients } = useClients();
  const { peutEcrire, peutSupprimer, entreprise } = useEntreprise();

  const devis = useMemo(() => tous.find((d) => d.id === id), [tous, id]);
  const client = useMemo(() => (devis ? clients.find((c) => c.id === devis.client_id) : null), [clients, devis]);
  const facture = useMemo(() => (devis ? factureDuDevis(factures, devis.id) : null), [factures, devis]);
  const acomptes = useMemo(() => (devis ? acomptesDuDevis(factures, devis.id) : []), [factures, devis]);
  const recap = useMemo(() => {
    if (!devis) return null;
    return {
      htBrut: totalHTBrut(devis),
      remise: remiseGlobale(devis),
      ht: totalHT(devis),
      tvaDetail: tvaParTaux(devis),
      ttc: totalTTC(devis),
    };
  }, [devis]);

  const [menuOuvert, setMenuOuvert] = useState(false);
  const [actionEnCours, setActionEnCours] = useState(false);
  const [erreurAction, setErreurAction] = useState(null);
  const [aSupprimer, setASupprimer] = useState(null);

  if (chargement && !devis) {
    return (
      <Panneau centre>
        <Spinner />
        <p className="text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
          Chargement du devis…
        </p>
      </Panneau>
    );
  }

  if (!devis) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <p className="text-sm" style={{ color: C.textSecondary }}>Devis introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/devis")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  const clientAbsent = !chargementClients && !client;
  const direction = peutSupprimer;
  const acompteActif = acomptes.some((f) => f.statut !== "annulee");
  // Avec un acompte actif, le devis reste accepté jusqu'à sa conversion.
  const optionsStatut = (acompteActif ? [] : statutsSuivants(devis.statut, direction))
    .map((s) => ({ value: s, label: LIBELLE_STATUT_DEVIS[s] }));
  const acompteEnBrouillon = acomptes.some((f) => f.statut === "brouillon");
  const seraSolde = acomptes.some((f) => f.statut !== "brouillon" && f.statut !== "annulee");
  const convertible = devis.statut === "accepte" && peutEcrire;

  const handleChangerStatut = async (nouveau) => {
    setMenuOuvert(false);
    setErreurAction(null);
    setActionEnCours(true);
    try {
      await changerStatutDevis(devis.id, nouveau);
    } catch (err) {
      setErreurAction(err?.message ?? "Changement de statut impossible.");
    } finally {
      setActionEnCours(false);
    }
  };

  const handleConvertir = async () => {
    setErreurAction(null);
    setActionEnCours(true);
    try {
      const factureId = await convertirDevis(devis.id);
      navigate(`/factures/${factureId}`);
    } catch (err) {
      setErreurAction(err?.message ?? "Transformation impossible.");
      setActionEnCours(false);
    }
  };

  const confirmerSuppression = async () => {
    setASupprimer(null);
    setErreurAction(null);
    const ok = await deleteDevis(devis.id);
    if (ok) navigate("/devis", { replace: true });
    else setErreurAction("Suppression impossible : votre rôle ne le permet pas, ou le devis a changé.");
  };

  return (
    <>
      {erreurAction && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}
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
              {devis.numero}
            </h2>
            {peutEcrire && optionsStatut.length > 0 ? (
              <MenuStatut
                badge={<BadgeStatutDevis statut={devis.statut} />}
                ariaLabel="Changer le statut du devis"
                statutActuel={devis.statut}
                options={optionsStatut}
                ouvert={menuOuvert}
                onOuvrir={() => setMenuOuvert((v) => !v)}
                onFermer={() => setMenuOuvert(false)}
                onSelectionner={handleChangerStatut}
                disabled={actionEnCours}
              />
            ) : (
              <BadgeStatutDevis statut={devis.statut} />
            )}
          </div>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Émis le {formaterDateLongue(devis.date_emission)} · Valable jusqu'au {formaterDateLongue(devis.date_validite)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/devis"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            <List size={16} aria-hidden="true" />
            Tous les devis
          </Link>
          <BoutonSecondaire
            onClick={() => genererDevisPdf(devis, client, recap, entreprise)}
            ariaLabel={`Télécharger le devis ${devis.numero} en PDF`}
            icon={Download}
            disabled={clientAbsent}
          >
            Télécharger PDF
          </BoutonSecondaire>
          {peutSupprimer && devis.statut !== "converti" && !acompteActif && (
            <BoutonSecondaire
              onClick={(e) => setASupprimer({ element: e.currentTarget })}
              ariaLabel={`Supprimer le devis ${devis.numero}`}
              icon={Trash2}
              disabled={actionEnCours}
            >
              Supprimer
            </BoutonSecondaire>
          )}
          {peutEcrire && devisModifiable(devis.statut) && (
            <Link
              to={`/devis/${devis.id}/modifier`}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: C.primary }}
            >
              <Pencil size={16} aria-hidden="true" />
              Modifier
            </Link>
          )}
          {convertible && (
            <BoutonSecondaire
              onClick={() => navigate(`/devis/${devis.id}/acompte`)}
              ariaLabel="Créer un acompte"
              icon={HandCoins}
              disabled={clientAbsent}
            >
              Créer un acompte
            </BoutonSecondaire>
          )}
          {convertible && (
            <button
              type="button"
              onClick={handleConvertir}
              disabled={actionEnCours || clientAbsent || acompteEnBrouillon}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: C.primary }}
            >
              <FileOutput size={16} aria-hidden="true" />
              {actionEnCours ? "Transformation…" : seraSolde ? "Transformer en facture de solde" : "Transformer en facture"}
            </button>
          )}
        </div>
      </div>

      {clientAbsent && (
        <Bandeau icone={AlertCircle} couleur={C.warning} couleurTexte={C.warningText}>
          Le client de ce devis a été supprimé : le PDF et la transformation en facture sont indisponibles.
        </Bandeau>
      )}
      {validiteDepassee(devis) && (
        <Bandeau icone={AlertCircle} couleur={C.warning} couleurTexte={C.warningText}>
          Validité dépassée : prolongez la date de validité avant d'accepter ce devis.
        </Bandeau>
      )}
      {acompteEnBrouillon && devis.statut === "accepte" && (
        <Bandeau icone={AlertCircle} couleur={C.warning} couleurTexte={C.warningText}>
          Un acompte est encore en brouillon : finalisez-le ou supprimez-le avant de transformer ce devis en facture.
        </Bandeau>
      )}
      {devis.statut === "accepte" && acompteActif && (
        <Bandeau icone={Lock} couleur={C.info} couleurTexte={C.infoText}>
          Ce devis a des acomptes : il reste accepté jusqu'à sa transformation en facture de solde, et ne peut plus être supprimé.
        </Bandeau>
      )}
      {devis.statut === "accepte" && !acompteActif && (
        <Bandeau icone={Lock} couleur={C.info} couleurTexte={C.infoText}>
          Ce devis accepté est verrouillé. Pour le corriger, un administrateur ou un manager doit le repasser en « Envoyé ».
        </Bandeau>
      )}
      {devis.statut === "converti" && !chargementFactures && (
        <Bandeau icone={Lock} couleur={C.info} couleurTexte={C.infoText}>
          {facture ? (
            <>
              {"Ce devis a été transformé en facture : "}
              <Link
                to={`/factures/${facture.id}`}
                className="inline-flex items-center gap-1 rounded font-semibold underline focus:outline-none focus-visible:ring-2"
              >
                {facture.numero ?? "brouillon sans numéro"}
                <ExternalLink size={12} aria-hidden="true" />
              </Link>
              . Il ne peut plus être modifié.
            </>
          ) : (
            "La facture issue de ce devis a été supprimée. Le devis reste converti : créez un nouveau devis pour refacturer."
          )}
        </Bandeau>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <CarteLignes lignes={devis.lignes} legende="Détail des lignes du devis" />
          <CarteResume recap={recap} />
          {acomptes.length > 0 && <CarteAcomptes acomptes={acomptes} ttcDevis={recap.ttc} />}
        </div>
        <div className="space-y-5">
          <CarteClient client={client} chargement={chargementClients} messageAbsent="Client supprimé." />
          {devis.message_client && <CarteBloc titre="Message client" contenu={devis.message_client} />}
          {devis.notes_internes && (
            <CarteBloc titre="Notes internes" contenu={devis.notes_internes} chapeau="Non transmises au client" />
          )}
        </div>
      </div>

      <ConfirmDialog
        ouvert={Boolean(aSupprimer)}
        titre="Supprimer ce devis ?"
        message={`Le devis ${devis.numero} ne sera plus visible. Son numéro ne sera pas réattribué.`}
        libelleAnnuler="Annuler"
        libelleConfirmer="Supprimer"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={confirmerSuppression}
        elementRetour={aSupprimer?.element}
      />
    </>
  );
}

function CarteAcomptes({ acomptes, ttcDevis }) {
  const factures = acomptes.filter((a) => a.statut !== "brouillon" && a.statut !== "annulee");
  const cumul = factures.reduce((s, a) => s + Math.round((totalTTC(a) - totalAvoirs(a)) * 100), 0) / 100;
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Acomptes</h3>
      <ul className="space-y-2 text-sm">
        {acomptes.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
            <Link to={`/factures/${a.id}`} className="rounded font-medium underline focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>
              {libelleNumero(a)}
            </Link>
            <span className="flex items-center gap-3">
              <span className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(totalTTC(a))}</span>
              <BadgeStatutFacture statut={statutCalcule(a)} />
            </span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1 pt-3 text-sm" style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between">
          <dt style={{ color: C.textSecondary }}>Déjà facturé, net des avoirs</dt>
          <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(cumul)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt style={{ color: C.textSecondary }}>Reste à facturer</dt>
          <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(Math.round((ttcDevis - cumul) * 100) / 100)}</dd>
        </div>
      </dl>
    </div>
  );
}

function Bandeau({ icone: Icone, couleur, couleurTexte, children }) {
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ backgroundColor: alpha(couleur, 0.08), color: couleurTexte, border: `1px solid ${couleur}` }}
    >
      <Icone size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
