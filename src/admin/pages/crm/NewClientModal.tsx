import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Client, PappersResult } from "../../types";
import { euro, joinAdresse, todayLabel, uid, splitAdresse } from "../../lib/format";
import { searchPappers } from "../../data/pappers";
import { useAdminData } from "../../data/AdminDataContext";
import { devisRepo } from "../../espace/devisRepo";
import { Modal } from "../../components/ui";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

interface ClientQonto {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
  rue: string | null;
  code_postal: string | null;
  ville: string | null;
}

export default function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { addClient, clients: crmClients } = useAdminData();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PappersResult | null>(null);
  const [qontoClients, setQontoClients] = useState<ClientQonto[]>([]);
  const [qontoPick, setQontoPick] = useState<ClientQonto | null>(null);
  const [jours, setJours] = useState(2);
  const [tarif, setTarif] = useState(1200);

  // Clients Qonto (source de vérité) — chargés au montage, best-effort.
  useEffect(() => {
    devisRepo.apercuClients()
      .then((r: any) => setQontoClients(r?.clients ?? []))
      .catch(() => {});
  }, []);

  // Suggestions Qonto correspondant à la saisie, hors clients déjà dans le CRM.
  const dejaCrm = useMemo(
    () => new Set(crmClients.map((c) => c.company.trim().toLowerCase())),
    [crmClients],
  );
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return qontoClients
      .filter((c) => !dejaCrm.has((c.name ?? "").trim().toLowerCase()))
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q) || (c.tax_id ?? "").includes(q))
      .slice(0, 5);
  }, [qontoClients, dejaCrm, query]);

  const runSearch = async () => {
    if (!query.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setQontoPick(null);
    try {
      setResult(await searchPappers(query));
    } catch (e) {
      console.error(e);
      toast.error("La recherche Pappers a échoué.");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    const id = uid();
    let client: Client | null = null;
    if (qontoPick) {
      // Création depuis un client Qonto existant (lié d'office).
      const taxe = (qontoPick.tax_id ?? "").replace(/\D/g, "");
      client = {
        id,
        company: qontoPick.name,
        siren: taxe.slice(0, 9),
        siret: taxe.length === 14 ? taxe : "",
        naf: "",
        adresse: joinAdresse(qontoPick.rue ?? "", qontoPick.code_postal ?? "", qontoPick.ville ?? ""),
        codePostal: qontoPick.code_postal ?? "",
        ville: qontoPick.ville ?? "",
        effectif: "—",
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
          { id: uid(), text: "Client créé — repris depuis Qonto.", deadline: null, done: true, when: todayLabel() },
        ],
      };
    } else if (result) {
      const adr = splitAdresse(result.adresse);
      client = {
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
          { id: uid(), text: "Client créé — fiche entreprise importée via Pappers.", deadline: null, done: true, when: todayLabel() },
        ],
      };
    }
    if (!client) return;
    addClient(client);
    if (qontoPick) await devisRepo.lierQonto(id, qontoPick.id);
    onCreated(id);
  };

  return (
    <Modal onClose={onClose} width={480}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">
        Nouveau client
      </h2>
      <p className="mb-5 text-[13px] text-muted-foreground">
        Choisissez un client existant dans Qonto, ou recherchez l'entreprise via l'API Pappers.
      </p>

      <div className="flex gap-2">
        <input
          className={cn(inputCls, "flex-1 rounded-full")}
          placeholder="Raison sociale ou SIREN…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setQontoPick(null); }}
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

      {/* Clients Qonto correspondants */}
      {!result && !qontoPick && suggestions.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
            Déjà dans Qonto
          </div>
          <div className="flex flex-col overflow-hidden rounded-xl border border-border">
            {suggestions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setQontoPick(c); setResult(null); }}
                className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-sky-50/70"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-avisdoc-ink">{c.name}</div>
                  {(c.ville || c.tax_id) && (
                    <div className="truncate text-[11.5px] text-muted-foreground">
                      {[c.ville, c.tax_id].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-avisdoc-teal/15 px-2 py-0.5 text-[10.5px] font-bold text-avisdoc-teal">
                  Qonto ✓
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fiche sélectionnée (Qonto) */}
      {qontoPick && (
        <div className="mt-4 rounded-xl border border-avisdoc-teal/40 bg-avisdoc-teal/5 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14.5px] font-bold text-avisdoc-ink">{qontoPick.name}</div>
            <span className="rounded-full bg-card px-2.5 py-1 text-[10.5px] font-bold text-avisdoc-teal">
              Client Qonto ✓
            </span>
          </div>
          <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px]">
            <Row k="N° d'identification" v={qontoPick.tax_id ?? "—"} />
            <Row k="Adresse" v={joinAdresse(qontoPick.rue ?? "", qontoPick.code_postal ?? "", qontoPick.ville ?? "") || "—"} />
            <Row k="E-mail" v={qontoPick.email ?? "—"} />
          </div>
        </div>
      )}

      {/* Fiche trouvée (Pappers) */}
      {result && (
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
      )}

      {(result || qontoPick) && (
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
          disabled={!result && !qontoPick}
          className={cn(
            "ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-3 text-sm font-bold text-white transition-opacity",
            !result && !qontoPick && "opacity-45",
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
