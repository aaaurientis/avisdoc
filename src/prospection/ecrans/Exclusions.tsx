// Liste d'exclusion : consultée à l'import, bloquante. Opposition définitive.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { ajouterExclusion, listerExclusions } from "../data/repo";
import type { MotifExclusion } from "../data/types";
import { Constants } from "../data/types.gen";
import { L } from "../i18n/libelles";
import { dateFr } from "../lib/format";
import { Bouton, Carte, Champ, Chargement, EnTete, Erreur, Saisie, Selection, Tableau, Vide } from "../composants/ui";

export default function Exclusions() {
  const qc = useQueryClient();
  const liste = useQuery({ queryKey: ["exclusions"], queryFn: listerExclusions });
  const [linkedin, setLinkedin] = useState("");
  const [email, setEmail] = useState("");
  const [motif, setMotif] = useState<MotifExclusion>("client_existant");
  const refLinkedin = useRef<HTMLInputElement>(null);

  const ajouter = useMutation({
    mutationFn: () => ajouterExclusion({ linkedin_url: linkedin.trim() || null, email: email.trim() || null, motif }),
    onSuccess: () => { toast.success(L.exclusions.ajoutee); setLinkedin(""); setEmail(""); void qc.invalidateQueries({ queryKey: ["exclusions"] }); },
  });

  const vide = !linkedin.trim() && !email.trim();

  return (
    <div>
      <EnTete titre={L.exclusions.titre} sousTitre={L.exclusions.sousTitre} />
      <Carte className="mb-5 p-[22px]">
        <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">{L.exclusions.ajouter}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Champ libelle={L.exclusions.linkedinUrl}><Saisie ref={refLinkedin} value={linkedin} onChange={(e) => setLinkedin(e.target.value)} /></Champ>
          <Champ libelle={L.exclusions.email}><Saisie type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Champ>
          <Champ libelle={L.exclusions.motif}>
            <Selection value={motif} onChange={(e) => setMotif(e.target.value as MotifExclusion)}>
              {Constants.prospection.Enums.motif_exclusion.map((m) => <option key={m} value={m}>{L.motifsExclusion[m]}</option>)}
            </Selection>
          </Champ>
        </div>
        <Erreur erreur={ajouter.error} className="mt-3" />
        <div className="mt-4">
          <Bouton
            principal
            libelle={L.exclusions.ajouter}
            onClick={() => ajouter.mutate()}
            chargement={ajouter.isPending}
            motifInactif={vide ? { texte: L.exclusions.motifAucunIdentifiant, action: () => refLinkedin.current?.focus() } : null}
          />
        </div>
      </Carte>

      <Carte className="p-2">
        <h2 className="px-3 py-2 font-display text-lg font-semibold text-avisdoc-ink">{L.exclusions.liste}</h2>
        <Erreur erreur={liste.error} className="m-3" />
        {liste.isPending ? <Chargement /> : (liste.data ?? []).length === 0 ? <Vide texte={L.exclusions.vide} /> : (
          <Tableau entetes={[L.exclusions.linkedinUrl, L.exclusions.email, L.exclusions.motif, L.exclusions.date]}>
            {(liste.data ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5 text-avisdoc-ink">{e.linkedin_url}</td>
                <td className="px-3 py-2.5 text-avisdoc-ink">{e.email}</td>
                <td className="px-3 py-2.5">{L.motifsExclusion[e.motif]}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{dateFr(e.cree_le)}</td>
              </tr>
            ))}
          </Tableau>
        )}
      </Carte>
    </div>
  );
}
