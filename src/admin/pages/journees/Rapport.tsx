// Rapport client — bilan des journées de dépistage d'un contrat (client + devis) ou d'une journée,
// aux couleurs AvisDoc (charte : crème, bleu marine, cyan, accents orange ; Newsreader + Hanken Grotesk).
//
// Page à part, sans le menu du Hub : on l'imprime ou on l'enregistre en PDF depuis le navigateur.
// Seulement au-delà de 20 expertises, et sans aucun chiffre par personne : le client reçoit des
// totaux et des proportions, jamais de quoi reconnaître quelqu'un.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Loader2, Printer } from "lucide-react";
import logo from "@/assets/avisdoc-logo.png";
import { useExpertises, useJournees } from "../../data/journeesStore";
import { cleJournee, issueDe, rapportPossible, resumer, SEUIL_RAPPORT, type Expertise } from "../../lib/expertises";
import type { JourneeDepistage } from "../../lib/journees";

// Charte AvisDoc.
const C = {
  creme: "#F7F4EF",
  marine: "#142A33",
  cyan: "#0CA6DF",
  orange: "#EC7735",
  ardoise: "#5C6A6E",
  filet: "#E3DCD2",
  cyanClair: "#EAF6FB",
  taupe: "#9A8E7F",
};
const SERIF = "'Newsreader', Georgia, serif";
const SANS = "'Hanken Grotesk', Arial, sans-serif";

const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const jourCourt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

/** Pourcentages arrondis dont la somme fait exactement 100 (méthode du plus fort reste). */
function centPourCent(valeurs: number[]): number[] {
  const total = valeurs.reduce((s, v) => s + v, 0);
  if (!total) return valeurs.map(() => 0);
  const bruts = valeurs.map((v) => (v / total) * 100);
  const arrondis = bruts.map(Math.floor);
  let reste = 100 - arrondis.reduce((s, v) => s + v, 0);
  for (const i of bruts.map((b, i) => [b - Math.floor(b), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) {
    if (reste-- <= 0) break;
    arrondis[i]++;
  }
  return arrondis;
}
const nb = (n: number) => n.toLocaleString("fr-FR");

const POLICES =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,500&display=swap";

/** Charge les polices de la charte le temps de la page. */
function usePolicesCharte() {
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = POLICES;
    document.head.appendChild(l);
    return () => l.remove();
  }, []);
}

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/**
 * Fabrique le PDF dans le navigateur et le télécharge, sans passer par l'impression : sous Safari,
 * « Enregistrer au format PDF » depuis la boîte d'impression produisait un fichier vide.
 * La page est photographiée en haute définition (×2) puis posée sur des feuilles A4 ; quand le
 * rapport fait plusieurs pages, la coupure tombe entre deux lignes du tableau, jamais au milieu.
 * Les deux bibliothèques ne sont chargées qu'au clic.
 */
async function fabriquerPdf(nom: string): Promise<Blob | null> {
  const page = document.querySelector<HTMLElement>(".rapport-page");
  if (!page) return null;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  // Les polices de la charte doivent être là avant la photo, sinon le PDF sort en police de secours.
  const polices = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (polices) {
    await Promise.race([
      Promise.all(["600 30px 'Newsreader'", "400 12px 'Hanken Grotesk'", "700 12px 'Hanken Grotesk'"].map((f) => polices.load(f))).then(() => polices.ready),
      new Promise((ok) => setTimeout(ok, 4000)),
    ]);
  }

  // Points de coupure possibles (bas de chaque ligne et de chaque bloc), en pixels CSS depuis le haut de la page.
  // Mesurés sur la copie elle-même (marges réduites), dans onclone ci-dessous.
  let coupures: number[] = [];

  const echelle = 2;
  const canvas = await html2canvas(page, {
    scale: echelle,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    // Sur la copie photographiée : pas d'ombre, pas de hauteur imposée.
    onclone: (doc) => {
      const p = doc.querySelector<HTMLElement>(".rapport-page");
      if (!p) return;
      Object.assign(p.style, { boxShadow: "none", minHeight: "0", padding: "12mm 15mm 10mm" });
      const haut = p.getBoundingClientRect().top;
      coupures = [...p.querySelectorAll<HTMLElement>("tr, .rapport-bloc")].map((el) => el.getBoundingClientRect().bottom - haut);
    },
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pxParMm = canvas.width / 210;
  const hauteurFeuille = Math.floor(297 * pxParMm);
  const limites = coupures.map((c) => Math.round(c * echelle)).sort((a, b) => a - b);
  let y = 0;
  let premiere = true;
  while (y < canvas.height - 2 * pxParMm) {
    let fin = Math.min(y + hauteurFeuille, canvas.height);
    if (fin < canvas.height) {
      const propre = limites.filter((l) => l > y + hauteurFeuille * 0.5 && l <= fin).pop();
      if (propre) fin = propre;
    }
    const morceau = document.createElement("canvas");
    morceau.width = canvas.width;
    morceau.height = fin - y;
    const ctx = morceau.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, morceau.width, morceau.height);
    ctx.drawImage(canvas, 0, y, canvas.width, fin - y, 0, 0, canvas.width, fin - y);
    if (!premiere) pdf.addPage();
    pdf.addImage(morceau.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, (fin - y) / pxParMm);
    premiere = false;
    y = fin;
  }
  pdf.setProperties({ title: nom, creator: "AvisDoc" });
  return pdf.output("blob");
}

/**
 * Téléchargement par un lien nommé, dans le geste même du clic : un téléchargement lancé plusieurs
 * secondes après (le temps de fabriquer le PDF) perd son nom, ou est bloqué par Safari.
 */
function enregistrer(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  // Nom de fichier sans accents : certains navigateurs refusent un nom accentué et retombent sur « download ».
  const fichier = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "");
  lien.download = `${fichier}.pdf`;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Le document imprimé : le rapport seul, sans rien du Hub autour. */
export function documentImprimable(pageHtml: string, titre: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${echapper(titre)}</title>
<link rel="stylesheet" href="${POLICES}">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  .rapport-page { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; width: 210mm !important; padding: 12mm 15mm 10mm !important; }
  tr, .rapport-bloc { break-inside: avoid; }
</style></head><body>${pageHtml}</body></html>`;
}

/**
 * Imprime le rapport depuis un cadre invisible qui ne contient que lui. Imprimer la page du Hub
 * mêlait les styles et la mise en page de l'application au rapport ; ici, le navigateur ne voit
 * que le rapport, ses styles, son logo et ses polices. Le titre du cadre devient le nom du PDF.
 */
function imprimer(titre: string) {
  const page = document.querySelector<HTMLElement>(".rapport-page");
  if (!page) return window.print();
  const copie = page.cloneNode(true) as HTMLElement;
  copie.querySelectorAll("img").forEach((img) => img.setAttribute("src", (img as HTMLImageElement).src)); // adresses absolues
  const cadre = document.createElement("iframe");
  cadre.setAttribute("aria-hidden", "true");
  Object.assign(cadre.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.appendChild(cadre);
  const doc = cadre.contentDocument;
  const fen = cadre.contentWindow;
  if (!doc || !fen) {
    cadre.remove();
    return window.print();
  }
  doc.open();
  doc.write(documentImprimable(copie.outerHTML, titre));
  doc.close();
  const images = [...doc.images].map((img) => (img.complete ? Promise.resolve() : new Promise((ok) => ((img.onload = ok), (img.onerror = ok)))));
  const polices = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
  // Au plus 3 s d'attente : une police lente ne doit pas bloquer l'impression.
  Promise.race([Promise.all([...images, polices]), new Promise((ok) => setTimeout(ok, 3000))]).then(() => {
    fen.focus();
    fen.print();
    setTimeout(() => cadre.remove(), 60_000);
  });
}

export default function Rapport() {
  usePolicesCharte();
  const [params] = useSearchParams();
  const { extraction, statut } = useJournees();
  const { index, statut: statutExp, source: sourceExp } = useExpertises();

  const portee = useMemo(() => {
    const toutes = extraction?.journees ?? [];
    const cle = params.get("journee");
    if (cle) {
      const j = toutes.find((x) => cleJournee(x) === cle);
      return j ? { titre: j.client, sousTitre: `Journée du ${jourLong(j.date)} · ${j.lieu}`, journees: [j], uneJournee: true } : null;
    }
    const client = params.get("client") ?? "";
    const devis = params.get("devis") ?? "";
    const journees = toutes.filter((j) => j.client === client && j.devis === devis).sort((a, b) => a.date.localeCompare(b.date));
    return journees.length ? { titre: client, sousTitre: devis ? `Devis ${devis}` : "", journees, uneJournee: false } : null;
  }, [extraction, params]);

  const lignes = useMemo(
    () => (portee?.journees ?? []).map((j) => ({ j, avis: index.get(cleJournee(j)) ?? [] })).filter((l) => l.avis.length > 0),
    [portee, index],
  );
  const avis = useMemo(() => lignes.flatMap((l) => l.avis), [lignes]);

  // Le navigateur propose le titre de la page comme nom du PDF : on le rend précis.
  // « AvisDoc - Bilan des journées - Groupama Rhône-Alpes-Auvergne - DEV 2026 051 - 2026-11-14 »
  useEffect(() => {
    if (!portee) return;
    const avant = document.title;
    const auj = new Date().toISOString().slice(0, 10);
    const j = portee.journees[0];
    const morceaux = portee.uneJournee
      ? ["AvisDoc", "Bilan de la journée", portee.titre, j?.date, j?.lieu]
      : ["AvisDoc", "Bilan des journées", portee.titre, portee.sousTitre.replace(/^Devis /, ""), auj];
    document.title = morceaux
      .filter(Boolean)
      .join(" - ")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return () => {
      document.title = avant;
    };
  }, [portee]);

  if (statut !== "pret" || statutExp !== "pret") {
    return (
      <Ecran>
        <Loader2 className="size-5 animate-spin" /> Préparation du rapport…
      </Ecran>
    );
  }
  if (!portee) return <Ecran>Journée ou contrat introuvable dans l'extraction.</Ecran>;
  if (!rapportPossible(avis.length)) {
    return (
      <Ecran>
        Rapport indisponible : {avis.length} expertise{avis.length > 1 ? "s" : ""} pour cette sélection. Il en faut plus de {SEUIL_RAPPORT}, pour que les chiffres ne puissent désigner personne.
      </Ecran>
    );
  }

  return (
    <div style={{ background: "#e9e6e1", minHeight: "100vh", padding: "24px 0" }} className="rapport-fond">
      <style>{`
        @page { size: A4; margin: 0; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; }
          .rapport-fond { background: none !important; padding: 0 !important; min-height: 0 !important; }
          .rapport-actions { display: none !important; }
          /* Pas de hauteur imposée à l'impression : forcer exactement une A4 faisait déborder
             le pied de page sur une 2e feuille presque blanche. Un rapport long continue
             simplement sur la page suivante. */
          .rapport-page { box-shadow: none !important; margin: 0 !important; min-height: 0 !important; width: auto !important; padding: 12mm 15mm 10mm !important; }
          .rapport-page tr, .rapport-page .rapport-bloc { break-inside: avoid; }
        }
        .rapport-page, .rapport-page * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>
      <Actions />
      <Page portee={portee} lignes={lignes} avis={avis} dateExport={sourceExp?.date ?? ""} />
    </div>
  );
}

/** Le PDF est préparé dès que le rapport est affiché (polices chargées) ; le clic l'enregistre aussitôt. */
function Actions() {
  const [pdf, setPdf] = useState<{ blob: Blob; nom: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    const t = window.setTimeout(async () => {
      try {
        const nom = document.title || "AvisDoc - Bilan";
        const blob = await fabriquerPdf(nom);
        if (vivant && blob) setPdf({ blob, nom });
      } catch (e) {
        if (vivant) setErreur(e instanceof Error ? e.message : String(e));
      }
    }, 1000);
    return () => {
      vivant = false;
      window.clearTimeout(t);
    };
  }, []);
  const enCours = !pdf && !erreur;
  const telecharger = () => pdf && enregistrer(pdf.blob, pdf.nom);
  const bouton = { display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, padding: "10px 18px", fontWeight: 600, cursor: "pointer" } as const;
  return (
    <div className="rapport-actions" style={{ maxWidth: "210mm", margin: "0 auto 16px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, fontFamily: SANS }}>
      {erreur && <span style={{ color: C.orange, fontSize: 13, marginRight: "auto" }}>Le PDF n'a pas pu être fabriqué : {erreur}</span>}
      <button type="button" onClick={() => imprimer(document.title)} style={{ ...bouton, background: "#fff", color: C.marine, border: `1px solid ${C.filet}` }}>
        <Printer size={16} /> Imprimer
      </button>
      <button type="button" onClick={telecharger} disabled={!pdf} style={{ ...bouton, background: C.marine, color: "#fff", border: 0, opacity: pdf ? 1 : 0.7, cursor: pdf ? "pointer" : "wait" }}>
        {enCours ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {enCours ? "Préparation du PDF…" : "Télécharger le PDF"}
      </button>
    </div>
  );
}

function Ecran({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 24, background: C.creme, color: C.marine, fontFamily: SANS, textAlign: "center" }}>
      {children}
    </div>
  );
}

interface Portee {
  titre: string;
  sousTitre: string;
  journees: JourneeDepistage[];
  uneJournee: boolean;
}

function Page({ portee, lignes, avis, dateExport }: { portee: Portee; lignes: { j: JourneeDepistage; avis: Expertise[] }[]; avis: Expertise[]; dateExport: string }) {
  const r = resumer(avis);
  const n = { non: 0, consult: 0, exerese: 0 };
  for (const e of avis) {
    const i = issueDe(e);
    if (i === "non-indispensable") n.non++;
    else if (i === "consultation") n.consult++;
    else if (i === "exerese") n.exerese++;
  }
  const [pNon, pConsult, pExerese] = centPourCent([n.non, n.consult, n.exerese]);
  const debut = lignes[0]?.j.date ?? "";
  const fin = lignes[lignes.length - 1]?.j.date ?? "";
  const edite = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const moisEdition = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  // Un délai n'est montré que s'il repose sur assez d'avis mesurés.
  const delaiFiable = r.delais.mesures > SEUIL_RAPPORT && r.delais.mediane !== null;

  const recos = [
    { label: "Consultation dermatologique non indispensable", n: n.non, p: pNon, couleur: C.cyan },
    { label: "Consultation dermatologique conseillée", n: n.consult, p: pConsult, couleur: C.marine },
    { label: "Exérèse indispensable", n: n.exerese, p: pExerese, couleur: C.orange },
  ];

  return (
    <div
      className="rapport-page"
      style={{
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        background: "#fff",
        color: C.marine,
        fontFamily: SANS,
        boxShadow: "0 10px 40px rgba(20,42,51,.15)",
        padding: "16mm 16mm 12mm",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* En-tête */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={logo} alt="AvisDoc" style={{ height: 44 }} />
        <div style={{ fontSize: 10, color: C.taupe, textAlign: "right" }}>
          Édité le {edite}
          {dateExport && (
            <>
              <br />
              Données arrêtées au {jourLong(dateExport)}
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: "12mm", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.18em", color: C.orange }}>
        BILAN {portee.uneJournee ? "DE LA JOURNÉE" : "DES JOURNÉES"} DE DÉPISTAGE
      </div>
      <h1 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 30, lineHeight: 1.15, margin: "6px 0 4px" }}>{portee.titre}</h1>
      <div style={{ fontSize: 12.5, color: C.ardoise }}>
        {[portee.sousTitre, !portee.uneJournee && debut ? (debut === fin ? jourLong(debut) : `du ${jourLong(debut)} au ${jourLong(fin)}`) : ""].filter(Boolean).join(" · ")}
      </div>

      {/* Chiffres clés */}
      <div className="rapport-bloc" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: "9mm" }}>
        {(
          [
            [nb(r.total), "avis dermatologiques rendus"],
            [portee.uneJournee ? `${nb(r.requis.length)}` : nb(lignes.length), portee.uneJournee ? "dermatologue(s) mobilisé(s)" : "journées réalisées"],
            [`${pNon} %`, "des avis sans consultation nécessaire"],
            [`${pConsult + pExerese} %`, "des avis orientant vers un dermatologue"],
          ] as const
        ).map(([v, l]) => (
          <div key={l} style={{ background: C.creme, border: "1px solid #ECE6DC", borderRadius: 12, padding: "12px 12px 10px" }}>
            <div style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 600, color: C.cyan, lineHeight: 1 }}>{v}</div>
            <div style={{ marginTop: 6, fontSize: 10.5, color: C.ardoise, lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Recommandations */}
      <Section numero="01" titre="Ce que les dermatologues ont recommandé" />
      <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", gap: 2 }}>
        {recos.filter((x) => x.n > 0).map((x) => (
          <div key={x.label} style={{ flex: x.n, background: x.couleur }} />
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {recos.map((x) => (
          <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: x.couleur, flex: "none" }} />
            <span style={{ flex: 1 }}>{x.label}</span>
            <span style={{ fontWeight: 700 }}>{x.p} %</span>
            <span style={{ width: 70, textAlign: "right", color: C.ardoise }}>{nb(x.n)} avis</span>
          </div>
        ))}
      </div>
      <p className="rapport-bloc" style={{ marginTop: 10, fontSize: 11.5, color: C.ardoise, lineHeight: 1.45 }}>
        Dans {pNon} % des avis, le dermatologue a jugé qu'une consultation n'était pas nécessaire. Pour les {nb(n.consult + n.exerese)} autres, une consultation
        dermatologique a été conseillée{n.exerese ? `, dont ${nb(n.exerese)} avec une exérèse jugée indispensable` : ""}
        {r.delaiRecoMedian ? `, dans un délai médian de ${r.delaiRecoMedian} jours` : ""}.
      </p>

      {/* Délais */}
      {delaiFiable && (
        <>
          <Section numero="02" titre="La rapidité des avis" />
          <div className="rapport-bloc" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {(
              [
                [`${Math.round(r.delais.mediane as number)} h`, "délai médian entre la demande et l'avis"],
                [`${pct(r.delais.sous24h, r.delais.mesures)} %`, "des avis rendus en moins de 24 h"],
                [`${pct(r.delais.sous48h, r.delais.mesures)} %`, "des avis rendus en moins de 48 h"],
              ] as const
            ).map(([v, l]) => (
              <div key={l} style={{ background: C.cyanClair, borderRadius: 12, padding: "10px 12px" }}>
                <div style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: C.marine }}>{v}</div>
                <div style={{ fontSize: 10.5, color: C.ardoise }}>{l}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Détail par journée */}
      {!portee.uneJournee && (
        <>
          <Section numero={delaiFiable ? "03" : "02"} titre="Les journées" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
            <thead>
              <tr style={{ background: C.marine, color: "#fff" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700 }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700 }}>Lieu</th>
                <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 700 }}>Avis rendus</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l, i) => (
                <tr key={cleJournee(l.j)} style={{ background: i % 2 ? C.cyanClair : "#fff", borderBottom: `1px solid ${C.filet}` }}>
                  <td style={{ padding: "5px 10px" }}>{jourCourt(l.j.date)}</td>
                  <td style={{ padding: "5px 10px" }}>{l.j.lieu}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontWeight: 600 }}>{nb(l.avis.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Méthode + pied de page */}
      <div style={{ marginTop: "auto", paddingTop: "8mm" }}>
        <p style={{ fontSize: 9.5, fontStyle: "italic", color: C.taupe, lineHeight: 1.4, margin: "0 0 8px" }}>
          Chiffres établis à partir des avis rendus par les dermatologues du réseau AvisDoc lors des journées citées. Ce bilan ne contient aucune donnée
          individuelle ; il n'est établi qu'au-delà de {SEUIL_RAPPORT} avis, pour qu'aucun chiffre ne permette d'identifier une personne.
        </p>
        <div style={{ borderTop: `1px solid ${C.filet}`, paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 10, color: C.taupe }}>
          <span>
            <b style={{ color: C.cyan }}>Avis</b>
            <b style={{ color: C.orange }}>Doc</b> · avisdoc.fr · La dermatologie n'attend pas.
          </span>
          <span style={{ textTransform: "capitalize" }}>{moisEdition}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ numero, titre }: { numero: string; titre: string }) {
  return (
    <div style={{ marginTop: "9mm", marginBottom: 10 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.18em", color: C.orange }}>{numero}</div>
      <h2 style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 19, margin: "2px 0 0" }}>{titre}</h2>
    </div>
  );
}
