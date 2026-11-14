// Réseau d'aval — relevé d'une fiche Doctolib. L'opérateur ouvre lui-même la fiche
// sur Doctolib et clique sur le favori « Relever sur Doctolib » : le texte de CETTE
// page arrive ici (message entre fenêtres, accepté seulement depuis doctolib.fr).
// Rien n'est enregistré sans vérification : l'opérateur choisit le praticien, relit
// l'analyse, coche les signaux, puis enregistre. Aucun parcours automatique.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Card, PageHeader, SectionLabel } from "../../components/ui";
import { lectureSeuleActive } from "../../lib/lectureSeule";
import { DEPARTEMENTS, POPULATION_LIBELLE, TEXTES } from "../../reseau/libelles";
import { reseauRepo, type InfosDoctolib, type PraticienReseau } from "../../reseau/reseauRepo";
import { analyserFicheDoctolib, type FicheDoctolib } from "../../../../supabase/functions/_shared/doctolib-fiche";
import { urlDoctolibValide, urlPropre } from "../../../../supabase/functions/_shared/doctolib";
import { SIGNAUX, VALEUR_LIBELLE } from "../../../../supabase/functions/_shared/reseau-signaux";
import { cn } from "@/lib/utils";

const ORIGINE_DOCTOLIB = /^https:\/\/([a-z0-9-]+\.)*doctolib\.(fr|de|it)$/;

const sansAccents = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** « Dr Jean-Pierre Dupont Martin » → candidats de nom de famille, du plus probable au moins probable. */
function nomsDeFamille(nom: string | null): string[] {
  const mots = sansAccents(nom ?? "").replace(/^(dr|docteur|pr|professeur)\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (mots.length < 2) return mots;
  return [mots[mots.length - 1], mots.slice(-2).join(" "), mots.slice(1).join(" ")];
}

export default function ReleveDoctolib() {
  const navigate = useNavigate();
  const [recu, setRecu] = useState<{ url: string; texte: string } | null>(null);
  const [collerUrl, setCollerUrl] = useState("");
  const [collerTexte, setCollerTexte] = useState("");
  const lectureSeule = lectureSeuleActive();

  // Réception du relevé envoyé par le favori, depuis doctolib.fr seulement.
  useEffect(() => {
    const surMessage = (e: MessageEvent) => {
      if (!ORIGINE_DOCTOLIB.test(e.origin)) return;
      const d = e.data as { type?: string; url?: string; texte?: string } | null;
      if (!d || d.type !== "avisdoc-doctolib" || typeof d.url !== "string" || typeof d.texte !== "string") return;
      (e.source as Window | null)?.postMessage("avisdoc-doctolib-recu", e.origin);
      if (!urlDoctolibValide(d.url)) return;
      setRecu((r) => (r && r.url === urlPropre(d.url!) ? r : { url: urlPropre(d.url!), texte: d.texte!.slice(0, 80000) }));
    };
    window.addEventListener("message", surMessage);
    return () => window.removeEventListener("message", surMessage);
  }, []);

  return (
    <div>
      <Link to="/reseau-aval" className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-avisdoc-ink">
        <ArrowLeft className="size-4" /> Départements
      </Link>
      <PageHeader title="Relevé d'une fiche Doctolib" subtitle="Vérifiez l'analyse avant d'enregistrer : rien n'est enregistré sans vous." />

      {recu ? (
        <Verification recu={recu} lectureSeule={lectureSeule} onFini={(id, dep) => navigate(dep ? `/reseau-aval/${dep}?praticien=${id}` : "/reseau-aval")} onAutre={() => setRecu(null)} />
      ) : (
        <Card className="max-w-3xl p-5 text-[13.5px]">
          <p className="flex items-center gap-2 font-semibold text-avisdoc-ink"><Loader2 className="size-4 animate-spin" /> En attente d'une fiche Doctolib…</p>
          <p className="mt-2 text-muted-foreground">
            Ouvrez la fiche d'un praticien sur Doctolib, puis cliquez sur le favori « Relever sur Doctolib » de votre barre de favoris. Cette page reçoit la fiche et l'analyse.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-avisdoc-ink">Le favori ne fonctionne pas ? Collez la fiche à la main</summary>
            <p className="mt-2 text-[12.5px] text-muted-foreground">Sur la fiche Doctolib : sélectionnez tout (Cmd + A ou Ctrl + A), copiez, puis collez ci-dessous avec l'adresse de la page.</p>
            <input value={collerUrl} onChange={(e) => setCollerUrl(e.target.value)} placeholder="https://www.doctolib.fr/…"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px]" />
            <textarea value={collerTexte} onChange={(e) => setCollerTexte(e.target.value)} rows={6} placeholder="Texte de la fiche"
              className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-[13px]" />
            <button type="button" disabled={!urlDoctolibValide(collerUrl.trim()) || collerTexte.trim().length < 50}
              title={!urlDoctolibValide(collerUrl.trim()) ? "Collez l'adresse complète de la fiche Doctolib." : collerTexte.trim().length < 50 ? "Collez le texte de la fiche." : undefined}
              onClick={() => setRecu({ url: urlPropre(collerUrl.trim()), texte: collerTexte.slice(0, 80000) })}
              className="mt-2 rounded-full bg-avisdoc-teal px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">Analyser</button>
          </details>
        </Card>
      )}
    </div>
  );
}

function Verification({ recu, lectureSeule, onFini, onAutre }: {
  recu: { url: string; texte: string }; lectureSeule: boolean; onFini: (id: string, departement: string | null) => void; onAutre: () => void;
}) {
  const fiche: FicheDoctolib = useMemo(() => analyserFicheDoctolib(recu.texte), [recu.texte]);
  const [candidats, setCandidats] = useState<PraticienReseau[] | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [coches, setCoches] = useState<Set<number>>(() => new Set(fiche.signaux.map((_, i) => i)));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setCoches(new Set(fiche.signaux.map((_, i) => i)));
    let annule = false;
    (async () => {
      try {
        let trouves = await reseauRepo.praticiensPourDoctolib(recu.url, "");
        for (const n of nomsDeFamille(fiche.nom)) {
          if (trouves.length) break;
          trouves = await reseauRepo.praticiensPourDoctolib("", n);
        }
        if (annule) return;
        setCandidats(trouves);
        setChoisi(trouves.length === 1 ? trouves[0].id : null);
      } catch (e) {
        if (!annule) setErreur(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { annule = true; };
  }, [recu.url, fiche]);

  const praticien = candidats?.find((p) => p.id === choisi) ?? null;
  const motif = lectureSeule ? TEXTES.motifLectureSeule : !praticien ? "Choisissez le praticien concerné." : envoi ? "Enregistrement…" : null;

  const enregistrer = async () => {
    if (motif || !praticien) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const infos: InfosDoctolib = {
        specialite: fiche.specialite, expertises: fiche.expertises, conventionnement: fiche.conventionnement, carteVitale: fiche.carteVitale,
        teleconsultation: fiche.teleconsultation, tarifs: fiche.tarifs, langues: fiche.langues, presentation: fiche.presentation, adresses: fiche.adresses,
        premierCreneau: fiche.premierCreneau ? { date: fiche.premierCreneau.date, jours: fiche.premierCreneau.jours, valeur: fiche.premierCreneau.valeur } : null,
      };
      const signaux = fiche.signaux.filter((_, i) => coches.has(i)).map((s) => ({ type: s.type, valeur: s.valeur }));
      await reseauRepo.enregistrerFicheDoctolib(praticien.id, recu.url, infos, signaux);
      toast.success(`Fiche Doctolib de ${praticien.prenom} ${praticien.nom} enregistrée${signaux.length ? `, ${signaux.length} signal${signaux.length > 1 ? "aux" : ""} validé${signaux.length > 1 ? "s" : ""}` : ""}.`);
      onFini(praticien.id, praticien.lieux[0]?.departement ?? null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionLabel>Fiche relevée</SectionLabel>
        <a href={recu.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] font-semibold text-avisdoc-ink underline-offset-2 hover:underline">
          {recu.url.replace(/^https:\/\/(www\.)?/, "")} <ExternalLink className="size-3" />
        </a>
        <div className="mt-3 font-display text-lg font-semibold text-avisdoc-ink">{fiche.nom ?? "Nom non reconnu"}</div>
        {fiche.specialite && <div className="text-[12.5px] text-muted-foreground">{fiche.specialite}</div>}
        <Ligne titre="Premier créneau" valeur={fiche.premierCreneau ? `${VALEUR_LIBELLE[fiche.premierCreneau.valeur]}${fiche.premierCreneau.date ? ` (le ${new Date(fiche.premierCreneau.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })})` : ""}` : null} />
        <Ligne titre="Nouveaux patients" valeur={fiche.nouveauxPatients ? VALEUR_LIBELLE[fiche.nouveauxPatients.valeur] : null} />
        <Ligne titre="Conventionnement" valeur={fiche.conventionnement} />
        <Ligne titre="Carte Vitale" valeur={fiche.carteVitale === null ? null : fiche.carteVitale ? "Acceptée" : "Non acceptée"} />
        <Ligne titre="Téléconsultation" valeur={fiche.teleconsultation ? "Proposée" : null} />
        <Ligne titre="Langues" valeur={fiche.langues.join(", ") || null} />
        <Ligne titre="Tarifs" valeur={fiche.tarifs.join(" · ") || null} />
        <Ligne titre="Adresses" valeur={fiche.adresses.join(" · ") || null} />
        {fiche.expertises.length > 0 && (
          <>
            <SectionLabel className="mt-3">Expertises, actes et symptômes</SectionLabel>
            <div className="mt-1 flex flex-wrap gap-1">{fiche.expertises.map((x) => <Badge key={x} className="bg-muted text-avisdoc-ink">{x}</Badge>)}</div>
          </>
        )}
        {fiche.presentation && (
          <details className="mt-3 text-[12.5px]">
            <summary className="cursor-pointer font-semibold text-avisdoc-ink">Présentation</summary>
            <p className="mt-1 text-muted-foreground">{fiche.presentation}</p>
          </details>
        )}
        <p className="mt-3 text-[11.5px] text-muted-foreground">Une rubrique vide veut dire « non reconnue sur la page », jamais « non ».</p>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <SectionLabel>Praticien concerné</SectionLabel>
          {erreur && <div role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{erreur}</div>}
          {!candidats && !erreur && <p className="mt-2 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Recherche dans la liste…</p>}
          {candidats && candidats.length === 0 && (
            <p className="mt-2 text-[13px] text-muted-foreground">Aucun praticien de la liste à ce nom. Ajoutez-le d'abord (import du département ou « Ajouter par RPPS »), puis relevez à nouveau la fiche.</p>
          )}
          <div className="mt-2 space-y-1.5">
            {candidats?.map((p) => (
              <label key={p.id} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-[13px]", choisi === p.id ? "border-avisdoc-teal bg-sky-50/60" : "border-border")}>
                <input type="radio" name="praticien" className="mt-0.5" checked={choisi === p.id} onChange={() => setChoisi(p.id)} />
                <span>
                  <span className="font-semibold text-avisdoc-ink">{p.prenom} {p.nom}</span>{" "}
                  <span className="text-muted-foreground">· {POPULATION_LIBELLE[p.population]} · RPPS {p.rpps}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {[...new Set(p.lieux.map((l) => [l.commune, DEPARTEMENTS[l.departement]].filter(Boolean).join(", ")))].join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionLabel>Signaux à enregistrer</SectionLabel>
          {fiche.signaux.length === 0 && <p className="mt-2 text-[13px] text-muted-foreground">Aucun signal reconnu sur cette fiche. Les informations seront tout de même enregistrées.</p>}
          <div className="mt-2 space-y-1.5">
            {fiche.signaux.map((s, i) => (
              <label key={`${s.type}-${i}`} className={cn("flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-[13px]", coches.has(i) ? "border-avisdoc-teal bg-sky-50/60" : "border-border")}>
                <input type="checkbox" className="mt-0.5" checked={coches.has(i)}
                  onChange={() => setCoches((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
                <span>
                  <span className="font-semibold text-avisdoc-ink">{SIGNAUX[s.type].libelle} : {VALEUR_LIBELLE[s.valeur] ?? s.valeur}</span>
                  <span className="block text-[12px] italic text-muted-foreground">« {s.extrait} »</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Chaque signal coché est validé à votre nom, avec la fiche Doctolib comme source.</p>
        </Card>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onAutre} className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground">Ignorer ce relevé</button>
          <button type="button" onClick={() => void enregistrer()} disabled={!!motif} title={motif ?? undefined}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {envoi ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Enregistrer
          </button>
        </div>
        {motif && <p className="text-right text-[12px] text-muted-foreground">{motif}</p>}
      </div>
    </div>
  );
}

function Ligne({ titre, valeur }: { titre: string; valeur: string | null }) {
  return (
    <div className="mt-2 grid grid-cols-[130px_1fr] gap-2 text-[13px]">
      <span className="text-muted-foreground">{titre}</span>
      <span className={valeur ? "text-avisdoc-ink" : "text-muted-foreground/70"}>{valeur ?? "non reconnu"}</span>
    </div>
  );
}
