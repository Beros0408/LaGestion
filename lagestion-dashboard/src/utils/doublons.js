const DIACRITIQUES = new RegExp("[\\u0300-\\u036f]", "g");

function normaliser(s) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITIQUES, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chiffresSeuls(s) {
  return (s ?? "").toString().replace(/\D/g, "");
}

function motsSignificatifs(s) {
  return normaliser(s)
    .split(/\s+/)
    .filter((m) => m.length >= 3);
}

export function detecterDoublons(saisie, existants, idExclu = null) {
  const type = saisie?.type;
  const emailIn = normaliser(saisie?.email);
  const sirenIn = chiffresSeuls(saisie?.siren);
  const telIn = chiffresSeuls(saisie?.telephone);
  const nomIn = normaliser(saisie?.nom);
  const motsIn = motsSignificatifs(saisie?.nom);
  const dateNIn = saisie?.date_naissance || null;

  const trouves = [];

  for (const c of existants ?? []) {
    if (idExclu != null && c.id === idExclu) continue;

    if (emailIn && normaliser(c.email) === emailIn) {
      trouves.push({ client: c, confiance: 100, motif: "Même e-mail" });
      continue;
    }

    if (type === "entreprise" && sirenIn && chiffresSeuls(c.siren) === sirenIn) {
      trouves.push({ client: c, confiance: 100, motif: "Même SIREN" });
      continue;
    }

    const telC = chiffresSeuls(c.telephone);
    if (telIn && telIn.length >= 6 && telC === telIn) {
      trouves.push({ client: c, confiance: 95, motif: "Même téléphone" });
      continue;
    }

    if (
      type === "particulier" &&
      dateNIn &&
      c.date_naissance === dateNIn &&
      nomIn &&
      normaliser(c.nom) === nomIn
    ) {
      trouves.push({ client: c, confiance: 90, motif: "Mêmes nom et date de naissance" });
      continue;
    }

    if (nomIn && normaliser(c.nom) === nomIn) {
      trouves.push({
        client: c,
        confiance: 70,
        motif: type === "entreprise" ? "Même raison sociale" : "Mêmes nom et prénom",
      });
      continue;
    }

    if (motsIn.length > 0) {
      const motsC = motsSignificatifs(c.nom);
      if (motsC.some((w) => motsIn.includes(w))) {
        trouves.push({ client: c, confiance: 40, motif: "Nom proche" });
      }
    }
  }

  trouves.sort((a, b) => b.confiance - a.confiance);
  return trouves;
}
