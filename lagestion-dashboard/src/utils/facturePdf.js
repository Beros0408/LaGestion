import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ligneHT, remiseGlobale, totalHTBrut, totalHT, tvaParTaux, totalTTC } from "./facture";
import { LIBELLE_STATUT } from "../data/factures";
import { LIBELLE_STATUT_DEVIS } from "../data/devis";

const COLORS = {
  primary:       [45, 91, 127],
  textPrimary:   [45, 52, 54],
  textSecondary: [99, 110, 114],
  border:        [223, 230, 233],
  bgLight:       [248, 249, 250],
  white:         [255, 255, 255],
};

const HAUTEUR_BON_POUR_ACCORD = 34;

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatEuro(n) {
  const v = Number(n) || 0;
  const formatted = v
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} €`;
}

function formatTaux(t) {
  return `${String(t ?? 0).replace(".", ",")} %`;
}

function formatQuantiteUnite(l) {
  const q = String(l.quantite ?? "");
  const u = (l.unite || "").trim();
  return u ? `${q} ${u}` : q;
}

function descriptionAvecReference(l) {
  const base = l.description || "—";
  return l.reference ? `${base}\n(Réf. ${l.reference})` : base;
}

// Identité de l'entreprise émettrice (table entreprises) ; les champs vides sont omis.
function ecrireEmetteur(doc, entreprise, x, largeur) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.primary);
  const nom = doc.splitTextToSize(entreprise?.nom || "—", largeur);
  doc.text(nom, x, 24);
  let y = 24 + (nom.length - 1) * 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  const siret = (entreprise?.siret || "").trim();
  if (siret) {
    y += 5;
    doc.text(`SIRET ${siret}`, x, y);
  }
  const adresse = (entreprise?.adresse || "").trim();
  if (adresse) {
    const lignes = doc.splitTextToSize(adresse, largeur);
    y += 5;
    doc.text(lignes, x, y);
    y += (lignes.length - 1) * 4;
  }
  return y;
}

function zoneBonPourAccord(doc, x, y, largeur) {
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.rect(x, y, largeur, HAUTEUR_BON_POUR_ACCORD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("Bon pour accord", x + 4, y + 7);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Date :", x + 4, y + 15);
  doc.text("Signature du client :", x + largeur / 2, y + 15);
}

function genererDocumentPdf(document, client, totaux, entreprise, config) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const limiteBas = pageH - 26; // au-dessus du pied de page

  const basEmetteur = ecrireEmetteur(doc, entreprise, margin, pageW / 2 - margin);

  doc.setFont("helvetica", "bold");
  // Titres longs (facture d'acompte, de solde) : plus petits, pour ne pas toucher l'identité de l'émetteur.
  doc.setFontSize(config.titre.length > 9 ? 18 : 24);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(config.titre, pageW - margin, 25, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(config.reference ?? document.numero, pageW - margin, 32, { align: "right" });

  let basTitre = 32;
  config.dates.forEach(({ texte, important }) => {
    doc.setFont("helvetica", important ? "bold" : "normal");
    doc.setFontSize(important ? 11 : 9);
    doc.setTextColor(...(important ? COLORS.primary : COLORS.textSecondary));
    basTitre += important ? 6 : 5.5;
    doc.text(texte, pageW - margin, basTitre, { align: "right" });
  });

  const ligneY = Math.max(50, Math.max(basEmetteur, basTitre) + 6);
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, ligneY, pageW - margin, ligneY);

  let y = ligneY + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(config.destinataire, margin, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(client?.nom || "—", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  if (client?.type === "entreprise" && client?.siren) {
    y += 5;
    doc.text(`SIREN ${client.siren}`, margin, y);
  }
  if (client?.type === "entreprise" && client?.tva_intra) {
    y += 5;
    doc.text(`TVA ${client.tva_intra}`, margin, y);
  }
  if (client?.adresse) {
    y += 5;
    doc.text(client.adresse, margin, y);
  }
  if (client?.telephone) {
    y += 5;
    doc.text(client.telephone, margin, y);
  }
  if (client?.email) {
    y += 5;
    doc.text(client.email, margin, y);
  }

  // Référence au document d'origine et motif (avoir)
  (config.mentions ?? []).forEach((texte, i) => {
    doc.setFont("helvetica", i === 0 ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.textPrimary);
    const lignesMention = doc.splitTextToSize(texte, pageW - margin * 2);
    y += i === 0 ? 8 : 5;
    doc.text(lignesMention, margin, y);
    y += (lignesMention.length - 1) * 4;
  });

  const startY = y + 12;
  const lignes = document.lignes ?? [];
  const rows = lignes.map((l) => [
    descriptionAvecReference(l),
    formatQuantiteUnite(l),
    formatEuro(l.prix_unitaire),
    Number(l.remise) > 0 ? `- ${formatEuro(l.remise)}` : "",
    formatTaux(l.taux_tva),
    formatEuro(config.lignesNegatives && ligneHT(l) !== 0 ? -ligneHT(l) : ligneHT(l)),
  ]);

  autoTable(doc, {
    startY,
    head: [["Description", "Qté", "Prix U. HT", "Remise", "TVA", "Total HT"]],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      textColor: COLORS.textPrimary,
      lineColor: COLORS.border,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: COLORS.primary,
      textColor: COLORS.white,
      fontStyle: "bold",
      halign: "left",
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", cellWidth: 20 },
      2: { halign: "right", cellWidth: 26 },
      3: { halign: "right", cellWidth: 22 },
      4: { halign: "right", cellWidth: 16 },
      5: { halign: "right", cellWidth: 28 },
    },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    margin: { left: margin, right: margin },
  });

  // Facture de solde : tableau des acomptes déduits, puis le net
  if (config.acomptes?.length) {
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 6,
      head: [["Acompte déduit", "Date", "HT", "TVA", "TTC"]],
      body: config.acomptes.map((a) => [
        a.numero, formatDate(a.date), formatEuro(a.total_ht), formatEuro(a.total_tva), formatEuro(a.total_ttc),
      ]),
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5, textColor: COLORS.textPrimary, lineColor: COLORS.border, lineWidth: 0.1 },
      headStyles: { fillColor: COLORS.primary, textColor: COLORS.white, fontStyle: "bold", halign: "left" },
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: margin, right: margin },
    });
  }

  const htBrut = totaux?.htBrut ?? totalHTBrut(document);
  const ht = totaux?.ht ?? totalHT(document);
  const tvaDetail = totaux?.tvaDetail ?? tvaParTaux(document);
  const ttc = totaux?.ttc ?? totalTTC(document);
  const remise = totaux?.remise ?? remiseGlobale(document);

  let recapY = (doc.lastAutoTable?.finalY ?? startY) + 8;
  const recapRight = pageW - margin;
  const recapLeft = pageW - margin - 70;
  const hauteurRecap = (remise !== 0 ? 10 : 0) + tvaDetail.length * 5 + 9;
  if (recapY + hauteurRecap > limiteBas) {
    doc.addPage();
    recapY = 25;
  }

  doc.setFontSize(9);
  if (remise !== 0) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Total HT brut", recapLeft, recapY);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(formatEuro(htBrut), recapRight, recapY, { align: "right" });

    recapY += 5;
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("Remise globale", recapLeft, recapY);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(`${remise > 0 ? "-" : "+"} ${formatEuro(Math.abs(remise))}`, recapRight, recapY, { align: "right" });
    recapY += 5;
  }

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(config.libelleHt ?? (remise !== 0 ? "Total HT net" : "Total HT"), recapLeft, recapY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(formatEuro(ht), recapRight, recapY, { align: "right" });

  tvaDetail.forEach((d) => {
    recapY += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(`TVA ${formatTaux(d.taux)} (base ${formatEuro(d.base)})`, recapLeft, recapY);
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(formatEuro(d.tva), recapRight, recapY, { align: "right" });
  });

  recapY += 3;
  doc.setDrawColor(...COLORS.border);
  doc.line(recapLeft, recapY, recapRight, recapY);

  recapY += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(config.libelleTtc ?? "Total TTC", recapLeft, recapY);
  doc.text(formatEuro(ttc), recapRight, recapY, { align: "right" });

  let basContenu = recapY;
  if (document.message_client) {
    const messageMaxWidth = pageW - margin * 2;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const lignesMessage = doc.splitTextToSize(document.message_client, messageMaxWidth);
    const hauteurMessage = 5 + lignesMessage.length * 4;
    let messageY = recapY + 14;
    if (messageY + hauteurMessage > limiteBas) {
      doc.addPage();
      messageY = 25;
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text("MESSAGE", margin, messageY);
    messageY += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textPrimary);
    doc.text(lignesMessage, margin, messageY);
    basContenu = messageY + lignesMessage.length * 4;
  }

  if (config.bonPourAccord) {
    if (basContenu + 8 + HAUTEUR_BON_POUR_ACCORD > limiteBas) doc.addPage();
    zoneBonPourAccord(doc, margin, limiteBas - HAUTEUR_BON_POUR_ACCORD, pageW - margin * 2);
  }

  const footerY = pageH - 18;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY - 5, pageW - margin, footerY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(`Statut : ${config.statut}`, margin, footerY);
  if (config.mentionPied) {
    doc.text(config.mentionPied, pageW - margin, footerY, { align: "right" });
  }

  doc.save(config.nomFichier ?? `${document.numero}.pdf`);
}

// Facture émise : identités figées à la finalisation. Brouillon : présenté comme tel, sans numéro ni date d'émission.
export function genererFacturePdf(facture, client, totaux, entreprise, devisOrigine = null) {
  const brouillon = facture.statut === "brouillon";
  if (facture.type === "avoir") {
    const dateOrigine = facture.origine_date ? ` du ${formatDate(facture.origine_date)}` : "";
    genererDocumentPdf(facture, facture.client_fige ?? client, totaux, facture.emetteur_fige ?? entreprise, {
      titre: brouillon ? "BROUILLON D'AVOIR" : "AVOIR",
      reference: brouillon ? "Sans valeur d'avoir" : undefined,
      nomFichier: brouillon ? "brouillon-avoir.pdf" : undefined,
      destinataire: "AVOIR POUR",
      dates: brouillon ? [] : [{ texte: `Émis le ${formatDate(facture.date_emission)}` }],
      mentions: [
        `Avoir sur la facture ${facture.origine_numero ?? ""}${dateOrigine}`,
        `Motif : ${facture.motif ?? ""}`,
      ],
      lignesNegatives: true,
      statut: LIBELLE_STATUT[facture.statut] ?? facture.statut ?? "—",
    });
    return;
  }
  const estAcompte = facture.type === "acompte";
  const estSolde = facture.type === "solde";
  const refDevis = devisOrigine ? ` ${devisOrigine.numero} du ${formatDate(devisOrigine.date_emission)}` : "";
  genererDocumentPdf(facture, facture.client_fige ?? client, totaux, facture.emetteur_fige ?? entreprise, {
    titre: brouillon
      ? (estAcompte ? "BROUILLON D'ACOMPTE" : estSolde ? "BROUILLON DE SOLDE" : "BROUILLON")
      : (estAcompte ? "FACTURE D'ACOMPTE" : estSolde ? "FACTURE DE SOLDE" : "FACTURE"),
    reference: brouillon ? "Sans valeur de facture" : undefined,
    nomFichier: brouillon ? `brouillon-${estAcompte ? "acompte" : estSolde ? "solde" : "facture"}.pdf` : undefined,
    destinataire: "FACTURÉ À",
    mentions: estAcompte ? [`Acompte sur le devis${refDevis}`] : estSolde ? [`Solde du devis${refDevis}`] : undefined,
    acomptes: estSolde ? facture.acomptes_deduits : undefined,
    libelleHt: estSolde ? "Net HT" : undefined,
    libelleTtc: estSolde ? "Net TTC" : undefined,
    dates: [
      ...(brouillon ? [] : [{ texte: `Émise le ${formatDate(facture.date_emission)}` }]),
      { texte: `Échéance le ${formatDate(facture.date_echeance)}` },
    ],
    statut: LIBELLE_STATUT[facture.statut] ?? facture.statut ?? "—",
    mentionPied: "En cas de retard de paiement, des pénalités seront exigibles au taux légal en vigueur.",
  });
}

export function genererDevisPdf(devis, client, totaux, entreprise) {
  genererDocumentPdf(devis, client, totaux, entreprise, {
    titre: "DEVIS",
    destinataire: "DEVIS POUR",
    dates: [
      { texte: `Émis le ${formatDate(devis.date_emission)}` },
      { texte: `Valable jusqu'au ${formatDate(devis.date_validite)}`, important: true },
    ],
    statut: LIBELLE_STATUT_DEVIS[devis.statut] ?? devis.statut ?? "—",
    bonPourAccord: true,
  });
}
