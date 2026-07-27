import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Minus, Pencil, Plus, X } from "lucide-react";
import type { Client, Stage } from "../../types";
import { euro, frDate, initials, todayISO } from "../../lib/format";
import { DOC_EXT, PROPO_STATUTS, STAGES, stageMeta } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Avatar, Card } from "../../components/ui";
import EspaceClientCard from "../../espace/EspaceClientCard";
import RendezVousCard from "../../espace/RendezVousCard";
import DangerZone from "../../espace/DangerZone";
import { cn } from "@/lib/utils";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

// Section repliable pleine largeur (accordéon de la fiche projet).
function Section({
  titre,
  compte,
  defaultOpen = true,
  actions,
  children,
}: {
  titre: string;
  compte?: number;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="truncate font-display text-[15px] font-semibold text-avisdoc-ink">{titre}</span>
          {compte != null && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {compte}
            </span>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {open && <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>}
    </Card>
  );
}

export default function ProjectView({
  client,
  allClients,
  onSelect,
  onClose,
}: {
  client: Client;
  allClients: Client[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const {
    updateClientFields,
    addProjectContact,
    removeProjectContact,
    addProjectDoc,
    removeProjectDoc,
    addSuivi,
    toggleSuivi,
    removeSuivi,
  } = useAdminData();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ company: "", siren: "", naf: "", adresse: "" });
  const [nc, setNc] = useState({ name: "", role: "", email: "" });
  const [ndName, setNdName] = useState("");
  const [ns, setNs] = useState({ text: "", deadline: "" });

  const today = todayISO();
  const total = client.jours * client.tarif;

  const startEdit = () => {
    setDraft({ company: client.company, siren: client.siren, naf: client.naf, adresse: client.adresse });
    setEditing(true);
  };
  const saveEdit = () => {
    updateClientFields(client.id, draft);
    setEditing(false);
  };

  const submitContact = () => {
    if (!nc.name.trim()) return;
    addProjectContact(client.id, nc);
    setNc({ name: "", role: "", email: "" });
  };
  const submitDoc = () => {
    if (!ndName.trim()) return;
    addProjectDoc(client.id, ndName);
    setNdName("");
  };
  const submitSuivi = () => {
    if (!ns.text.trim()) return;
    addSuivi(client.id, { text: ns.text, deadline: ns.deadline || null });
    setNs({ text: "", deadline: "" });
  };

  const btnOutline =
    "ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors";
  const btnAccent = "ad-btn-accent rounded-full bg-avisdoc-teal text-[12.5px] font-bold text-white";

  return (
    <div className="ad-crm-grid grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      {/* Liste des clients */}
      <Card className="overflow-hidden">
        {allClients.map((c) => {
          const active = c.id === client.id;
          const sm = stageMeta(c.stage);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "ad-row block w-full border-b border-border/60 border-l-[3px] px-4.5 py-3 text-left transition-colors last:border-b-0",
                active ? "border-l-avisdoc-teal bg-sky-50/70" : "border-l-transparent",
              )}
              style={{ paddingLeft: 18, paddingRight: 18 }}
            >
              <div className="text-[13.5px] font-semibold text-avisdoc-ink">{c.company}</div>
              <div className="mt-0.5 flex justify-between">
                <span className="text-[11.5px] text-muted-foreground">{c.contacts[0]?.name ?? "—"}</span>
                <span className={cn("text-[11px] font-bold uppercase tracking-wide", sm.text)}>{c.stage}</span>
              </div>
            </button>
          );
        })}
      </Card>

      {/* Détail projet — accordéon pleine largeur */}
      <div className="flex min-w-0 flex-col gap-3">
        {/* 1. Nom de la société et infos */}
        <Section
          titre={client.company}
          actions={
            <>
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className={btnAccent}
                    style={{ paddingLeft: 18, paddingRight: 18, paddingTop: 8, paddingBottom: 8 }}
                  >
                    Enregistrer
                  </button>
                </>
              ) : (
                <button type="button" onClick={startEdit} className={btnOutline}>
                  <Pencil className="size-3.5" /> Modifier
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                title="Fermer le projet"
                className="rounded-lg p-1 text-muted-foreground transition-colors hover:text-avisdoc-ink"
              >
                <X className="size-5" />
              </button>
            </>
          }
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                className={cn(inputCls, "font-semibold")}
                placeholder="Raison sociale"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className={cn(inputCls, "w-[130px]")}
                  placeholder="SIREN"
                  value={draft.siren}
                  onChange={(e) => setDraft({ ...draft, siren: e.target.value })}
                />
                <input
                  className={cn(inputCls, "min-w-0 flex-1")}
                  placeholder="Activité (NAF)"
                  value={draft.naf}
                  onChange={(e) => setDraft({ ...draft, naf: e.target.value })}
                />
              </div>
              <input
                className={inputCls}
                placeholder="Adresse du siège"
                value={draft.adresse}
                onChange={(e) => setDraft({ ...draft, adresse: e.target.value })}
              />
            </div>
          ) : (
            <div>
              <div className="text-[12.5px] text-muted-foreground">
                SIREN {client.siren} · {client.naf} —{" "}
                <span className="font-bold text-blue-700">données Pappers ✓</span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{client.adresse}</div>
            </div>
          )}

          {/* Pastilles d'étape */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {STAGES.map((s) => {
              const active = client.stage === s.name;
              return (
                <button
                  key={s.name}
                  type="button"
                  onClick={() => updateClientFields(client.id, { stage: s.name as Stage })}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-bold transition-colors",
                    active
                      ? cn(s.dot, "border-transparent text-white")
                      : "border-border bg-card text-muted-foreground hover:border-avisdoc-ink",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </Section>

        {/* 2. Contacts */}
        <Section titre="Contacts" compte={client.contacts.length}>
          <div className="flex flex-col">
            {client.contacts.map((pc) => {
              const tel = pc.tel && pc.tel !== "—" ? pc.tel : "";
              const email = pc.email && pc.email !== "—" ? pc.email : "";
              const contactLine = [email, tel].filter(Boolean).join(" · ");
              return (
                <div key={pc.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                  <Avatar initials={initials(pc.name || "?")} className="bg-sky-100 text-sky-700" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{pc.name}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{pc.role}</div>
                    {contactLine && (
                      <div className="truncate text-[11.5px] text-muted-foreground/80">{contactLine}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProjectContact(client.id, pc.id)}
                    className="ad-x shrink-0 px-1 text-muted-foreground/60 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[110px] flex-[1.2] rounded-full py-2.5")}
              placeholder="Nom"
              value={nc.name}
              onChange={(e) => setNc({ ...nc, name: e.target.value })}
            />
            <input
              className={cn(inputCls, "min-w-[90px] flex-1 rounded-full py-2.5")}
              placeholder="Fonction"
              value={nc.role}
              onChange={(e) => setNc({ ...nc, role: e.target.value })}
            />
            <input
              className={cn(inputCls, "min-w-[110px] flex-[1.2] rounded-full py-2.5")}
              placeholder="Email"
              value={nc.email}
              onChange={(e) => setNc({ ...nc, email: e.target.value })}
            />
            <button type="button" onClick={submitContact} className={btnAccent} style={{ padding: "10px 18px" }}>
              Ajouter
            </button>
          </div>
        </Section>

        {/* 3. Proposition financière */}
        <Section titre="Proposition financière">
          <div className="rounded-2xl bg-avisdoc-ink p-6 text-white">
            <div className="font-display text-[32px] font-bold text-avisdoc-coral">{euro(total)}</div>
            <div className="mt-1 break-words text-[13px] text-white/60">
              {client.jours} {client.jours > 1 ? "journées" : "journée"} × {euro(client.tarif)} / jour
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <Stepper
                label="Journées"
                value={String(client.jours)}
                onMinus={() => updateClientFields(client.id, { jours: Math.max(1, client.jours - 1) })}
                onPlus={() => updateClientFields(client.id, { jours: client.jours + 1 })}
              />
              <Stepper
                label="Tarif / journée"
                value={euro(client.tarif)}
                onMinus={() => updateClientFields(client.id, { tarif: Math.max(0, client.tarif - 50) })}
                onPlus={() => updateClientFields(client.id, { tarif: client.tarif + 50 })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PROPO_STATUTS.map((st) => {
                const active = client.statutPropo === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => updateClientFields(client.id, { statutPropo: st })}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-colors",
                      active ? "bg-avisdoc-coral text-avisdoc-ink" : "bg-white/10 text-white/60 hover:bg-white/20",
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Résultat de campagne */}
          <div className="mt-4 rounded-2xl border border-border p-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Résultat</div>
            {client.resultat ? (
              <>
                <div className="mb-2.5 flex gap-3.5">
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-ink">{client.depistes}</div>
                    <div className="text-[11px] text-muted-foreground/80">dépistés</div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-coral">{client.orientes}</div>
                    <div className="text-[11px] text-muted-foreground/80">orientés</div>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/80">{client.resultat}</p>
              </>
            ) : (
              <p className="text-[13px] italic text-muted-foreground">
                Campagne non réalisée — résultats disponibles après les journées de dépistage.
              </p>
            )}
          </div>
        </Section>

        {/* 4. Suivis et échéances */}
        <Section titre="Suivis et échéances" compte={client.suivis.length}>
          <div className="flex flex-col">
            {client.suivis.map((ev) => {
              const overdue = ev.deadline && !ev.done && ev.deadline < today;
              const badgeCls = ev.done
                ? "bg-emerald-100 text-emerald-700"
                : overdue
                  ? "bg-rose-100 text-rose-700"
                  : ev.deadline
                    ? "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground";
              const label = ev.deadline ? frDate(ev.deadline) : ev.when || "Sans échéance";
              return (
                <div key={ev.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleSuivi(client.id, ev.id)}
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      ev.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                    )}
                  >
                    {ev.done && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <div
                    className={cn(
                      "min-w-0 flex-1 text-[13px] leading-snug",
                      ev.done ? "text-muted-foreground/70 line-through" : "text-avisdoc-ink",
                    )}
                  >
                    {ev.text}
                  </div>
                  <span
                    className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", badgeCls)}
                  >
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSuivi(client.id, ev.id)}
                    className="ad-x px-1 text-muted-foreground/60 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[160px] flex-[2] rounded-full")}
              placeholder="Nouvelle action de suivi…"
              value={ns.text}
              onChange={(e) => setNs({ ...ns, text: e.target.value })}
            />
            <input
              type="date"
              className={cn(inputCls, "rounded-full text-muted-foreground")}
              value={ns.deadline}
              onChange={(e) => setNs({ ...ns, deadline: e.target.value })}
            />
            <button type="button" onClick={submitSuivi} className={btnAccent} style={{ padding: "10px 18px" }}>
              Ajouter
            </button>
          </div>
        </Section>

        {/* 5. Documents partagés */}
        <Section titre="Documents partagés" compte={client.docs.length}>
          <div className="flex flex-col">
            {client.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-bold text-white",
                    DOC_EXT[d.ext],
                  )}
                >
                  {d.ext}
                </span>
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-avisdoc-ink">{d.name}</div>
                <div className="shrink-0 text-[11.5px] text-muted-foreground/80">{d.date}</div>
                <button
                  type="button"
                  onClick={() => removeProjectDoc(client.id, d.id)}
                  className="ad-x px-1 text-muted-foreground/60 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[140px] flex-1 rounded-full")}
              placeholder="Nom du document (ex. Devis DEP-2026-042.pdf)"
              value={ndName}
              onChange={(e) => setNdName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDoc()}
            />
            <button type="button" onClick={submitDoc} className={btnAccent} style={{ padding: "10px 18px" }}>
              Partager
            </button>
          </div>
        </Section>

        {/* 6. Espace client */}
        <Section titre="Espace client">
          <EspaceClientCard bare clientId={client.id} clientName={client.company} />
        </Section>

        {/* 7. Rendez-vous (journées de dépistage) */}
        <Section titre="Rendez-vous">
          <RendezVousCard bare clientId={client.id} />
        </Section>

        {/* Zone de danger : suppression complète du client */}
        <DangerZone clientId={client.id} clientName={client.company} onDeleted={onClose} />
      </div>
    </div>
  );
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="min-w-[110px] text-[12.5px] text-white/60">{label}</span>
      <button
        type="button"
        onClick={onMinus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[64px] text-center text-sm font-bold">{value}</span>
      <button
        type="button"
        onClick={onPlus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
