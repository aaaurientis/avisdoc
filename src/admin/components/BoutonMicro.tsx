// Poser une question de vive voix.
//
// Le commercial est au volant entre deux rendez-vous : il ne tapera pas sa question.
// Il appuie, il parle, il appuie encore — et le texte arrive dans le champ, où il
// peut le corriger avant d'envoyer.
//
// Rien n'est conservé : contrairement à un débrief, une question dictée au volant n'a
// pas à être archivée. L'enregistrement traverse, il est transcrit, il disparaît.

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { toast } from "sonner";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { cn } from "@/lib/utils";

/** Une question, pas un compte rendu : au-delà, c'est le Débrief qu'il faut. */
const MAX_SECONDES = 60;

/** L'encodage gonfle d'un tiers : on reste bien sous ce que la fonction accepte. */
const MAX_OCTETS = 2_200_000;

async function enBase64(blob: Blob): Promise<string> {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = "";
  // Par tranches : passer 500 000 octets d'un coup à String.fromCharCode fait
  // déborder la pile d'appels sur certains navigateurs.
  for (let i = 0; i < octets.length; i += 8192) {
    binaire += String.fromCharCode(...octets.subarray(i, i + 8192));
  }
  return btoa(binaire);
}

export default function BoutonMicro({
  onTexte,
  className,
}: {
  /** Reçoit ce qui a été dit, une fois transcrit. */
  onTexte: (texte: string) => void;
  className?: string;
}) {
  const [enregistre, setEnregistre] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [secondes, setSecondes] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const morceauxRef = useRef<Blob[]>([]);
  const minuteurRef = useRef<number | null>(null);

  const arreter = () => {
    if (minuteurRef.current) window.clearInterval(minuteurRef.current);
    minuteurRef.current = null;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    r?.stream.getTracks().forEach((t) => t.stop());
    recorderRef.current = null;
    setEnregistre(false);
  };

  // Quitter l'écran en parlant ne doit pas laisser le micro ouvert.
  useEffect(() => () => arreter(), []);

  const demarrer = async () => {
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(flux);
      morceauxRef.current = [];
      setSecondes(0);

      recorder.ondataavailable = (e) => e.data.size > 0 && morceauxRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(morceauxRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1000) {
          toast.error("Rien n’a été entendu.");
          return;
        }
        if (blob.size > MAX_OCTETS) {
          toast.error("Question trop longue. Passez par le Débrief pour un compte rendu.");
          return;
        }
        setEnvoi(true);
        try {
          const { data, error } = await supabaseAdmin.functions.invoke("merx", {
            body: { action: "transcrire_question", audio: await enBase64(blob), type: blob.type },
          });
          if (error) throw new Error(error.message);
          const r = data as { texte?: string; error?: string };
          if (r.error) throw new Error(r.error);
          if (!r.texte?.trim()) throw new Error("Rien d’audible.");
          onTexte(r.texte.trim());
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "La transcription a échoué.");
        } finally {
          setEnvoi(false);
        }
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setEnregistre(true);
      minuteurRef.current = window.setInterval(() => {
        setSecondes((s) => {
          if (s + 1 >= MAX_SECONDES) arreter();
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Le micro n’est pas accessible. Autorisez-le dans les réglages du navigateur.");
    }
  };

  return (
    <button
      type="button"
      onClick={() => (enregistre ? arreter() : void demarrer())}
      disabled={envoi}
      aria-label={enregistre ? "Arrêter et transcrire" : "Poser la question de vive voix"}
      title={enregistre ? "Arrêter et transcrire" : "Poser la question de vive voix"}
      className={cn(
        "inline-flex h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-bold transition-colors disabled:opacity-60",
        enregistre
          ? "border-avisdoc-coral bg-avisdoc-coral text-white"
          : "border-border text-avisdoc-ink hover:border-avisdoc-teal",
        className,
      )}
    >
      {envoi ? (
        <Loader2 className="size-4 animate-spin" />
      ) : enregistre ? (
        <>
          <Square className="size-3.5" fill="currentColor" />
          {`0:${String(MAX_SECONDES - secondes).padStart(2, "0")}`}
        </>
      ) : (
        <Mic className="size-4" />
      )}
    </button>
  );
}
