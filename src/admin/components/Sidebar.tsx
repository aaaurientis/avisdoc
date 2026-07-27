import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Building2,
  FileText,
  LayoutDashboard,
  Moon,
  Power,
  Settings,
  Sun,
  Users,
  Wallet,
} from "lucide-react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { initials } from "../lib/format";
import { appliquerTheme, themeCourant, type Theme } from "../lib/theme";
import { Avatar } from "./ui";

const NAV = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/crm", label: "CRM", icon: Building2 },
  { to: "/clients", label: "Clients", icon: Wallet },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/settings", label: "Réglages", icon: Settings },
];

export default function Sidebar() {
  const { user, signOut } = useAuth();
  const [theme, setTheme] = useState<Theme>(themeCourant());
  const basculerTheme = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    appliquerTheme(t);
    setTheme(t);
  };

  return (
    <aside className="ad-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6">
      <div className="flex flex-col gap-1.5 px-2.5 pb-6">
        <AvisdocLogo className="h-12 w-auto self-start" />
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Administration
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-avisdoc-ink text-white"
                  : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
              )
            }
          >
            <Icon className="size-[18px]" strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
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
