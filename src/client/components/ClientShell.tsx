// Coquille de l'espace client : sidebar + zone de contenu.
// Reprend exactement le design du back-office (Sidebar admin) : mêmes tokens,
// même logo, mêmes états actifs. La nav et le pied diffèrent (contexte client).
import { NavLink } from "react-router-dom";
import { CalendarClock, FileText, Mail, Power } from "lucide-react";
import type { ReactNode } from "react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { Avatar } from "../../admin/components/ui";
import { supabase } from "../lib/supabase";

const NAV = [
  { to: "/", label: "Documents", icon: FileText, end: true },
  { to: "/emails", label: "E-mails", icon: Mail, end: false },
  { to: "/rendez-vous", label: "Rendez-vous", icon: CalendarClock, end: false },
];

function initialesDe(nom: string, email: string): string {
  const parts = (nom || email).trim().split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function ClientShell({
  email,
  clientNom,
  children,
}: {
  email: string;
  clientNom: string;
  children: ReactNode;
}) {
  return (
    <div className="ad-shell flex min-h-screen bg-background">
      <aside className="ad-sidebar sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-4 py-6">
        <div className="flex flex-col gap-1.5 px-2.5 pb-6">
          <AvisdocLogo className="h-12 w-auto self-start" />
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Espace client
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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

        <div className="mt-auto flex items-center gap-2.5 border-t border-border pt-4">
          <Avatar
            initials={initialesDe(clientNom, email)}
            size={36}
            className="bg-avisdoc-teal text-white"
          />
          <div className="flex min-w-0 flex-col">
            <div className="truncate text-[13px] font-semibold text-avisdoc-ink">
              {clientNom}
            </div>
            <div className="truncate text-[11.5px] text-muted-foreground">
              {email}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            title="Se déconnecter"
            className="ml-auto rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-coral"
          >
            <Power className="size-[18px]" />
          </button>
        </div>
      </aside>

      <main className="ad-content min-w-0 flex-1 px-9 py-8">{children}</main>
    </div>
  );
}
