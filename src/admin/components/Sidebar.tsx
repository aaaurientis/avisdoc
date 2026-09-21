// Barre latérale du Hub — menu à 2 niveaux, filtré par les modules autorisés
// (admin_droits ; un super-admin voit tout). Les groupes se déplient et
// s'ouvrent automatiquement quand une de leurs pages est active.
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Megaphone,
  Moon,
  Power,
  Settings,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/format";
import type { Module } from "../lib/modules";
import { appliquerTheme, themeCourant, type Theme } from "../lib/theme";
import { Avatar } from "./ui";

interface Enfant {
  to: string;
  label: string;
  /** Réservé aux super-admins (ex. journal d'audit). */
  superadmin?: boolean;
  /** Module propre à cette page, quand il diffère de celui du groupe (ex. Merx). */
  module?: Module;
}
interface Entree {
  /** Module de droits ; null = visible par tous (tableau de bord). */
  module: Module | null;
  label: string;
  icon: LucideIcon;
  /** Lien direct… */
  to?: string;
  /** …ou groupe déroulant de 2e niveau. */
  enfants?: Enfant[];
  /** Module annoncé mais pas encore livré. */
  aVenir?: boolean;
}

const MENU: Entree[] = [
  { module: null, label: "Tableau de bord", icon: LayoutDashboard, to: "/dashboard" },
  { module: "crm", label: "Clients et Prospection", icon: Building2, enfants: [
    { to: "/merx", label: "Merx", module: "merx" },
    { to: "/prospects", label: "Prospection", module: "merx" },
    { to: "/crm", label: "Pipeline" },
    { to: "/fichier-client", label: "Clients", module: "merx" },
    { to: "/notes-dictees", label: "Notes dictées", module: "merx" },
  ] },
  { module: "contacts", label: "Contacts Médicaux", icon: Users, to: "/contacts" },
  { module: "marketing", label: "Marketing", icon: Megaphone, aVenir: true },
  { module: "finance", label: "Finance", icon: Wallet, enfants: [
    { to: "/clients", label: "Facturation" },
  ] },
  { module: "documents", label: "Documents", icon: FileText, to: "/documents" },
  { module: "admin", label: "Admin", icon: Settings, enfants: [
    { to: "/settings", label: "Réglages" },
    { to: "/droits", label: "Droits d'accès", superadmin: true },
    { to: "/audit", label: "Auditabilité", superadmin: true },
  ] },
];

const lienCls = (actif: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
    actif ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
  );

function Groupe({ entree, isSuperAdmin, peut }: { entree: Entree; isSuperAdmin: boolean; peut: (m: Module) => boolean }) {
  const { pathname } = useLocation();
  const enfants = (entree.enfants ?? []).filter((e) => (!e.superadmin || isSuperAdmin) && (!e.module || peut(e.module)));
  const enfantActif = enfants.some((e) => pathname.startsWith(e.to));
  const [ouvert, setOuvert] = useState(enfantActif);
  const Icon = entree.icon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={cn(lienCls(false), "w-full", enfantActif && "text-avisdoc-ink")}
      >
        <Icon className="size-[18px]" strokeWidth={2.2} />
        <span className="min-w-0 flex-1 truncate text-left">{entree.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", (ouvert || enfantActif) && "rotate-180")} />
      </button>
      {(ouvert || enfantActif) && (
        <div className="ml-[26px] flex flex-col gap-0.5 border-l border-border pl-2.5 pt-0.5">
          {enfants.map((e) => (
            <NavLink
              key={e.to}
              to={e.to}
              className={({ isActive }) =>
                cn(
                  "rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
                  isActive
                    ? "bg-avisdoc-ink text-white"
                    : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
                )
              }
            >
              {e.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { user, signOut, isSuperAdmin, peut } = useAuth();
  const [theme, setTheme] = useState<Theme>(themeCourant());
  const basculerTheme = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    appliquerTheme(t);
    setTheme(t);
  };

  const menu = MENU.filter((m) => m.module === null || peut(m.module));

  return (
    <aside className="ad-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-4 py-6">
      <div className="flex flex-col gap-1.5 px-2.5 pb-6">
        <AvisdocLogo className="h-12 w-auto self-start" />
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Hub
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {menu.map((m) => {
          const Icon = m.icon;
          if (m.aVenir) {
            return (
              <div key={m.label} className={cn(lienCls(false), "cursor-default opacity-60")}>
                <Icon className="size-[18px]" strokeWidth={2.2} />
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                  À venir
                </span>
              </div>
            );
          }
          if (m.enfants) return <Groupe key={m.label} entree={m} isSuperAdmin={isSuperAdmin} peut={peut} />;
          return (
            <NavLink key={m.to} to={m.to!} className={({ isActive }) => lienCls(isActive)}>
              <Icon className="size-[18px]" strokeWidth={2.2} />
              {m.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Bascule clair / sombre */}
      <button
        type="button"
        onClick={basculerTheme}
        className="mt-auto flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-avisdoc-ink"
      >
        {theme === "dark" ? (
          <Sun className="size-[18px]" strokeWidth={2.2} />
        ) : (
          <Moon className="size-[18px]" strokeWidth={2.2} />
        )}
        {theme === "dark" ? "Mode clair" : "Mode sombre"}
      </button>

      <div className="flex items-center gap-2.5 border-t border-border pt-4">
        <Avatar initials={user ? initials(user.name) : "?"} size={36} />
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[13px] font-semibold text-avisdoc-ink">
            {user?.name}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            {user?.email}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/80">
            via Google SSO
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          title="Se déconnecter"
          className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-coral"
        >
          <Power className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}
