import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Ban, BarChart3, CalendarCheck, Filter, Moon, Power, Sun, Upload, Users } from "lucide-react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { L } from "../i18n/libelles";
import { initiales } from "../lib/format";
import { appliquerTheme, themeCourant, type Theme } from "../lib/theme";
import { CIBLE } from "./ui";

const NAV = [
  { to: "/jour", libelle: L.nav.jour, Icone: CalendarCheck },
  { to: "/contacts", libelle: L.nav.contacts, Icone: Users },
  { to: "/import", libelle: L.nav.import, Icone: Upload },
  { to: "/sourcing", libelle: L.nav.sourcing, Icone: Filter },
  { to: "/exclusions", libelle: L.nav.exclusions, Icone: Ban },
  { to: "/synthese", libelle: L.nav.synthese, Icone: BarChart3 },
];

export default function BarreLaterale() {
  const { utilisateur, deconnecter } = useAuth();
  const [theme, setTheme] = useState<Theme>(themeCourant());
  const basculer = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    appliquerTheme(t);
    setTheme(t);
  };
  const [prenom = "", nom = ""] = (utilisateur?.nom ?? "").split(" ");

  return (
    <aside className="pr-barre sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6">
      <div className="flex flex-col gap-1.5 px-2.5 pb-6">
        <AvisdocLogo className="h-12 w-auto self-start" />
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{L.app.module}</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ to, libelle, Icone }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(CIBLE, "flex items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold transition-colors",
                isActive ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink")
            }
          >
            <Icone className="size-[18px]" strokeWidth={2.2} />
            {libelle}
          </NavLink>
        ))}
      </nav>

      <p className="mt-6 px-3.5 text-[11px] leading-snug text-muted-foreground/80">{L.app.cloisonnement}</p>

      <button
        type="button"
        onClick={basculer}
        className={cn(CIBLE, "mt-auto flex items-center gap-2.5 rounded-xl px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-avisdoc-ink")}
      >
        {theme === "dark" ? <Sun className="size-[18px]" strokeWidth={2.2} /> : <Moon className="size-[18px]" strokeWidth={2.2} />}
        {theme === "dark" ? L.app.modeClair : L.app.modeSombre}
      </button>

      <div className="flex items-center gap-2.5 border-t border-border pt-4">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-avisdoc-ink text-[13px] font-bold text-white">
          {initiales(prenom, nom)}
        </span>
        <div className="flex min-w-0 flex-col">
          <div className="truncate text-[13px] font-semibold text-avisdoc-ink">{utilisateur?.nom}</div>
          <div className="truncate text-[11.5px] text-muted-foreground">{utilisateur?.email}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/80">{L.app.viaSso}</div>
        </div>
        <button
          type="button"
          onClick={() => void deconnecter()}
          title={L.app.deconnexion}
          aria-label={L.app.deconnexion}
          className={cn(CIBLE, "ml-auto inline-flex items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-avisdoc-coral-ink")}
        >
          <Power className="size-[18px]" />
        </button>
      </div>
    </aside>
  );
}
