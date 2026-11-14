import React from "react";
import { C } from "../theme";
import logoLaGestion from "../assets/logo-lagestion.png";

// Texte de l'accroche, en un seul endroit (traduction).
export const ACCROCHE = "Pilotez votre activité en toute sérénité.";

// Masque du reflet : la même image, pour que la bande ne colore que les pixels du dessin.
const MASQUE_LOGO = { WebkitMaskImage: `url(${logoLaGestion})`, maskImage: `url(${logoLaGestion})` };

// En-tête des pages hors application, aligné à droite sur la carte, sur FOND_HORS_APPLICATION.
// logo-lagestion.png a un texte blanc : uniquement sur fond sombre. Repère « bannière », ni le logo ni l'accroche
// ne sont des titres (le h1 est dans la carte). Animation « shift » et reflet du « G » : index.css (lg-shift, lg-reflet).
export default function LogoHorsApplication() {
  return (
    <header className="lg-shift mb-8 flex flex-col items-end">
      <span className="lg-shift-logo relative block w-40 sm:w-[200px]">
        <img src={logoLaGestion} alt="LaGestion" width={282} height={49} className="block h-auto w-full" />
        <span className="lg-reflet" style={MASQUE_LOGO} aria-hidden="true">
          <span className="lg-reflet-bande" />
        </span>
      </span>
      <p className="lg-shift-phrase mt-2 text-right text-sm" style={{ color: C.texteHorsApplication }}>
        {ACCROCHE}
      </p>
    </header>
  );
}
