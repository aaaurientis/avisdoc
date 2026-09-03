// Génération assistée d'une note d'invitation ou d'un message LinkedIn.
// Le texte revient en ÉDITION dans l'écran : rien ne part sans relecture, et
// l'envoi se fait à la main dans LinkedIn. Aucune API LinkedIn ici.
//
// Reçoit : type de compte, cercle, fonction, signaux datés, historique des
// interactions, objection attendue. Ni nom, ni email, ni donnée de santé.
// Bedrock eu-west-3 (Mistral Large ou Claude), voir _shared/bedrock.ts.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { cors, json, membreAppelant } from "../_shared/auth.ts";
import { bedrockConfigure, converser, MODELE } from "../_shared/bedrock.ts";
import { LONGUEUR_MAX, normaliser, violations, type Genre } from "../_shared/garde-fous.ts";

interface Demande {
  genre: Genre;
  typeCompte: string | null;
  cercle: number | null;
  fonction: string | null;
  niveau: string | null;
  destinataireRh: boolean;
  objectionTexte: string;
  signaux: Array<{ code: string; libelle: string; constate_le?: string; detail?: string }>;
  historique: Array<{ type: string; sens: string; survenu_le: string; contenu: string }>;
  typeEnvoi: string;
}

const SYSTEME = `Tu rédiges, en français, des messages LinkedIn de prospection B2B pour AvisDoc,
service français de téléexpertise dermatologique : une journée de repérage de lésions suspectes
sur le lieu de travail, avec avis d'un dermatologue sous 96 heures. L'employeur n'a accès à aucune
information médicale individuelle.

Règles absolues :
- vocabulaire : « repérage de lésions suspectes », jamais « dépistage du cancer », jamais « diagnostic » ;
- aucune photo ni description clinique, aucune promesse de résultat, aucun ciblage sur un critère de santé ;
- si le destinataire est une fonction RH : rappeler explicitement la confidentialité pour les salariés ;
- typographie LinkedIn : apostrophe droite ('), espace simple avant ? ! : ;, aucun tiret cadratin ;
- ton net et factuel, une seule question de clôture, pas de superlatif, pas d'emoji ;
- ne mentionne jamais un nom de personne ni une adresse email ;
- respecte la limite de caractères demandée, réponds uniquement par le texte du message.`;

function construireDemande(d: Demande, corrections: string[]): string {
  const limite = LONGUEUR_MAX[d.genre];
  const signaux = d.signaux.length
    ? d.signaux.map((s) => `- ${s.code} ${s.libelle}${s.constate_le ? ` (constaté le ${s.constate_le})` : ""}${s.detail ? ` : ${s.detail}` : ""}`).join("\n")
    : "- aucun signal daté";
  const historique = d.historique.length
    ? d.historique.slice(0, 6).map((h) => `- ${h.survenu_le.slice(0, 10)} ${h.sens} ${h.type} : ${h.contenu.slice(0, 160)}`).join("\n")
    : "- première prise de contact";
  return [
    `Genre : ${d.genre === "invitation" ? "note d'invitation LinkedIn" : "message LinkedIn"} (${d.typeEnvoi}), ${limite} caractères maximum.`,
    `Type de compte : ${d.typeCompte ?? "inconnu"}. Cercle de cible : ${d.cercle ?? "inconnu"}.`,
    `Fonction du destinataire : ${d.fonction ?? "inconnue"} (niveau ${d.niveau ?? "inconnu"}). Fonction RH : ${d.destinataireRh ? "oui" : "non"}.`,
    `Objection attendue à désamorcer : ${d.objectionTexte}`,
    `Signaux datés :\n${signaux}`,
    `Historique des échanges :\n${historique}`,
    corrections.length ? `La proposition précédente a été refusée pour : ${corrections.join(", ")}. Corrige-la.` : "",
  ].filter(Boolean).join("\n\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);

  const membre = await membreAppelant(req);
  if (!membre) return json({ error: "réservé aux comptes @avisdoc.fr" }, 403);
  if (!bedrockConfigure()) return json({ error: "Bedrock non configuré (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)" }, 503);

  const d = (await req.json().catch(() => null)) as Demande | null;
  if (!d || (d.genre !== "invitation" && d.genre !== "message")) return json({ error: "demande invalide" }, 400);

  try {
    let texte = normaliser(await converser(SYSTEME, construireDemande(d, [])));
    let refus = violations(texte, d.genre, d.destinataireRh);
    if (refus.length) {
      texte = normaliser(await converser(SYSTEME, construireDemande(d, refus)));
      refus = violations(texte, d.genre, d.destinataireRh);
    }
    // Le texte est renvoyé même imparfait : l'écran affiche les violations et
    // bloque « Copier » / « Marquer comme envoyé » tant qu'elles subsistent.
    return json({ texte, modele: MODELE, violations: refus });
  } catch (e) {
    return json({ error: "génération indisponible", detail: String(e instanceof Error ? e.message : e).slice(0, 300) }, 502);
  }
});
