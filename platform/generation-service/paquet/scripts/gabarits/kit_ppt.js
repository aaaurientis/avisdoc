const pptxgen = require("pptxgenjs");

/* ============ Jetons de charte AvisDoc ============ */
const CREME   = "F7F4EF";
const MARINE  = "142A33";
const CYAN    = "0CA6DF";
const CYAN_C  = "29B1E0";
const ORANGE  = "EC7735";
const ARDOISE = "5C6A6E";
const BEIGE   = "E3DCD2";
const CYAN_TC = "EAF6FB";
const TAUPE   = "9A8E7F";
const BLANC   = "FFFFFF";
const FILET   = "ECE6DC";

/* Substituts sûrs déclarés par la charte §2 (Newsreader → Georgia, Hanken Grotesk → Calibri) */
const SERIF = "Georgia";
const SANS  = "Calibri";

const L = 13.333, H = 7.5, M = 0.62;      // marges latérales ≈ 1,4 cm
const LARG = L - 2 * M;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "AvisDoc";
pres.company = "AvisDoc";
pres.title = "Kit collaborateur — Dépistage du cancer cutané";

/* Ombre douce : objet neuf à chaque appel (pptxgenjs mute les options en place) */
const ombre = () => ({ type: "outer", color: "142A33", opacity: 0.07, blur: 10, offset: 2, angle: 90 });

/* ---------- Pied de page ---------- */
function pied(slide, num) {
  slide.addShape(pres.ShapeType.line, {
    x: M, y: 6.82, w: LARG, h: 0, line: { color: BEIGE, width: 0.75 },
  });
  slide.addText(
    [{ text: "Avis", options: { color: CYAN, bold: true } },
     { text: "Doc", options: { color: ORANGE, bold: true } },
     { text: "  ·  avisdoc.fr", options: { color: TAUPE } }],
    { x: M, y: 6.9, w: 5, h: 0.3, fontFace: SANS, fontSize: 10, margin: 0, valign: "top" }
  );
  slide.addText(
    [{ text: "Kit collaborateur 2026 · ", options: { color: TAUPE } },
     { text: num, options: { color: MARINE, bold: true } }],
    { x: L - M - 6, y: 6.9, w: 6, h: 0.3, align: "right", fontFace: SANS, fontSize: 10, margin: 0, valign: "top" }
  );
}

/* ---------- Sur-titre + titre-argument ---------- */
function entete(slide, kicker, titre, accent) {
  slide.addText(kicker, {
    x: M, y: 0.46, w: LARG, h: 0.28,
    fontFace: SANS, fontSize: 11.5, bold: true, color: ORANGE, charSpacing: 2.6, margin: 0, valign: "middle",
  });
  const parts = [{ text: titre, options: { color: MARINE } }];
  if (accent) parts.push({ text: accent, options: { color: CYAN, italic: true } });
  slide.addText(parts, {
    x: M, y: 0.79, w: LARG, h: 0.62,
    fontFace: SERIF, fontSize: 29, margin: 0, valign: "middle",
  });
}

/* ---------- Puce : intitulé gras + suite ---------- */
function puce(gras, suite, dernier) {
  const p = [{ text: gras, options: { bullet: { indent: 16 }, bold: true, color: MARINE, breakLine: false } }];
  if (suite) p.push({ text: suite, options: { color: ARDOISE, breakLine: false } });
  p[p.length - 1].options.breakLine = !dernier;
  return p;
}

/* ============================================================
   1 · COUVERTURE
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: MARINE };

  // Filigrane : symbole en grand, très faible opacité (charte §3)
  s.addImage({ path: "assets/photos/kit/logo_blanc.png", x: 9.9, y: 0.9, w: 4.4, h: 4.94, transparency: 89 });

  s.addImage({ path: "assets/photos/kit/logo_blanc.png", x: M, y: 0.5, w: 0.52, h: 0.58 });
  s.addText(
    [{ text: "Avis", options: { color: BLANC, bold: true } },
     { text: "Doc", options: { color: BLANC, bold: true } }],
    { x: M + 0.66, y: 0.53, w: 3, h: 0.52, fontFace: SANS, fontSize: 17, margin: 0, valign: "middle" }
  );

  s.addText("KIT COLLABORATEUR", {
    x: M, y: 2.02, w: 8.6, h: 0.3,
    fontFace: SANS, fontSize: 11.5, bold: true, color: ORANGE, charSpacing: 2.6, margin: 0, valign: "middle",
  });
  s.addText(
    [{ text: "Votre entreprise s'engage pour la\n", options: { color: BLANC } },
     { text: "prévention du cancer cutané.", options: { color: CYAN_C, italic: true } }],
    { x: M, y: 2.42, w: 9.1, h: 1.7, fontFace: SERIF, fontSize: 34, lineSpacing: 41, margin: 0, valign: "top" }
  );
  s.addText("Tout ce qu'il faut savoir sur votre journée de dépistage en téléexpertise.", {
    x: M, y: 4.24, w: 8.2, h: 0.4, fontFace: SANS, fontSize: 14, color: "A9B4B8", margin: 0, valign: "top",
  });

  // Zones à personnaliser par l'entreprise
  // Emplacement logo client : forme nommée LOGO_CLIENT, remplacée automatiquement
  // par logo_client_pptx.py. Le cadre reste visible ici, le PPTX étant un gabarit édité.
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.05, w: 3.5, h: 1.28, rectRadius: 0.06, objectName: "LOGO_CLIENT",
    fill: { color: MARINE }, line: { color: "3A555F", width: 0.75, dashType: "dash" },
  });
  s.addText("Logo de votre entreprise", {
    x: M, y: 5.05, w: 3.5, h: 1.28, objectName: "LOGO_CLIENT_TEXTE",
    fontFace: SANS, fontSize: 10.5, italic: true,
    color: "7E9299", align: "center", valign: "middle", margin: 0,
  });
  s.addShape(pres.ShapeType.roundRect, {
    x: M + 3.72, y: 5.05, w: 4.88, h: 1.28, rectRadius: 0.06,
    fill: { color: MARINE }, line: { color: "3A555F", width: 0.75, dashType: "dash" },
  });
  s.addText("Message clé de votre campagne", {
    x: M + 3.72, y: 5.05, w: 4.88, h: 1.28, fontFace: SANS, fontSize: 10.5, italic: true,
    color: "7E9299", align: "center", valign: "middle", margin: 0,
  });
}

/* ============================================================
   2 · LE CANCER DE LA PEAU
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "01 · LE CANCER DE LA PEAU", "La précocité du dépistage ", "change le pronostic.");

  s.addText("Le cancer de la peau est le cancer le plus fréquent en France. Repéré tôt, il se traite dans la très grande majorité des cas.", {
    x: M, y: 1.56, w: 9.4, h: 0.4, fontFace: SANS, fontSize: 13.5, color: ARDOISE, margin: 0, valign: "top",
  });

  const stats = [
    ["≈ 200 000", "cancers de la peau\npar an"],
    ["≈ 20 000",  "nouveaux mélanomes\ndétectés par an"],
    ["≈ 2 000",   "décès\nchaque année"],
  ];
  const cw = 3.86, gap = 0.35;
  stats.forEach(([n, l], i) => {
    const x = M + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 2.36, w: cw, h: 2.1, rectRadius: 0.05,
      fill: { color: BLANC }, line: { color: FILET, width: 0.75 }, shadow: ombre(),
    });
    s.addText(n, {
      x: x + 0.34, y: 2.62, w: cw - 0.68, h: 0.86,
      fontFace: SERIF, fontSize: 38, color: CYAN, margin: 0, valign: "middle",
    });
    s.addText(l, {
      x: x + 0.34, y: 3.5, w: cw - 0.68, h: 0.72,
      fontFace: SANS, fontSize: 13, color: ARDOISE, lineSpacing: 18, margin: 0, valign: "top",
    });
  });

  s.addText("Source : Institut National du Cancer.", {
    x: M, y: 4.58, w: 8, h: 0.28, fontFace: SANS, fontSize: 10, italic: true, color: TAUPE, margin: 0, valign: "top",
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.16, w: LARG, h: 1.34, rectRadius: 0.05,
    fill: { color: CYAN_TC }, line: { color: "CBE8F5", width: 0.75 },
  });
  s.addText(
    [{ text: "Un dépistage sur votre lieu de travail.  ", options: { bold: true, color: MARINE } },
     { text: "Votre entreprise met à votre disposition une journée de dépistage des tumeurs cutanées, réalisée en téléexpertise par des dermatologues.", options: { color: ARDOISE } }],
    { x: M + 0.36, y: 5.16, w: LARG - 0.72, h: 1.34, fontFace: SANS, fontSize: 13.5, lineSpacing: 20, margin: 0, valign: "middle" }
  );

  pied(s, "02");
}

/* ============================================================
   3 · LES ÉTAPES CLÉS
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "02 · LES ÉTAPES CLÉS", "Votre dépistage ", "en quatre étapes.");

  const etapes = [
    ["Prise de rendez-vous", "Auprès de vos ressources humaines."],
    ["Préparation de votre visite", "Auto-examen de votre peau en suivant la règle ABCDE."],
    ["Journée de dépistage", "Rendez-vous individuel avec un professionnel de santé, incluant un examen au dermatoscope."],
    ["Résultats sur la plateforme", "Deux orientations possibles selon ce que voit le dermatologue."],
  ];
  const cw = 2.94, gap = 0.31;
  etapes.forEach(([t, d], i) => {
    const x = M + i * (cw + gap);
    s.addShape(pres.ShapeType.roundRect, {
      x, y: 1.9, w: cw, h: 3.42, rectRadius: 0.06,
      fill: { color: BLANC }, line: { color: FILET, width: 0.75 }, shadow: ombre(),
    });
    s.addShape(pres.ShapeType.ellipse, {
      x: x + 0.32, y: 2.2, w: 0.62, h: 0.62, fill: { color: CYAN },
    });
    s.addText(String(i + 1), {
      x: x + 0.32, y: 2.2, w: 0.62, h: 0.62,
      fontFace: SANS, fontSize: 17, bold: true, color: BLANC, align: "center", valign: "middle", margin: 0,
    });
    s.addText(t, {
      x: x + 0.32, y: 3.02, w: cw - 0.64, h: 0.72,
      fontFace: SANS, fontSize: 15, bold: true, color: MARINE, lineSpacing: 20, margin: 0, valign: "top",
    });
    s.addText(d, {
      x: x + 0.32, y: 3.76, w: cw - 0.64, h: 1.3,
      fontFace: SANS, fontSize: 12.5, color: ARDOISE, lineSpacing: 17, margin: 0, valign: "top",
    });
  });

  s.addText("Le dépistage est entièrement volontaire et dure en moyenne moins de 15 minutes.", {
    x: M, y: 5.62, w: LARG, h: 0.4, fontFace: SANS, fontSize: 13, italic: true, color: TAUPE, margin: 0, valign: "top",
  });

  pied(s, "03");
}

/* ============================================================
   4 · PRÉPARER SON DÉPISTAGE
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "03 · AVANT LE RENDEZ-VOUS", "Quelques minutes de préparation ", "suffisent.");

  s.addText(
    [...puce("Auto-examen cutané", " en suivant la règle ABCDE, page suivante."),
     ...puce("S'examiner de la tête aux pieds", ", sans oublier les plantes de pieds et le cuir chevelu."),
     ...puce("Se faire aider par son entourage", " pour les zones que vous ne voyez pas."),
     ...puce("Noter vos antécédents", ", en particulier familiaux de cancers cutanés, et vos traitements des 3 derniers mois.", true)],
    { x: M, y: 1.94, w: 7.5, h: 3.5, fontFace: SANS, fontSize: 14.5, lineSpacing: 22, paraSpaceAfter: 12, margin: 0, valign: "top" }
  );

  s.addImage({ path: "assets/photos/kit/photo_autoexamen.jpg", x: 8.66, y: 1.9, w: 4.05, h: 4.05, rounding: false });
  s.addText("L'auto-examen se fait à la lumière du jour, devant un miroir.", {
    x: 8.66, y: 6.06, w: 4.05, h: 0.5, fontFace: SANS, fontSize: 10, italic: true, color: TAUPE, lineSpacing: 14, margin: 0, valign: "top",
  });

  pied(s, "04");
}

/* ============================================================
   5 · RÈGLE ABCDE
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "04 · LA RÈGLE ABCDE", "Cinq critères pour repérer ", "une lésion suspecte.");

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 1.86, w: 8.1, h: 4.48, rectRadius: 0.05,
    fill: { color: BLANC }, line: { color: FILET, width: 0.75 }, shadow: ombre(),
  });
  // ratio réel de la planche : 1644 × 910
  const iw = 7.05, ih = iw * (910 / 1644);
  s.addImage({ path: "assets/photos/kit/abcde.png", x: M + (8.1 - iw) / 2, y: 1.86 + (4.48 - ih) / 2, w: iw, h: ih });

  const criteres = [
    ["A", "Asymétrie de la lésion"],
    ["B", "Bords irréguliers"],
    ["C", "Couleur non homogène"],
    ["D", "Diamètre supérieur à 6 mm"],
    ["E", "Évolution dans le temps"],
  ];
  criteres.forEach(([l, t], i) => {
    const y = 1.98 + i * 0.78;
    s.addText(l, {
      x: 9.0, y, w: 0.5, h: 0.5, fontFace: SERIF, fontSize: 25, color: CYAN, margin: 0, valign: "middle",
    });
    s.addText(t, {
      x: 9.54, y, w: 3.2, h: 0.5, fontFace: SANS, fontSize: 14, color: MARINE, margin: 0, valign: "middle",
    });
  });

  s.addShape(pres.ShapeType.line, { x: 9.0, y: 5.76, w: 3.72, h: 0, line: { color: BEIGE, width: 0.75 } });
  s.addText("Un seul critère suffit à justifier un avis. Ne cherchez pas à conclure vous-même.", {
    x: 9.0, y: 5.9, w: 3.72, h: 0.72, fontFace: SANS, fontSize: 11.5, italic: true, color: TAUPE, lineSpacing: 16, margin: 0, valign: "top",
  });

  pied(s, "05");
}

/* ============================================================
   6 · LE JOUR J
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "05 · LE JOUR J", "Un examen court, non invasif ", "et confidentiel.");

  s.addText("LE DÉROULÉ", {
    x: M, y: 1.9, w: 4.4, h: 0.28, fontFace: SANS, fontSize: 10.5, bold: true, color: CYAN, charSpacing: 2, margin: 0, valign: "middle",
  });
  s.addText(
    [...puce("Un professionnel de santé formé", " réalise le dépistage."),
     ...puce("Examen non invasif", ", dans un cadre confidentiel."),
     ...puce("Une lettre de consentement", " vous est remise pour signature.", true)],
    { x: M, y: 2.26, w: 4.4, h: 2.4, fontFace: SANS, fontSize: 13.5, lineSpacing: 20, paraSpaceAfter: 10, margin: 0, valign: "top" }
  );

  s.addText("DOCUMENTS À APPORTER", {
    x: M + 4.72, y: 1.9, w: 4.4, h: 0.28, fontFace: SANS, fontSize: 10.5, bold: true, color: CYAN, charSpacing: 2, margin: 0, valign: "middle",
  });
  s.addText(
    [...puce("Votre carte Vitale", ""),
     ...puce("Une pièce d'identité", ""),
     ...puce("Le document d'information et de consentement", " à un acte de télémédecine, transmis par vos RH.", true)],
    { x: M + 4.72, y: 2.26, w: 4.4, h: 2.4, fontFace: SANS, fontSize: 13.5, lineSpacing: 20, paraSpaceAfter: 10, margin: 0, valign: "top" }
  );

  s.addImage({ path: "assets/photos/kit/photo_decollete.jpg", x: 9.98, y: 1.86, w: 2.73, h: 1.56 });
  s.addImage({ path: "assets/photos/kit/photo_levre.jpg",     x: 9.98, y: 3.5,  w: 2.73, h: 1.82 });
  s.addText("Des photographies de vos grains de beauté sont prises, puis analysées à distance par un dermatologue.", {
    x: 9.98, y: 5.42, w: 2.73, h: 0.9, fontFace: SANS, fontSize: 10, italic: true, color: TAUPE, lineSpacing: 14, margin: 0, valign: "top",
  });

  pied(s, "06");
}

/* ============================================================
   7 · VOS RÉSULTATS
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "06 · VOS RÉSULTATS", "Accessibles en ligne, ", "et confidentiels.");

  s.addText("COMMENT Y ACCÉDER", {
    x: M, y: 1.86, w: 8, h: 0.28, fontFace: SANS, fontSize: 10.5, bold: true, color: CYAN, charSpacing: 2, margin: 0, valign: "middle",
  });
  s.addText(
    [...puce("Vous recevez un email sécurisé", " dès que vos résultats sont disponibles."),
     ...puce("Cet email contient un code d'accès personnel", "."),
     ...puce("Vous consultez vos résultats", " sur la plateforme AvisDoc, de manière claire et confidentielle.", true)],
    { x: M, y: 2.2, w: 11.9, h: 1.5, fontFace: SANS, fontSize: 13.5, lineSpacing: 20, paraSpaceAfter: 8, margin: 0, valign: "top" }
  );

  s.addText("DEUX SITUATIONS POSSIBLES", {
    x: M, y: 3.86, w: 8, h: 0.28, fontFace: SANS, fontSize: 10.5, bold: true, color: CYAN, charSpacing: 2, margin: 0, valign: "middle",
  });

  const cw = 5.94, gap = 0.2;
  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 4.24, w: cw, h: 2.14, rectRadius: 0.05,
    fill: { color: BLANC }, line: { color: FILET, width: 0.75 }, shadow: ombre(),
  });
  s.addText("Aucune anomalie n'est détectée", {
    x: M + 0.34, y: 4.5, w: cw - 0.68, h: 0.36, fontFace: SANS, fontSize: 15, bold: true, color: MARINE, margin: 0, valign: "middle",
  });
  s.addText("Vous recevez votre dossier médical. Il n'y a rien d'autre à faire.", {
    x: M + 0.34, y: 4.92, w: cw - 0.68, h: 1.2, fontFace: SANS, fontSize: 13, color: ARDOISE, lineSpacing: 19, margin: 0, valign: "top",
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M + cw + gap, y: 4.24, w: cw, h: 2.14, rectRadius: 0.05,
    fill: { color: "FDF1E9" }, line: { color: "F6D3BE", width: 0.75 }, shadow: ombre(),
  });
  s.addText("Une anomalie est détectée", {
    x: M + cw + gap + 0.34, y: 4.5, w: cw - 0.68, h: 0.36, fontFace: SANS, fontSize: 15, bold: true, color: ORANGE, margin: 0, valign: "middle",
  });
  s.addText("Vous recevez votre dossier médical ainsi qu'une lettre d'adressage. Vous consultez ensuite soit le médecin de votre choix, soit un professionnel du réseau d'aval AvisDoc.", {
    x: M + cw + gap + 0.34, y: 4.92, w: cw - 0.68, h: 1.2, fontFace: SANS, fontSize: 13, color: ARDOISE, lineSpacing: 19, margin: 0, valign: "top",
  });

  pied(s, "07");
}

/* ============================================================
   8 · FAQ
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CREME };
  entete(s, "07 · QUESTIONS FRÉQUENTES", "Ce que les collaborateurs ", "nous demandent.");

  const faq = [
    ["Est-ce obligatoire ?", "Non. La participation est entièrement volontaire."],
    ["Combien de temps cela prend-il ?", "En moyenne moins de 15 minutes."],
    ["Comment se déroule concrètement le dépistage ?", "Vous êtes accompagné(e) par un professionnel de santé formé. Des photos de vos grains de beauté sont prises, puis analysées à distance par un dermatologue. Vous recevez ensuite vos résultats."],
    ["Que se passe-t-il si quelque chose nécessite une attention particulière ?", "Vous en êtes informé(e) simplement et, si besoin, orienté(e) vers un réseau de professionnels de santé pour la suite de la prise en charge. Vous restez libre de vos démarches."],
    ["Mes informations sont-elles confidentielles ?", "Oui, totalement. Les données sont sécurisées et traitées dans le respect du RGPD. Votre employeur n'a accès à aucune information médicale individuelle."],
  ];

  // colonne, y du filet, hauteur de la question, hauteur de la réponse
  const pose = [
    [0, 1.90, 0.30, 0.32],
    [0, 3.14, 0.30, 0.32],
    [0, 4.38, 0.30, 0.84],
    [1, 1.90, 0.58, 0.84],
    [1, 3.90, 0.30, 0.84],
  ];
  const cw = 5.94, gap = 0.21;

  faq.forEach(([q, r], i) => {
    const [c, y, hq, hr] = pose[i];
    const x = M + c * (cw + gap);
    s.addShape(pres.ShapeType.line, { x, y: y - 0.16, w: cw, h: 0, line: { color: BEIGE, width: 0.75 } });
    s.addText(q, {
      x, y, w: cw, h: hq,
      fontFace: SANS, fontSize: 13.5, bold: true, color: MARINE, lineSpacing: 18, margin: 0, valign: "top",
    });
    s.addText(r, {
      x, y: y + hq + 0.04, w: cw, h: hr,
      fontFace: SANS, fontSize: 12.5, color: ARDOISE, lineSpacing: 17, margin: 0, valign: "top",
    });
  });

  s.addShape(pres.ShapeType.roundRect, {
    x: M, y: 5.68, w: LARG, h: 0.72, rectRadius: 0.05,
    fill: { color: CYAN_TC }, line: { color: "CBE8F5", width: 0.75 },
  });
  s.addText(
    [{ text: "Une autre question ?  ", options: { bold: true, color: MARINE } },
     { text: "Adressez-vous à vos ressources humaines, ou écrivez à contact@avisdoc.fr.", options: { color: ARDOISE } }],
    { x: M + 0.34, y: 5.68, w: LARG - 0.68, h: 0.72, fontFace: SANS, fontSize: 13, margin: 0, valign: "middle" }
  );

  pied(s, "08");
}

/* ============================================================
   9 · CLÔTURE
   ============================================================ */
{
  const s = pres.addSlide();
  s.background = { color: CYAN };

  s.addImage({ path: "assets/photos/kit/logo_blanc.png", x: 10.6, y: 0.62, w: 2.85, h: 3.2, transparency: 88 });

  s.addImage({ path: "assets/photos/kit/logo_blanc.png", x: M, y: 1.72, w: 0.86, h: 0.97 });
  s.addText("AvisDoc", {
    x: M, y: 2.86, w: 6, h: 0.5, fontFace: SANS, fontSize: 22, bold: true, color: BLANC, margin: 0, valign: "middle",
  });
  s.addText("La dermatologie n'attend pas.", {
    x: M, y: 3.44, w: 9, h: 0.9, fontFace: SERIF, fontSize: 37, italic: true, color: BLANC, margin: 0, valign: "middle",
  });

  const infos = [["SITE", "avisdoc.fr"], ["CONTACT", "contact@avisdoc.fr"], ["RENDEZ-VOUS", "Auprès de vos ressources humaines"]];
  infos.forEach(([k, v], i) => {
    const x = M + i * 3.6;
    s.addText(k, {
      x, y: 4.86, w: 3.4, h: 0.26, fontFace: SANS, fontSize: 10, bold: true, color: "BDE7F8", charSpacing: 2, margin: 0, valign: "middle",
    });
    s.addText(v, {
      x, y: 5.16, w: 3.4, h: 0.5, fontFace: SANS, fontSize: 14, color: BLANC, lineSpacing: 18, margin: 0, valign: "top",
    });
  });
}

pres.writeFile({ fileName: "documents/pptx/KIT_COLLABORATEUR_AvisDoc.pptx" })
  .then(f => console.log("écrit :", f));
