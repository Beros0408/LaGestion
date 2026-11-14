import React from "react";
import logoLaGestion from "../assets/logo-lagestion.png";

// Logo des pages hors application, centré au-dessus de la carte, sur FOND_HORS_APPLICATION.
// logo-lagestion.png a un texte blanc : uniquement sur fond sombre. Repère « bannière », pas un titre (le h1 est dans la carte).
export default function LogoHorsApplication() {
  return (
    <header className="mb-8 flex justify-center">
      <img src={logoLaGestion} alt="LaGestion" width={282} height={49} className="block h-auto w-40 sm:w-[200px]" />
    </header>
  );
}
