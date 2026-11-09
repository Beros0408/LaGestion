// Web Worker de lecture des fichiers d'import : isole xlsx du reste de l'application.
import { ErreurLecture, lireFichier } from "./lectureFichier.js";

self.onmessage = (e) => {
  const { octets, nom, feuille } = e.data;
  try {
    self.postMessage({ ok: true, resultat: lireFichier(octets, nom, feuille) });
  } catch (err) {
    self.postMessage({
      ok: false,
      message: err instanceof ErreurLecture ? err.message : "Fichier illisible : vérifiez son format et son contenu.",
    });
  }
};
