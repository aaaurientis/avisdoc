import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { STATUTS_CRM, type Client } from "../lib/types";

const COULEUR_STATUT: Record<string, string> = {
  prospect: "bg-filet text-ardoise",
  en_cours: "bg-cyan/15 text-marine",
  signe: "bg-marine text-creme",
  clos: "bg-ardoise/20 text-ardoise",
};

export function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [nouveau, setNouveau] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  async function charger() {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("maj_le", { ascending: false });
    if (error) setErreur(error.message);
    else setClients(data as Client[]);
  }

  useEffect(() => { charger(); }, []);

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const nom = nouveau.trim();
    if (!nom) return;
    const { error } = await supabase.from("clients").insert({ nom });
    if (error) setErreur(error.message);
    else { setNouveau(""); charger(); }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">Clients</h1>
        <form onSubmit={creer} className="flex gap-2">
          <input
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            placeholder="Nom du client"
            className="rounded border border-filet bg-white px-3 py-1.5 text-sm"
          />
          <button className="rounded bg-marine px-3 py-1.5 text-sm text-creme">
            Nouveau client
          </button>
        </form>
      </div>

      {erreur && <p className="mt-4 text-sm text-orange">{erreur}</p>}

      <ul className="mt-6 divide-y divide-filet rounded border border-filet bg-white">
        {clients.map((c) => (
          <li key={c.id}>
            <Link
              to={`/clients/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-creme"
            >
              <span className="font-medium">{c.nom}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs ${COULEUR_STATUT[c.statut_crm]}`}
              >
                {STATUTS_CRM.find((s) => s.valeur === c.statut_crm)?.libelle}
              </span>
            </Link>
          </li>
        ))}
        {clients.length === 0 && (
          <li className="px-4 py-6 text-center text-ardoise">Aucun client.</li>
        )}
      </ul>
    </div>
  );
}
