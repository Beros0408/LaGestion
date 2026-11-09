// Fichier du logo (PNG ou JPEG) → image prête pour jsPDF, avec ses dimensions en pixels.
export function lireLogo(blob) {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error("Lecture du logo impossible."));
    lecteur.onload = () => {
      const image = new Image();
      image.onerror = () => rejeter(new Error("Logo illisible."));
      image.onload = () => resoudre({
        dataUrl: lecteur.result,
        format: blob.type === "image/png" ? "PNG" : "JPEG",
        largeur: image.naturalWidth,
        hauteur: image.naturalHeight,
      });
      image.src = lecteur.result;
    };
    lecteur.readAsDataURL(blob);
  });
}
