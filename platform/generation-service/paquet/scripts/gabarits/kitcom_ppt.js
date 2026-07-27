const pptxgen = require("pptxgenjs");

const CREME="F7F4EF", MARINE="142A33", CYAN="0CA6DF", CYAN_C="29B1E0", ORANGE="EC7735";
const ARDOISE="5C6A6E", BEIGE="E3DCD2", CYAN_TC="EAF6FB", TAUPE="9A8E7F", BLANC="FFFFFF", FILET="ECE6DC";
const SERIF="Georgia", SANS="Calibri";
const L=13.333, M=0.62, LARG=L-2*M;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";
pres.author = "AvisDoc"; pres.company = "AvisDoc";
pres.title = "Kit de communication interne — Journée de dépistage du cancer de la peau";

const ombre = () => ({type:"outer", color:"142A33", opacity:0.07, blur:10, offset:2, angle:90});

function pied(s, num){
  s.addShape(pres.ShapeType.line, {x:M, y:6.82, w:LARG, h:0, line:{color:BEIGE, width:0.75}});
  s.addText([{text:"Avis",options:{color:CYAN,bold:true}},{text:"Doc",options:{color:ORANGE,bold:true}},
             {text:"  ·  avisdoc.fr",options:{color:TAUPE}}],
    {x:M, y:6.9, w:5, h:0.3, fontFace:SANS, fontSize:10, margin:0, valign:"top"});
  s.addText([{text:"Mode d'emploi RH 2026 · ",options:{color:TAUPE}},{text:num,options:{color:MARINE,bold:true}}],
    {x:L-M-6, y:6.9, w:6, h:0.3, align:"right", fontFace:SANS, fontSize:10, margin:0, valign:"top"});
}

function entete(s, kicker, titre, accent){
  s.addText(kicker, {x:M, y:0.46, w:LARG, h:0.28, fontFace:SANS, fontSize:11.5, bold:true,
    color:ORANGE, charSpacing:2.6, margin:0, valign:"middle"});
  const p = [{text:titre, options:{color:MARINE}}];
  if (accent) p.push({text:accent, options:{color:CYAN, italic:true}});
  s.addText(p, {x:M, y:0.79, w:LARG, h:0.62, fontFace:SERIF, fontSize:29, margin:0, valign:"middle"});
}

/* ===================== 1 · COUVERTURE ===================== */
{
  const s = pres.addSlide();
  s.background = {color: MARINE};
  s.addImage({path:"assets/photos/kit/logo_blanc.png", x:9.9, y:0.9, w:4.4, h:4.94, transparency:89});
  s.addImage({path:"assets/photos/kit/logo_blanc.png", x:M, y:0.5, w:0.52, h:0.58});
  s.addText("AvisDoc", {x:M+0.66, y:0.53, w:3, h:0.52, fontFace:SANS, fontSize:17, bold:true, color:BLANC, margin:0, valign:"middle"});

  s.addText("MODE D'EMPLOI RH · 2026", {x:M, y:2.06, w:8.6, h:0.3, fontFace:SANS, fontSize:11.5,
    bold:true, color:ORANGE, charSpacing:2.6, margin:0, valign:"middle"});
  s.addText([{text:"Préparer votre journée de dépistage\n", options:{color:BLANC}},
             {text:"du cancer de la peau.", options:{color:CYAN_C, italic:true}}],
    {x:M, y:2.46, w:9.3, h:1.7, fontFace:SERIF, fontSize:34, lineSpacing:41, margin:0, valign:"top"});
  s.addText("Tout ce dont vous avez besoin pour organiser et faire connaître la campagne auprès de vos collaborateurs.",
    {x:M, y:4.3, w:8.4, h:0.5, fontFace:SANS, fontSize:14, color:"A9B4B8", margin:0, valign:"top"});

  s.addShape(pres.ShapeType.roundRect, {x:M, y:5.15, w:3.5, h:1.28, rectRadius:0.06, objectName:"LOGO_CLIENT",
    fill:{color:MARINE}, line:{color:"3A555F", width:0.75, dashType:"dash"}});
  s.addText("Logo de votre entreprise", {x:M, y:5.15, w:3.5, h:1.28, objectName:"LOGO_CLIENT_TEXTE",
    fontFace:SANS, fontSize:10.5, italic:true, color:"7E9299", align:"center", valign:"middle", margin:0});
}

/* ===================== 2 · LES 4 ÉTAPES ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CREME};
  entete(s, "01 · LE DÉROULÉ", "Votre campagne ", "en quatre étapes.");

  const et = [
    ["Le cadrage opérationnel", "Définir la date et le lieu. Planifier des créneaux de 15 minutes. Prévoir l'impression des formulaires de consentement, environ 35 exemplaires."],
    ["Le lancement", "Envoyer le mail d'annonce de la journée de dépistage, puis les deux relances à J-14 et J-7."],
    ["La préparation des collaborateurs", "Diffuser le kit collaborateur et transmettre aux inscrits la notice d'information et de consentement à un acte de télémédecine."],
    ["La journée, puis le bilan", "Dérouler la campagne, puis recevoir le bilan et les éléments de valorisation transmis par AvisDoc."],
  ];
  const cw = 2.94, gap = 0.31;
  et.forEach(([t,d], i) => {
    const x = M + i*(cw+gap);
    s.addShape(pres.ShapeType.roundRect, {x, y:1.9, w:cw, h:3.6, rectRadius:0.06,
      fill:{color:BLANC}, line:{color:FILET, width:0.75}, shadow:ombre()});
    s.addShape(pres.ShapeType.ellipse, {x:x+0.32, y:2.2, w:0.62, h:0.62, fill:{color:CYAN}});
    s.addText(String(i+1), {x:x+0.32, y:2.2, w:0.62, h:0.62, fontFace:SANS, fontSize:17, bold:true,
      color:BLANC, align:"center", valign:"middle", margin:0});
    s.addText(t, {x:x+0.32, y:3.02, w:cw-0.64, h:0.74, fontFace:SANS, fontSize:15, bold:true,
      color:MARINE, lineSpacing:20, margin:0, valign:"top"});
    s.addText(d, {x:x+0.32, y:3.8, w:cw-0.64, h:1.5, fontFace:SANS, fontSize:12, color:ARDOISE,
      lineSpacing:16, margin:0, valign:"top"});
  });

  s.addShape(pres.ShapeType.roundRect, {x:M, y:5.72, w:LARG, h:0.78, rectRadius:0.05,
    fill:{color:CYAN_TC}, line:{color:"CBE8F5", width:0.75}});
  s.addText([{text:"À prévoir dès le cadrage :  ", options:{bold:true, color:MARINE}},
             {text:"des créneaux de 15 minutes par collaborateur, et l'impression des formulaires de consentement.", options:{color:ARDOISE}}],
    {x:M+0.34, y:5.72, w:LARG-0.68, h:0.78, fontFace:SANS, fontSize:13, margin:0, valign:"middle"});

  pied(s, "02");
}

/* ===================== 3 · CE QUE NOUS FOURNISSONS ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CREME};
  entete(s, "02 · CE QUE NOUS VOUS FOURNISSONS", "Tous les éléments de communication ", "sont prêts.");

  const el = [
    ["Les e-mails", "Le mail d'annonce et les deux relances, à J-14 et J-7. Quatre options rédactionnelles pour chacun."],
    ["Les affiches", "Cinq affiches A2 déjà mises en page. Il ne reste qu'à ajouter votre logo."],
    ["La banque de visuels", "Des photographies et des accroches à combiner librement pour créer vos propres affiches."],
    ["Le kit collaborateur", "Un document destiné aux salariés, conçu pour les préparer à leur rendez-vous."],
  ];
  const cw = 2.94, gap = 0.31;
  el.forEach(([t,d], i) => {
    const x = M + i*(cw+gap);
    s.addShape(pres.ShapeType.roundRect, {x, y:1.94, w:cw, h:3.1, rectRadius:0.06,
      fill:{color:BLANC}, line:{color:FILET, width:0.75}, shadow:ombre()});
    s.addText(t, {x:x+0.34, y:2.24, w:cw-0.68, h:0.5, fontFace:SERIF, fontSize:17, color:CYAN, margin:0, valign:"middle"});
    s.addText(d, {x:x+0.34, y:2.84, w:cw-0.68, h:1.9, fontFace:SANS, fontSize:12.5, color:ARDOISE,
      lineSpacing:17, margin:0, valign:"top"});
  });

  s.addText("Les documents médicaux, notice d'information et formulaire de consentement, vous sont fournis séparément et ne doivent pas être modifiés.",
    {x:M, y:5.3, w:LARG, h:0.5, fontFace:SANS, fontSize:13, italic:true, color:TAUPE, margin:0, valign:"top"});

  pied(s, "03");
}

/* ===================== 4 · PERSONNALISER ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CREME};
  entete(s, "03 · PERSONNALISER VOTRE CAMPAGNE", "Trois gestes suffisent ", "pour créer votre affiche.");

  const pas = [
    ["Choisir une accroche", "Parmi les messages clés proposés page suivante."],
    ["Sélectionner un visuel", "Dans la banque d'images fournie."],
    ["Associer les deux", "Puis ajouter votre logo à l'emplacement prévu."],
  ];
  const cw = 3.96, gap = 0.35;
  pas.forEach(([t,d], i) => {
    const x = M + i*(cw+gap);
    s.addShape(pres.ShapeType.roundRect, {x, y:1.98, w:cw, h:2.2, rectRadius:0.06,
      fill:{color:BLANC}, line:{color:FILET, width:0.75}, shadow:ombre()});
    s.addText(String(i+1), {x:x+0.34, y:2.2, w:0.8, h:0.72, fontFace:SERIF, fontSize:32, color:CYAN, margin:0, valign:"middle"});
    s.addText(t, {x:x+0.34, y:3.0, w:cw-0.68, h:0.4, fontFace:SANS, fontSize:15, bold:true, color:MARINE, margin:0, valign:"top"});
    s.addText(d, {x:x+0.34, y:3.42, w:cw-0.68, h:0.66, fontFace:SANS, fontSize:12.5, color:ARDOISE, lineSpacing:17, margin:0, valign:"top"});
  });

  s.addShape(pres.ShapeType.roundRect, {x:M, y:4.5, w:LARG, h:1.7, rectRadius:0.05,
    fill:{color:CYAN_TC}, line:{color:"CBE8F5", width:0.75}});
  s.addText("Besoin d'aller plus vite ?", {x:M+0.4, y:4.74, w:LARG-0.8, h:0.4,
    fontFace:SANS, fontSize:15, bold:true, color:MARINE, margin:0, valign:"middle"});
  s.addText("Cinq affiches A2 sont déjà mises en page et prêtes à imprimer. Il ne vous reste qu'à ajouter votre logo à l'emplacement prévu, ou à nous le transmettre pour que nous le fassions.",
    {x:M+0.4, y:5.16, w:LARG-0.8, h:0.8, fontFace:SANS, fontSize:13.5, color:ARDOISE, lineSpacing:19, margin:0, valign:"top"});

  pied(s, "04");
}

/* ===================== 5 · MESSAGES CLÉS ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CREME};
  entete(s, "04 · MESSAGES CLÉS", "Quatre accroches ", "prêtes à l'emploi.");

  const msg = [
    "Le dépistage du cancer de la peau vient à vous.",
    "Prenez soin de votre peau.",
    "Préserver sa peau, c'est aussi préserver sa santé.",
    "Difficultés à prendre un rendez-vous avec un dermatologue ?",
  ];
  const cw = 4.10;
  msg.forEach((t, i) => {
    const x = M + (i % 2) * (cw + 0.34);
    const y = 1.98 + Math.floor(i / 2) * 1.5;
    s.addShape(pres.ShapeType.roundRect, {x, y, w:cw, h:1.24, rectRadius:0.06,
      fill:{color:BLANC}, line:{color:FILET, width:0.75}, shadow:ombre()});
    s.addText(t, {x:x+0.36, y, w:cw-0.72, h:1.24, fontFace:SERIF, fontSize:17, color:MARINE,
      lineSpacing:24, margin:0, valign:"middle"});
  });

  s.addShape(pres.ShapeType.roundRect, {x:M+2*(cw+0.34), y:1.98, w:3.2, h:2.76, rectRadius:0.06,
    fill:{color:MARINE}});
  s.addText("85 %", {x:M+2*(cw+0.34)+0.30, y:2.34, w:2.6, h:1, fontFace:SERIF, fontSize:44, color:CYAN_C, margin:0, valign:"middle"});
  s.addText("des collaborateurs se disent plus engagés lorsque la communication est régulière et claire.",
    {x:M+2*(cw+0.34)+0.30, y:3.36, w:2.6, h:1.1, fontFace:SANS, fontSize:12.5, color:"C6D0D4", lineSpacing:17, margin:0, valign:"top"});
  s.addText("Source : Culture RH.", {x:M+2*(cw+0.34)+0.30, y:4.34, w:2.6, h:0.3,
    fontFace:SANS, fontSize:9.5, italic:true, color:"8FA0A6", margin:0, valign:"top"});

  s.addText("Associez librement une accroche et un visuel de la banque d'images. Une même accroche peut servir sur plusieurs supports : affiche, e-mail, écran d'accueil.",
    {x:M, y:5.1, w:LARG, h:0.6, fontFace:SANS, fontSize:13, color:ARDOISE, lineSpacing:19, margin:0, valign:"top"});

  pied(s, "05");
}

/* ===================== 6 · CALENDRIER ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CREME};
  entete(s, "05 · CALENDRIER TYPE", "Quand envoyer ", "quoi.");

  const jalons = [
    ["J-30", "Cadrage", "Date, lieu, créneaux de 15 minutes, volume de formulaires à imprimer."],
    ["J-21", "Mail d'annonce", "Lancement de la campagne auprès de l'ensemble des collaborateurs."],
    ["J-14", "Première relance", "Rappel aux collaborateurs non inscrits."],
    ["J-7",  "Seconde relance", "Derniers jours pour s'inscrire. Diffusion du kit collaborateur."],
    ["J-2",  "Notice de consentement", "Transmission aux inscrits de la notice d'information et de consentement."],
    ["Jour J", "Campagne", "Accueil des collaborateurs, formulaires de consentement signés sur place."],
  ];
  const y0 = 1.94, hl = 0.72;
  jalons.forEach(([j, t, d], i) => {
    const y = y0 + i*hl;
    if (i) s.addShape(pres.ShapeType.line, {x:M, y, w:LARG, h:0, line:{color:BEIGE, width:0.75}});
    s.addText(j, {x:M, y:y+0.08, w:1.3, h:0.56, fontFace:SERIF, fontSize:19, color:CYAN, margin:0, valign:"middle"});
    s.addText(t, {x:M+1.4, y:y+0.08, w:3.1, h:0.56, fontFace:SANS, fontSize:14, bold:true, color:MARINE, margin:0, valign:"middle"});
    s.addText(d, {x:M+4.6, y:y+0.08, w:LARG-4.6, h:0.56, fontFace:SANS, fontSize:13, color:ARDOISE, margin:0, valign:"middle"});
  });
  s.addShape(pres.ShapeType.line, {x:M, y:y0+6*hl, w:LARG, h:0, line:{color:BEIGE, width:0.75}});

  s.addText("Calendrier indicatif, à adapter à votre organisation. Les trois e-mails sont fournis en quatre options rédactionnelles chacun.",
    {x:M, y:6.36, w:LARG, h:0.4, fontFace:SANS, fontSize:12.5, italic:true, color:TAUPE, margin:0, valign:"top"});

  pied(s, "06");
}

/* ===================== 7 · CLÔTURE ===================== */
{
  const s = pres.addSlide();
  s.background = {color: CYAN};
  s.addImage({path:"assets/photos/kit/logo_blanc.png", x:10.6, y:0.62, w:2.85, h:3.2, transparency:88});
  s.addImage({path:"assets/photos/kit/logo_blanc.png", x:M, y:1.72, w:0.86, h:0.97});
  s.addText("AvisDoc", {x:M, y:2.86, w:6, h:0.5, fontFace:SANS, fontSize:22, bold:true, color:BLANC, margin:0, valign:"middle"});
  s.addText("La dermatologie n'attend pas.", {x:M, y:3.44, w:9, h:0.9, fontFace:SERIF, fontSize:37,
    italic:true, color:BLANC, margin:0, valign:"middle"});

  [["SITE","avisdoc.fr"],["CONTACT","contact@avisdoc.fr"],["VOTRE INTERLOCUTEUR","À compléter"]].forEach(([k,v],i)=>{
    const x = M + i*3.6;
    s.addText(k, {x, y:4.86, w:3.4, h:0.26, fontFace:SANS, fontSize:10, bold:true, color:"BDE7F8", charSpacing:2, margin:0, valign:"middle"});
    s.addText(v, {x, y:5.16, w:3.4, h:0.5, fontFace:SANS, fontSize:14, color:BLANC, lineSpacing:18, margin:0, valign:"top"});
  });
}

pres.writeFile({fileName:"documents/pptx/KIT_COM_INTERNE_AvisDoc.pptx"}).then(f=>console.log("écrit :", f));
