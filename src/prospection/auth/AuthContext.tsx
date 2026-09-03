// Authentification du module : SSO Google sur le projet VITRINE, restreint
// au domaine @avisdoc.fr côté client ET côté serveur (RLS prospection.est_membre()).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authentification } from "../data/repo";
import { estEmailAutorise } from "../lib/config";
import { nomDepuisEmail } from "../lib/format";
import { L } from "../i18n/libelles";

export type Utilisateur = { nom: string; email: string };
type Statut = "chargement" | "connecte" | "anonyme";

type Valeur = {
  statut: Statut;
  utilisateur: Utilisateur | null;
  erreur: string | null;
  connecter: () => Promise<void>;
  deconnecter: () => Promise<void>;
};

const Ctx = createContext<Valeur | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [statut, setStatut] = useState<Statut>("chargement");
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    const appliquer = (email: string | undefined, meta: Record<string, unknown> | undefined) => {
      if (!actif) return;
      if (!email) { setUtilisateur(null); setStatut("anonyme"); return; }
      if (!estEmailAutorise(email)) {
        setErreur(L.connexion.erreurDomaine);
        void authentification.deconnecter();
        setUtilisateur(null); setStatut("anonyme");
        return;
      }
      const nom = (meta?.full_name as string | undefined) || (meta?.name as string | undefined) || nomDepuisEmail(email);
      setUtilisateur({ nom, email });
      setStatut("connecte");
    };
    authentification.session()
      .then((s) => appliquer(s?.user.email, s?.user.user_metadata))
      .catch((e: unknown) => { if (actif) { setErreur(e instanceof Error ? e.message : String(e)); setStatut("anonyme"); } });
    const arreter = authentification.surChangement((s) => appliquer(s?.user.email, s?.user.user_metadata));
    return () => { actif = false; arreter(); };
  }, []);

  const connecter = useCallback(async () => {
    setErreur(null);
    try {
      await authentification.connecter(window.location.origin + window.location.pathname);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const deconnecter = useCallback(async () => {
    await authentification.deconnecter();
    setUtilisateur(null);
    setStatut("anonyme");
  }, []);

  const valeur = useMemo<Valeur>(() => ({ statut, utilisateur, erreur, connecter, deconnecter }), [statut, utilisateur, erreur, connecter, deconnecter]);
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useAuth(): Valeur {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth hors AuthProvider");
  return v;
}
