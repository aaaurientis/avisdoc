import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import LegalLayout from "@/components/LegalLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Droit d’opposition à la prospection : page cible du lien présent dans chaque
 * email. Le jeton est un identifiant opaque propre au contact ; l’opposition
 * alimente la liste d’exclusion (définitive) et supprime la fiche.
 */
const ProspectionOpposition = () => {
  const [params] = useSearchParams();
  const jeton = params.get("jeton") ?? "";
  const [etat, setEtat] = useState<"attente" | "envoi" | "fait" | "erreur">("attente");
  const [detail, setDetail] = useState("");

  const confirmer = async () => {
    setEtat("envoi");
    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("prospection-opposition", {
      body: { jeton },
    });
    if (error || !data?.ok) {
      setDetail(error?.message ?? data?.error ?? "");
      setEtat("erreur");
      return;
    }
    setEtat("fait");
  };

  return (
    <LegalLayout
      eyebrow="Protection des données"
      title="Vous opposer à toute sollicitation"
      subtitle="Un clic suffit. L’opposition est immédiate, gratuite et définitive."
      metaDescription="Exercez votre droit d’opposition à la prospection professionnelle d’AvisDoc."
      canonicalPath="/prospection-opposition"
    >
      {!jeton && (
        <section>
          <p>
            Ce lien est incomplet. Utilisez le lien d’opposition présent dans l’email que vous avez reçu,
            ou écrivez-nous via la <Link to="/contact">page de contact</Link>.
          </p>
        </section>
      )}

      {jeton && etat !== "fait" && (
        <section>
          <p>
            En confirmant, vos coordonnées professionnelles sont retirées de notre fichier de prospection
            et inscrites sur une liste d’exclusion, dans le seul but de ne plus jamais vous solliciter.
            Vous pouvez lire le détail du traitement sur la page{" "}
            <Link to="/prospection-information">d’information</Link>.
          </p>
          <div className="mt-6">
            <Button onClick={() => void confirmer()} disabled={etat === "envoi"} className="min-h-[44px]">
              {etat === "envoi" ? "Enregistrement…" : "Confirmer mon opposition"}
            </Button>
          </div>
          {etat === "erreur" && (
            <p role="alert" className="mt-4 text-destructive">
              L’opposition n’a pas pu être enregistrée. Réessayez, ou écrivez-nous via la{" "}
              <Link to="/contact">page de contact</Link>. {detail}
            </p>
          )}
        </section>
      )}

      {etat === "fait" && (
        <section>
          <h2>Opposition enregistrée</h2>
          <p>
            Vous ne serez plus sollicité par AvisDoc. Vos coordonnées ont été retirées de notre fichier et
            inscrites sur la liste d’exclusion. Merci de votre confiance.
          </p>
        </section>
      )}
    </LegalLayout>
  );
};

export default ProspectionOpposition;
