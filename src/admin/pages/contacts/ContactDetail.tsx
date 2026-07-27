import { useState } from "react";
import { MapPin, Trash2, X } from "lucide-react";
import type { ContactStatut, NetworkContact } from "../../types";
import { initials } from "../../lib/format";
import { mapsUrl } from "../../lib/maps";
import { STATUT_BADGE, TYPE_BADGE } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Avatar, Badge, Card, SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

const STATUTS: ContactStatut[] = ["Accepté", "En attente", "Refusé"];
const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

export default function ContactDetail({
  contact,
  onClose,
}: {
  contact: NetworkContact;
  onClose: () => void;
}) {
  const { updateContact, deleteContact } = useAdminData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<NetworkContact>(contact);
  // Onglets : fiche mise en forme / JSON brut (réponse Annuaire Santé).
  const [onglet, setOnglet] = useState<"fiche" | "json">("fiche");
  const [copie, setCopie] = useState(false);

  const jsonBrut = JSON.stringify(contact.fhirBrut ?? contact, null, 2);
  const copierJson = () => {
    navigator.clipboard?.writeText(jsonBrut).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 1500);
    });
  };
  // Suppression en deux temps : 1er clic arme la confirmation, 2e clic supprime.
  const [confirmSuppr, setConfirmSuppr] = useState(false);

  const supprimer = () => {
    if (!confirmSuppr) { setConfirmSuppr(true); return; }
    deleteContact(contact.id);
    onClose();
  };

  const startEdit = () => {
    setDraft(contact);
    setEditing(true);
  };
  const save = () => {
    updateContact(draft);
    setEditing(false);
  };
  const set = (field: keyof NetworkContact, value: string) =>
    setDraft((d) => ({ ...d, [field]: value }));

  return (
    <Card className="sticky top-6 p-6">
      <div className="flex items-start justify-between">
        <Avatar
          initials={initials(contact.name)}
          size={52}
          className={TYPE_BADGE[contact.type]}
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-0.5 text-muted-foreground transition-colors hover:text-avisdoc-ink"
        >
          <X className="size-5" />
        </button>
      </div>

      {editing ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <input className={inputCls} placeholder="Nom complet" value={draft.name} onChange={(e) => set("name", e.target.value)} />
          <input className={inputCls} placeholder="Fonction" value={draft.role} onChange={(e) => set("role", e.target.value)} />
          <input className={inputCls} placeholder="Email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
          <input className={inputCls} placeholder="Téléphone" value={draft.tel} onChange={(e) => set("tel", e.target.value)} />
          <input className={inputCls} placeholder="Adresse (n°, rue, code postal)" value={draft.adresse} onChange={(e) => set("adresse", e.target.value)} />
          <input className={inputCls} placeholder="Ville" value={draft.ville} onChange={(e) => set("ville", e.target.value)} />
          <textarea
            className={cn(inputCls, "ad-textarea resize-y")}
            rows={3}
            placeholder="Notes"
            value={draft.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
          <SectionLabel className="mt-1">Statut</SectionLabel>
          <div className="flex gap-1.5">
            {STATUTS.map((st) => {
              const on = draft.statut === st;
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => set("statut", st)}
                  className={cn(
                    "flex-1 rounded-full py-2 text-center text-xs font-bold transition-colors",
                    on ? STATUT_BADGE[st] : "bg-muted/50 text-muted-foreground",
                  )}
                >
                  {st}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-2.5 text-[13px] font-bold text-muted-foreground transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              className="ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-2.5 text-[13px] font-bold text-white"
            >
              Enregistrer
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="mt-3.5 font-display text-xl font-semibold text-avisdoc-ink">
            {contact.name}
          </h2>
          <div className="mt-0.5 text-[13px] text-muted-foreground">{contact.role}</div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Badge className={TYPE_BADGE[contact.type]}>{contact.type}</Badge>
            <Badge className={STATUT_BADGE[contact.statut]}>{contact.statut}</Badge>
          </div>

          {/* Onglets Fiche / JSON (réponse brute Annuaire Santé) */}
          <div className="mt-4 flex gap-1 rounded-full bg-muted/60 p-1">
            {([["fiche", "Fiche"], ["json", "JSON"]] as const).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setOnglet(k)}
                className={cn(
                  "flex-1 rounded-full py-1.5 text-center text-[12px] font-bold transition-colors",
                  onglet === k ? "bg-card text-avisdoc-ink shadow-sm" : "text-muted-foreground",
                )}
              >
                {lbl}
              </button>
            ))}
          </div>

          {onglet === "json" ? (
            <div className="mt-3.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                  {contact.fhirBrut ? "Réponse Annuaire Santé (FHIR)" : "Données du contact (pas de FHIR stocké)"}
                </span>
                <button
                  type="button"
                  onClick={copierJson}
                  className="rounded-full border border-border px-3 py-1 text-[11.5px] font-bold text-muted-foreground transition-colors hover:text-avisdoc-ink"
                >
                  {copie ? "Copié ✓" : "Copier"}
                </button>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-muted/50 p-3 text-[10.5px] leading-relaxed text-foreground/80">
                {jsonBrut}
              </pre>
            </div>
          ) : (
            <>
          <div className="mt-5 flex flex-col gap-2.5 text-[13px]">
            <Field k="Email" v={contact.email} />
            <Field k="Téléphone" v={contact.tel} />
            <Field k="Dernier contact" v={contact.last} />
          </div>

          {/* Fiche officielle (Annuaire Santé) — champs structurés 0014/0015 */}
          {(contact.rpps || contact.specialite || contact.profession || contact.structure ||
            (contact.savoirFaire?.length ?? 0) > 0 || (contact.diplomes?.length ?? 0) > 0) && (
            <div className="mt-3.5 rounded-xl bg-avisdoc-teal/5 p-4">
              <SectionLabel className="mb-1.5 text-avisdoc-teal">
                Fiche officielle{contact.source === "annuaire_sante" ? " · Annuaire Santé" : ""}
              </SectionLabel>
              <div className="flex flex-col gap-2 text-[13px]">
                {contact.rpps && <Field k="N° RPPS" v={contact.rpps} />}
                {contact.profession && <Field k="Profession" v={contact.profession} />}
              </div>

              {/* Savoir-faire (spécialités) — un praticien peut en avoir plusieurs */}
              {(contact.savoirFaire?.length ?? 0) > 0 ? (
                <div className="mt-2.5">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">Savoir-faire</div>
                  <div className="flex flex-wrap gap-1.5">
                    {contact.savoirFaire!.map((s) => (
                      <span key={s} className="rounded-full bg-avisdoc-teal/15 px-2.5 py-0.5 text-[11.5px] font-medium text-avisdoc-teal">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : contact.specialite ? (
                <div className="mt-2 text-[13px]"><Field k="Spécialité" v={contact.specialite} /></div>
              ) : null}

              {/* Diplômes d'État */}
              {(contact.diplomes?.length ?? 0) > 0 && (
                <div className="mt-2.5">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">Diplômes</div>
                  <ul className="flex flex-col gap-0.5 text-[12.5px] text-foreground/80">
                    {contact.diplomes!.map((d) => <li key={d}>• {d}</li>)}
                  </ul>
                </div>
              )}

              {/* Activités (exercices) */}
              {(contact.activites?.length ?? 0) > 0 && (
                <div className="mt-2.5">
                  <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                    Activités ({contact.activites!.length})
                  </div>
                  <ul className="flex flex-col gap-1 text-[12.5px] text-foreground/80">
                    {contact.activites!.map((a, i) => (
                      <li key={i} className="leading-snug">
                        • {[a.fonction, a.structure, [a.code_postal, a.ville].filter(Boolean).join(" ")]
                          .filter(Boolean).join(" — ") || "—"}
                        {(a.telephone || a.email) && (
                          <span className="text-muted-foreground"> · {[a.telephone, a.email].filter(Boolean).join(" · ")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {!contact.activites?.length && contact.structure && (
                <div className="mt-2 text-[13px]"><Field k="Structure" v={contact.structure} /></div>
              )}
            </div>
          )}

          <div className="mt-3.5 rounded-xl bg-muted/50 p-4">
            <SectionLabel className="mb-1.5">Adresse</SectionLabel>
            <div className="text-[13px] leading-relaxed text-foreground/80">
              {contact.adresse}
              <br />
              {contact.ville}
            </div>
            <a
              href={mapsUrl(contact.adresse, contact.ville)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-avisdoc-teal hover:text-avisdoc-teal"
            >
              <MapPin className="size-3.5 text-avisdoc-coral" />
              Voir sur Google Maps ↗
            </a>
          </div>

          <div className="mt-3.5 rounded-xl bg-muted/50 p-4">
            <SectionLabel className="mb-1.5">Notes</SectionLabel>
            <div className="text-[13px] leading-relaxed text-foreground/80">
              {contact.notes || "—"}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={startEdit}
              className="ad-btn-accent flex-1 rounded-full bg-avisdoc-teal py-2.5 text-[13px] font-bold text-white"
            >
              Modifier
            </button>
            <a
              href={`mailto:${contact.email}`}
              className="ad-btn-outline flex-1 rounded-full border-[1.5px] border-border py-2.5 text-center text-[13px] font-bold text-avisdoc-ink transition-colors"
            >
              Contacter
            </a>
          </div>
          <button
            type="button"
            onClick={supprimer}
            onBlur={() => setConfirmSuppr(false)}
            className={cn(
              "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-full border-[1.5px] py-2.5 text-[13px] font-bold transition-colors",
              confirmSuppr
                ? "border-transparent bg-rose-600 text-white hover:bg-rose-700"
                : "border-rose-300 text-rose-700 hover:bg-rose-50",
            )}
          >
            <Trash2 className="size-3.5" />
            {confirmSuppr ? "Confirmer la suppression ?" : "Supprimer le contact"}
          </button>
            </>
          )}
        </>
      )}
    </Card>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-semibold text-avisdoc-ink">{v || "—"}</span>
    </div>
  );
}
