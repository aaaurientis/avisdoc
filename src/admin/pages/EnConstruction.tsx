// Écran « squelette » — la place est réservée dans le menu, le contenu arrive
// en phase B. On réutilise le même composant pour toutes les pages à venir
// (Veille à démarcher et Veille Marché), chacune avec son titre.
import { Hammer } from "lucide-react";
import { Card, PageHeader } from "../components/ui";

export default function EnConstruction({ titre, sousTitre }: { titre: string; sousTitre?: string }) {
  return (
    <div>
      <PageHeader title={titre} subtitle={sousTitre} />
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <Hammer className="size-8 text-avisdoc-coral" />
        <p className="max-w-md text-sm text-muted-foreground">
          Cet écran arrive bientôt. La structure du menu est en place&nbsp;; le
          contenu sera ajouté prochainement.
        </p>
      </Card>
    </div>
  );
}
