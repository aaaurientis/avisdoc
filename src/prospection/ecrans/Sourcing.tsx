// Sourcing : jeux de filtres Sales Navigator par cercle, à copier dans l'outil.
// L'export CSV d'une liste Sales Navigator est la seule entrée LinkedIn.
import { useState } from "react";
import { toast } from "@/components/ui/sonner";
import { pr70JeuxDeFiltres, pr71TexteJeuDeFiltres } from "../domaine/jeuxDeFiltres";
import { pr31ObjectionAttendue } from "../domaine/gardeFousMessage";
import { L } from "../i18n/libelles";
import { copier } from "../lib/navigateur";
import { Bouton, Carte, Cercle, Champ, EnTete, Etiquette, LienPrincipal, Saisie } from "../composants/ui";

export default function Sourcing() {
  const [region, setRegion] = useState("Grand Est");
  const jeux = pr70JeuxDeFiltres(region);

  return (
    <div>
      <EnTete titre={L.sourcing.titre} sousTitre={L.sourcing.sousTitre} action={<LienPrincipal to="/import" libelle={L.sourcing.versImport} />} />
      <Carte className="mb-5 flex flex-wrap items-end gap-4 p-4">
        <div className="w-64">
          <Champ libelle={L.sourcing.region}><Saisie value={region} onChange={(e) => setRegion(e.target.value)} /></Champ>
        </div>
        <p className="flex-1 text-[12.5px] text-muted-foreground">{L.sourcing.rappel}</p>
      </Carte>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {jeux.map((j) => (
          <Carte key={j.cle} className="p-[22px]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-avisdoc-ink">{L.sourcing.cles[j.cle]}</h2>
                <div className="mt-1 text-[12px] text-muted-foreground">{L.typesCompte[j.typeCompte]}</div>
              </div>
              <Cercle cercle={j.cercle} />
            </div>
            <dl className="mb-4 grid grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
              {j.filtres.map((f) => (
                <div key={f.champ} className="contents">
                  <dt className="font-semibold text-avisdoc-ink">{f.champ}</dt>
                  <dd className="text-muted-foreground">{f.valeurs.join(", ")}</dd>
                </div>
              ))}
            </dl>
            <div className="mb-4 rounded-xl bg-muted px-4 py-3 text-[12.5px]">
              <Etiquette>{L.sourcing.objection}</Etiquette>
              <div className="mt-1 text-avisdoc-ink">{L.objections[pr31ObjectionAttendue(j.typeCompte, j.cercle)]}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[12px] text-muted-foreground">
                {L.sourcing.listeSuggeree} : <span className="font-semibold text-avisdoc-ink">{j.listeSuggeree}</span>
              </div>
              <Bouton libelle={L.sourcing.copierJeu} onClick={() => void copier(pr71TexteJeuDeFiltres(j)).then((ok) => ok && toast.success(L.commun.copie))} />
            </div>
          </Carte>
        ))}
      </div>
    </div>
  );
}
