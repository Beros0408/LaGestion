import React, { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Briefcase, FileText, Package, Mail, BarChart3, Bot,
  FolderOpen, Settings, HelpCircle, Bell, Search, Plus, Menu,
} from "lucide-react";
import { C } from "../theme";

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

const breadcrumbLabels = {
  "/dashboard": "Tableau de bord",
  "/clients": "Clients",
  "/opportunites": "Opportunités",
  "/factures": "Factures",
};

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-[15px] font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 md:justify-center md:gap-0 md:px-0 xl:justify-start xl:gap-3 xl:px-2.5";

const activeStyle = { color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" };
const inactiveStyle = { color: C.textSecondary, backgroundColor: "transparent" };

export default function Layout() {
  const [menuMobile, setMenuMobile] = useState(false);
  const location = useLocation();
  const breadcrumb = breadcrumbLabels[location.pathname] || "Tableau de bord";
  const closeMobile = () => setMenuMobile(false);

  const renderNavItem = (item) => {
    const Icon = item.icon;
    const content = (
      <>
        <Icon size={20} aria-hidden="true" />
        <span className="flex-1 text-left md:hidden xl:inline">{item.label}</span>
        {item.soon && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold md:hidden xl:inline"
            style={{ color: C.accent, backgroundColor: "rgba(244,162,97,0.15)" }}
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
        style={inactiveStyle}
      >
        {content}
      </button>
    );
  };

  const Sidebar = (
    <aside
      className="flex h-full w-[216px] md:w-[72px] xl:w-[216px] shrink-0 flex-col"
      style={{ backgroundColor: C.bgCard, borderRight: `1px solid ${C.border}` }}
    >
      <div className="flex items-center gap-2.5 px-4 py-4 md:justify-center md:px-2 xl:justify-start xl:px-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})` }}
        >
          <span className="text-lg font-bold text-white" style={{ fontFamily: "Sora, sans-serif" }}>L</span>
        </div>
        <span
          className="text-lg font-bold md:hidden xl:inline"
          style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
        >
          Lagestion
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2 xl:px-3" aria-label="Navigation principale">
        {navItems.map(renderNavItem)}

        <div className="my-3" style={{ borderTop: `1px solid ${C.border}` }} />

        {navSecondaires.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              title={item.label}
              className={itemClass}
              style={inactiveStyle}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="md:hidden xl:inline">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="m-2 rounded-xl p-2.5 xl:m-3 xl:p-3" style={{ backgroundColor: C.bgMain }}>
        <div className="flex items-center gap-3 md:justify-center md:gap-0 xl:justify-start xl:gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: C.secondary }}
            aria-label="Profil de Camille Lambert"
            title="Camille Lambert — Plan Pro · Commercial"
          >
            CL
          </div>
          <div className="min-w-0 flex-1 md:hidden xl:block">
            <p className="truncate text-[15px] font-semibold" style={{ color: C.textPrimary }}>Camille Lambert</p>
            <p className="truncate text-xs" style={{ color: C.textSecondary }}>Plan Pro · Commercial</p>
          </div>
        </div>
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
            style={{ backgroundColor: "rgba(45,52,54,0.4)" }}
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
              Bonjour Camille 👋
            </h1>
          </div>

          <div className="relative hidden md:block">
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
              style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}`, color: C.textPrimary }}
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

          <button
            className="hidden items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 sm:flex"
            style={{ backgroundColor: C.primary }}
          >
            <Plus size={16} aria-hidden="true" />
            Nouvelle facture
          </button>
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
