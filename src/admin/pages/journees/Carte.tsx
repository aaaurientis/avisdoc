// Statistiques › Carte — les journées de dépistage sur une carte.
//
// Un point par lieu et par client : toutes les journées d'un client au même endroit forment un seul
// point, avec leur historique. Sa taille suit le nombre de journées ; orange s'il y a une journée à
// venir, bleu si toutes sont passées. Un clic ouvre la bulle : pour chaque journée, la date, le lieu,
// le client et le nombre de participants (avis rendus ; « à venir » tant qu'elle n'a pas eu lieu).
// Deux clients au même endroit : deux points, légèrement écartés pour rester visibles.
//
// Les lieux sont localisés par l'API Adresse (BAN, data.gouv.fr) : seul le nom du lieu est envoyé.
// Méthode : code postal s'il y en a un, sinon une commune de ce nom (voir localiserLieu).
// Le résultat est gardé dans le navigateur, pour ne pas relocaliser à chaque visite.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { Card } from "../../components/ui";
import { useExpertises, useJournees } from "../../data/journeesStore";
import { fetchMapsKey, loadGoogleMaps } from "../../lib/googleMaps";
import { localiserLieu } from "../../lib/geo";
import { cleJournee } from "../../lib/expertises";
import { aujourdhuiISO, compterPar, dansLaPeriode, estPassee, type JourneeDepistage, type Periode } from "../../lib/journees";
import { cn } from "@/lib/utils";
import { CadreJournees, Choix, jour } from "./commun";

const PERIODES: { cle: Periode; label: string }[] = [
  { cle: "avenir", label: "À venir" },
  { cle: "30j", label: "30 jours" },
  { cle: "90j", label: "90 jours" },
  { cle: "12m", label: "12 mois" },
  { cle: "tout", label: "Tout" },
];

const COULEUR_AVENIR = "#EC7735"; // orange de la charte
const COULEUR_PASSEE = "#0CA6DF"; // cyan de la charte

// ── Localisation des lieux, gardée dans le navigateur ─────────────────────────
// v2 : nouvelle méthode de localisation (commune d'abord) ; les positions de la v1 sont oubliées.
const CLE_CACHE = "avisdoc.journees.lieux.v2";
try {
  localStorage.removeItem("avisdoc.journees.lieux");
} catch {
  /* stockage indisponible */
}
type Coord = { lat: number; lng: number } | null;
const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function lireCache(): Record<string, Coord> {
  try {
    return JSON.parse(localStorage.getItem(CLE_CACHE) ?? "{}");
  } catch {
    return {};
  }
}
function ecrireCache(c: Record<string, Coord>) {
  try {
    localStorage.setItem(CLE_CACHE, JSON.stringify(c));
  } catch {
    /* stockage plein ou bloqué : on relocalisera la prochaine fois */
  }
}

/** Localise les lieux absents du cache, 4 à la fois. */
function useLieux(lieux: string[]) {
  const [coords, setCoords] = useState<Record<string, Coord>>(lireCache);
  const [enCours, setEnCours] = useState(0);
  const cle = lieux.join("|");
  useEffect(() => {
    let vivant = true;
    const cache = lireCache();
    const aFaire = lieux.filter((l) => !(normaliser(l) in cache));
    if (!aFaire.length) {
      setCoords(cache);
      return;
    }
    setEnCours(aFaire.length);
    (async () => {
      for (let i = 0; i < aFaire.length && vivant; i += 4) {
        const lot = aFaire.slice(i, i + 4);
        const res = await Promise.all(lot.map((l) => localiserLieu(l)));
        lot.forEach((l, k) => (cache[normaliser(l)] = res[k]));
        ecrireCache(cache);
        if (vivant) {
          setCoords({ ...cache });
          setEnCours(Math.max(0, aFaire.length - i - lot.length));
        }
      }
    })();
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return { coords, enCours };
}

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export default function Carte() {
  return (
    <CadreJournees titre="Carte des journées">
      <Contenu />
    </CadreJournees>
  );
}

interface Lieu {
  nom: string;
  client: string;
  journees: JourneeDepistage[];
  aVenir: number;
}

function Contenu() {
  const { extraction } = useJournees();
  const { index, statut: statutExp, source: sourceExp } = useExpertises();
  const [periode, setPeriode] = useState<Periode>("tout");
  const [client, setClient] = useState("");
  const [requis, setRequis] = useState("");

  const toutes = useMemo(() => extraction?.journees ?? [], [extraction]);
  const clients = useMemo(() => compterPar(toutes, (j) => j.client).map((c) => c.cle), [toutes]);
  const lesRequis = useMemo(() => compterPar(toutes, (j) => j.requis).map((c) => c.cle), [toutes]);
  const journees = useMemo(
    () => dansLaPeriode(toutes, periode).filter((j) => j.lieu && (!client || j.client === client) && (!requis || j.requis === requis)),
    [toutes, periode, client, requis],
  );

  // Un point = un client à un endroit (écritures identiques à la casse et aux accents près), avec
  // l'historique de ses journées.
  const lieux = useMemo(() => {
    const auj = aujourdhuiISO();
    const m = new Map<string, Lieu>();
    for (const j of journees) {
      const k = `${normaliser(j.lieu)}|${normaliser(j.client)}`;
      const l = m.get(k) ?? { nom: j.lieu, client: j.client, journees: [], aVenir: 0 };
      l.journees.push(j);
      if (!estPassee(j, auj)) l.aVenir++;
      m.set(k, l);
    }
    for (const l of m.values()) l.journees.sort((a, b) => b.date.localeCompare(a.date));
    return [...m.values()];
  }, [journees]);

  const { coords, enCours } = useLieux(useMemo(() => [...new Set(lieux.map((l) => l.nom))].sort(), [lieux]));
  const nonLocalises = lieux.filter((l) => coords[normaliser(l.nom)] === null);
  const nbEndroits = new Set(lieux.map((l) => normaliser(l.nom))).size;

  /**
   * Participants d'une journée = avis rendus. Une journée à venir n'en a pas encore ; une journée
   * passée après la date de l'extraction des expertises n'y figure pas encore (ce n'est pas « 0 »).
   */
  const participants = (j: JourneeDepistage) => {
    if (!estPassee(j, aujourdhuiISO())) return "à venir";
    if (statutExp !== "pret") return "…";
    const n = index.get(cleJournee(j))?.length ?? 0;
    if (!n && sourceExp?.date && j.date >= sourceExp.date) return "pas encore dans l'export";
    return String(n);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            type="button"
            onClick={() => setPeriode(p.cle)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              periode === p.cle ? "border-avisdoc-ink bg-avisdoc-ink text-white" : "border-border bg-card text-muted-foreground hover:text-avisdoc-ink",
            )}
          >
            {p.label}
          </button>
        ))}
        <Choix valeur={client} changer={setClient} options={clients} tous="Tous les clients" />
        <Choix valeur={requis} changer={setRequis} options={lesRequis} tous="Tous les requis" />
      </div>

      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-[12.5px] text-muted-foreground">
          <span>
            <b className="text-avisdoc-ink">{journees.length}</b> journée{journees.length > 1 ? "s" : ""} · <b className="text-avisdoc-ink">{lieux.length}</b> point
            {lieux.length > 1 ? "s" : ""} (client et lieu) · {nbEndroits} lieu{nbEndroits > 1 ? "x" : ""}
            {enCours > 0 && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Loader2 className="size-3.5 animate-spin" /> localisation de {enCours} lieu{enCours > 1 ? "x" : ""}…
              </span>
            )}
          </span>
          <span className="flex flex-wrap gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: COULEUR_AVENIR }} /> Avec une journée à venir
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full" style={{ background: COULEUR_PASSEE }} /> Journées passées
            </span>
            <span>Un point = un client à un lieu · taille = nombre de journées · clic pour l'historique</span>
          </span>
        </div>
        <CarteGoogle lieux={lieux} coords={coords} participants={participants} />
      </Card>

      {nonLocalises.length > 0 && (
        <Card className="p-4 text-[12.5px] text-muted-foreground">
          <MapPin className="mr-1 inline size-3.5" />
          Lieux non localisés (adresse introuvable) : {nonLocalises.map((l) => `${l.nom} – ${l.client} (${l.journees.length})`).join(", ")}.
        </Card>
      )}
    </>
  );
}

function CarteGoogle({
  lieux,
  coords,
  participants,
}: {
  lieux: Lieu[];
  coords: Record<string, Coord>;
  participants: (j: JourneeDepistage) => string;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const carteRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const marqueursRef = useRef<any[]>([]);
  const cadreRef = useRef("");
  const [etat, setEtat] = useState<"chargement" | "prete" | "sans-cle" | "erreur">("chargement");

  useEffect(() => {
    let annule = false;
    fetchMapsKey()
      .then((cle) => loadGoogleMaps(cle))
      .then((google) => {
        if (annule || !divRef.current) return;
        carteRef.current = new google.maps.Map(divRef.current, {
          center: { lat: 46.6, lng: 2.45 },
          zoom: 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });
        infoRef.current = new google.maps.InfoWindow();
        setEtat("prete");
      })
      .catch((e) => {
        if (!annule) setEtat(e?.message === "missing-key" ? "sans-cle" : "erreur");
      });
    return () => {
      annule = true;
    };
  }, []);

  useEffect(() => {
    if (etat !== "prete" || !carteRef.current) return;
    const google = (window as any).google;
    const carte = carteRef.current;
    marqueursRef.current.forEach((m) => m.setMap(null));
    marqueursRef.current = [];
    const cadre = new google.maps.LatLngBounds();
    const max = Math.max(1, ...lieux.map((l) => l.journees.length));

    // Plusieurs clients au même endroit : on les dispose en petit cercle autour du point.
    const parEndroit = new Map<string, Lieu[]>();
    for (const l of lieux) parEndroit.set(normaliser(l.nom), [...(parEndroit.get(normaliser(l.nom)) ?? []), l]);
    const position = (l: Lieu, c: { lat: number; lng: number }) => {
      const voisins = parEndroit.get(normaliser(l.nom)) ?? [l];
      if (voisins.length < 2) return c;
      const angle = (2 * Math.PI * voisins.indexOf(l)) / voisins.length;
      const r = 0.004; // ≈ 400 m : visible dès qu'on zoome sur la ville
      return { lat: c.lat + r * Math.cos(angle), lng: c.lng + (r * Math.sin(angle)) / Math.cos((c.lat * Math.PI) / 180) };
    };

    for (const l of lieux) {
      const base = coords[normaliser(l.nom)];
      if (!base) continue;
      const c = position(l, base);
      const n = l.journees.length;
      const marqueur = new google.maps.Marker({
        map: carte,
        position: c,
        title: `${l.client} · ${l.nom} · ${n} journée${n > 1 ? "s" : ""}`,
        label: n > 1 ? { text: String(n), color: "#ffffff", fontSize: "11px", fontWeight: "700" } : undefined,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8 + 10 * Math.sqrt(n / max),
          fillColor: l.aVenir ? COULEUR_AVENIR : COULEUR_PASSEE,
          fillOpacity: 0.9,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
        zIndex: l.aVenir ? 2 : 1,
      });
      marqueur.addListener("click", () => {
        const lignes = l.journees
          .map(
            (j) => `<tr>
              <td style="padding:4px 10px 4px 0;white-space:nowrap;font-weight:600">${echapper(jour(j.date))}</td>
              <td style="padding:4px 10px 4px 0">${echapper(j.lieu)}</td>
              <td style="padding:4px 10px 4px 0">${echapper(j.client)}</td>
              <td style="padding:4px 0;text-align:right;white-space:nowrap">${echapper(participants(j))}</td>
            </tr>`,
          )
          .join("");
        infoRef.current.setContent(`<div style="font-family:Inter,system-ui,sans-serif;font-size:12.5px;color:#142A33;max-height:260px;overflow:auto">
          <div style="font-weight:700;font-size:13.5px">${echapper(l.client)}</div>
          <div style="color:#5C6A6E;margin-bottom:6px">${echapper(l.nom)} · ${n} journée${n > 1 ? "s" : ""}${l.aVenir ? ` dont ${l.aVenir} à venir` : ""}</div>
          <table style="border-collapse:collapse">
            <thead><tr style="color:#5C6A6E;font-size:11px;text-align:left">
              <th style="padding:0 10px 4px 0;font-weight:600">Date</th>
              <th style="padding:0 10px 4px 0;font-weight:600">Lieu</th>
              <th style="padding:0 10px 4px 0;font-weight:600">Client</th>
              <th style="padding:0 0 4px;font-weight:600;text-align:right">Participants</th>
            </tr></thead>
            <tbody>${lignes}</tbody>
          </table></div>`);
        infoRef.current.open({ map: carte, anchor: marqueur });
      });
      marqueursRef.current.push(marqueur);
      cadre.extend(c);
    }

    // Recadrage seulement quand l'ensemble des lieux affichés change (pas à chaque localisation).
    const signature = lieux.map((l) => `${normaliser(l.nom)}|${normaliser(l.client)}`).sort().join("|");
    if (!cadre.isEmpty() && cadreRef.current !== signature && marqueursRef.current.length === lieux.filter((l) => coords[normaliser(l.nom)]).length) {
      cadreRef.current = signature;
      carte.fitBounds(cadre, 48);
      google.maps.event.addListenerOnce(carte, "idle", () => {
        if ((carte.getZoom() ?? 6) > 11) carte.setZoom(11);
      });
    }
  }, [etat, lieux, coords, participants]);

  return (
    <div className="relative h-[560px]">
      <div ref={divRef} className="absolute inset-0" />
      {etat !== "prete" && (
        <div className="absolute inset-0 flex items-center justify-center bg-card text-sm text-muted-foreground">
          {etat === "chargement" ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Chargement de la carte…
            </span>
          ) : etat === "sans-cle" ? (
            "Carte indisponible : la clé Google Maps n'est pas configurée."
          ) : (
            "La carte n'a pas pu être chargée."
          )}
        </div>
      )}
    </div>
  );
}
