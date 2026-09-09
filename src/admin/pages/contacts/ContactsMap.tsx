// Visualisation cartographique des contacts (Google Maps).
//
// - Charge l'API Google Maps à la demande (clé publique restreinte par domaine).
// - Place un marqueur par contact géolocalisé, coloré selon son type.
// - Géocode à la volée les contacts sans coordonnées (adresse → lat/lng) puis
//   met le résultat en cache via setContactGeo (une seule fois par contact).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { ContactType, NetworkContact } from "../../types";
import { typesDe } from "../../lib/ui-tokens";
import { GOOGLE_MAPS_KEY } from "../../lib/config";
import { loadGoogleMaps } from "../../lib/googleMaps";
import { useAdminData } from "../../data/AdminDataContext";
import { Card } from "../../components/ui";

// Couleurs des marqueurs, alignées sur les jetons de type de l'app.
const TYPE_COLOR: Record<ContactType, string> = {
  Requérant: "#0284c7", // sky-600
  Expert: "#059669", // emerald-600
  "Réseau d'Aval": "#d97706", // amber-600
};

const FRANCE_CENTER = { lat: 46.6, lng: 2.45 };

function adresseDe(c: NetworkContact): string {
  const base = c.adresse?.trim() || [c.codePostal, c.ville].filter(Boolean).join(" ");
  return base?.trim() ?? "";
}

export default function ContactsMap({
  contacts,
  onSelect,
}: {
  contacts: NetworkContact[];
  onSelect: (id: string) => void;
}) {
  const { setContactGeo } = useAdminData();
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const triedGeo = useRef<Set<string>>(new Set());
  const [state, setState] = useState<"loading" | "ready" | "no-key" | "error">("loading");

  // Chargement de l'API + initialisation de la carte (une fois).
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then((google) => {
        if (cancelled || !divRef.current) return;
        mapRef.current = new google.maps.Map(divRef.current, {
          center: FRANCE_CENTER,
          zoom: 5,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        infoRef.current = new google.maps.InfoWindow();
        geocoderRef.current = new google.maps.Geocoder();
        setState("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e?.message === "missing-key" ? "no-key" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)dessine les marqueurs + géocode ce qui manque, à chaque évolution.
  useEffect(() => {
    if (state !== "ready" || !mapRef.current) return;
    const w = window as any;
    const google = w.google;

    // Nettoyage.
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const bounds = new google.maps.LatLngBounds();
    let placed = 0;

    for (const c of contacts) {
      if (typeof c.lat !== "number" || typeof c.lng !== "number") continue;
      const type = typesDe(c)[0];
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: c.lat, lng: c.lng },
        title: c.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: TYPE_COLOR[type] ?? "#0f766e",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => {
        infoRef.current.setContent(
          `<div style="font:13px/1.4 system-ui,sans-serif;max-width:220px">
             <strong>${escapeHtml(c.name)}</strong><br/>
             <span style="color:#64748b">${escapeHtml(c.role || type)}</span><br/>
             <span style="color:#64748b">${escapeHtml(c.ville || "")}</span>
           </div>`,
        );
        infoRef.current.open(mapRef.current, marker);
        onSelect(c.id);
      });
      markersRef.current.push(marker);
      bounds.extend({ lat: c.lat, lng: c.lng });
      placed++;
    }

    if (placed > 0) {
      mapRef.current.fitBounds(bounds, 64);
      if (placed === 1) mapRef.current.setZoom(11);
    }

    // Géocodage différé des contacts sans coordonnées (une tentative par id).
    const toGeocode = contacts.filter(
      (c) =>
        (typeof c.lat !== "number" || typeof c.lng !== "number") &&
        !triedGeo.current.has(c.id) &&
        adresseDe(c),
    );
    let i = 0;
    let stop = false;
    const next = () => {
      if (stop || i >= toGeocode.length) return;
      const c = toGeocode[i++];
      triedGeo.current.add(c.id);
      geocoderRef.current.geocode(
        { address: adresseDe(c), componentRestrictions: { country: "FR" } },
        (results: any[], status: string) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            setContactGeo(c.id, loc.lat(), loc.lng());
          }
          // Throttle : ~5 requêtes/seconde max.
          window.setTimeout(next, 220);
        },
      );
    };
    next();

    return () => {
      stop = true;
    };
  }, [contacts, state, onSelect, setContactGeo]);

  if (state === "no-key") {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <MapPin className="size-8 text-avisdoc-coral" />
        <p className="max-w-md text-sm text-muted-foreground">
          Carte non configurée. Définissez la clé <code>VITE_GOOGLE_MAPS_KEY</code>
          {" "}(API Google Maps JavaScript, restreinte au domaine admin.avisdoc.fr)
          pour activer la visualisation géographique.
        </p>
      </Card>
    );
  }

  if (state === "error") {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <MapPin className="size-8 text-avisdoc-coral" />
        <p className="max-w-md text-sm text-muted-foreground">
          Impossible de charger la carte. Vérifiez la clé API et sa restriction de
          domaine dans la console Google Cloud.
        </p>
      </Card>
    );
  }

  const geoloc = contacts.filter((c) => typeof c.lat === "number").length;

  return (
    <Card className="relative overflow-hidden p-0">
      <div ref={divRef} className="h-[calc(100vh-260px)] min-h-[460px] w-full bg-muted" />

      {state === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Chargement de la carte…
        </div>
      )}

      {/* Légende */}
      <div className="absolute bottom-3 left-3 rounded-xl border border-border bg-card/95 px-3 py-2.5 text-[12px] shadow-soft backdrop-blur">
        <div className="mb-1.5 font-bold text-avisdoc-ink">Type de contact</div>
        <div className="flex flex-col gap-1">
          {(Object.keys(TYPE_COLOR) as ContactType[]).map((t) => (
            <div key={t} className="flex items-center gap-2 text-muted-foreground">
              <span
                className="inline-block size-2.5 rounded-full ring-2 ring-white"
                style={{ background: TYPE_COLOR[t] }}
              />
              {t}
            </div>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-1.5 text-[11px] text-muted-foreground/80">
          {geoloc}/{contacts.length} localisés
        </div>
      </div>
    </Card>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}
