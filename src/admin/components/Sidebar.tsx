// Barre latérale du Hub — menu à 2 niveaux, filtré par les modules autorisés
// (admin_droits ; un super-admin voit tout). Les groupes se déplient et
// s'ouvrent automatiquement quand une de leurs pages est active.
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useSearchParams } from "react-router-dom";
import {
  BookUser,
  Building2,
  CalendarDays,
  ChevronDown,
  FileText,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Megaphone,
  Mic,
  Moon,
  Power,
  Receipt,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  Sun,
  Target,
  Trash2,
  type LucideIcon,
  Users,
  Wallet,
  Radar,
  Newspaper,
  Archive,
  TrendingUp,
  Landmark,
  Umbrella,
  Handshake,
  Star,
  Swords,
  FlaskConical,
  Calculator,
  Bell,
  CalendarCheck,
  BarChart3,
  Tags,
  HeartPulse,
} from "lucide-react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { useAdminData } from "../data/AdminDataContext";
import { initials } from "../lib/format";
import { ecrireArrivee, lireArrivee, type Arrivee } from "../lib/arrivee";
import { MODULE_DU_CRM, type Module } from "../lib/modules";
import { appliquerTheme, themeCourant, type Theme } from "../lib/theme";
import { CRMS, nouveautesCommercial } from "../lib/veille";
import { lectureSeuleActive, reglerLectureSeule } from "../lib/lectureSeule";
import { Avatar } from "./ui";

interface Enfant {
  to: string;
  label: string;
  /** Pictogramme de la page, en trait fin — mêmes choix que le hub Onetip. */
  icon: LucideIcon;
  /** Réservé aux super-admins (ex. journal d'audit). */
  superadmin?: boolean;
  /** Module propre à cette page, quand il diffère de celui du groupe (ex. Merx). */
  module?: Module;
  /** Correspondance exacte du lien actif (sinon un préfixe suffit). */
  end?: boolean;
  /** Une pastille rouge : le nombre de nouveautés arrivées depuis la dernière ouverture. */
  pastille?: "commercial-veille";
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

// Les quatre CRM (lib/veille), chacun avec son pictogramme.
const ICONE_CRM: Record<string, LucideIcon> = { demarcher: Building2, collectivites: Landmark, mutuelles: Umbrella, intermediaires: Handshake };

/** Un lien du menu est actif si le chemin correspond et que chacun de ses paramètres (?crm=…, ?seul=…) est dans l'adresse. */
function lienActif(to: string, end: boolean | undefined, pathname: string, search: string) {
  // Scope, ouvert depuis une page de veille, garde allumée l'entrée d'où l'on vient.
  pathname = pathname.replace(/^\/veille\/(\w+)\/vigile\/?$/, "/veille/$1/direct");
  const [chemin, requete = ""] = to.split("?");
  if (end ? pathname !== chemin : !(pathname === chemin || pathname.startsWith(`${chemin}/`))) return false;
  const ici = new URLSearchParams(search);
  return [...new URLSearchParams(requete)].every(([k, v]) => ici.get(k) === v);
}

const MENU: Entree[] = [
  { module: null, label: "Tableau de bord", icon: LayoutDashboard, to: "/dashboard" },
  // Organigramme de Laurent et Irène (Olivier, 09/11) : un CRM par marché, chacun avec les mêmes entrées et son propre droit.
  // CRM Entreprise est l'ancien bloc Commercial : même droit (« commercial »), mêmes fiches ; Débrief et CAP quittent le menu.
  // Derrière, les écrans restent communs ; chacun ne montre que les fiches et la veille de son marché.
  ...CRMS.map((c): Entree => ({ module: MODULE_DU_CRM[c.axe], label: c.label, icon: ICONE_CRM[c.axe], enfants: [
    { to: `/planning?crm=${c.axe}`, label: "Planning", icon: CalendarDays },
    { to: `/veille/commerciale/direct?seul=${c.axe}`, label: "Veille", icon: Newspaper },
    { to: `/merx?crm=${c.axe}`, label: "Merx", icon: Sparkles },
    { to: `/prospects?crm=${c.axe}`, label: "Prospection", icon: Target },
    { to: `/crm?crm=${c.axe}`, label: "Pipeline", icon: LayoutGrid },
    { to: `/fichier-client?crm=${c.axe}`, label: "Clients", icon: BookUser },
    { to: `/veille/commerciale?crm=${c.axe}`, label: "Weekly", icon: Radar, end: true },
    { to: `/veille/commerciale/archives?seul=${c.axe}`, label: "Archivés", icon: Archive },
    { to: `/corbeille?crm=${c.axe}`, label: "Corbeille", icon: Trash2 },
    { to: `/aide?crm=${c.axe}`, label: "Aide", icon: LifeBuoy },
  ] })),
  { module: "veille", label: "Veille Marché", icon: TrendingUp, enfants: [
    { to: "/veille/marche/direct?seul=nous", label: "Les avis sur AvisDoc", icon: Star },
    { to: "/veille/marche/direct?seul=evenements", label: "Évènements", icon: CalendarDays },
    { to: "/veille/marche/direct?seul=concurrents", label: "Concurrence", icon: Swords },
    { to: "/veille/marche/direct?seul=publications", label: "Publi Scientifiques", icon: FlaskConical },
    { to: "/veille/marche", label: "Weekly", icon: Radar, end: true },
    { to: "/veille/marche/archives", label: "Archivés", icon: Archive },
    { to: "/corbeille?veille=marche", label: "Corbeille", icon: Trash2 },
    { to: "/aide?veille=marche", label: "Aide", icon: LifeBuoy },
  ] },
  // CRM Synthèse : les mêmes entrées que chaque CRM, tous marchés ensemble, et sa Vue d'ensemble en tête (Olivier, 09/11).
  { module: "crm_synthese", label: "CRM Synthèse", icon: LayoutGrid, enfants: [
    { to: "/crm-synthese", label: "Vue d'ensemble", icon: LayoutDashboard },
    { to: "/planning?crm=synthese", label: "Planning", icon: CalendarDays },
    { to: "/prospects?crm=synthese", label: "Prospection", icon: Target },
    { to: "/crm?crm=synthese", label: "Pipeline", icon: LayoutGrid },
    { to: "/fichier-client?crm=synthese", label: "Clients", icon: BookUser },
    { to: "/veille/commerciale?crm=synthese", label: "Weekly", icon: Radar, end: true },
    { to: "/veille/commerciale/archives?crm=synthese", label: "Archivés", icon: Archive },
    { to: "/corbeille?crm=synthese", label: "Corbeille", icon: Trash2 },
    { to: "/aide?crm=synthese", label: "Aide", icon: LifeBuoy },
  ] },
  // 5 — Professionnels de Santé (ex Contacts Médicaux).
  { module: "sante", label: "Professionnels de Santé", icon: HeartPulse, enfants: [
    { to: "/contacts", label: "Vue d'ensemble", icon: LayoutGrid, end: true },
    { to: "/infirmieres", label: "Requérants", icon: Stethoscope },
    { to: "/contacts/requis", label: "Requis", icon: Users },
    { to: "/contacts/reseau", label: "Réseau Aval", icon: Building2 },
  ] },
  // Journée : suivi et statistiques des journées de dépistage (extractions S3).
  { module: "journee", label: "Journée", icon: CalendarCheck, enfants: [
    { to: "/journees", label: "Statistiques", icon: BarChart3, end: true },
    { to: "/journees/calendrier", label: "Calendrier", icon: CalendarDays },
  ] },
  { module: "finance", label: "Finance", icon: Wallet, enfants: [
    { to: "/clients", label: "Facturation", icon: Receipt },
  ] },
  { module: "documents", label: "Documents", icon: FileText, to: "/documents" },
  { module: "admin", label: "Admin", icon: Settings, enfants: [
    { to: "/settings", label: "Réglages", icon: SlidersHorizontal },
    { to: "/typologies", label: "Typologies clients", icon: Tags },
    { to: "/parametrage-veille", label: "Paramétrage veille", icon: Radar },
    { to: "/cpr", label: "CPR veille", icon: Calculator },
    { to: "/droits", label: "Droits d'accès", icon: KeyRound },
    { to: "/audit", label: "Auditabilité", icon: ScrollText },
  ] },
];

const lienCls = (actif: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
    actif ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
  );

/** Les entreprises arrivées dans Commercial › Veille depuis votre dernière visite : relu à chaque changement d'écran. */
function useNouveautesCommercial(actif: boolean) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!actif || !user?.email) return;
    if (pathname.startsWith("/commercial-veille")) return setN(0);
    let vivant = true;
    nouveautesCommercial(user.email).then((x) => vivant && setN(x), () => {});
    return () => {
      vivant = false;
    };
  }, [actif, user?.email, pathname]);
  return n;
}

const Pastille = ({ n }: { n: number }) =>
  n > 0 ? <span className="ml-auto min-w-[18px] shrink-0 rounded-full bg-red-600 px-1.5 text-center text-[10px] font-bold leading-[18px] text-white">{n}</span> : null;

function Groupe({ entree, isSuperAdmin, peut }: { entree: Entree; isSuperAdmin: boolean; peut: (m: Module) => boolean }) {
  const { pathname, search } = useLocation();
  const enfants = (entree.enfants ?? []).filter((e) => (!e.superadmin || isSuperAdmin) && (!e.module || peut(e.module)));
  const enfantActif = enfants.some((e) => lienActif(e.to, e.end, pathname, search));
  const [ouvert, setOuvert] = useState(enfantActif);
  const Icon = entree.icon;
  const nouveautes = useNouveautesCommercial(enfants.some((e) => e.pastille === "commercial-veille"));

  // Le groupe suit la navigation : il s'ouvre sur ses écrans, se referme dès qu'on le
  // quitte. Sans cela, « enfantActif » forçait l'ouverture et le chevron ne servait à rien.
  useEffect(() => {
    setOuvert(enfantActif);
  }, [enfantActif]);

  // Un groupe dont aucun enfant n'est autorisé ne s'affiche pas.
  if (enfants.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={cn(lienCls(false), "w-full", enfantActif && "bg-accent font-bold text-avisdoc-ink")}
      >
        <Icon className="size-[18px]" strokeWidth={2.2} />
        <span className="min-w-0 flex-1 truncate text-left">{entree.label}</span>
        {!ouvert && <Pastille n={nouveautes} />}
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", ouvert && "rotate-180")} />
      </button>
      {ouvert && (
        <div className="ml-[26px] flex flex-col gap-0.5 border-l border-border pl-2.5 pt-0.5">
          {enfants.map((e) => {
            const IconeEnfant = e.icon;
            return (
              <NavLink
                key={e.to}
                to={e.to}
                end={e.end}
                className={() =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
                    lienActif(e.to, e.end, pathname, search)
                      ? "bg-avisdoc-ink text-white"
                      : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
                  )
                }
              >
                <IconeEnfant className="size-[15px] shrink-0" strokeWidth={1.9} />
                <span className="min-w-0 truncate">{e.label}</span>
                {e.pastille === "commercial-veille" && <Pastille n={nouveautes} />}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** « Documents » déroule les catégories (niveau 1) de l'arborescence. */
function GroupeDocuments() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const { docTree } = useAdminData();
  const surDocuments = pathname.startsWith("/documents");
  const [ouvert, setOuvert] = useState(surDocuments);
  useEffect(() => {
    if (surDocuments) setOuvert(true);
  }, [surDocuments]);

  // Catégorie active = paramètre d'URL, sinon la première (défaut de la page).
  const catActive = params.get("cat") ?? docTree[0]?.name ?? "";

  // Sans arborescence chargée : lien simple vers Documents.
  if (docTree.length === 0) {
    return (
      <NavLink to="/documents" className={({ isActive }) => lienCls(isActive)}>
        <FileText className="size-[18px]" strokeWidth={2.2} />
        Documents
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className={cn(lienCls(false), "w-full", surDocuments && "bg-accent font-bold text-avisdoc-ink")}
      >
        <FileText className="size-[18px]" strokeWidth={2.2} />
        <span className="min-w-0 flex-1 truncate text-left">Documents</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", ouvert && "rotate-180")} />
      </button>
      {ouvert && (
        <div className="ml-[26px] flex flex-col gap-0.5 border-l border-border pl-2.5 pt-0.5">
          {docTree.map((c) => {
            const actif = surDocuments && catActive === c.name;
            return (
              <Link
                key={c.name}
                to={`/documents?cat=${encodeURIComponent(c.name)}`}
                className={cn(
                  "rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors",
                  actif ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:bg-accent hover:text-avisdoc-ink",
                )}
              >
                <span className="block min-w-0 truncate">{c.name}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ ouvert = false }: { ouvert?: boolean } = {}) {
  const { user, signOut, isSuperAdmin, peut } = useAuth();
  const [theme, setTheme] = useState<Theme>(themeCourant());
  const [arrivee, setArrivee] = useState<Arrivee>(lireArrivee);

  const basculerTheme = () => {
    const t: Theme = theme === "dark" ? "light" : "dark";
    appliquerTheme(t);
    setTheme(t);
  };

  // Chaque CRM, la Veille Marché et la CRM Synthèse ont leur case dans Admin › Droits d'accès (Olivier, 09/11).
  const menu = MENU.filter((m) => m.module === null || peut(m.module));

  // CRM Synthèse = vue seule : allumée sur ses pages (?crm=synthese, Vue d'ensemble), éteinte dès qu'on ouvre un autre CRM
  // (?crm=… ou ?seul=…) ou une page hors CRM ; une fiche ouverte depuis la Synthèse reste en vue seule.
  const { pathname: ici, search: requete } = useLocation();
  useEffect(() => {
    const q = new URLSearchParams(requete);
    let v = lectureSeuleActive();
    if (ici.startsWith("/crm-synthese")) v = true;
    else if (q.has("crm") || q.has("seul")) v = q.get("crm") === "synthese";
    else if (!/^\/(crm|prospects|planning|merx|fichier-client|corbeille|aide|veille\/commerciale)(\/|$)/.test(ici)) v = false;
    reglerLectureSeule(v);
  }, [ici, requete]);
  // Une page sans menu (la dictée) : la vue seule ne la suit pas.
  useEffect(() => () => reglerLectureSeule(false), []);

  return (
    <>
    <aside
      data-ouvert={ouvert ? "oui" : "non"}
      className="ad-sidebar sticky top-0 flex h-screen w-[19rem] shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-4 py-6"
    >
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
          if (m.module === "documents") return <GroupeDocuments key={m.label} />;
          if (m.enfants) return <Groupe key={m.label} entree={m} isSuperAdmin={isSuperAdmin} peut={peut} />;
          return (
            <NavLink key={m.to} to={m.to!} className={({ isActive }) => lienCls(isActive)}>
              <Icon className="size-[18px]" strokeWidth={2.2} />
              {m.label}
            </NavLink>
          );
        })}
      </nav>

      {/* Où l'on arrive en ouvrant le Hub d'un téléphone. Le réglage n'apparaît que
          là où il a un sens : sur un grand écran, on arrive toujours au tableau de bord. */}
      <button
        type="button"
        onClick={() => {
          const suivant = arrivee === "dictee" ? "dashboard" : "dictee";
          ecrireArrivee(suivant);
          setArrivee(suivant);
        }}
        className="mt-auto hidden items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-avisdoc-ink max-md:flex"
      >
        {arrivee === "dictee" ? <Mic className="size-[18px]" strokeWidth={2.2} /> : <LayoutDashboard className="size-[18px]" strokeWidth={2.2} />}
        <span className="min-w-0 flex-1">
          <span className="block">Ouvrir sur {arrivee === "dictee" ? "la dictée" : "le tableau de bord"}</span>
          <span className="block text-[11px] font-normal text-muted-foreground/80">sur ce téléphone</span>
        </span>
      </button>

      {/* Bascule clair / sombre */}
      <button
        type="button"
        onClick={basculerTheme}
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-avisdoc-ink max-md:mt-0 md:mt-auto"
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
    </>
  );
}
