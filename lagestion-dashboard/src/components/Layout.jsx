import React, { useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Briefcase, FileText, Package, Mail, BarChart3, Bot,
  FolderOpen, Settings, HelpCircle, Search, Plus, Menu, LogOut, ArrowLeft, Boxes, FileSignature,
  Clock, ListChecks, AlertCircle,
} from "lucide-react";
import { C, VOILE, alpha } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { useTaches } from "../context/TachesContext.jsx";
import { jourParis } from "../utils/facture";
import { libelleEnRetard, nombreEnRetard } from "../utils/taches";
import { GardeModificationsProvider, useQuitter } from "../context/GardeModificationsContext.jsx";
import { pageParente, libellePage } from "../utils/navigation";
import logoLaGestion from "../assets/logo-lagestion.png";
import SelecteurEntreprise from "./SelecteurEntreprise.jsx";

const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, to: "/dashboard" },
  { id: "clients", label: "Clients", icon: Users, to: "/clients" },
  { id: "opportunites", label: "Opportunités", icon: Briefcase, to: "/opportunites" },
  { id: "devis", label: "Devis", icon: FileSignature, to: "/devis" },
  { id: "factures", label: "Factures", icon: FileText, to: "/factures" },
  { id: "impayes", label: "Impayés", icon: Clock, to: "/impayes" },
  { id: "taches", label: "Mes tâches", icon: ListChecks, to: "/taches" },
  { id: "catalogue", label: "Catalogue", icon: Boxes, to: "/catalogue" },
  { id: "stock", label: "Stock", icon: Package, soon: true },
  { id: "campagnes", label: "Campagnes", icon: Mail, soon: true },
  { id: "rapports", label: "Rapports", icon: BarChart3 },
  { id: "assistant", label: "Assistant IA", icon: Bot, soon: true },
];

const navSecondaires = [
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "parametres", label: "Paramètres", icon: Settings, to: "/parametres" },
  { id: "aide", label: "Aide & Tutoriels", icon: HelpCircle },
];

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-[15px] font-medium transition-colors duration-150 hover:bg-lg-sidebar-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-lg-sidebar-focus focus-visible:ring-offset-lg-sidebar-bg md:justify-center md:gap-0 md:px-0 xl:justify-start xl:gap-3 xl:px-2.5";

// Lien actif : fond plus clair et liseré gauche (ombre interne : aucun décalage de mise en page).
const activeStyle = {
  color: C.sidebarAccent,
  backgroundColor: C.sidebarActiveBg,
  boxShadow: `inset 3px 0 0 ${C.sidebarAccent}`,
};
const inactiveStyle = { color: C.sidebarText };
const bientotStyle = { color: C.sidebarTextMuted };

export default function Layout() {
  return (
    <GardeModificationsProvider>
      <LayoutContenu />
    </GardeModificationsProvider>
  );
}

function LayoutContenu() {
  const [menuMobile, setMenuMobile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const quitter = useQuitter();
  const { signOut, user } = useAuth();
  const { taches } = useTaches();
  // Compteur de l'en-tête : tâches en retard dont l'utilisateur connecté est responsable.
  const enRetard = nombreEnRetard(taches, user?.id, jourParis());
  const { prenomAffiche, peutEcrire } = useEntreprise();
  const breadcrumb = libellePage(location.pathname);
  const parente = pageParente(location.pathname);

  // Retour : historique de l'application s'il existe ; sinon (lien ouvert directement) page parente.
  const revenir = () =>
    quitter(() => {
      if (location.key !== "default") navigate(-1);
      else navigate(parente, { replace: true });
    });
  const closeMobile = () => setMenuMobile(false);
  // Lien de la barre latérale ou de l'en-tête : confirmation si un formulaire ou un import est en cours.
  // Clic du milieu ou avec Ctrl / Cmd / Maj : comportement du navigateur (nouvel onglet), sans garde.
  const lienProtege = (to, apres) => (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    quitter(() => {
      apres?.();
      navigate(to);
    });
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      closeMobile();
      navigate("/login", { replace: true });
    }
  };

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const content = (
      <>
        <Icon size={20} aria-hidden="true" className="shrink-0" />
        <span className="flex-1 whitespace-nowrap text-left md:hidden xl:inline">{item.label}</span>
        {item.soon && (
          <span
            className="shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold md:hidden xl:inline"
            style={{ color: C.accent, backgroundColor: alpha(C.accent, 0.15) }}
          >
            Phase 2
          </span>
        )}
      </>
    );

    if (item.to) {
      return (
        <NavLink
          key={item.id}
          to={item.to}
          onClick={lienProtege(item.to, closeMobile)}
          aria-label={item.label}
          title={item.label}
          className={itemClass}
          style={({ isActive }) => (isActive ? activeStyle : inactiveStyle)}
        >
          {content}
        </NavLink>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        aria-label={item.label}
        title={item.label}
        className={itemClass}
        style={bientotStyle}
      >
        {content}
      </button>
    );
  };

  const Sidebar = (
    <aside
      className="flex h-full w-[216px] md:w-[72px] xl:w-[216px] shrink-0 flex-col"
      style={{ backgroundColor: C.sidebarBg, borderRight: `1px solid ${C.sidebarBorder}` }}
    >
      <div className="flex items-center px-4 py-4 md:justify-center md:px-2 xl:justify-start xl:px-4">
        {/* Logo de LaGestion (src/assets, fond transparent, texte blanc) : 175 px au plus, hauteur automatique.
            Barre repliée (72 px) : seul le monogramme, à gauche de l'image, reste visible dans 40 px. */}
        <Link
          to="/dashboard"
          onClick={lienProtege("/dashboard", closeMobile)}
          title="Tableau de bord"
          className="block w-full max-w-[175px] overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-lg-sidebar-focus md:w-10 xl:w-full"
        >
          <img
            src={logoLaGestion}
            alt="LaGestion"
            className="block h-auto w-full max-w-[175px] md:h-[26px] md:w-auto md:max-w-none xl:h-auto xl:w-full xl:max-w-[175px]"
          />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2 xl:px-3" aria-label="Navigation principale">
        {navItems.map(renderNavItem)}

        <div className="my-3" style={{ borderTop: `1px solid ${C.sidebarBorder}` }} />

        {navSecondaires.map((item) => {
          if (item.to) return renderNavItem(item);
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={item.label}
              className={itemClass}
              style={bientotStyle}
            >
              <Icon size={20} aria-hidden="true" className="shrink-0" />
              <span className="md:hidden xl:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <SelecteurEntreprise onAction={closeMobile} />

      <div className="px-2 pb-3 xl:px-3">
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className={itemClass}
          style={inactiveStyle}
        >
          <LogOut size={20} aria-hidden="true" />
          <span className="flex-1 text-left md:hidden xl:inline">Se déconnecter</span>
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: C.bgMain, fontFamily: "Inter, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700&display=swap');`}</style>

      <div className="hidden md:block">{Sidebar}</div>

      {menuMobile && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: VOILE }}
            onClick={closeMobile}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6"
          style={{ backgroundColor: C.bgCard, borderBottom: `1px solid ${C.border}` }}
        >
          <button
            className="rounded-lg p-2 md:hidden focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary }}
            onClick={() => setMenuMobile(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={20} />
          </button>

          {parente !== null && (
            <button
              type="button"
              onClick={revenir}
              aria-label="Revenir à la page précédente"
              className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, border: `1px solid ${C.borderInput}` }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Retour
            </button>
          )}

          <div className="min-w-0 flex-1">
            <nav
              className="flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs"
              style={{ color: C.textSecondary }}
              aria-label="Fil d'Ariane"
            >
              <span>LaGestion</span>
              <span aria-hidden="true">/</span>
              <span className="truncate font-medium" style={{ color: C.textPrimary }}>{breadcrumb}</span>
            </nav>
            {/* Titre métier en h1 ; visible seulement sur le tableau de bord (« Bonjour »), ailleurs la page affiche son titre. */}
            {location.pathname === "/dashboard" ? (
              <h1
                className="truncate text-lg font-bold sm:text-xl"
                style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
              >
                Bonjour {prenomAffiche} 👋
              </h1>
            ) : (
              <h1 className="sr-only">{breadcrumb}</h1>
            )}
          </div>

          <div className="relative hidden lg:block">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: C.textSecondary }}
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Rechercher…"
              className="w-64 rounded-xl py-2 pl-9 pr-3 text-sm placeholder:text-lg-text-secondary focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: C.bgMain, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
              aria-label="Rechercher"
            />
          </div>

          {enRetard > 0 && (
            <Link
              to="/taches"
              onClick={lienProtege("/taches")}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-2 text-sm font-medium transition-colors hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
              style={{ color: C.errorText }}
              aria-label={libelleEnRetard(enRetard)}
            >
              <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
              {/* Sous 640 px : le nombre seul, le nom accessible garde le libellé complet. */}
              <span className="tabular-nums sm:hidden">{enRetard}</span>
              <span className="hidden sm:inline">{libelleEnRetard(enRetard)}</span>
            </Link>
          )}

          {/* Masqué sur /factures (la page a son propre bouton) et sur /factures/nouvelle. */}
          {peutEcrire && !["/factures", "/factures/nouvelle"].includes(location.pathname) && (
            <Link
              to="/factures/nouvelle"
              onClick={lienProtege("/factures/nouvelle")}
              className="hidden items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 sm:flex"
              style={{ backgroundColor: C.primary }}
            >
              <Plus size={16} aria-hidden="true" />
              Nouvelle facture
            </Link>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
