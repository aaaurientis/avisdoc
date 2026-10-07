import { useState } from "react";
import { toast } from "sonner";
import { portalRepo } from "../lib/repo";

export default function Bienvenue() {
  const [email, setEmail] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [envoye, setEnvoye] = useState(false);

  const recevoir = async () => {
    if (!email.includes("@")) {
      toast.error("E-mail invalide.");
      return;
    }
    setEnvoi(true);
    try {
      await portalRepo.renvoyerLien(email.trim().toLowerCase());
      setEnvoye(true);
    } catch (e) {
      console.error(e);
      // On ne révèle pas si le dossier existe.
      setEnvoye(true);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">
        Votre inscription AvisDoc
      </h1>
      <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
        Finalisez votre inscription comme infirmière requérante. Comptez environ
        10 minutes : vérification de votre RPPS, dépôt de votre attestation de
        responsabilité civile et de votre attestation URSSAF, puis signature du
        contrat. Vos pièces ne sont consultées que par l'équipe AvisDoc.
      </p>

      {envoye ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-[14px] text-avisdoc-ink shadow-soft">
          Si un dossier existe pour cette adresse, un lien de connexion vient d'y
          être envoyé. Ouvrez-le depuis votre boîte e-mail (pensez aux spams).
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-2 text-[13px] font-semibold text-avisdoc-ink">
            Recevoir mon lien de connexion
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="email"
              inputMode="email"
              className="rounded-xl border border-border bg-card px-4 py-3 text-[15px] outline-none transition-colors focus:border-avisdoc-teal"
              placeholder="votre e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && recevoir()}
            />
            <button
              type="button"
              onClick={() => void recevoir()}
              disabled={envoi}
              className="rounded-full bg-avisdoc-ink px-5 py-3 text-[15px] font-bold text-white transition-colors disabled:opacity-60"
            >
              {envoi ? "Envoi…" : "Recevoir mon lien"}
            </button>
          </div>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Vous avez déjà reçu un e-mail d'invitation ? Ouvrez simplement le lien
            qu'il contient.
          </p>
        </div>
      )}
    </div>
  );
}
