// Ajouter un prospect à la main, ou corriger une fiche : la fiche complète.
//
// Olivier (19/10) : « je l'enregistre, c'est moi qui l'enregistre, c'est mon
// prospect ». Une fiche saisie ici n'est jamais complétée d'office par Merx ; on le
// lui demande depuis la fiche, avec « Enrichir par Merx ».

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { Modal } from "../../components/ui";
import FormulaireFiche from "../../components/fiche/FormulaireFiche";
import { chargerMembres } from "../../lib/membres";
import { colonnesProspect, erreurSaisie, fermerSiRienAPerdre, FICHE_VIDE, saisieDepuisProspect, type FicheSaisie } from "../../lib/fiche-saisie";
import type { Prospect } from "../../lib/merx";
import { lancerApprofondissement } from "../../lib/merx-appels";

export default function NouveauProspect({
  fiche,
  onClose,
  onCree,
}: {
  /** Présente quand on modifie une fiche existante ; absente à la création. */
  fiche?: Prospect;
  onClose: () => void;
  onCree: () => Promise<void>;
}) {
  const { user } = useAuth();
  const [saisie, setSaisie] = useState<FicheSaisie>(() =>
    fiche ? saisieDepuisProspect(fiche) : { ...FICHE_VIDE, referent: user?.email ?? "" },
  );
  const [initiale] = useState(saisie);
  const fermer = () => void fermerSiRienAPerdre(initiale, saisie, onClose);
  const [membres, setMembres] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState<false | "simple" | "merx">(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    void chargerMembres().then(setMembres);
  }, []);

  /** `avecMerx` : la fiche enregistrée, Merx est lancé dessus (Olivier, 19/10). */
  const enregistrer = async (avecMerx = false) => {
    if (envoi) return;
    const souci = erreurSaisie(saisie);
    if (souci) return setErreur(souci);
    setEnvoi(avecMerx ? "merx" : "simple");
    setErreur(null);
    try {
      const valeurs = colonnesProspect(saisie, fiche);
      const { data, error } = fiche
        ? await supabaseAdmin.from("admin_prospects").update(valeurs).eq("id", fiche.id).select("id").single()
        : await supabaseAdmin.from("admin_prospects").insert({ ...valeurs, owner_email: user?.email ?? "" }).select("id").single();
      if (error) throw new Error(error.message);
      if (avecMerx && data?.id) {
        // La fiche est enregistrée quoi qu'il arrive : si Merx ne peut pas partir, on le
        // dit et on ferme (rester ouvert inviterait à créer la fiche une seconde fois).
        await lancerApprofondissement(data.id as string).catch((e) =>
          toast.error(`Fiche enregistrée, mais Merx n’a pas pu être lancé (${e instanceof Error ? e.message : "erreur"}). Relancez-le depuis la fiche.`),
        );
      }
      await onCree();
      onClose();
    } catch (e) {
      const m = e instanceof Error ? e.message : "L’enregistrement a échoué.";
      setErreur(
        /duplicate key|unique/i.test(m)
          ? "Une entreprise de ce nom existe déjà dans cette ville (peut-être à la corbeille) : cherchez-la dans la liste."
          : m,
      );
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={fermer} width={640}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{fiche ? `Modifier ${fiche.name}` : "Ajouter un prospect"}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {fiche
              ? "Ce que vous écrivez ici prime sur ce que Merx avait trouvé."
              : "Seul le nom est nécessaire. Rien n’est ajouté par Merx tant que vous ne cliquez pas sur « Enrichir par Merx » dans la fiche."}
          </p>
        </div>
        <button type="button" onClick={fermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      <FormulaireFiche valeur={saisie} onChange={setSaisie} membres={membres} />

      {erreur && <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-5 flex gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={Boolean(envoi)}
          className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {envoi === "simple" && <Loader2 className="size-4 animate-spin" />}
          {fiche ? "Enregistrer" : "Ajouter le prospect"}
        </button>
        {!fiche && (
          <button
            type="button"
            onClick={() => void enregistrer(true)}
            disabled={Boolean(envoi)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {envoi === "merx" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Ajouter et enrichir par Merx
          </button>
        )}
        <button type="button" onClick={fermer} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink">
          Annuler
        </button>
      </div>
    </Modal>
  );
}
