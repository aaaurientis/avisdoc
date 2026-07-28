import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { ContactType } from "../types";
import { initials } from "../lib/format";
import { STATUT_BADGE, TYPE_BADGE, typesDe } from "../lib/ui-tokens";
import { useAdminData } from "../data/AdminDataContext";
import { Avatar, Badge, Card, PageHeader } from "../components/ui";
import { cn } from "@/lib/utils";
import ContactDetail from "./contacts/ContactDetail";
import NewContactModal from "./contacts/NewContactModal";

type Filter = "Tous" | ContactType;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "Tous", label: "Tous" },
  { value: "Requérant", label: "Requérants" },
  { value: "Expert", label: "Experts" },
  { value: "Réseau d'Aval", label: "Réseau d'Aval" },
];

const COLS_FULL = "minmax(150px,2fr) 110px minmax(70px,0.8fr) minmax(110px,1.2fr) 96px";
const COLS_COMPACT = "minmax(140px,1.3fr) minmax(110px,1fr)";

export default function Contacts() {
  const { contacts } = useAdminData();
  const [filter, setFilter] = useState<Filter>("Tous");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts
      .filter((c) => filter === "Tous" || typesDe(c).includes(filter))
      .filter((c) => !q || `${c.name} ${c.ville} ${c.role}`.toLowerCase().includes(q));
  }, [contacts, filter, search]);

  const selected = contacts.find((c) => c.id === selectedId) ?? null;
  const cols = selected ? COLS_COMPACT : COLS_FULL;

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${contacts.length} contacts dans le réseau AvisDoc`}
        action={
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Nouveau contact
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full border border-border bg-card p-1">
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
                  on ? "bg-avisdoc-ink text-white" : "text-muted-foreground hover:text-avisdoc-ink",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <input
          className="ad-input max-w-[320px] flex-1 rounded-full border border-border bg-card px-4.5 py-2.5 text-[13.5px] outline-none transition-colors focus:border-avisdoc-teal"
          style={{ paddingLeft: 18, paddingRight: 18 }}
          placeholder="Rechercher un nom, une ville…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        className="grid items-start gap-5"
        // Fiche sélectionnée : partage équilibré liste / fiche (~50 / 50).
        style={{ gridTemplateColumns: selected ? "minmax(0,1fr) minmax(380px,1fr)" : "1fr" }}
      >
        <Card className="overflow-hidden">
          {/* En-tête de colonnes */}
          <div
            className="grid gap-3 border-b border-border/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
            style={{ gridTemplateColumns: cols }}
          >
            <div>Nom</div>
            <div>Type</div>
            {!selected && (
              <>
                <div>Ville</div>
                <div>Email</div>
                <div>Statut</div>
              </>
            )}
          </div>

          {rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "ad-row grid w-full items-center gap-3 border-b border-border/60 px-5 py-3 text-left transition-colors last:border-b-0",
                selectedId === c.id && "bg-sky-50/70",
              )}
              style={{ gridTemplateColumns: cols }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar initials={initials(c.name)} className={TYPE_BADGE[c.type]} />
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">
                    {c.name}
                  </div>
                  <div className="truncate text-[11.5px] text-muted-foreground">{c.role}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {typesDe(c).map((t) => (
                  <Badge key={t} className={TYPE_BADGE[t]}>{t}</Badge>
                ))}
              </div>
              {!selected && (
                <>
                  <div className="text-[13px] text-muted-foreground">{c.ville}</div>
                  <div className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                    {c.email}
                  </div>
                  <div>
                    <Badge className={STATUT_BADGE[c.statut]}>{c.statut}</Badge>
                  </div>
                </>
              )}
            </button>
          ))}

          {rows.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun contact ne correspond à la recherche.
            </div>
          )}
        </Card>

        {selected && <ContactDetail contact={selected} onClose={() => setSelectedId(null)} />}
      </div>

      {showModal && <NewContactModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
