import { useState } from "react";
import { toast } from "sonner";
import type { Client, PappersResult } from "../../types";
import { euro, todayLabel, uid, splitAdresse } from "../../lib/format";
import { searchPappers } from "../../data/pappers";
import { useAdminData } from "../../data/AdminDataContext";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { addClient } = useAdminData();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PappersResult | null>(null);
  const [jours, setJours] = useState(2);
  const [tarif, setTarif] = useState(1200);

  const runSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await searchPappers(query));
    } catch (e) {
      console.error(e);
      toast.error("La recherche Pappers a échoué.");
    } finally {
      setLoading(false);
    }
  };

  const create = () => {
    if (!result) return;
    const id = uid();
    const adr = splitAdresse(result.adresse);
    const client: Client = {
      id,
      company: result.company,
      siren: result.siren,
      siret: result.siret,
      naf: result.naf,
      adresse: result.adresse,
      codePostal: adr.cp,
      ville: adr.ville,
      effectif: result.effectif,
      stage: "Nouveau",
      jours: jours || 1,
      tarif: tarif || 0,
      depistes: 0,
      orientes: 0,
      resultat: null,
      statutPropo: "Brouillon",
      contacts: [],
      docs: [],
      suivis: [
        {
          id: uid(),
          text: "Client créé — fiche entreprise importée via Pappers.",
          deadline: null,
          done: true,
          when: todayLabel(),
        },
      ],
    };
    addClient(client);
    onCreated(id);
  };

  return (
    <Modal onClose={onClose} width={480}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">
        Nouveau client
      </h2>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Recherchez l'entreprise — les données légales sont récupérées via l'API Pappers.
      </p>

      <div className="flex gap-2">
        <input
          className={cn(inputCls, "flex-1 rounded-full")}
          placeholder="Raison sociale ou SIREN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          className="ad-btn-navy whitespace-nowrap rounded-full bg-avisdoc-ink px-5 py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-70"
        >
          {loading ? "Recherche…" : "Rechercher"}
        </button>
      </div>

      {result && (
        <>
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-4">
            <div className="flex items-center justify-between">
              <div className="text-[14.5px] font-bold text-avisdoc-ink">{result.company}</div>
              <span className="rounded-full bg-card px-2.5 py-1 text-[10.5px] font-bold text-blue-700">
                API Pappers ✓
              </span>
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px]">
              <Row k="SIREN" v={result.siren} />
              <Row k="Activité (NAF)" v={result.naf} />
              <Row k="Siège" v={result.adresse} />
              <Row k="Effectif" v={result.effectif} />
              <Row k="Dirigeant" v={result.dirigeant} />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="whitespace-nowrap text-[12.5px] font-bold text-muted-foreground">
                Campagne :
              </span>
              <input
                type="number"
                min={1}
                value={jours}
                onChange={(e) => setJours(parseInt(e.target.value, 10) || 0)}
                className={cn(inputCls, "w-16")}
              />
              <span className="text-[12.5px] text-muted-foreground">journées ×</span>
              <input
                type="number"
                min={0}
                step={50}
                value={tarif}
                onChange={(e) => setTarif(parseInt(e.target.value, 10) || 0)}
                className={cn(inputCls, "w-[90px]")}
              />
              <span className="text-[12.5px] text-muted-foreground">€/jour =</span>
              <span className="whitespace-nowrap text-sm font-bold text-avisdoc-ink">
                {euro((jours || 0) * (tarif || 0))}
              </span>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={create}
          disabled={!result}
          className={cn(
            "ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-3 text-sm font-bold text-white transition-opacity",
            !result && "opacity-45",
          )}
        >
          Créer le client
        </button>
      </div>
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-semibold text-avisdoc-ink">{v}</span>
    </div>
  );
}
