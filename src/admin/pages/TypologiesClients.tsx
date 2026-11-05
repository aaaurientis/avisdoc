// Admin › Typologies clients — les règles de confirmation des journées, par type de client.
//
// 1. Les typologies : ce que chacune exige pour qu'une journée soit confirmée
//    (ex. « Partenaire sans CPS » : l'expert seulement, le partenaire fournit les requérants).
// 2. Les clients Qonto : chacun reçoit une typologie (sinon, la typologie par défaut s'applique).
// 3. Le rapprochement avec l'extraction des journées : un nom de l'extraction (« VIABEEZ ») qui
//    ne retrouve pas son client Qonto se rattache à la main ; il devient un alias du client.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { confirmer } from "../components/Confirmation";
import { useAuth } from "../auth/AuthContext";
import { rechargerTypologies, useJournees } from "../data/journeesStore";
import {
  affecter,
  clientsQonto,
  desaffecter,
  enregistrerTypologie,
  listerAffectations,
  listerTypologies,
  supprimerTypologie,
  type ClientQonto,
} from "../data/typologiesRepo";
import {
  CRITERES,
  rapprocher,
  type Affectation,
  type Typologie,
} from "../lib/typologies";
import { cn } from "@/lib/utils";

const CHAMP: Record<(typeof CRITERES)[number]["cle"], keyof Typologie> = {
  requerant: "exige_requerant",
  expert: "exige_expert",
};

const inputCls =
  "w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] text-avisdoc-ink";

export default function TypologiesClients() {
  const { user } = useAuth();
  const { extraction } = useJournees();
  const [typologies, setTypologies] = useState<Typologie[]>([]);
  const [affectations, setAffectations] = useState<Affectation[]>([]);
  const [clients, setClients] = useState<ClientQonto[] | null>(null);
  const [erreurQonto, setErreurQonto] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const recharger = useCallback(async () => {
    try {
      const [t, a] = await Promise.all([
        listerTypologies(),
        listerAffectations(),
      ]);
      setTypologies(t);
      setAffectations(a);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    }
    void rechargerTypologies(); // les écrans Journée suivent
  }, []);

  useEffect(() => {
    void recharger();
    clientsQonto().then(setClients, (e) => {
      setClients([]);
      setErreurQonto(e instanceof Error ? e.message : String(e));
    });
  }, [recharger]);

  const agir = async (fn: () => Promise<unknown>, ok?: string) => {
    setOccupe(true);
    try {
      await fn();
      await recharger();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(false);
    }
  };

  const parDefaut = typologies.find((t) => t.par_defaut) ?? null;

  return (
    <div>
      <PageHeader
        title="Typologies clients"
        subtitle="Ce qu'il faut pour qu'une journée de dépistage soit confirmée, selon le type de client."
        action={
          occupe ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : undefined
        }
      />

      {erreur ? (
        <Card className="mb-6 border-avisdoc-coral/40 p-5 text-sm text-avisdoc-ink">
          {erreur}
        </Card>
      ) : (
        <>
          <BlocTypologies typologies={typologies} agir={agir} />
          <BlocClients
            clients={clients}
            erreurQonto={erreurQonto}
            typologies={typologies}
            affectations={affectations}
            parDefaut={parDefaut}
            agir={agir}
            par={user?.email ?? ""}
          />
          {extraction && extraction.journees.length > 0 && (
            <BlocRapprochement
              noms={[
                ...new Set(
                  extraction.journees.map((j) => j.client).filter(Boolean),
                ),
              ].sort((a, b) => a.localeCompare(b, "fr"))}
              clients={clients ?? []}
              typologies={typologies}
              affectations={affectations}
              parDefaut={parDefaut}
              agir={agir}
              par={user?.email ?? ""}
            />
          )}
        </>
      )}
    </div>
  );
}

type Agir = (fn: () => Promise<unknown>, ok?: string) => Promise<void>;

// ── 1. Typologies ────────────────────────────────────────────────────────────
function BlocTypologies({
  typologies,
  agir,
}: {
  typologies: Typologie[];
  agir: Agir;
}) {
  const [nouveau, setNouveau] = useState("");

  const modifier = (t: Typologie, p: Partial<Typologie>) =>
    void agir(() => enregistrerTypologie({ ...t, ...p }));
  const ajouter = () => {
    const nom = nouveau.trim();
    if (!nom) return;
    void agir(
      () =>
        enregistrerTypologie({
          nom,
          description: "",
          exige_requerant: true,
          exige_expert: true,
          par_defaut: typologies.length === 0,
          position: typologies.length + 1,
        }),
      `Typologie « ${nom} » ajoutée.`,
    ).then(() => setNouveau(""));
  };
  const supprimer = async (t: Typologie) => {
    if (
      !(await confirmer({
        titre: `Supprimer « ${t.nom} » ?`,
        message:
          "Les clients qui y sont affectés doivent d'abord être réaffectés.",
      }))
    )
      return;
    void agir(() => supprimerTypologie(t.id), "Typologie supprimée.");
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <SectionLabel>Typologies et règles de confirmation</SectionLabel>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Cochez ce qui doit être acquis pour qu'une journée soit confirmée. La
          typologie par défaut vaut pour tout client non affecté.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Typologie</th>
              <th className="px-3 py-2.5 font-semibold">Description</th>
              {CRITERES.map((c) => (
                <th
                  key={c.cle}
                  className="px-2 py-2.5 text-center font-semibold capitalize"
                >
                  {c.court}
                </th>
              ))}
              <th className="px-3 py-2.5 text-center font-semibold">
                Par défaut
              </th>
              <th className="w-10 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {typologies.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="w-56 px-5 py-2">
                  <input
                    defaultValue={t.nom}
                    onBlur={(e) =>
                      e.target.value.trim() &&
                      e.target.value !== t.nom &&
                      modifier(t, { nom: e.target.value.trim() })
                    }
                    className={cn(inputCls, "font-semibold")}
                    aria-label="Nom"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    defaultValue={t.description}
                    onBlur={(e) =>
                      e.target.value !== t.description &&
                      modifier(t, { description: e.target.value })
                    }
                    className={inputCls}
                    aria-label="Description"
                    placeholder="À quoi sert cette typologie"
                  />
                </td>
                {CRITERES.map((c) => (
                  <td key={c.cle} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!t[CHAMP[c.cle]]}
                      onChange={(e) =>
                        modifier(t, {
                          [CHAMP[c.cle]]: e.target.checked,
                        } as Partial<Typologie>)
                      }
                      className="size-4 accent-[hsl(var(--avisdoc-teal))]"
                      aria-label={`${t.nom} exige : ${c.court}`}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-center">
                  <input
                    type="radio"
                    name="par-defaut"
                    checked={t.par_defaut}
                    onChange={() => modifier(t, { par_defaut: true })}
                    className="size-4 accent-[hsl(var(--avisdoc-teal))]"
                    aria-label={`${t.nom} par défaut`}
                  />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => void supprimer(t)}
                    disabled={t.par_defaut}
                    title={
                      t.par_defaut
                        ? "Choisissez d'abord une autre typologie par défaut"
                        : "Supprimer"
                    }
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-coral disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 border-t border-border px-5 py-3">
        <input
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ajouter()}
          placeholder="Nouvelle typologie (ex. Mutuelle, Collectivité…)"
          className={cn(inputCls, "max-w-sm")}
        />
        <button
          type="button"
          onClick={ajouter}
          className="inline-flex items-center gap-1.5 rounded-full bg-avisdoc-ink px-4 py-1.5 text-[13px] font-semibold text-white"
        >
          <Plus className="size-4" /> Ajouter
        </button>
      </div>
    </Card>
  );
}

// ── 2. Clients Qonto ─────────────────────────────────────────────────────────
function BlocClients({
  clients,
  erreurQonto,
  typologies,
  affectations,
  parDefaut,
  agir,
  par,
}: {
  clients: ClientQonto[] | null;
  erreurQonto: string | null;
  typologies: Typologie[];
  affectations: Affectation[];
  parDefaut: Typologie | null;
  agir: Agir;
  par: string;
}) {
  const [recherche, setRecherche] = useState("");
  const [nonAffectes, setNonAffectes] = useState(false);
  const parId = useMemo(
    () => new Map(affectations.map((a) => [a.qonto_client_id, a])),
    [affectations],
  );
  const liste = (clients ?? []).filter(
    (c) =>
      (!recherche || c.name.toLowerCase().includes(recherche.toLowerCase())) &&
      (!nonAffectes || !parId.has(c.id)),
  );

  const choisir = (c: ClientQonto, typologieId: string) => {
    const a = parId.get(c.id);
    if (!typologieId)
      return void agir(
        () => desaffecter(c.id),
        `${c.name} : typologie par défaut.`,
      );
    void agir(() =>
      affecter(
        {
          qonto_client_id: c.id,
          nom_qonto: c.name,
          typologie_id: typologieId,
          alias: a?.alias ?? [],
        },
        par,
      ),
    );
  };
  const changerAlias = (c: ClientQonto, texte: string) => {
    const a = parId.get(c.id);
    const alias = texte
      .split(/[;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (JSON.stringify(alias) === JSON.stringify(a?.alias ?? [])) return;
    const typologieId = a?.typologie_id ?? parDefaut?.id;
    if (!typologieId) return void toast.error("Créez d'abord une typologie.");
    void agir(() =>
      affecter(
        {
          qonto_client_id: c.id,
          nom_qonto: c.name,
          typologie_id: typologieId,
          alias,
        },
        par,
      ),
    );
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <SectionLabel>Clients Qonto</SectionLabel>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {clients
              ? `${clients.length} clients · ${affectations.length} affectés`
              : "Lecture des clients Qonto…"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              checked={nonAffectes}
              onChange={(e) => setNonAffectes(e.target.checked)}
              className="size-4"
            />{" "}
            Non affectés seulement
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher un client"
              className={cn(inputCls, "w-56 pl-8")}
            />
          </div>
        </div>
      </div>
      {erreurQonto && (
        <p className="px-5 py-3 text-[13px] text-avisdoc-coral">
          {erreurQonto}
        </p>
      )}
      {!clients ? (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture des clients Qonto…
        </p>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[11.5px] text-muted-foreground">
                <th className="px-5 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold">Typologie</th>
                <th className="px-5 py-2.5 font-semibold">
                  Noms dans l'extraction (séparés par « ; »)
                </th>
              </tr>
            </thead>
            <tbody>
              {liste.map((c) => {
                const a = parId.get(c.id);
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-5 py-2 font-semibold text-avisdoc-ink">
                      {c.name}
                    </td>
                    <td className="w-64 px-3 py-2">
                      <select
                        value={a?.typologie_id ?? ""}
                        onChange={(e) => choisir(c, e.target.value)}
                        className={inputCls}
                        aria-label={`Typologie de ${c.name}`}
                      >
                        <option value="">
                          Par défaut{parDefaut ? ` (${parDefaut.nom})` : ""}
                        </option>
                        {typologies.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nom}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-5 py-2">
                      <input
                        key={(a?.alias ?? []).join(";")}
                        defaultValue={(a?.alias ?? []).join(" ; ")}
                        onBlur={(e) => changerAlias(c, e.target.value)}
                        placeholder="ex. VIABEEZ"
                        className={inputCls}
                        aria-label={`Noms de ${c.name} dans l'extraction`}
                      />
                    </td>
                  </tr>
                );
              })}
              {liste.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-4 text-muted-foreground">
                    Aucun client.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ── 3. Rapprochement avec l'extraction ───────────────────────────────────────
function BlocRapprochement({
  noms,
  clients,
  typologies,
  affectations,
  parDefaut,
  agir,
  par,
}: {
  noms: string[];
  clients: ClientQonto[];
  typologies: Typologie[];
  affectations: Affectation[];
  parDefaut: Typologie | null;
  agir: Agir;
  par: string;
}) {
  /** Rattacher un nom de l'extraction à un client Qonto : le nom devient un alias de ce client. */
  const rattacher = (nom: string, qontoId: string) => {
    const c = clients.find((x) => x.id === qontoId);
    if (!c) return;
    const a = affectations.find((x) => x.qonto_client_id === qontoId);
    const typologieId = a?.typologie_id ?? parDefaut?.id;
    if (!typologieId) return void toast.error("Créez d'abord une typologie.");
    void agir(
      () =>
        affecter(
          {
            qonto_client_id: c.id,
            nom_qonto: c.name,
            typologie_id: typologieId,
            alias: [...(a?.alias ?? []), nom],
          },
          par,
        ),
      `« ${nom} » rattaché à ${c.name}.`,
    );
  };

  // Tous les clients Qonto, affectés ou non : sert à proposer le bon rattachement.
  const tousLesClients = useMemo<Affectation[]>(
    () =>
      clients.map((c) => ({
        qonto_client_id: c.id,
        nom_qonto: c.name,
        typologie_id: "",
        alias: [],
      })),
    [clients],
  );

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <SectionLabel>Clients de l'extraction des journées</SectionLabel>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Chaque nom de client de l'extraction, son client Qonto et la règle qui
          s'applique. Un nom non rattaché suit la typologie par défaut.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px] text-muted-foreground">
              <th className="px-5 py-2.5 font-semibold">Dans l'extraction</th>
              <th className="px-3 py-2.5 font-semibold">Client Qonto</th>
              <th className="px-5 py-2.5 font-semibold">Typologie appliquée</th>
            </tr>
          </thead>
          <tbody>
            {noms.map((nom) => {
              const r = rapprocher(nom, affectations);
              const t = r
                ? typologies.find((x) => x.id === r.affectation.typologie_id)
                : parDefaut;
              const propose = r
                ? null
                : (rapprocher(nom, tousLesClients)?.affectation ?? null);
              return (
                <tr key={nom} className="border-t border-border">
                  <td className="px-5 py-2 font-semibold text-avisdoc-ink">
                    {nom}
                  </td>
                  <td className="px-3 py-2">
                    {r ? (
                      <span className="text-avisdoc-ink">
                        {r.affectation.nom_qonto}
                        <span className="ml-1.5 text-[11.5px] text-muted-foreground">
                          ({r.par === "approche" ? "nom proche" : r.par})
                        </span>
                      </span>
                    ) : (
                      <span className="flex flex-wrap items-center gap-2">
                        {propose && (
                          <button
                            type="button"
                            onClick={() =>
                              rattacher(nom, propose.qonto_client_id)
                            }
                            className="rounded-full bg-avisdoc-teal-soft px-3 py-1 text-[12.5px] font-semibold text-avisdoc-ink hover:bg-avisdoc-teal hover:text-white"
                          >
                            Rattacher à {propose.nom_qonto}
                          </button>
                        )}
                        <select
                          value=""
                          onChange={(e) => rattacher(nom, e.target.value)}
                          className={cn(inputCls, "max-w-xs")}
                          aria-label={`Rattacher ${nom}`}
                        >
                          <option value="">
                            Non rattaché — choisir le client Qonto…
                          </option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2 text-muted-foreground">
                    {t?.nom ?? "Règle par défaut (requérant + expert)"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
