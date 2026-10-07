// Tableau de bord « Contacts médicaux » : vue d'ensemble des 3 types du réseau
// (Requérants issus du parcours infirmières ; Requis et Réseau d'aval issus de
// l'annuaire) + carte.
//
// Les requérants n'ont pas d'adresse saisie : on résout leur adresse d'exercice
// depuis le RPPS (Annuaire Santé), on géocode (BAN) et on met en cache les
// coordonnées sur l'inscription (Lot 7b). Une tentative par requérant.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, Stethoscope, Users } from "lucide-react";
import type { ContactType, NetworkContact } from "../types";
import type { ReqInscription } from "../req/types";
import { reqRepo } from "../req/reqRepo";
import { geocodeBAN } from "../lib/geo";
import { typesDe } from "../lib/ui-tokens";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { useAdminData } from "../data/AdminDataContext";
import { Card, PageHeader } from "../components/ui";
import ContactsMap from "./contacts/ContactsMap";

/* eslint-disable @typescript-eslint/no-explicit-any */

// États pour lesquels localiser le requérant (hors dossiers clos).
const VIVANTS = new Set(["identite_verifiee", "pieces_a_valider", "a_completer", "pret_a_signer", "contrat_envoye", "active", "suspendue"]);

// Inscription → point de carte (pseudo-contact de type « Requérant »).
function toPoint(r: ReqInscription): NetworkContact {
  return {
    id: `req-${r.id}`,
    name: `${r.prenom} ${r.nom}`.trim(),
    role: "Requérant",
    type: "Requérant",
    types: ["Requérant"],
    statut: "Accepté",
    ville: r.ville ?? "",
    adresse: r.adresse ?? "",
    email: r.email,
    tel: r.telephone ?? "",
    last: "",
    notes: "",
    rpps: r.rpps ?? undefined,
    codePostal: r.codePostal ?? undefined,
    lat: typeof r.lat === "number" ? r.lat : undefined,
    lng: typeof r.lng === "number" ? r.lng : undefined,
  };
}

export default function ContactsDashboard() {
  const { contacts } = useAdminData();
  const navigate = useNavigate();
  const [requerants, setRequerants] = useState<ReqInscription[] | null>(null);

  // Chargement + résolution adresse (RPPS → Annuaire Santé) & géocodage (BAN),
  // en cache sur l'inscription. Une seule passe, au montage.
  useEffect(() => {
    let stop = false;
    const run = async () => {
      let liste: ReqInscription[];
      try {
        liste = await reqRepo.list();
      } catch {
        setRequerants([]);
        return;
      }
      if (stop) return;
      setRequerants(liste);

      for (const r of liste) {
        if (stop) return;
        if (!VIVANTS.has(r.etat) || !r.rpps || typeof r.lat === "number") continue;
        try {
          let adresse = r.adresse ?? "";
          let cp = r.codePostal ?? "";
          let ville = r.ville ?? "";
          if (!adresse && r.rpps) {
            const { data } = await supabaseAdmin.functions.invoke("annuaire-sante", { body: { query: r.rpps } });
            const res: any[] = (data as any)?.resultats ?? [];
            const f = res.find((x) => x.rpps === r.rpps) ?? res[0];
            if (f) { adresse = f.adresse ?? ""; cp = f.code_postal ?? ""; ville = f.ville ?? ""; }
          }
          const q = [adresse, cp, ville].filter(Boolean).join(" ").trim();
          if (!q) continue;
          const hit = await geocodeBAN(q);
          if (!hit) continue;
          await reqRepo.enregistrerGeo(r.id, { lat: hit.lat, lng: hit.lng, adresse, codePostal: cp, ville });
          if (stop) return;
          setRequerants((prev) =>
            (prev ?? []).map((x) => (x.id === r.id ? { ...x, lat: hit.lat, lng: hit.lng, adresse, codePostal: cp, ville } : x)),
          );
          await new Promise((res) => setTimeout(res, 250)); // doux pour l'Annuaire Santé
        } catch {
          /* best-effort : un requérant non résolu reste hors carte */
        }
      }
    };
    void run();
    return () => { stop = true; };
  }, []);

  const requis = useMemo(() => contacts.filter((c) => typesDe(c).includes("Requis")), [contacts]);
  const aval = useMemo(() => contacts.filter((c) => typesDe(c).includes("Réseau d'Aval")), [contacts]);

  const pointsRequerants = useMemo(
    () => (requerants ?? []).filter((r) => VIVANTS.has(r.etat) && typeof r.lat === "number").map(toPoint),
    [requerants],
  );
  const annuaireCarte = useMemo(
    () => contacts.filter((c) => typesDe(c).some((t) => t === "Requis" || t === "Réseau d'Aval")),
    [contacts],
  );
  const surCarte = useMemo(() => [...pointsRequerants, ...annuaireCarte], [pointsRequerants, annuaireCarte]);

  const tuiles = [
    {
      to: "/infirmieres",
      label: "Requérants",
      icon: Stethoscope,
      accent: "text-sky-600",
      valeur: requerants ? `${requerants.length}` : "—",
      detail: requerants ? `${requerants.filter((r) => r.etat === "active").length} actifs` : "Chargement…",
    },
    { to: "/contacts/requis", label: "Requis", icon: Users, accent: "text-emerald-600", valeur: `${requis.length}`, detail: "experts de l'annuaire" },
    { to: "/contacts/reseau", label: "Réseau d'aval", icon: Building2, accent: "text-amber-600", valeur: `${aval.length}`, detail: "structures d'aval" },
  ];

  const onSelect = (id: string) => {
    if (id.startsWith("req-")) {
      navigate(`/infirmieres/${id.slice(4)}`);
      return;
    }
    const c = contacts.find((x) => x.id === id);
    navigate(c && typesDe(c)[0] === "Réseau d'Aval" ? "/contacts/reseau" : "/contacts/requis");
  };

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

      <ContactsMap contacts={surCarte} onSelect={onSelect} />
    </div>
  );
}
