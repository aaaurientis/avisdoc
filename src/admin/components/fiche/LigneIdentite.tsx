// L'identité officielle sous l'en-tête : SIREN, raison sociale, siège. La même ligne
// sur les trois fiches, tirée de la fiche de prospection quand il y en a une.

import type { Prospect } from "../../lib/merx";

export default function LigneIdentite({
  prospect,
  siren,
  adresse,
}: {
  prospect: Prospect | null;
  /** Repli quand l'entreprise n'est jamais passée par Merx (affaire saisie à la main). */
  siren?: string | null;
  adresse?: string | null;
}) {
  const s = prospect?.siren || siren;
  const siege = prospect?.head_office;
  const lieu = siege && (siege.address || siege.city) ? [siege.address, siege.city].filter(Boolean).join(", ") : adresse;
  if (!s && !lieu) return null;
  return (
    <>
      {s && (
        <div className="text-[12.5px] text-muted-foreground">
          SIREN {s}
          {prospect?.legal_name ? ` · ${prospect.legal_name}` : ""}
          {/* La source n'est dite que quand on la connaît : celle de Merx. */}
          {prospect?.siren && (
            <>
              {" "}— <span className="font-bold text-avisdoc-teal">annuaire des entreprises ✓</span>
            </>
          )}
        </div>
      )}
      {lieu && <div className="mt-0.5 text-[12.5px] text-muted-foreground">{lieu}</div>}
    </>
  );
}
