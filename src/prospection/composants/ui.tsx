// Primitives UI du module, habillées au design system du site (tokens avisdoc-*).
// Règles : une seule action principale par écran, le retour est un lien, un
// bouton inactif nomme son motif et le motif est cliquable, cibles à 44 points.
// Le cyan et l'orange logo ne servent jamais de couleur de texte sur fond clair :
// on utilise leurs déclinaisons lisibles (teal-ink, coral-ink).
import { forwardRef, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatutContact } from "../data/types";
import { ErreurRepo } from "../data/erreurs";
import { L, t } from "../i18n/libelles";

export const CIBLE = "min-h-[44px] min-w-[44px]";

export function Carte({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl border border-border bg-card shadow-soft", className)}>{children}</div>;
}

export function Pastille({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", className)}>
      {children}
    </span>
  );
}

export function Etiquette({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground", className)}>{children}</div>;
}

export function LienRetour({ to, libelle }: { to: string; libelle: string }) {
  return (
    <Link to={to} className={cn(CIBLE, "inline-flex items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-avisdoc-teal-ink hover:underline")}>
      <ArrowLeft className="size-4" />
      {libelle}
    </Link>
  );
}

export function EnTete({ titre, sousTitre, retour, action }: { titre: string; sousTitre?: string; retour?: { to: string; libelle: string }; action?: ReactNode }) {
  return (
    <div className="mb-6">
      {retour && <div className="mb-2"><LienRetour to={retour.to} libelle={retour.libelle} /></div>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold text-avisdoc-ink">{titre}</h1>
          {sousTitre && <p className="mt-1 text-sm text-muted-foreground">{sousTitre}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export type MotifInactif = { texte: string; action?: () => void; lien?: string };

type BoutonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  libelle: string;
  principal?: boolean;
  danger?: boolean;
  chargement?: boolean;
  motifInactif?: MotifInactif | null;
};

/**
 * Bouton avec motif d'inactivité nommé et cliquable. `principal` : une seule
 * fois par écran.
 */
export function Bouton({ libelle, principal, danger, chargement, motifInactif, className, onClick, type = "button", ...reste }: BoutonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const inactif = !!motifInactif || !!chargement;
  const classes = cn(
    CIBLE,
    "inline-flex items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-all",
    principal
      ? "bg-avisdoc-ink text-white hover:bg-avisdoc-ink-soft shadow-soft"
      : danger
        ? "border-[1.5px] border-rose-200 bg-card text-rose-700 hover:border-rose-400"
        : "border-[1.5px] border-border bg-card text-avisdoc-ink hover:border-avisdoc-teal",
    inactif && "cursor-not-allowed opacity-50 hover:border-border hover:bg-avisdoc-ink",
    className,
  );
  const cliquerMotif = () => {
    if (motifInactif?.action) motifInactif.action();
    else ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button ref={ref} type={type} className={classes} disabled={inactif} aria-disabled={inactif} onClick={onClick} {...reste}>
        {chargement && <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />}
        {libelle}
      </button>
      {motifInactif && !chargement && (
        motifInactif.lien ? (
          <Link to={motifInactif.lien} className={cn(CIBLE, "inline-flex items-center px-1 text-[12.5px] font-medium text-avisdoc-coral-ink underline-offset-2 hover:underline")}>
            {motifInactif.texte}
          </Link>
        ) : (
          <button type="button" onClick={cliquerMotif} className={cn(CIBLE, "inline-flex items-center px-1 text-left text-[12.5px] font-medium text-avisdoc-coral-ink underline-offset-2 hover:underline")}>
            {motifInactif.texte}
          </button>
        )
      )}
    </div>
  );
}

/** Navigation présentée comme action principale (c'est un lien). */
export function LienPrincipal({ to, libelle, motifInactif }: { to: string; libelle: string; motifInactif?: MotifInactif | null }) {
  if (motifInactif) return <Bouton libelle={libelle} principal motifInactif={motifInactif} />;
  return (
    <Link to={to} className={cn(CIBLE, "inline-flex items-center justify-center gap-2 rounded-full bg-avisdoc-ink px-5 text-sm font-semibold text-white shadow-soft transition-all hover:bg-avisdoc-ink-soft")}>
      {libelle}
    </Link>
  );
}

/** Message d'erreur d'une opération : le code serveur nommé devient un libellé. */
export function messageErreur(e: unknown): string {
  if (e instanceof ErreurRepo) {
    const libelles = L.erreurs as Record<string, string>;
    const l = libelles[e.code];
    return l ? t(l, { d: e.detail ?? e.message }) : t(L.erreurs.inconnue, { d: e.detail ?? e.message });
  }
  if (e instanceof Error) return /fetch|network|Failed/i.test(e.message) ? L.erreurs.reseau : t(L.erreurs.inconnue, { d: e.message });
  return t(L.erreurs.inconnue, { d: String(e) });
}

export function Erreur({ erreur, className }: { erreur: unknown; className?: string }) {
  if (!erreur) return null;
  return (
    <div role="alert" className={cn("rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800", className)}>
      <div className="font-semibold">{L.commun.erreurTitre}</div>
      <div>{messageErreur(erreur)}</div>
    </div>
  );
}

export function Chargement() {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground" aria-live="polite">
      <span className="size-5 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" aria-hidden />
      {L.commun.chargement}
    </div>
  );
}

export function Vide({ texte }: { texte: string }) {
  return <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">{texte}</p>;
}

export const CLASSES_SAISIE = cn(CIBLE, "w-full rounded-xl border border-border bg-background px-3.5 text-sm text-avisdoc-ink outline-none transition-colors focus:border-avisdoc-teal disabled:opacity-60");

export function Champ({ libelle, aide, children, htmlFor }: { libelle: string; aide?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-avisdoc-ink">{libelle}</span>
      {children}
      {aide && <span className="text-[11.5px] text-muted-foreground">{aide}</span>}
    </label>
  );
}

export const Saisie = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Saisie(props, ref) {
  return <input ref={ref} {...props} className={cn(CLASSES_SAISIE, props.className)} />;
});

export function Selection(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(CLASSES_SAISIE, props.className)} />;
}

export function ZoneTexte(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CLASSES_SAISIE, "min-h-[120px] py-3 leading-relaxed", props.className)} />;
}

export function Kpi({ libelle, valeur, pied, inverse, accent }: { libelle: string; valeur: string; pied?: string; inverse?: boolean; accent?: boolean }) {
  if (inverse) {
    return (
      <div className="rounded-2xl bg-avisdoc-ink p-5">
        <Etiquette className="text-white/60">{libelle}</Etiquette>
        <div className="mt-2 font-display text-[34px] font-bold text-avisdoc-coral">{valeur}</div>
        {pied && <div className="mt-1 text-[12.5px] text-white/60">{pied}</div>}
      </div>
    );
  }
  return (
    <Carte className="p-5">
      <Etiquette>{libelle}</Etiquette>
      <div className={cn("mt-2 font-display text-[34px] font-bold", accent ? "text-avisdoc-teal-ink" : "text-avisdoc-ink")}>{valeur}</div>
      {pied && <div className="mt-1 text-[12.5px] text-muted-foreground">{pied}</div>}
    </Carte>
  );
}

const CLASSES_STATUT: Record<StatutContact, string> = {
  a_qualifier: "bg-slate-100 text-slate-700",
  a_contacter: "bg-sky-100 text-sky-800",
  invite: "bg-amber-100 text-amber-800",
  accepte: "bg-emerald-100 text-emerald-800",
  en_conversation: "bg-teal-100 text-teal-800",
  partenaire: "bg-emerald-600 text-white",
  refus: "bg-rose-100 text-rose-800",
  arrete: "bg-slate-200 text-slate-600",
};

export function Statut({ statut }: { statut: StatutContact }) {
  return <Pastille className={CLASSES_STATUT[statut]}>{L.statuts[statut]}</Pastille>;
}

export function Cercle({ cercle }: { cercle: number | null | undefined }) {
  const c = cercle === 1 || cercle === 2 || cercle === 3 ? cercle : 0;
  return <Pastille className="bg-muted text-avisdoc-ink">{L.cerclesCourts[c]}</Pastille>;
}

export function Score({ total }: { total: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 font-display text-lg font-bold text-avisdoc-ink">
      {total}
      <span className="text-[11px] font-semibold text-muted-foreground">{L.commun.points}</span>
    </span>
  );
}

export function Tableau({ entetes, children }: { entetes: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            {entetes.map((e) => <th key={e} className="px-3 py-2.5 font-bold">{e}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
