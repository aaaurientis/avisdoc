import { useState } from "react";
import { supabase } from "../lib/supabase";

export function Login({ connecteNonAdmin }: { connecteNonAdmin: boolean }) {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) setErreur(error.message);
    else setEnvoye(true);
  }

  if (connecteNonAdmin) {
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <h1 className="font-serif text-2xl">Accès réservé</h1>
        <p className="mt-3 text-ardoise">
          Ce compte n'a pas les droits d'administration.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-6 rounded bg-marine px-4 py-2 text-creme"
        >
          Se déconnecter
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-md px-6">
      <h1 className="font-serif text-2xl">AvisDoc · Administration</h1>
      <p className="mt-2 text-ardoise">
        Connexion par lien magique envoyé à votre adresse.
      </p>
      {envoye ? (
        <p className="mt-6 rounded border border-filet bg-white p-4">
          Un lien de connexion a été envoyé à <strong>{email}</strong>.
          Ouvrez-le sur cet appareil.
        </p>
      ) : (
        <form onSubmit={envoyer} className="mt-6 space-y-4">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="prenom@avisdoc.fr"
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
