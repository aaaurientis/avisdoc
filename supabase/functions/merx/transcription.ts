// Transformer la voix en texte, avant que Merx ne la lise.
//
// Claude ne sait pas écouter : il lit du texte. Il faut donc un service qui transcrive
// l'enregistrement d'abord. On reprend le montage éprouvé sur DictaDoc — même modèle,
// mêmes pièges déjà rencontrés là-bas.

const MODELE = "gpt-4o-transcribe";

// Ce qu'on dicte ici : des comptes rendus de rendez-vous commerciaux. Le donner au
// modèle l'aide sur les noms d'entreprises et le vocabulaire du métier.
const CONTEXTE =
  "Compte rendu dicté par un commercial d'AvisDoc après un rendez-vous : noms d'entreprises, " +
  "interlocuteurs, objections entendues, arguments qui ont porté, actions à faire ensuite.";

/** Le service refuse au-delà de 25 Mo ; l'enregistreur s'arrête à 24. */
const MAX_OCTETS = 25_000_000;

const EXTENSIONS: Record<string, string> = {
  "audio/mp4": "m4a", // iPhone
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/webm": "webm", // Android et ordinateur
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const extension = (mime: string): string => EXTENSIONS[mime.split(";")[0].trim().toLowerCase()] ?? "m4a";

/** Pour comparer un texte à un autre sans buter sur la ponctuation ni les accents. */
const nu = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Transcrit un enregistrement. Lève une erreur en français, lisible par le commercial :
 * ces messages sont enregistrés sur la note et s'affichent à l'écran.
 */
export async function transcrire(audio: Blob, cle: string): Promise<string> {
  if (audio.size > MAX_OCTETS) {
    throw new Error("L'enregistrement est trop lourd pour être transcrit. Redictez-le en plusieurs fois.");
  }

  const form = new FormData();
  form.append("model", MODELE);
  // Le format se lit à l'extension du fichier : sans elle, le service refuse.
  form.append("file", audio, `debrief.${extension(audio.type)}`);
  form.append("language", "fr");
  form.append("prompt", CONTEXTE);

  const rep = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${cle}` },
    body: form,
    // Large : dix minutes d'audio prennent du temps à traverser.
    signal: AbortSignal.timeout(120_000),
  }).catch((e: unknown) => {
    throw new Error(
      e instanceof Error && e.name === "TimeoutError"
        ? "La transcription n'a pas répondu à temps. Réessayez."
        : "Le service de transcription est injoignable.",
    );
  });

  if (!rep.ok) {
    throw new Error(
      rep.status === 401
        ? "La clé OpenAI a été refusée."
        : rep.status === 403 || rep.status === 404
          ? "Cette clé OpenAI n'a pas accès au modèle de transcription."
          : rep.status === 429
            ? "Crédit OpenAI épuisé, ou trop de demandes à la fois."
            : `Transcription : réponse HTTP ${rep.status}.`,
    );
  }

  const texte = ((await rep.json()) as { text?: string }).text?.trim();

  // Sur un enregistrement vide, le modèle RECOPIE la consigne qu'on lui a donnée au
  // lieu de rendre un texte. Constaté sur AvisDoc le 14/09 : sans ce garde-fou, on
  // rangeait la consigne comme si c'était le compte rendu du commercial.
  if (!texte || nu(texte).includes(nu(CONTEXTE).slice(0, 60))) {
    throw new Error("Rien d'audible dans cet enregistrement.");
  }
  return texte;
}
