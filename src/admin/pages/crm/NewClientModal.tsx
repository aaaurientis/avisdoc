// Nouveau client au Pipeline : la fiche complète, comme « Ajouter un prospect ».
//
// Olivier (19/10) : sans SIREN, on était bloqué. Désormais seul le nom compte ;
// Qonto et l'annuaire ne servent qu'à préremplir, si on veut.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Client, PappersResult } from "../../types";
import { euro, uid, splitAdresse } from "../../lib/format";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import FormulaireFiche from "../../components/fiche/FormulaireFiche";
import { chargerMembres } from "../../lib/membres";
import { TRANCHES } from "../../lib/merx";
import { colonnesProspect, departementDuCodePostal, erreurSaisie, fermerSiRienAPerdre, FICHE_VIDE, type FicheSaisie } from "../../lib/fiche-saisie";
import { champsAffaire, contactsAffaire } from "../../lib/affaire-saisie";
import { searchPappers } from "../../data/pappers";
import { useAdminData } from "../../data/AdminDataContext";
import { devisRepo } from "../../espace/devisRepo";
import { Modal, SectionLabel } from "../../components/ui";
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
  pipelineId,
  etapeDepart,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  /** Le tableau ouvert : l'affaire y entre, pas ailleurs. */
  pipelineId: string;
  /** Sa première colonne — « Nouveau » n'existe pas forcément dans tous les pipelines. */
  etapeDepart: string;
}) {
  const { addClient, clients: crmClients, rafraichir } = useAdminData();
  const { user } = useAuth();
  const [saisie, setSaisie] = useState<FicheSaisie>(() => ({ ...FICHE_VIDE, referent: user?.email ?? "" }));
  const [initiale] = useState(saisie);
  // La campagne compte aussi : changer les journées ou le tarif, c'est avoir commencé.
  const fermer = () => void fermerSiRienAPerdre({ saisie: initiale, jours: 2, tarif: 1200 }, { saisie, jours, tarif }, onClose);
  const [membres, setMembres] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PappersResult | null>(null);
  const [qontoClients, setQontoClients] = useState<ClientQonto[]>([]);
  const [qontoPick, setQontoPick] = useState<ClientQonto | null>(null);
  const [qQonto, setQQonto] = useState("");
  const [jours, setJours] = useState(2);
  const [tarif, setTarif] = useState(1200);

  useEffect(() => {
    void chargerMembres().then(setMembres);
  }, []);

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
    const q = qQonto.trim().toLowerCase();
    return qontoClients
      .filter((c) => !dejaCrm.has((c.name ?? "").trim().toLowerCase()))
      .filter((c) => !q || (c.name ?? "").toLowerCase().includes(q) || (c.tax_id ?? "").includes(q))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"));
  }, [qontoClients, dejaCrm, qQonto]);

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

  /** Un client Qonto ou une fiche du registre préremplit la fiche : on corrige ensuite. */
  const prendre = (depuis: { nom: string; siren?: string; adresse?: string; cp?: string; ville?: string; activite?: string; effectif?: string; dirigeant?: string; email?: string }) => {
    const code = Object.entries(TRANCHES).find(([, label]) => label === depuis.effectif)?.[0] ?? "";
    setSaisie((s) => ({
      ...s,
      nom: depuis.nom || s.nom,
      siren: (depuis.siren ?? s.siren).replace(/\D/g, "").slice(0, 9),
      adresse: depuis.adresse ?? s.adresse,
      codePostal: depuis.cp ?? s.codePostal,
      ville: depuis.ville ?? s.ville,
      departement: depuis.cp ? departementDuCodePostal(depuis.cp) || s.departement : s.departement,
      activite: depuis.activite ?? s.activite,
      effectif: code || s.effectif,
      dirigeant: depuis.dirigeant && depuis.dirigeant !== "—" ? depuis.dirigeant : s.dirigeant,
      email: depuis.email ?? s.email,
    }));
  };

  const create = async () => {
    if (envoi) return;
    const souci = erreurSaisie(saisie);
    if (souci) return setErreur(souci);
    const deja = crmClients.find((c) => c.company.trim().toLowerCase() === saisie.nom.trim().toLowerCase());
    if (deja) return setErreur(`${deja.company} est déjà dans le Pipeline, à l’étape « ${deja.stage} ».`);
    setEnvoi(true);
    setErreur(null);
    try {
      const id = uid();
      // Un doublon se dit AVANT d'écrire quoi que ce soit (même nom, même ville).
      const { data: memeNom, error: lecture } = await supabaseAdmin
        .from("admin_prospects")
        .select("id, city, deleted_at")
        .ilike("name", saisie.nom.trim().replace(/[%_]/g, "\\$&"));
      if (lecture) throw new Error(`Vérification des doublons impossible : ${lecture.message}`);
      const villeSaisie = saisie.ville.trim().toLowerCase();
      if ((memeNom ?? []).some((x) => ((x.city as string | null) ?? "").trim().toLowerCase() === villeSaisie)) {
        throw new Error(
          "Une fiche de ce nom existe déjà dans cette ville en Prospection (peut-être à la corbeille) : ouvrez-la et faites-la entrer au Pipeline.",
        );
      }
      // La fiche d'entreprise d'abord : c'est elle qui porte le dirigeant, le standard,
      // le site. Saisie à la main : Merx n'y touche pas tant qu'on ne le lui demande pas.
      const { data: fiche, error } = await supabaseAdmin
        .from("admin_prospects")
        .insert({ ...colonnesProspect(saisie), owner_email: user?.email ?? "", status: "contacte" })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const client: Client = {
        id,
        siret: qontoPick?.tax_id?.replace(/\D/g, "").length === 14 ? qontoPick.tax_id.replace(/\D/g, "") : (result?.siret ?? ""),
        naf: result?.naf ?? "",
        ...(champsAffaire(saisie) as Pick<Client, "company" | "siren" | "adresse" | "codePostal" | "ville" | "effectif">),
        secteur: saisie.secteur || null,
        stage: etapeDepart,
        pipelineId,
        jours: jours || 1,
        tarif: tarif || 0,
        depistes: 0,
        orientes: 0,
        resultat: null,
        statutPropo: "Brouillon",
        contacts: contactsAffaire(saisie),
        docs: [],
        suivis: [],
      };
      // On attend l'écriture : le devis Qonto et la navigation pointent sur cette affaire.
      if (!(await addClient(client))) {
        // L'affaire n'a pas pu naître : la fiche créée pour elle part à la corbeille
        // plutôt que de rester seule en Prospection.
        const { error: jete } = await supabaseAdmin.from("admin_prospects").update({ deleted_at: new Date().toISOString() }).eq("id", fiche.id);
        throw new Error(
          jete
            ? "Le client n’a pas pu être créé au Pipeline, et sa fiche est restée en Prospection : supprimez-la, puis réessayez."
            : "Le client n’a pas pu être créé au Pipeline ; la fiche préparée pour lui est partie à la corbeille. Réessayez.",
        );
      }
      // Le lien se pose après l'affaire : c'est lui qui y reporte le commercial (0039).
      const { error: lien } = await supabaseAdmin
        .from("admin_prospects")
        .update({ converted_client_id: id, converted_at: new Date().toISOString() })
        .eq("id", fiche.id);
      if (lien) {
        await rafraichir();
        throw new Error(`Le client est créé au Pipeline, mais sa fiche n’a pas pu lui être reliée (${lien.message}). Ouvrez-le et utilisez « Modifier la fiche ».`);
      }
      if (qontoPick) await devisRepo.lierQonto(id, qontoPick.id);
      await rafraichir();
      onCreated(id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La création a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={fermer} width={640}>
      <h2 className="mb-1 font-display text-[22px] font-semibold text-avisdoc-ink">Nouveau client</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Remplissez la fiche : seul le nom est nécessaire, le SIREN est facultatif. Vous pouvez partir d’un client Qonto ou
        de l’annuaire des entreprises pour la préremplir. Rien n’est ajouté par Merx tant que vous ne le lui demandez pas.
      </p>

      {/* Préremplir, si on veut : Qonto ou le registre. */}
      <details className="mb-5 rounded-2xl border border-border px-4 py-3" open={false}>
        <summary className="cursor-pointer text-[13px] font-bold text-avisdoc-ink">Préremplir depuis Qonto ou l’annuaire des entreprises</summary>
        <div className="mt-3 flex gap-2">
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
          <button
            type="button"
            onClick={() => {
              const adr = splitAdresse(result.adresse);
              prendre({ nom: result.company, siren: result.siren, adresse: adr.rue, cp: adr.cp, ville: adr.ville, activite: result.naf, effectif: result.effectif, dirigeant: result.dirigeant });
              setQontoPick(null);
            }}
            className="mt-3 w-full rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-left transition-colors hover:border-avisdoc-teal"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold text-avisdoc-ink">{result.company}</span>
              <span className="text-[11.5px] font-bold text-avisdoc-teal">Reprendre dans la fiche</span>
            </div>
            <div className="mt-1 flex flex-col gap-1 text-[12px]">
              <Row k="SIREN" v={result.siren} />
              <Row k="Siège" v={result.adresse} />
              <Row k="Dirigeant" v={result.dirigeant} />
            </div>
          </button>
        )}
        {qontoClients.length > 0 && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">Déjà dans Qonto ({suggestions.length})</div>
              <input
                className="ad-input w-[180px] rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[12px] outline-none transition-colors focus:border-avisdoc-teal"
                placeholder="Filtrer la liste…"
                value={qQonto}
                onChange={(e) => setQQonto(e.target.value)}
              />
            </div>
            <div className="flex max-h-48 flex-col overflow-y-auto rounded-xl border border-border">
              {suggestions.length === 0 && <p className="px-3.5 py-3 text-[12.5px] italic text-muted-foreground">Aucun client Qonto ne correspond.</p>}
              {suggestions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setQontoPick(c);
                    setResult(null);
                    prendre({ nom: c.name, siren: c.tax_id ?? "", adresse: c.rue ?? "", cp: c.code_postal ?? "", ville: c.ville ?? "", email: c.email ?? undefined });
                  }}
                  className={cn(
                    "flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5 text-left transition-colors last:border-b-0 hover:bg-sky-50/70",
                    qontoPick?.id === c.id && "bg-avisdoc-teal/10",
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-avisdoc-ink">{c.name}</div>
                    {(c.ville || c.tax_id) && <div className="truncate text-[11.5px] text-muted-foreground">{[c.ville, c.tax_id].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <span className="shrink-0 rounded-full bg-avisdoc-teal/15 px-2 py-0.5 text-[10.5px] font-bold text-avisdoc-teal">
                    {qontoPick?.id === c.id ? "Repris ✓" : "Qonto"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </details>

      <FormulaireFiche valeur={saisie} onChange={setSaisie} membres={membres} />

      <section className="mt-4 border-t border-border pt-4">
        <SectionLabel className="mb-2.5">La campagne envisagée</SectionLabel>
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="number" min={1} value={jours} onChange={(e) => setJours(parseInt(e.target.value, 10) || 0)} aria-label="Journées" className={cn(inputCls, "w-16")} />
          <span className="text-[12.5px] text-muted-foreground">journées ×</span>
          <input type="number" min={0} step={50} value={tarif} onChange={(e) => setTarif(parseInt(e.target.value, 10) || 0)} aria-label="Tarif par journée" className={cn(inputCls, "w-[90px]")} />
          <span className="text-[12.5px] text-muted-foreground">€/jour =</span>
          <span className="whitespace-nowrap text-sm font-bold text-avisdoc-ink">{euro((jours || 0) * (tarif || 0))}</span>
        </div>
      </section>

      {erreur && <p className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={fermer}
          className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-3 text-sm font-bold text-muted-foreground transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => void create()}
          disabled={envoi || !saisie.nom.trim()}
          className="ad-btn-accent inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-avisdoc-teal py-3 text-sm font-bold text-white transition-opacity disabled:opacity-45"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />}
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
