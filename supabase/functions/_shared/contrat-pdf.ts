// Génération du contrat (convention de partenariat infirmière requérante) en PDF,
// côté serveur et sans tiers (pdf-lib). Le texte juridique est volontairement
// synthétique et versionné (MODELE_VERSION) — à affiner avec le conseil juridique.
//
// Expose aussi l'emplacement de la zone de signature (coordonnées Yousign, origine
// en haut à gauche) pour que le champ de signature soit posé au bon endroit.

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

export const MODELE_VERSION = "2026-10";

// Zone de signature, coordonnées Yousign (origine coin haut-gauche, en points).
export const SIGN_FIELD = { page: 1, x: 330, y: 724, width: 200, height: 72 };

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

export interface ContratInfos {
  nom: string;
  prenom: string;
  email: string;
  rpps: string | null;
}

export async function genererContratPdf(i: ContratInfos): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.w, A4.h]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.12, 0.15, 0.2);
  const soft = rgb(0.45, 0.48, 0.54);
  const teal = rgb(0.05, 0.5, 0.5);
  const maxW = A4.w - MARGIN * 2;
  let y = A4.h - MARGIN;

  const line = (text: string, size: number, f = font, color = ink, gap = 6) => {
    page.drawText(text, { x: MARGIN, y, size, font: f, color });
    y -= size + gap;
  };

  // Paragraphe avec retour à la ligne automatique.
  const para = (text: string, size = 10.5, gap = 5) => {
    const words = text.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && cur) {
        page.drawText(cur, { x: MARGIN, y, size, font, color: ink });
        y -= size + gap;
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) {
      page.drawText(cur, { x: MARGIN, y, size, font, color: ink });
      y -= size + gap;
    }
    y -= 4;
  };

  line("AvisDoc — Téléexpertise dermatologique", 15, bold, teal, 4);
  line("Convention de partenariat — infirmière requérante", 12.5, bold, ink, 2);
  line(`Modèle ${MODELE_VERSION} · établie le ${new Date().toLocaleDateString("fr-FR")}`, 9, font, soft, 16);

  line("Entre les soussignés", 11, bold, ink, 8);
  para(
    "AvisDoc, service de téléexpertise dermatologique (ci-après « AvisDoc »), d'une part,",
  );
  para(
    `et ${i.prenom} ${i.nom}, infirmier(ère) en exercice libéral` +
      `${i.rpps ? `, RPPS n° ${i.rpps}` : ""}, joignable à l'adresse ${i.email} ` +
      "(ci-après « l'Infirmière requérante »), d'autre part.",
  );

  y -= 6;
  line("Article 1 — Objet", 11, bold, ink, 8);
  para(
    "La présente convention définit les conditions dans lesquelles l'Infirmière requérante " +
      "sollicite, via la plateforme AvisDoc, l'avis d'un médecin dermatologue requis à partir " +
      "d'éléments cliniques et photographiques recueillis auprès du patient.",
  );

  line("Article 2 — Engagements de l'Infirmière requérante", 11, bold, ink, 8);
  para(
    "Elle garantit l'exactitude des informations transmises, recueille le consentement du patient, " +
      "maintient à jour ses attestations (responsabilité civile professionnelle et URSSAF) et " +
      "respecte le secret professionnel et la réglementation applicable.",
  );

  line("Article 3 — Protection des données (RGPD)", 11, bold, ink, 8);
  para(
    "Les données de santé sont traitées pour les seules finalités de téléexpertise, hébergées chez " +
      "un hébergeur de données de santé, et conservées conformément aux durées légales. Chaque partie " +
      "agit dans le respect du RGPD et de ses obligations respectives.",
  );

  line("Article 4 — Durée et résiliation", 11, bold, ink, 8);
  para(
    "La convention prend effet à sa signature, pour une durée indéterminée. Elle peut être résiliée " +
      "par l'une ou l'autre des parties, ou suspendue par AvisDoc en cas d'attestation échue ou de " +
      "manquement aux engagements ci-dessus.",
  );

  para(
    "Signé électroniquement via Yousign. La signature vaut acceptation pleine et entière des présentes.",
    9.5,
  );

  // Cadre de signature (doit coïncider avec SIGN_FIELD, origine Yousign en haut-gauche).
  const ry = A4.h - SIGN_FIELD.y - SIGN_FIELD.height;
  page.drawRectangle({
    x: SIGN_FIELD.x,
    y: ry,
    width: SIGN_FIELD.width,
    height: SIGN_FIELD.height,
    borderColor: soft,
    borderWidth: 0.8,
  });
  page.drawText("Signature de l'infirmière requérante", {
    x: SIGN_FIELD.x,
    y: ry + SIGN_FIELD.height + 6,
    size: 8.5,
    font,
    color: soft,
  });

  return await pdf.save();
}
