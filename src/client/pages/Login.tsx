import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) setErreur(error.message);
    else setEnvoye(true);
  }

  return (
    <div className="mx-auto mt-24 max-w-md px-6">
      <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">AvisDoc · Espace client</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Connexion par lien envoyé à votre adresse professionnelle.
      </p>
      {envoye ? (
        <p className="mt-6 rounded-xl border border-border bg-card p-4 text-sm">
          Si <strong>{email}</strong> est déclarée pour votre entreprise, un lien de connexion vient de vous être envoyé.
        </p>
      ) : (
        <form onSubmit={envoyer} className="mt-6 space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@entreprise.fr"
            className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm outline-none focus:border-avisdoc-teal" />
          <button className="w-full rounded-xl bg-avisdoc-ink px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
            Recevoir le lien
          </button>
          {erreur && <p className="text-sm text-orange-600">{erreur}</p>}
        </form>
      )}
    </div>
  );
}
