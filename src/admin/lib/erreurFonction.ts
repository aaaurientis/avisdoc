// Le message qu'une fonction serveur a vraiment renvoyé.
//
// Quand une fonction répond en erreur (4xx, 5xx), supabase-js ne donne que
// « Edge Function returned a non-2xx status code » : le message utile est dans
// le corps de la réponse, qu'il faut lire soi-même.

import { FunctionsHttpError } from "@supabase/supabase-js";

export async function messageErreurFonction(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const reponse = error.context as Response | undefined;
    const statut = reponse?.status;
    try {
      const corps = await reponse?.clone().json();
      if (typeof corps?.error === "string" && corps.error) return corps.error;
    } catch {
      // Corps absent ou pas en JSON : la fonction n'a pas démarré, ou l'hébergeur a coupé.
    }
    if (statut === 401) return "Votre session a expiré : reconnectez-vous.";
    if (statut === 403) return "Votre compte n'a pas accès à cette fonction : prévenez un administrateur.";
    if (statut === 504 || statut === 546) return "Le serveur a mis trop de temps à répondre. Réessayez.";
    return `Le serveur a répondu une erreur${statut ? ` (${statut})` : ""}. Réessayez.`;
  }
  return error instanceof Error ? error.message : String(error);
}
