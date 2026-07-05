import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ligneHT, totalHT, tvaParTaux, totalTTC } from "./facture";
import { LIBELLE_STATUT } from "../data/factures";

const COLORS = {
  primary:       [45, 91, 127],
  textPrimary:   [45, 52, 54],
  textSecondary: [99, 110, 114],
  border:        [223, 230, 233],
  bgLight:       [248, 249, 250],
  white:         [255, 255, 255],
};

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
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${formatted} €`;
}

function formatTaux(t) {
  return `${String(t ?? 0).replace(".", ",")} %`;
}

export function genererFacturePdf(facture, client, totaux) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...COLORS.primary);
  doc.text("Lagestion", margin, 25);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Gestion commerciale", margin, 30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text("FACTURE", pageW - margin, 25, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(facture.numero, pageW - margin, 32, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(`Émise le ${formatDate(facture.date_emission)}`, pageW - margin, 38, { align: "right" });
  doc.text(`Échéance le ${formatDate(facture.date_echeance)}`, pageW - margin, 43, { align: "right" });

  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.3);
  doc.line(margin, 50, pageW - margin, 50);

  let y = 60;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("FACTURÉ À", margin, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(client?.nom || "—", margin, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  if (client?.adresse) {
    y += 5;
    doc.text(client.adresse, margin, y);
  }
  if (client?.email) {
    y += 5;
    doc.text(client.email, margin, y);
  }
  if (client?.telephone) {
    y += 5;
    doc.text(client.telephone, margin, y);
  }

  const startY = y + 12;
  const lignes = facture.lignes ?? [];
  const rows = lignes.map((l) => [
    l.description || "—",
    String(l.quantite ?? ""),
    formatEuro(l.prix_unitaire),
    formatTaux(l.taux_tva),
    formatEuro(ligneHT(l)),
  ]);

  autoTable(doc, {
    startY,
    head: [["Description", "Qté", "Prix U. HT", "TVA", "Total HT"]],
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
      1: { halign: "right", cellWidth: 18 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 20 },
      4: { halign: "right", cellWidth: 32 },
    },
    alternateRowStyles: { fillColor: COLORS.bgLight },
    margin: { left: margin, right: margin },
  });

  const ht = totaux?.ht ?? totalHT(facture);
  const tvaDetail = totaux?.tvaDetail ?? tvaParTaux(facture);
  const ttc = totaux?.ttc ?? totalTTC(facture);

  let recapY = (doc.lastAutoTable?.finalY ?? startY) + 8;
  const recapRight = pageW - margin;
  const recapLeft = pageW - margin - 70;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text("Total HT", recapLeft, recapY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...COLORS.textPrimary);
  doc.text(formatEuro(ht), recapRight, recapY, { align: "right" });

  tvaDetail.forEach((d) => {
    recapY += 5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...COLORS.textSecondary);
    doc.text(`TVA ${formatTaux(d.taux)}`, recapLeft, recapY);
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
  doc.text("Total TTC", recapLeft, recapY);
  doc.text(formatEuro(ttc), recapRight, recapY, { align: "right" });

  const footerY = pageH - 18;
  doc.setDrawColor(...COLORS.border);
  doc.setLineWidth(0.2);
  doc.line(margin, footerY - 5, pageW - margin, footerY - 5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.textSecondary);
  doc.text(`Statut : ${LIBELLE_STATUT[facture.statut] ?? facture.statut ?? "—"}`, margin, footerY);
  doc.text(
    "En cas de retard de paiement, des pénalités seront exigibles au taux légal en vigueur.",
    pageW - margin,
    footerY,
    { align: "right" }
  );

  doc.save(`${facture.numero}.pdf`);
}
