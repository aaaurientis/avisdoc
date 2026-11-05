// Tableau de bord — les journées de dépistage d'aujourd'hui et de la semaine (lundi → dimanche).
import { Link } from "react-router-dom";
import { CalendarCheck, Loader2 } from "lucide-react";
import { Card } from "../../components/ui";
import { useJournees } from "../../data/journeesStore";
import { aujourdhuiISO, journeesEntre, lundiDe, plusJours, type JourneeDepistage } from "../../lib/journees";
import { PastilleEtat, capitale, jour } from "./commun";

export default function EncartJournees() {
  const { statut, source, extraction } = useJournees();
  const auj = aujourdhuiISO();
  const lundi = lundiDe(auj);
  const dimanche = plusJours(lundi, 6);
  const toutes = extraction?.journees ?? [];
  const duJour = journeesEntre(toutes, auj, auj);
  const semaine = journeesEntre(toutes, lundi, dimanche);

  return (
    <Card className="mb-6 p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-avisdoc-ink">
          <CalendarCheck className="size-5 text-avisdoc-teal" strokeWidth={2.2} /> Journées de dépistage
        </h2>
        <Link to="/journees/calendrier" className="text-[13px] font-semibold text-avisdoc-teal hover:underline">
          Voir le calendrier
        </Link>
      </div>

      {!source ? (
        statut !== "pret" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Lecture de l'extraction…
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune extraction chargée.{" "}
            <Link to="/journees/calendrier" className="font-semibold text-avisdoc-teal hover:underline">
              Importer le CSV
            </Link>{" "}
            pour voir les journées du jour et de la semaine.
          </p>
        )
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Colonne titre={`Aujourd'hui · ${capitale(jour(auj, { weekday: "long", day: "numeric", month: "long" }))}`} liste={duJour} vide="Aucune journée aujourd'hui." />
          <Colonne
            titre={`Cette semaine · du ${jour(lundi, { day: "numeric", month: "short" })} au ${jour(dimanche, { day: "numeric", month: "short" })}`}
            liste={semaine}
            vide="Aucune journée cette semaine."
            avecDate
          />
        </div>
      )}
    </Card>
  );
}

function Colonne({ titre, liste, vide, avecDate = false }: { titre: string; liste: JourneeDepistage[]; vide: string; avecDate?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-bold uppercase tracking-[0.05em] text-muted-foreground">{titre}</div>
        <div className="shrink-0 font-display text-[22px] font-bold text-avisdoc-ink">{liste.length}</div>
      </div>
      {liste.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{vide}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {liste.map((j) => (
            <div key={j.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
              {avecDate && <span className="w-16 shrink-0 font-semibold text-avisdoc-ink">{capitale(jour(j.date, { weekday: "short", day: "numeric" }))}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-avisdoc-ink">
                  {j.client}
                  {j.numero !== null && <span className="ml-1 font-normal text-muted-foreground">· {j.numero}{j.commandees ? `/${j.commandees}` : ""}</span>}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {j.lieu || "lieu non renseigné"} · {j.expert || "expert non renseigné"}
                </span>
              </span>
              <PastilleEtat j={j} court />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
