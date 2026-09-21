// Notes dictées — ce que le commercial a dicté, au bureau.
// Pour l’instant : la liste, la réécoute et la suppression. La transcription par Merx et le
// rangement dans la fiche arrivent à l’étape suivante (il faut la clé du service de transcription).

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mic, Play, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Modal, PageHeader, SectionLabel } from "../components/ui";

interface Note {
  id: string;
  audio_path: string | null;
  duree_s: number | null;
  statut: string;
  message: string | null;
  titre: string | null;
  created_at: string;
}

const chrono = (s: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Une table absente veut dire « migration pas encore appliquée » : on le dit en français. */
function messageErreur(brut: string): string {
  return /Could not find the table|does not exist/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

export default function NotesDictees() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ecoute, setEcoute] = useState<{ id: string; url: string } | null>(null);
  const [aSupprimer, setASupprimer] = useState<Note | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    const { data, error } = await supabaseAdmin
      .from("admin_notes_dictees")
      .select("id, audio_path, duree_s, statut, message, titre, created_at")
      .order("created_at", { ascending: false });
    if (error) setErreur(messageErreur(error.message));
    else setNotes((data ?? []) as Note[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** L’audio est privé : on demande une adresse signée, valable quelques minutes. */
  const ecouter = async (note: Note) => {
    if (!note.audio_path) return;
    const { data } = await supabaseAdmin.storage.from("admin-dictee").createSignedUrl(note.audio_path, 300);
    if (data?.signedUrl) setEcoute({ id: note.id, url: data.signedUrl });
  };

  const supprimer = async (note: Note) => {
    if (note.audio_path) await supabaseAdmin.storage.from("admin-dictee").remove([note.audio_path]);
    await supabaseAdmin.from("admin_notes_dictees").delete().eq("id", note.id);
    setASupprimer(null);
    setEcoute(null);
    await charger();
  };

  return (
    <div>
      <PageHeader
        title="Notes dictées"
        subtitle={chargement ? "Chargement…" : `${notes.length} note${notes.length > 1 ? "s" : ""}`}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void charger()}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
            >
              <RefreshCw className="size-4" /> Actualiser
            </button>
            <Link
              to="/dictee"
              className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
            >
              <Mic className="size-4" /> Dicter
            </Link>
          </div>
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>Aucune note</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Ouvrez « Dicter » sur votre téléphone en sortant d’un rendez-vous. La note arrive ici, même si
            vous n’aviez pas de réseau au moment de parler.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {notes.map((note) => (
            <div key={note.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-avisdoc-ink">{note.titre ?? "Note dictée"}</div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                  {quand(note.created_at)} · {chrono(note.duree_s)}
                  {note.statut === "recue" && " · en attente de transcription"}
                  {note.statut === "echec" && ` · ${note.message ?? "échec"}`}
                </div>
              </div>
              {note.audio_path && (
                <button
                  type="button"
                  onClick={() => void ecouter(note)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                >
                  <Play className="size-4" /> Réécouter
                </button>
              )}
              <button
                type="button"
                onClick={() => setASupprimer(note)}
                aria-label="Supprimer la note"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:text-rose-700"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lecture : jamais lancée toute seule. */}
      {ecoute && (
        <Modal onClose={() => setEcoute(null)} width={420}>
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Réécouter la note</h2>
          <audio src={ecoute.url} controls className="mt-4 w-full">
            <track kind="captions" />
          </audio>
          <button
            type="button"
            onClick={() => setEcoute(null)}
            className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
          >
            Fermer
          </button>
        </Modal>
      )}

      {aSupprimer && (
        <Modal onClose={() => setASupprimer(null)} width={420}>
          <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Supprimer cette note ?</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            L’enregistrement sera effacé. Cette suppression ne se défait pas.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => void supprimer(aSupprimer)}
              className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-coral px-5 py-2.5 text-sm font-bold text-white"
            >
              <Trash2 className="size-4" /> Supprimer
            </button>
            <button
              type="button"
              onClick={() => setASupprimer(null)}
              className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Annuler
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
