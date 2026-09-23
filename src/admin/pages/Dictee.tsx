// Dictée — l’écran de téléphone : un gros bouton, on parle, ça part.
// L’audio est déposé directement dans le compartiment privé `admin-dictee` (aucune limite de taille
// d’envoi, contrairement à un passage par une fonction), et la note est créée en base.
// Sans réseau, la note attend sur l’appareil et part dès que la connexion revient.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, Square, WifiOff } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { garder, listerEnAttente, oublier, type NoteEnAttente } from "./dictee/store";
import { cn } from "@/lib/utils";
import BoutonRetour from "../components/BoutonRetour";

// Deux limites, pour deux dangers différents.
//
// LA TAILLE est la vraie contrainte technique : le service de transcription refuse
// au-delà de 25 Mo. On s'arrête à 24, et la barrière tient quel que soit l'appareil —
// un iPhone enregistre en AAC, un Android en Opus, et le même quart d'heure ne pèse
// pas du tout pareil.
const MAX_OCTETS = 24_000_000;

// LA DURÉE ne protège pas la transcription — 25 Mo, c'est plus d'une heure de parole —
// mais la dictée oubliée : le téléphone qui retourne dans la poche sans qu'on ait
// appuyé sur stop et qui enregistre tout le trajet de retour. On le transcrirait, et
// on le paierait. (3 min à l'origine, porté à 10 le 22/09.)
const DUREE_MAX_S = 600;
const ALERTE_S = DUREE_MAX_S - 30; // on prévient trente secondes avant l'arrêt

const chrono = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function Dictee() {
  const { user } = useAuth();
  const [enregistre, setEnregistre] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const [octets, setOctets] = useState(0);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [enAttente, setEnAttente] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  /** Ce que pèse l'enregistrement en cours : c'est la limite qui compte vraiment. */
  const octetsRef = useRef(0);
  const morceauxRef = useRef<Blob[]>([]);
  const minuteurRef = useRef<number | null>(null);
  const secondesRef = useRef(0);

  /** Envoie une note : l’audio dans le compartiment, puis la ligne en base. */
  const envoyer = useCallback(
    async (note: NoteEnAttente): Promise<boolean> => {
      const email = user?.email;
      if (!email) return false;
      const chemin = `${email.toLowerCase()}/${note.id}.webm`;
      const { error: erreurFichier } = await supabaseAdmin.storage
        .from("admin-dictee")
        .upload(chemin, note.blob, { contentType: note.blob.type || "audio/webm", upsert: true });
      if (erreurFichier) return false;
      const { error: erreurLigne } = await supabaseAdmin.from("admin_notes_dictees").insert({
        id: note.id,
        owner_email: email,
        audio_path: chemin,
        duree_s: note.dureeS,
      });
      // Une note déjà envoyée (même identifiant) n’est pas une erreur : elle est simplement arrivée.
      if (erreurLigne && !erreurLigne.message.includes("duplicate")) return false;
      return true;
    },
    [user?.email],
  );

  /** Rattrape ce qui attend sur l’appareil. */
  const viderLaFile = useCallback(async () => {
    const attente = await listerEnAttente();
    setEnAttente(attente.length);
    if (!attente.length) return;
    setEnvoiEnCours(true);
    let partis = 0;
    for (const note of attente) {
      if (await envoyer(note)) {
        await oublier(note.id);
        partis++;
      }
    }
    setEnvoiEnCours(false);
    const reste = await listerEnAttente();
    setEnAttente(reste.length);
    if (partis > 0) setMessage(`${partis} note${partis > 1 ? "s envoyées" : " envoyée"}.`);
  }, [envoyer]);

  useEffect(() => {
    void viderLaFile();
    const auRetourDuReseau = () => void viderLaFile();
    window.addEventListener("online", auRetourDuReseau);
    return () => window.removeEventListener("online", auRetourDuReseau);
  }, [viderLaFile]);

  const arreter = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    if (minuteurRef.current) window.clearInterval(minuteurRef.current);
    minuteurRef.current = null;
    setEnregistre(false);
  }, []);

  const demarrer = useCallback(async () => {
    setErreur(null);
    setMessage(null);
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(flux);
      morceauxRef.current = [];
      secondesRef.current = 0;
      octetsRef.current = 0;
      setSecondes(0);
      setOctets(0);

      octetsRef.current = 0;
      recorder.ondataavailable = (e) => {
        if (e.data.size === 0) return;
        morceauxRef.current.push(e.data);
        octetsRef.current += e.data.size;
        setOctets(octetsRef.current);
        // On arrête AVANT de dépasser : un fichier trop lourd serait refusé à la
        // transcription, et tout le récit serait perdu.
        if (octetsRef.current >= MAX_OCTETS) {
          setMessage("Enregistrement arrêté : la taille maximale est atteinte. Vous pouvez en redicter un autre.");
          arreter();
        }
      };
      recorder.onstop = async () => {
        const blob = new Blob(morceauxRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1000) {
          setErreur("Rien n’a été enregistré.");
          return;
        }
        const note: NoteEnAttente = { id: crypto.randomUUID(), blob, dureeS: secondesRef.current, creeeLe: Date.now() };
        // On garde d’abord sur l’appareil : même si l’envoi échoue, la note est en sécurité.
        await garder(note);
        setEnAttente((n) => n + 1);
        setEnvoiEnCours(true);
        const parti = await envoyer(note);
        setEnvoiEnCours(false);
        if (parti) {
          await oublier(note.id);
          setEnAttente((n) => Math.max(0, n - 1));
          setMessage(`Note de ${chrono(note.dureeS)} envoyée.`);
        } else {
          setMessage("Pas de réseau : la note est gardée sur l’appareil, elle partira toute seule.");
        }
      };

      recorder.start(1000); // un morceau par seconde : rien ne se perd si l’onglet se ferme
      recorderRef.current = recorder;
      setEnregistre(true);
      minuteurRef.current = window.setInterval(() => {
        secondesRef.current += 1;
        setSecondes(secondesRef.current);
        if (secondesRef.current >= DUREE_MAX_S) arreter();
      }, 1000);
    } catch {
      setErreur("Le micro n’est pas accessible. Autorisez-le dans les réglages du navigateur.");
    }
  }, [arreter, envoyer]);

  useEffect(() => () => arreter(), [arreter]);

  const presqueFini = enregistre && secondes >= ALERTE_S;
  /** Passé les trois quarts, la taille mérite d'être annoncée. */
  const lourd = enregistre && octets >= MAX_OCTETS * 0.75;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col px-5 py-8">
      {/* Au même endroit que sur le Débrief écrit : en haut à droite. */}
      <div className="mb-6 flex justify-end">
        <BoutonRetour vers="/debrief" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
      <h1 className="font-display text-3xl font-semibold text-avisdoc-ink">Dictée</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dictez votre compte rendu en sortant du rendez-vous. Merx le relira et le rangera dans la bonne fiche.
      </p>

      {/* Le bouton */}
      <button
        type="button"
        onClick={() => (enregistre ? arreter() : void demarrer())}
        disabled={envoiEnCours}
        className={cn(
          "mt-10 flex size-40 items-center justify-center rounded-full text-white shadow-raised transition-transform active:scale-95 disabled:opacity-60",
          enregistre ? "bg-avisdoc-coral" : "bg-avisdoc-teal",
        )}
        aria-label={enregistre ? "Arrêter l’enregistrement" : "Commencer à dicter"}
      >
        {envoiEnCours ? (
          <Loader2 className="size-14 animate-spin" />
        ) : enregistre ? (
          <Square className="size-12" fill="currentColor" />
        ) : (
          <Mic className="size-16" />
        )}
      </button>

      <div className="mt-6 h-12">
        {enregistre ? (
          <>
            <div className={cn("font-mono text-3xl font-bold", presqueFini ? "text-avisdoc-coral" : "text-avisdoc-ink")}>
              {chrono(secondes)}
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              {/* La taille ne se montre qu'au moment où elle devient un sujet : l'annoncer
                  plus tôt ferait douter sans raison. */}
              {lourd
                ? `${(octets / 1_000_000).toFixed(1)} Mo sur ${MAX_OCTETS / 1_000_000} — arrêt automatique à la limite`
                : presqueFini
                  ? `Arrêt automatique à ${chrono(DUREE_MAX_S)}`
                  : "Appuyez pour arrêter"}
            </div>
          </>
        ) : envoiEnCours ? (
          <div className="text-[13px] font-semibold text-muted-foreground">Envoi en cours…</div>
        ) : (
          <div className="text-[13px] text-muted-foreground">{Math.round(DUREE_MAX_S / 60)} minutes au plus</div>
        )}
      </div>

      {message && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-2 text-[13px] font-semibold text-emerald-700">
          <Check className="size-4" /> {message}
        </div>
      )}
      {erreur && (
        <div className="mt-2 rounded-2xl bg-rose-50 px-4 py-2 text-[13px] font-semibold text-rose-700">{erreur}</div>
      )}
      {enAttente > 0 && !envoiEnCours && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-4 py-2 text-[13px] font-semibold text-amber-800">
          <WifiOff className="size-4" /> {enAttente} note{enAttente > 1 ? "s" : ""} en attente de réseau
        </div>
      )}

      </div>
    </div>
  );
}
