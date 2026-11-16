// Réseau d'aval — la liste d'un département sous forme de carte : un point par
// lieu d'exercice dans le département, coloré selon la population, entouré quand le
// praticien a donné son accord. Un clic ouvre sa fiche. Les coordonnées viennent de
// l'API Adresse (BAN), calculées par la recherche des liens (aucun géocodage ici).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Card } from "../../components/ui";
import { fetchMapsKey, loadGoogleMaps } from "../../lib/googleMaps";
import { POPULATION_LIBELLE, POPULATIONS, type Population } from "../../reseau/libelles";
import type { PraticienReseau } from "../../reseau/reseauRepo";

const COULEUR: Record<Population, string> = {
  DERM: "#0f766e", // teal-700
  ORL: "#7c3aed", // violet-600
  PLAST: "#db2777", // pink-600
  CHIR: "#d97706", // amber-600
  MG_DERM: "#0284c7", // sky-600
};

const echapper = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// Contours des départements : API Découpage administratif d'abord, sinon le fichier public
// france-geojson (IGN, Licence Ouverte) — chargé une fois, gardé en mémoire.
const SOURCE_CONTOURS = "https://cdn.jsdelivr.net/gh/gregoiredavid/france-geojson@master/departements-version-simplifiee.geojson";
let contoursFrance: Promise<any | null> | null = null;

async function depuisGeoApi(code: string): Promise<any | null> {
  const r = await fetch(`https://geo.api.gouv.fr/departements/${encodeURIComponent(code)}?fields=contour&format=geojson&geometry=contour`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(String(r.status));
  const geo = await r.json();
  const geometrie = geo?.type === "Feature" ? geo.geometry : geo?.contour ?? (geo?.type === "Polygon" || geo?.type === "MultiPolygon" ? geo : null);
  if (geometrie?.type === "Polygon" || geometrie?.type === "MultiPolygon") return { type: "Feature", geometry: geometrie, properties: { code } };
  throw new Error("sans contour");
}

async function depuisFichier(code: string): Promise<any | null> {
  contoursFrance ??= fetch(SOURCE_CONTOURS, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const tous = await contoursFrance;
  if (!tous) { contoursFrance = null; throw new Error("fichier indisponible"); }
  const f = (tous.features ?? []).find((x: any) => String(x?.properties?.code ?? "").toUpperCase() === code.toUpperCase());
  if (!f) throw new Error("département absent");
  return f;
}

/** Les deux sources en même temps : la première qui répond l'emporte. */
async function contourDepartement(code: string): Promise<any | null> {
  // Équivalent de Promise.any (non disponible dans la cible TypeScript du projet).
  return new Promise((resoudre) => {
    let echecs = 0;
    for (const p of [depuisGeoApi(code), depuisFichier(code)]) {
      p.then((v) => resoudre(v)).catch(() => { if (++echecs === 2) resoudre(null); });
    }
  });
}

/**
 * Masque gris autour du département : un grand rectangle dont le département est « percé »
 * (chaque polygone du département devient un trou, sens inverse comme le veut GeoJSON).
 */
function masqueAutour(contour: any): any {
  const polygones: number[][][][] = contour.geometry.type === "Polygon" ? [contour.geometry.coordinates] : contour.geometry.coordinates;
  const exterieur = [[-30, 20], [40, 20], [40, 65], [-30, 65], [-30, 20]];
  const trous = polygones.map((p) => [...p[0]].reverse());
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [exterieur, ...trous] }, properties: { masque: true } };
}

export default function ReseauCarte({ praticiens, departement, scores, selection, onSelect }: {
  praticiens: PraticienReseau[];
  departement: string;
  scores: Map<string, { probabilite: number }>;
  selection: string | null;
  onSelect: (id: string) => void;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const carteRef = useRef<any>(null);
  const infoRef = useRef<any>(null);
  const marqueursRef = useRef<any[]>([]);
  const cadreRef = useRef<string>("");
  const [etat, setEtat] = useState<"chargement" | "prete" | "sans-cle" | "erreur">("chargement");

  useEffect(() => {
    let annule = false;
    fetchMapsKey()
      .then((cle) => loadGoogleMaps(cle))
      .then((google) => {
        if (annule || !divRef.current) return;
        carteRef.current = new google.maps.Map(divRef.current, {
          center: { lat: 46.6, lng: 2.45 }, zoom: 6, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        setEtat("prete");
      })
      .catch((e) => { if (!annule) setEtat(e?.message === "missing-key" ? "sans-cle" : "erreur"); });
    return () => { annule = true; };
  }, []);

  // Contour officiel du département (API Découpage administratif, geo.api.gouv.fr) : dessiné,
  // et la carte est cadrée et bornée dessus. Sans contour (réseau), cadrage sur les lieux.
  const contourRef = useRef<string | null>(null);
  useEffect(() => {
    if (etat !== "prete" || !carteRef.current) return;
    const google = (window as any).google;
    const carte = carteRef.current;
    let annule = false;
    carte.data.forEach((f: any) => carte.data.remove(f));
    carte.setOptions({ restriction: null, minZoom: null });
    contourRef.current = null;
    contourDepartement(departement)
      .then((geo) => {
        if (annule || !geo) return;
        carte.data.addGeoJson(masqueAutour(geo));
        carte.data.addGeoJson(geo);
        carte.data.setStyle((f: any) => f.getProperty("masque")
          ? { fillColor: "#475569", fillOpacity: 0.35, strokeWeight: 0, clickable: false, zIndex: 0 }
          : { fillOpacity: 0, strokeColor: "#0e7490", strokeOpacity: 0.8, strokeWeight: 2, clickable: false, zIndex: 1 });
        const cadre = new google.maps.LatLngBounds();
        carte.data.forEach((f: any) => { if (!f.getProperty("masque")) f.getGeometry().forEachLatLng((p: any) => cadre.extend(p)); });
        if (cadre.isEmpty()) return;
        carte.fitBounds(cadre, 16);
        // Bornes : le département et une petite marge, pas au-delà (on peut zoomer, pas s'éloigner).
        const ne = cadre.getNorthEast(), so = cadre.getSouthWest();
        const dLat = (ne.lat() - so.lat()) * 0.15, dLng = (ne.lng() - so.lng()) * 0.15;
        google.maps.event.addListenerOnce(carte, "idle", () => {
          if (annule) return;
          carte.setOptions({
            restriction: { latLngBounds: { north: ne.lat() + dLat, south: so.lat() - dLat, east: ne.lng() + dLng, west: so.lng() - dLng }, strictBounds: false },
            minZoom: Math.max(5, (carte.getZoom() ?? 8) - 1),
          });
        });
        contourRef.current = departement;
        cadreRef.current = "";
      })
      .catch(() => { /* sans contour : cadrage sur les lieux (effet suivant) */ });
    return () => { annule = true; };
  }, [etat, departement]);

  useEffect(() => {
    if (etat !== "prete" || !carteRef.current) return;
    const google = (window as any).google;
    marqueursRef.current.forEach((m) => m.setMap(null));
    marqueursRef.current = [];
    const cadre = new google.maps.LatLngBounds();
    let places = 0;
    for (const p of praticiens) {
      for (const l of p.lieux.filter((x) => x.departement === departement && x.lat != null && x.lng != null)) {
        const choisi = p.id === selection;
        const m = new google.maps.Marker({
          map: carteRef.current,
          position: { lat: l.lat, lng: l.lng },
          title: `${p.prenom} ${p.nom}`,
          zIndex: choisi ? 1000 : undefined,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: choisi ? 11 : 7,
            fillColor: COULEUR[p.population],
            fillOpacity: p.etat === "exclu" ? 0.3 : 1,
            strokeColor: p.etat === "accord" ? "#059669" : "#ffffff",
            strokeWeight: p.etat === "accord" ? 4 : 2,
          },
        });
        m.addListener("click", () => {
          const score = Math.round((scores.get(p.id)?.probabilite ?? 0) * 100);
          infoRef.current.setContent(
            `<div style="font:13px/1.4 system-ui,sans-serif;max-width:240px">
               <strong>${echapper(`${p.prenom} ${p.nom}`)}</strong><br/>
               <span style="color:#64748b">${echapper(POPULATION_LIBELLE[p.population])} · ${score} %</span><br/>
               <span style="color:#64748b">${echapper([l.raisonSociale, l.commune].filter(Boolean).join(", "))}</span>
             </div>`,
          );
          infoRef.current.open(carteRef.current, m);
          onSelect(p.id);
        });
        marqueursRef.current.push(m);
        cadre.extend({ lat: l.lat, lng: l.lng });
        places++;
      }
    }
    // Recadrer seulement quand la liste change, pas à chaque sélection.
    const cle = `${departement}|${praticiens.map((p) => p.id).join(",")}`;
    // Le contour du département, s'il est chargé, fixe déjà le cadre.
    if (places > 0 && cadreRef.current !== cle && contourRef.current !== departement) {
      carteRef.current.fitBounds(cadre, 48);
      if (places === 1) carteRef.current.setZoom(12);
      cadreRef.current = cle;
    }
  }, [etat, praticiens, departement, scores, selection, onSelect]);

  if (etat === "sans-cle" || etat === "erreur") {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <MapPin className="size-8 text-avisdoc-coral" />
        <p className="max-w-md text-sm text-muted-foreground">
          {etat === "sans-cle" ? "Carte non configurée : la clé Google Maps du Hub est absente." : "Impossible de charger la carte. Vérifiez la clé Google Maps du Hub."}
        </p>
      </Card>
    );
  }

  const lieuxIci = praticiens.flatMap((p) => p.lieux.filter((l) => l.departement === departement));
  const localises = lieuxIci.filter((l) => l.lat != null).length;
  const presentes = POPULATIONS.filter((x) => praticiens.some((p) => p.population === x));

  return (
    <Card className="relative overflow-hidden p-0">
      <div ref={divRef} className="h-[calc(100vh-300px)] min-h-[460px] w-full bg-muted" />
      {etat === "chargement" && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Chargement de la carte…</div>}
      <div className="absolute bottom-3 left-3 rounded-xl border border-border bg-card/95 px-3 py-2.5 text-[12px] shadow-soft backdrop-blur">
        <div className="mb-1.5 font-bold text-avisdoc-ink">Population</div>
        <div className="flex flex-col gap-1">
          {presentes.map((x) => (
            <div key={x} className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-block size-2.5 rounded-full ring-2 ring-white" style={{ background: COULEUR[x] }} /> {POPULATION_LIBELLE[x]}
            </div>
          ))}
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-block size-2.5 rounded-full bg-slate-300 ring-[3px] ring-emerald-600" /> Accord donné
          </div>
        </div>
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
          {localises}/{lieuxIci.length} lieux localisés
          {localises < lieuxIci.length && <span className="block">Les autres le seront par la recherche des liens.</span>}
        </div>
      </div>
    </Card>
  );
}
