// Tableau de bord « Contacts médicaux » : vue d'ensemble des 3 types du réseau
// (Requérants issus du parcours infirmières ; Requis et Réseau d'aval issus de
// l'annuaire) + carte. Chaque tuile mène à sa vue détaillée.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Stethoscope, Users } from "lucide-react";
import type { ContactType } from "../types";
import { reqRepo } from "../req/reqRepo";
import { typesDe } from "../lib/ui-tokens";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";
import ContactsMap from "./contacts/ContactsMap";

export default function ContactsDashboard() {
  const { contacts } = useAdminData();
  const navigate = useNavigate();
  const [requerants, setRequerants] = useState<{ total: number; actifs: number } | null>(null);

  useEffect(() => {
    void reqRepo
      .list()
      .then((rows) => setRequerants({ total: rows.length, actifs: rows.filter((r) => r.etat === "active").length }))
      .catch(() => setRequerants({ total: 0, actifs: 0 }));
  }, []);

  const requis = useMemo(() => contacts.filter((c) => typesDe(c).includes("Requis")), [contacts]);
  const aval = useMemo(() => contacts.filter((c) => typesDe(c).includes("Réseau d'Aval")), [contacts]);
  // La carte montre l'annuaire (Requis + Réseau d'aval) ; les requérants y
  // seront ajoutés via géocodage RPPS (Lot 7b).
  const surCarte = useMemo(
    () => contacts.filter((c) => typesDe(c).some((t) => t === "Requis" || t === "Réseau d'Aval")),
    [contacts],
  );

  const typeDeContact = (id: string): ContactType | null => {
    const c = contacts.find((x) => x.id === id);
    return c ? typesDe(c)[0] : null;
  };

  const tuiles = [
    {
      to: "/infirmieres",
      label: "Requérants",
      icon: Stethoscope,
      accent: "text-sky-600",
      valeur: requerants ? `${requerants.total}` : "—",
      detail: requerants ? `${requerants.actifs} actifs` : "Chargement…",
    },
    {
      to: "/contacts/requis",
      label: "Requis",
      icon: Users,
      accent: "text-emerald-600",
      valeur: `${requis.length}`,
      detail: "experts de l'annuaire",
    },
    {
      to: "/contacts/reseau",
      label: "Réseau d'aval",
      icon: Building2,
      accent: "text-amber-600",
      valeur: `${aval.length}`,
      detail: "structures d'aval",
    },
  ];

  return (
    <div>
      <PageHeader title="Contacts médicaux" subtitle="Vue d'ensemble du réseau AvisDoc" />

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {tuiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to}>
              <Card className="group flex flex-col gap-2 p-5 transition-shadow hover:shadow-soft">
                <div className="flex items-center justify-between">
                  <Icon className={`size-6 ${t.accent}`} strokeWidth={1.9} />
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <div className="mt-1 text-3xl font-bold text-avisdoc-ink">{t.valeur}</div>
                <div className="text-[13.5px] font-semibold text-avisdoc-ink">{t.label}</div>
                <div className="text-[12px] text-muted-foreground">{t.detail}</div>
              </Card>
            </Link>
          );
        })}
      </div>

      <ContactsMap
        contacts={surCarte}
        onSelect={(id) => {
          const t = typeDeContact(id);
          navigate(t === "Réseau d'Aval" ? "/contacts/reseau" : "/contacts/requis");
        }}
      />
    </div>
  );
}
