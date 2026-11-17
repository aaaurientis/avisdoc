// Rapport client — le PDF, dessiné directement (jsPDF) avec les polices de la charte intégrées.
//
// Photographier la page (html2canvas) décalait le texte sous Safari : chiffres qui descendaient sur
// leur libellé, texte collé au bas des lignes du tableau. Ici chaque élément est placé au millimètre :
// alignements exacts dans tous les navigateurs, texte sélectionnable, fichier léger.
// Polices et bibliothèque ne sont chargées qu'à la fabrication du PDF.

import nr600 from "@/admin/assets/fonts/NR-600.ttf?url";
import hg400 from "@/admin/assets/fonts/HG-400.ttf?url";
import hg700 from "@/admin/assets/fonts/HG-700.ttf?url";
import hgi400 from "@/admin/assets/fonts/HGI-400.ttf?url";
import logoUrl from "@/assets/avisdoc-logo.png";
import type { jsPDF as JsPDF } from "jspdf";

/** Charte AvisDoc. */
export const COULEURS = {
  creme: "#F7F4EF",
  marine: "#142A33",
  cyan: "#0CA6DF",
  orange: "#EC7735",
  ardoise: "#5C6A6E",
  filet: "#E3DCD2",
  cyanClair: "#EAF6FB",
  taupe: "#9A8E7F",
  carte: "#ECE6DC",
};

/** Tout ce que le rapport affiche, calculé une fois (page et PDF disent la même chose). */
export interface ContenuRapport {
  nomFichier: string;
  kicker: string;
  titre: string;
  sousTitre: string;
  edite: string;
  donneesArretees: string | null;
  chiffres: [string, string][];
  recos: { label: string; p: number; n: number; couleur: string }[];
  texteRecos: string;
  /** Absent quand le délai repose sur trop peu d'avis mesurés. */
  delais: [string, string][] | null;
  /** Absent pour le rapport d'une seule journée. */
  /** `niveau` 1 : créneau d'une journée regroupée, sous sa journée principale. */
  journees: { date: string; lieu: string; avis: string; niveau?: 0 | 1 }[] | null;
  note: string;
  moisEdition: string;
}

// ── Mise en page (mm, A4 portrait) ───────────────────────────────────────────
const L = 16; // marge gauche
const R = 194; // bord droit (210 − 16)
const LARGEUR = R - L;
const BAS = 278; // dernière ligne utile au-dessus du pied de page
const pt = (mm: number) => mm; // lisibilité : les tailles de police sont en points

/** Les espaces insécables de toLocaleString (fr) n'existent pas dans toutes les polices. */
const net = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

async function enBase64(url: string): Promise<string> {
  const octets = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

async function dimensionsImage(url: string): Promise<{ l: number; h: number }> {
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ l: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => ok({ l: 1, h: 1 });
    img.src = url;
  });
}

export async function fabriquerPdfRapport(c: ContenuRapport): Promise<Blob> {
  const [{ jsPDF }, polices, logo, dims] = await Promise.all([
    import("jspdf"),
    Promise.all([nr600, hg400, hg700, hgi400].map(enBase64)),
    enBase64(logoUrl),
    dimensionsImage(logoUrl),
  ]);
  const doc: JsPDF = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const noms = ["NR600", "HG400", "HG700", "HGI400"];
  noms.forEach((n, i) => {
    doc.addFileToVFS(`${n}.ttf`, polices[i]);
    doc.addFont(`${n}.ttf`, n, "normal");
  });

  const police = (nom: string, taille: number, couleur: string) => {
    doc.setFont(nom, "normal");
    doc.setFontSize(pt(taille));
    doc.setTextColor(couleur);
  };
  const texte = (t: string, x: number, y: number, opts: { align?: "left" | "right" | "center"; espacement?: number } = {}) => {
    doc.setCharSpace(opts.espacement ?? 0);
    doc.text(net(t), x, y, { align: opts.align ?? "left", baseline: "alphabetic" });
    doc.setCharSpace(0);
  };
  /** Paragraphe : renvoie la hauteur occupée. */
  const paragraphe = (t: string, x: number, y: number, largeur: number, interligne: number) => {
    const lignes = doc.splitTextToSize(net(t), largeur) as string[];
    lignes.forEach((l, i) => doc.text(l, x, y + i * interligne, { baseline: "alphabetic" }));
    return lignes.length * interligne;
  };
  const carte = (x: number, y: number, l: number, h: number, fond: string, bord?: string) => {
    doc.setFillColor(fond);
    if (bord) {
      doc.setDrawColor(bord);
      doc.setLineWidth(0.25);
    }
    doc.roundedRect(x, y, l, h, 2.6, 2.6, bord ? "FD" : "F");
  };
  const piedDePage = () => {
    doc.setDrawColor(COULEURS.filet);
    doc.setLineWidth(0.25);
    doc.line(L, 284, R, 284);
    police("HG700", 7.5, COULEURS.cyan);
    texte("Avis", L, 288.5);
    const lAvis = doc.getTextWidth("Avis");
    police("HG700", 7.5, COULEURS.orange);
    texte("Doc", L + lAvis, 288.5);
    const lDoc = doc.getTextWidth("Doc");
    police("HG400", 7.5, COULEURS.taupe);
    texte(" · avisdoc.fr · La dermatologie n'attend pas.", L + lAvis + lDoc, 288.5);
    texte(c.moisEdition, R, 288.5, { align: "right" });
  };
  const titreSection = (numero: string, titre: string, y: number) => {
    police("HG700", 7, COULEURS.orange);
    texte(numero, L, y, { espacement: 0.5 });
    police("NR600", 15, COULEURS.marine);
    texte(titre, L, y + 6.2);
    return y + 10;
  };

  // ── En-tête ──
  const hLogo = 12;
  doc.addImage(`data:image/png;base64,${logo}`, "PNG", L, 13, (hLogo * dims.l) / dims.h, hLogo);
  police("HG400", 7.5, COULEURS.taupe);
  texte(c.edite, R, 17, { align: "right" });
  if (c.donneesArretees) texte(c.donneesArretees, R, 20.8, { align: "right" });

  let y = 40;
  police("HG700", 8, COULEURS.orange);
  texte(c.kicker, L, y, { espacement: 0.55 });
  y += 9;
  police("NR600", 23, COULEURS.marine);
  const lignesTitre = doc.splitTextToSize(net(c.titre), LARGEUR) as string[];
  lignesTitre.forEach((l, i) => doc.text(l, L, y + i * 9, { baseline: "alphabetic" }));
  y += (lignesTitre.length - 1) * 9 + 6;
  police("HG400", 9.5, COULEURS.ardoise);
  y += paragraphe(c.sousTitre, L, y, LARGEUR, 4.4);

  // ── Chiffres clés : 4 cartes ──
  y += 5;
  const ecart = 3;
  const lCarte = (LARGEUR - 3 * ecart) / 4;
  const hCarte = 23;
  c.chiffres.forEach(([valeur, libelle], i) => {
    const x = L + i * (lCarte + ecart);
    carte(x, y, lCarte, hCarte, COULEURS.creme, COULEURS.carte);
    police("NR600", 21, COULEURS.cyan);
    texte(valeur, x + 3.6, y + 10.2);
    police("HG400", 7.6, COULEURS.ardoise);
    paragraphe(libelle, x + 3.6, y + 15.2, lCarte - 7, 3.4);
  });
  y += hCarte + 10;

  // ── 01 Recommandations ──
  y = titreSection("01", "Ce que les dermatologues ont recommandé", y);
  const total = c.recos.reduce((s, r) => s + r.n, 0) || 1;
  const visibles = c.recos.filter((r) => r.n > 0);
  const espace = 0.7;
  const lUtile = LARGEUR - espace * (visibles.length - 1);
  let x = L;
  const hB = 3.6;
  const rB = hB / 2;
  visibles.forEach((r, i) => {
    const l = (r.n / total) * lUtile;
    const premier = i === 0;
    const dernier = i === visibles.length - 1;
    doc.setFillColor(r.couleur);
    if (premier || dernier) {
      // Bout arrondi côté extérieur, bord droit côté intérieur.
      doc.roundedRect(x, y, l, hB, Math.min(rB, l / 2), Math.min(rB, l / 2), "F");
      if (premier && !dernier) doc.rect(x + l - Math.min(rB, l / 2), y, Math.min(rB, l / 2), hB, "F");
      if (dernier && !premier) doc.rect(x, y, Math.min(rB, l / 2), hB, "F");
    } else {
      doc.rect(x, y, l, hB, "F");
    }
    x += l + espace;
  });
  y += 9.5;
  c.recos.forEach((r) => {
    doc.setFillColor(r.couleur);
    doc.roundedRect(L, y - 2.6, 2.8, 2.8, 0.5, 0.5, "F");
    police("HG400", 9, COULEURS.marine);
    texte(r.label, L + 5.5, y);
    police("HG700", 9, COULEURS.marine);
    texte(`${r.p} %`, 166, y, { align: "right" });
    police("HG400", 9, COULEURS.ardoise);
    texte(`${r.n.toLocaleString("fr-FR")} avis`, R, y, { align: "right" });
    y += 5.6;
  });
  y += 1.5;
  police("HG400", 8.6, COULEURS.ardoise);
  y += paragraphe(c.texteRecos, L, y, LARGEUR, 4.1);

  // ── 02 Délais ──
  let numero = 2;
  if (c.delais) {
    y += 7;
    y = titreSection(`0${numero++}`, "La rapidité des avis", y);
    const lD = (LARGEUR - 2 * ecart) / 3;
    const hD = 17;
    c.delais.forEach(([valeur, libelle], i) => {
      const xd = L + i * (lD + ecart);
      carte(xd, y, lD, hD, COULEURS.cyanClair);
      police("NR600", 17, COULEURS.marine);
      texte(valeur, xd + 3.6, y + 8.4);
      police("HG400", 7.6, COULEURS.ardoise);
      paragraphe(libelle, xd + 3.6, y + 13, lD - 7, 3.4);
    });
    y += hD;
  }

  // La note de méthode, mesurée d'avance : elle doit tenir sous le tableau.
  police("HGI400", 7.2, COULEURS.taupe);
  const lignesNote = doc.splitTextToSize(net(c.note), LARGEUR) as string[];
  const hNote = lignesNote.length * 3.3;

  // ── 03 Journées : tableau, sur plusieurs pages si besoin ──
  if (c.journees?.length) {
    y += 9;
    if (y + 26 > BAS) {
      piedDePage();
      doc.addPage();
      y = 18;
    }
    y = titreSection(`0${numero++}`, "Les journées", y);
    const colLieu = L + 42;
    const hEntete = 7;
    const hLigne = 6.2;
    const entete = () => {
      doc.setFillColor(COULEURS.marine);
      doc.rect(L, y, LARGEUR, hEntete, "F");
      police("HG700", 8.3, "#ffffff");
      const yt = y + hEntete / 2 + 1.1; // centré verticalement
      texte("Date", L + 3, yt);
      texte("Lieu", colLieu, yt);
      texte("Avis rendus", R - 3, yt, { align: "right" });
      y += hEntete;
    };
    entete();
    // Tout tient sur la page sauf la note ? Les 3 dernières lignes passent avec elle à la page
    // suivante, plutôt qu'une page qui ne porterait que la note.
    const n = c.journees.length;
    const capacite = Math.floor((BAS - y) / hLigne);
    const toutTient = n <= capacite && y + n * hLigne + 8 + hNote <= BAS;
    const coupure = !toutTient && n <= capacite ? Math.max(1, n - 3) : -1;
    c.journees.forEach((j, i) => {
      if (i === coupure || y + hLigne > BAS) {
        piedDePage();
        doc.addPage();
        y = 18;
        entete();
      }
      const sous = j.niveau === 1;
      doc.setFillColor(!sous && i % 2 ? COULEURS.cyanClair : "#ffffff");
      doc.rect(L, y, LARGEUR, hLigne, "F");
      doc.setDrawColor(COULEURS.filet);
      doc.setLineWidth(0.2);
      doc.line(L, y + hLigne, R, y + hLigne);
      const yt = y + hLigne / 2 + 1.1;
      police("HG400", sous ? 7.6 : 8.5, sous ? COULEURS.ardoise : COULEURS.marine);
      texte(net(sous ? `- ${j.date}` : j.date), sous ? L + 7 : L + 3, yt);
      const lieu = doc.splitTextToSize(net(j.lieu), R - 30 - colLieu)[0] as string;
      texte(lieu, colLieu, yt);
      police(sous ? "HG400" : "HG700", sous ? 7.6 : 8.5, sous ? COULEURS.ardoise : COULEURS.marine);
      texte(j.avis, R - 3, yt, { align: "right" });
      y += hLigne;
    });
  }

  // ── Méthode, en bas de la dernière page ──
  police("HGI400", 7.2, COULEURS.taupe);
  if (y + 8 + hNote > BAS) {
    piedDePage();
    doc.addPage();
    y = 18;
  }
  const yNote = Math.max(y + 8, BAS - hNote + 2);
  lignesNote.forEach((l, i) => doc.text(l, L, yNote + i * 3.3, { baseline: "alphabetic" }));
  piedDePage();

  doc.setProperties({ title: c.nomFichier, creator: "AvisDoc", author: "AvisDoc" });
  return doc.output("blob");
}
