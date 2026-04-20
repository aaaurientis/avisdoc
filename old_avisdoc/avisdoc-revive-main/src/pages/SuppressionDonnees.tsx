import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Mail, CheckCircle, Shield } from "lucide-react";

const SuppressionDonnees = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !email.includes("@")) {
      toast({
        title: "Erreur",
        description: "Veuillez saisir une adresse email valide.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.functions.invoke("send-data-deletion-request", {
        body: { email },
      });

      if (error) throw error;

      setIsSubmitted(true);
    } catch (err) {
      console.error("Error:", err);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue. Veuillez réessayer ou nous contacter directement à contact@avisdoc.fr.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-20 md:pt-24">
        <div className="section-container section-padding">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="h-8 w-8 text-primary" />
              <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground">
                Suppression des données personnelles
              </h1>
            </div>

            <p className="text-muted-foreground text-lg mb-8">
              Conformément au Règlement Général sur la Protection des Données (RGPD), vous avez le droit de demander la suppression de vos données personnelles. Remplissez le formulaire ci-dessous et nous traiterons votre demande dans un délai de 30 jours.
            </p>

            {isSubmitted ? (
              <div className="bg-accent/50 border border-primary/20 rounded-2xl p-8 text-center">
                <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
                <h2 className="font-display text-2xl font-bold text-foreground mb-3">
                  Demande envoyée avec succès
                </h2>
                <p className="text-muted-foreground">
                  Votre demande de suppression de données a bien été transmise à notre équipe. Nous vous contacterons à l'adresse email indiquée dans un délai de 30 jours pour confirmer le traitement de votre demande.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-card border border-border/50 rounded-2xl p-8 shadow-soft">
                <div className="mb-6">
                  <label htmlFor="email" className="block text-sm font-semibold text-foreground mb-2">
                    Votre adresse email
                  </label>
                  <p className="text-muted-foreground text-sm mb-3">
                    Veuillez saisir l'adresse email associée à votre compte AvisDoc.
                  </p>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="votre@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="bg-muted/50 rounded-xl p-4 mb-6">
                  <h3 className="font-semibold text-foreground text-sm mb-2">Informations importantes :</h3>
                  <ul className="text-muted-foreground text-sm space-y-1">
                    <li>• Votre demande sera traitée dans un délai maximum de 30 jours.</li>
                    <li>• Nous pourrons vous demander une pièce d'identité pour vérifier votre identité.</li>
                    <li>• Certaines données peuvent être conservées pour des obligations légales.</li>
                  </ul>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full" size="lg">
                  {isLoading ? "Envoi en cours..." : "Envoyer ma demande de suppression"}
                </Button>
              </form>
            )}

            <div className="mt-8 text-center">
              <p className="text-muted-foreground text-sm">
                Vous pouvez également nous contacter directement à{" "}
                <a href="mailto:contact@avisdoc.fr" className="text-primary hover:underline">
                  contact@avisdoc.fr
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default SuppressionDonnees;
