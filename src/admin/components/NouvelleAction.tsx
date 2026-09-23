// Poser une action au planning, sans passer par une fiche.
//
// Une journée de commercial ne se résume pas à ses entreprises : préparer une tournée,
// rappeler un fournisseur, passer au salon du BTP. Sans ces lignes-là, le planning
// ment sur ce qu'il y a vraiment à faire.
//
// On peut la rattacher à une entreprise si elle en concerne une — elle apparaît alors
// aussi dans sa fiche —, mais ce n'est pas obligatoire : c'est tout l'objet de cet écran.

import { useEffect, useState } from "react";
import { CalendarClock, Loader2, Mail, Phone } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Modal, SectionLabel } from "./ui";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { ajouterEchange, type GenreEchange } from "../lib/echanges";
import { LIBELLE, type Origine } from "../lib/corbeille";
import { cn } from "@/lib/utils";

// Les trois genres que le planning affiche. Une note n'y a pas sa place : c'est un
// compte rendu de ce qui s'est passé, pas quelque chose à faire.
const GENRES: { valeur: GenreEchange; label: string; icone: typeof Phone; aide: string }[] = [
  { valeur: "appel", label: "Appel", icone: Phone, aide: "Qui appeler, et pourquoi." },
  { valeur: "rdv", label: "Rendez-vous", icone: CalendarClock, aide: "Le lieu, l’objet, ce qui s’y joue." },
  { valeur: "email", label: "E-mail", icone: Mail, aide: "Le message à écrire, et à qui." },
];

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

/** L'heure ronde qui vient : on propose, on ne fait pas saisir. */
const prochaineHeure = () => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toTimeString().slice(0, 5);
};

/** Une même entreprise peut exister en prospect ET en affaire : on dit d'où vient chacune. */
interface Fiche {
  cle: string;
  id: string;
  nom: string;
  origine: Extract<Origine, "prospect" | "affaire" | "client">;
}

export default function NouvelleAction({
  jour,
  onClose,
  onFait,
}: {
  /** Le jour de la semaine affichée : on évite de faire ressaisir une date qu'on connaît. */
  jour: Date;
  onClose: () => void;
  onFait: () => Promise<void> | void;
}) {
  const { user } = useAuth();
  const [genre, setGenre] = useState<GenreEchange>("appel");
  const [titre, setTitre] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(() => jour.toLocaleDateString("sv-SE"));
  const [heure, setHeure] = useState(prochaineHeure);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [choix, setChoix] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Les entreprises auxquelles on PEUT rattacher, si on le souhaite.
  useEffect(() => {
    let vivant = true;
    void (async () => {
      const [affaires, prospects, clients] = await Promise.all([
        supabaseAdmin.from("admin_clients").select("id, company").is("deleted_at", null).order("company"),
        supabaseAdmin.from("admin_prospects").select("id, name").is("deleted_at", null).order("name"),
        supabaseAdmin.from("admin_accounts").select("id, name").is("deleted_at", null).order("name"),
      ]);
      if (!vivant) return;
      setFiches([
        ...((affaires.data ?? []) as { id: string; company: string }[]).map((x) => ({
          cle: `affaire:${x.id}`, id: x.id, nom: x.company, origine: "affaire" as const,
        })),
        ...((prospects.data ?? []) as { id: string; name: string }[]).map((x) => ({
          cle: `prospect:${x.id}`, id: x.id, nom: x.name, origine: "prospect" as const,
        })),
        ...((clients.data ?? []) as { id: string; name: string }[]).map((x) => ({
          cle: `client:${x.id}`, id: x.id, nom: x.name, origine: "client" as const,
        })),
      ]);
    })();
    return () => {
      vivant = false;
    };
  }, []);

  const choisi = GENRES.find((g) => g.valeur === genre)!;

  const enregistrer = async () => {
    if (!titre.trim() || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const fiche = fiches.find((f) => f.cle === choix);
      await ajouterEchange(
        fiche
          ? {
              prospectId: fiche.origine === "prospect" ? fiche.id : null,
              clientId: fiche.origine === "affaire" ? fiche.id : null,
              accountId: fiche.origine === "client" ? fiche.id : null,
            }
          : {},
        { kind: genre, titre, detail, au: new Date(`${date}T${heure}:00`).toISOString(), par: user?.email ?? "" },
      );
      await onFait();
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "L’action n’a pas pu être enregistrée.";
      setErreur(
        /admin_echanges_une_seule_fiche/.test(m)
          ? "Une action sans entreprise attend la migration 0038 : collez-la dans le SQL Editor."
          : m,
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={onClose} width={520}>
      <h2 className="font-display text-xl font-semibold text-avisdoc-ink">Ajouter au planning</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Une entreprise si elle en concerne une, ou rien du tout — préparer une tournée compte aussi.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {GENRES.map((g) => {
          const Icone = g.icone;
          return (
            <button
              key={g.valeur}
              type="button"
              onClick={() => setGenre(g.valeur)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-bold transition-colors",
                genre === g.valeur
                  ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                  : "border-border text-avisdoc-ink hover:border-avisdoc-teal",
              )}
            >
              <Icone className="size-3.5" /> {g.label}
            </button>
          );
        })}
      </div>

      <label className="mt-4 block">
        <SectionLabel>Ce qu’il faut faire</SectionLabel>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{choisi.aide}</p>
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          autoFocus
          placeholder="Préparer la tournée de jeudi, passer au salon du BTP…"
          className={cn(champCls, "mt-1.5")}
        />
      </label>

      <label className="mt-3 block">
        <SectionLabel>Le détail, si besoin</SectionLabel>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} className={cn(champCls, "mt-1 resize-none")} />
      </label>

      <label className="mt-3 block">
        <SectionLabel>Pour quelle entreprise ?</SectionLabel>
        <select value={choix} onChange={(e) => setChoix(e.target.value)} className={cn(champCls, "mt-1")}>
          <option value="">Aucune — c’est une action à moi</option>
          {fiches.map((f) => (
            <option key={f.cle} value={f.cle}>
              {f.nom} — {LIBELLE[f.origine]}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          Le
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(champCls, "w-auto")} />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
          à
          <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} className={cn(champCls, "w-auto")} />
        </label>
      </div>

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={!titre.trim() || envoi}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />} Ajouter au planning
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
        >
          Annuler
        </button>
      </div>
    </Modal>
  );
}
