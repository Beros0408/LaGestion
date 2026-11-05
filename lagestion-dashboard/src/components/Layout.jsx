import React, { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Briefcase, FileText, Package, Mail, BarChart3, Bot,
  FolderOpen, Settings, HelpCircle, Bell, Search, Plus, Menu, LogOut, ArrowLeft,
} from "lucide-react";
import { C, AVATARS, VOILE, alpha } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { GardeModificationsProvider, useQuitter } from "../context/GardeModificationsContext.jsx";
import { pageParente, libellePage } from "../utils/navigation";

const navItems = [
  { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, to: "/dashboard" },
  { id: "clients", label: "Clients", icon: Users, to: "/clients" },
  { id: "opportunites", label: "Opportunités", icon: Briefcase, to: "/opportunites" },
  { id: "factures", label: "Factures", icon: FileText, to: "/factures" },
  { id: "stock", label: "Stock", icon: Package, soon: true },
  { id: "campagnes", label: "Campagnes", icon: Mail, soon: true },
  { id: "rapports", label: "Rapports", icon: BarChart3 },
  { id: "assistant", label: "Assistant IA", icon: Bot, soon: true },
];

const navSecondaires = [
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "parametres", label: "Paramètres", icon: Settings },
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
  const { signOut } = useAuth();
  const { nomAffiche, prenomAffiche, initiales, entreprise, libelleRole, peutEcrire } = useEntreprise();
  const sousTitreProfil = [entreprise?.nom, libelleRole].filter(Boolean).join(" · ");
  const breadcrumb = libellePage(location.pathname);
  const parente = pageParente(location.pathname);

  // Retour : historique de l'application s'il existe ; sinon (lien ouvert directement) page parente.
  const revenir = () =>
    quitter(() => {
      if (location.key !== "default") navigate(-1);
      else navigate(parente, { replace: true });
    });
  const closeMobile = () => setMenuMobile(false);

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
        <Icon size={20} aria-hidden="true" />
        <span className="flex-1 text-left md:hidden xl:inline">{item.label}</span>
        {item.soon && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold md:hidden xl:inline"
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
          onClick={closeMobile}
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
      <div className="flex items-center gap-2.5 px-4 py-4 md:justify-center md:px-2 xl:justify-start xl:px-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `linear-gradient(135deg, ${C.primary}, ${AVATARS.vertEau})` }}
        >
          <span className="text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>L</span>
        </div>
        <span
          className="text-lg font-bold md:hidden xl:inline"
          style={{ color: C.sidebarText, fontFamily: "Sora, sans-serif" }}
        >
          Lagestion
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2 xl:px-3" aria-label="Navigation principale">
        {navItems.map(renderNavItem)}

        <div className="my-3" style={{ borderTop: `1px solid ${C.sidebarBorder}` }} />

        {navSecondaires.map((item) => {
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
              <Icon size={20} aria-hidden="true" />
              <span className="md:hidden xl:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="m-2 rounded-xl p-2.5 xl:m-3 xl:p-3" style={{ backgroundColor: C.sidebarHover }}>
        <div className="flex items-center gap-3 md:justify-center md:gap-0 xl:justify-start xl:gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: AVATARS.vertEau }}
            aria-label={`Profil de ${nomAffiche}`}
            title={`${nomAffiche} — ${sousTitreProfil}`}
          >
            {initiales}
          </div>
          <div className="min-w-0 flex-1 md:hidden xl:block">
            <p className="truncate text-[15px] font-semibold" style={{ color: C.sidebarText }}>{nomAffiche}</p>
            <p className="truncate text-xs" style={{ color: C.sidebarTextMuted }}>{sousTitreProfil}</p>
          </div>
        </div>
      </div>

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
              className="flex items-center gap-1.5 text-xs"
              style={{ color: C.textSecondary }}
              aria-label="Fil d'Ariane"
            >
              <span>Lagestion</span>
              <span aria-hidden="true">/</span>
              <span className="font-medium" style={{ color: C.textPrimary }}>{breadcrumb}</span>
            </nav>
            <h1
              className="truncate text-lg font-bold sm:text-xl"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              Bonjour {prenomAffiche} 👋
            </h1>
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
              placeholder="Rechercher un client, une facture…"
              className="w-64 rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: C.bgMain, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
              aria-label="Rechercher"
            />
          </div>

          <button
            className="relative rounded-xl p-2 transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary }}
            aria-label="Notifications"
          >
            <Bell size={20} />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: C.error }} />
          </button>

          {peutEcrire && (
            <button
              className="hidden items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 sm:flex"
              style={{ backgroundColor: C.primary }}
            >
              <Plus size={16} aria-hidden="true" />
              Nouvelle facture
            </button>
          )}
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>

      <button
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-transform hover:-translate-y-1 focus:outline-none focus-visible:ring-2"
        style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})` }}
        aria-label="Assistant IA (disponible en Phase 2)"
        title="Assistant IA — Phase 2"
      >
        <Bot size={24} aria-hidden="true" />
      </button>
    </div>
  );
}
