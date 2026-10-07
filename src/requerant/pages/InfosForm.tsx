// Formulaire « Vos informations » (étape 1) : repris de l'annuaire à l'invitation,
// l'infirmière complète/corrige (civilité, date et lieu de naissance notamment).
// Ces données préremplissent le contrat.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import { Check, MapPin, Save } from "lucide-react";
import { toast } from "sonner";
import { portalRepo } from "../lib/repo";
import { fetchMapsKey, loadGooglePlaces } from "../lib/googleMaps";
import type { ReqInscription } from "../../admin/req/types";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-avisdoc-teal";

export default function InfosForm({ i, onSaved }: { i: ReqInscription; onSaved: () => void }) {
  const [civilite, setCivilite] = useState(i.civilite ?? "");
  const [prenom, setPrenom] = useState(i.prenom ?? "");
  const [nom, setNom] = useState(i.nom ?? "");
  const [profession, setProfession] = useState(i.profession ?? "");
  const [adresse, setAdresse] = useState(i.adresse ?? "");
  const [codePostal, setCodePostal] = useState(i.codePostal ?? "");
  const [ville, setVille] = useState(i.ville ?? "");
  // Autocomplétion du lieu d'exercice : Google Places si la clé est dispo,
  // sinon repli sur l'API Adresse BAN (gratuite, sans clé).
  const [sugs, setSugs] = useState<{ name: string; postcode: string; city: string; label: string }[]>([]);
  const [googleReady, setGoogleReady] = useState(false);
  const debounce = useRef<number | undefined>(undefined);
  const adresseRef = useRef<HTMLInputElement>(null);

  // Branche Google Places Autocomplete sur le champ adresse si possible.
  useEffect(() => {
    let annule = false;
    void (async () => {
      try {
        const key = await fetchMapsKey();
        if (!key || annule) return;
        const google = await loadGooglePlaces(key);
        if (annule || !adresseRef.current || !google?.maps?.places) return;
        const ac = new google.maps.places.Autocomplete(adresseRef.current, {
          types: ["address"],
          componentRestrictions: { country: "fr" },
          fields: ["address_components"],
        });
        ac.addListener("place_changed", () => {
          const comp: any[] = ac.getPlace()?.address_components ?? [];
          const get = (t: string) => comp.find((c) => c.types?.includes(t))?.long_name ?? "";
          const rue = [get("street_number"), get("route")].filter(Boolean).join(" ");
          setAdresse(rue || get("route"));
          setCodePostal(get("postal_code"));
          setVille(get("locality") || get("municipality"));
          setSugs([]);
        });
        setGoogleReady(true);
      } catch { /* repli BAN */ }
    })();
    return () => { annule = true; };
  }, []);

  const chercherAdresse = (q: string) => {
    if (googleReady) return; // Google gère l'autocomplétion
    window.clearTimeout(debounce.current);
    if (q.trim().length < 3) { setSugs([]); return; }
    debounce.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSugs((data?.features ?? []).map((f: { properties: Record<string, string> }) => ({
          name: f.properties.name ?? "",
          postcode: f.properties.postcode ?? "",
          city: f.properties.city ?? "",
          label: f.properties.label ?? "",
        })));
      } catch { setSugs([]); }
    }, 250);
  };

  const [rpps, setRpps] = useState(i.rpps ?? "");
  const [dateNaissance, setDateNaissance] = useState(i.dateNaissance ?? "");
  const [lieuNaissance, setLieuNaissance] = useState(i.lieuNaissance ?? "");
  const [busy, setBusy] = useState(false);
  const [ouvert, setOuvert] = useState(!i.infosCompletes);

  const manque =
    !civilite || !prenom.trim() || !nom.trim() || !profession.trim() || !adresse.trim() ||
    !rpps.trim() || !dateNaissance || !lieuNaissance.trim();

  const enregistrer = async () => {
    setBusy(true);
    try {
      await portalRepo.enregistrerInfos({
        civilite, prenom: prenom.trim(), nom: nom.trim(), profession: profession.trim(),
        adresse: adresse.trim(), codePostal: codePostal.trim(), ville: ville.trim(),
        rpps: rpps.trim(), dateNaissance, lieuNaissance: lieuNaissance.trim(),
      });
      toast.success("Informations enregistrées.");
      onSaved();
    } catch (e) {
      console.error(e);
      toast.error("L'enregistrement a échoué.");
    } finally {
      setBusy(false);
    }
  };

  if (i.infosCompletes && !ouvert) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700">
          <Check className="size-4" /> Vos informations sont complètes
        </span>
        <button type="button" onClick={() => setOuvert(true)} className="text-[12.5px] font-semibold text-avisdoc-teal underline">
          Modifier
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Vos informations</div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Reprises de l'Annuaire Santé — vérifiez et complétez (ces informations figureront sur votre convention).
      </p>

      <div className="mt-4 flex flex-col gap-2.5">
        <div className="flex gap-2">
          {(["Madame", "Monsieur"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCivilite(c)}
              className={cn(
                "flex-1 rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors",
                civilite === c ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border text-muted-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-2.5">
          <input className={inputCls} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          <input className={inputCls} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} />
        </div>
        <input className={inputCls} placeholder="Profession" value={profession} onChange={(e) => setProfession(e.target.value)} />
        <input className={inputCls} placeholder="N° RPPS" inputMode="numeric" value={rpps} onChange={(e) => setRpps(e.target.value)} />
        <div className="relative">
          <input
            ref={adresseRef}
            className={inputCls}
            placeholder="Lieu d'exercice (adresse)"
            value={adresse}
            onChange={(e) => { setAdresse(e.target.value); chercherAdresse(e.target.value); }}
            autoComplete="off"
          />
          {!googleReady && sugs.length > 0 && (
            <div className="absolute z-10 mt-1 flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-soft">
              {sugs.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => { setAdresse(s.name); setCodePostal(s.postcode); setVille(s.city); setSugs([]); }}
                  className="flex items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-[13px] transition-colors last:border-b-0 hover:bg-accent"
                >
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2.5">
          <input className={cn(inputCls, "w-28")} placeholder="Code postal" value={codePostal} onChange={(e) => setCodePostal(e.target.value)} />
          <input className={inputCls} placeholder="Ville" value={ville} onChange={(e) => setVille(e.target.value)} />
        </div>
        <label className="text-[12px] font-semibold text-muted-foreground">
          Date de naissance
          <input type="date" className={cn(inputCls, "mt-0.5")} value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} />
        </label>
        <input className={inputCls} placeholder="Lieu de naissance" value={lieuNaissance} onChange={(e) => setLieuNaissance(e.target.value)} />

        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={busy || manque}
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-[14px] font-bold text-white transition-colors disabled:opacity-50"
        >
          <Save className="size-4" /> {busy ? "Enregistrement…" : "Enregistrer mes informations"}
        </button>
        {manque && <p className="text-[12px] text-muted-foreground">Tous les champs sont requis pour la convention.</p>}
      </div>
    </div>
  );
}
