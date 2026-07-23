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
      options: {
        emailRedirectTo: window.location.origin,
        // Ne crée pas de compte pour une adresse inconnue : l'accès est réservé
        // aux utilisateurs déclarés par l'admin.
        shouldCreateUser: false,
      },
    });
    if (error) setErreur(error.message);
    else setEnvoye(true);
  }

  return (
    <div className="mx-auto mt-24 max-w-md px-6">
      <h1 className="font-serif text-2xl">AvisDoc · Espace client</h1>
      <p className="mt-2 text-ardoise">
        Connexion par lien envoyé à votre adresse professionnelle.
      </p>
      {envoye ? (
        <p className="mt-6 rounded border border-filet bg-white p-4">
          Si <strong>{email}</strong> est déclarée pour votre entreprise, un lien
          de connexion vient de vous être envoyé.
        </p>
      ) : (
        <form onSubmit={envoyer} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@entreprise.fr"
            className="w-full rounded border border-filet bg-white px-3 py-2"
          />
          <button className="w-full rounded bg-marine px-4 py-2 text-creme">
            Recevoir le lien
          </button>
          {erreur && <p className="text-sm text-orange">{erreur}</p>}
        </form>
      )}
    </div>
  );
}
