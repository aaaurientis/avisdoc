// Le mail du rapport, et l'alerte quand il n'a pas pu partir.
//
// Les destinataires sont fixés côté serveur (VEILLE_DESTINATAIRES) : personne
// ne peut les changer depuis un écran. Pendant les essais en local, le mail
// part vers la boîte locale (Mailpit) si VEILLE_MAILPIT_URL est posée ;
// sinon par Resend, comme les rappels du Planning.

import { momentEnClair } from "./calendrier.ts";

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const BLEU = "#29B1E0";
const ORANGE = "#EF7B33";
const ENCRE = "#16283C";
const GRIS = "#5B6B7A";

export const destinataires = () => (Deno.env.get("VEILLE_DESTINATAIRES") ?? "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
const hub = () => (Deno.env.get("VEILLE_HUB_URL") ?? "https://admin.avisdoc.fr/admin.html#").replace(/\/$/, "");
/** Un lien vers un écran du Hub (« /prospects?fiche=… »). */
export const lienHub = (chemin: string) => `${hub()}${chemin}`;

export interface ArticleMail {
  n: number;
  titre: string;
  url: string;
  source: string;
  publie_le: string | null;
  importance: number;
  resume: string;
  pour_avisdoc: string;
  /** Le site refuse les robots : on écrit l'adresse en clair, à coller dans Google si besoin. */
  protege: boolean;
  /** Signaux d'entreprises : qui, et où. */
  entreprise: string | null;
  ville: string | null;
  /** « À ne pas manquer » et sa raison. */
  urgent?: boolean;
  urgence?: string | null;
}

export interface RapportMail {
  id: string;
  /** Depuis le 02/11, un rapport par veille. */
  veille: "commerciale" | "marche";
  /** Un Weekly par CRM (09/11) : le nom du CRM en titre (« CRM Collectivités Locales ») et son marché dans le lien. */
  crm?: { axe: string; label: string };
  debut: Date;
  fin: Date;
  points: { texte: string; articles: number[] }[];
  rubriques: { nom: string; axe: string; articles: ArticleMail[] }[];
  posts: { titre: string; accroche: string; brouillon: string; sources: ArticleMail[] }[];
  enPanne: string[];
  total: number;
}

/** Les axes du rapport, dans l'ordre voulu par AvisDoc (26/10) : on agit d'abord, on s'informe ensuite. */
export const AXES: { cle: string; titre: string; sousTitre: string }[] = [
  { cle: "demarcher", titre: "Entreprises", sousTitre: "Entreprises et mutuelles qui parlent de la santé de leurs salariés : des clients potentiels." },
  { cle: "collectivites", titre: "Collectivités", sousTitre: "Mairies, départements, régions : déserts médicaux, besoins de soins de leurs habitants, appels d'offres." },
  { cle: "intermediaires", titre: "Intermédiaires", sousTitre: "Ceux qui peuvent apporter des clients à AvisDoc." },
  { cle: "mutuelles", titre: "Mutuelle Assurance", sousTitre: "Complémentaires santé et assureurs : offres, forfaits prévention, partenariats." },
  { cle: "publier", titre: "À publier", sousTitre: "Idées de posts LinkedIn, à relire avant de les publier." },
  { cle: "evenements", titre: "Événements", sousTitre: "Salons, congrès, courses contre le cancer : où exposer, aller, sponsoriser, ou quoi relayer." },
  { cle: "concurrents", titre: "Concurrents", sousTitre: "Ce qu'ils font, et ce que ça change pour AvisDoc." },
  { cle: "publications", titre: "Publications scientifiques", sousTitre: "Études et avis : les arguments qu'on peut en tirer." },
  { cle: "nouveautes", titre: "Nouveautés", sousTitre: "Réglementation, santé au travail, IA et dispositifs, presse." },
  { cle: "nous", titre: "Les avis sur AvisDoc", sousTitre: "Ce que d'autres disent d'AvisDoc : presse, avis, commentaires, réseaux sociaux." },
];

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }) : "");

const NOM_VEILLE = { commerciale: "Veille Commerciale", marche: "Veille Marché" };

/** Une partie de mail : un Weekly (une veille, ou un CRM), avec son titre, ses points, ses cases et son lien. */
function partie(r: RapportMail, signature: boolean, ancre?: string) {
  const urgents = r.rubriques.flatMap((x) => x.articles).filter((a) => a.urgent).length;
  const nom = r.crm ? `Weekly · ${r.crm.label}` : NOM_VEILLE[r.veille];
  const sujet = `Scope · ${nom} AvisDoc du ${momentEnClair(r.fin).replace(/, 9 h$/, "")} — ${r.total} publication${r.total > 1 ? "s" : ""}${urgents ? ` dont ${urgents} à ne pas manquer` : ""}`;
  const lienArticle = (a: ArticleMail) => `<a href="${echapper(a.url)}" style="color:${BLEU};text-decoration:none;">${echapper(a.source)}${a.publie_le ? `, ${date(a.publie_le)}` : ""}</a>`;
  // Les points à retenir disent l'essentiel en deux phrases ; leurs articles se lisent plus bas, une seule fois.
  const points = r.points.map((p, i) => `
      <tr><td style="padding:0 0 10px;"><p style="margin:0;font-size:15px;line-height:1.5;color:${ENCRE};"><b style="color:${BLEU};">${i + 1}.</b> ${echapper(p.texte)}</p></td></tr>`).join("");
  const titreAxe = (t: string, st: string) => `
      <tr><td style="padding:22px 0 2px;"><p style="margin:0;font-size:15px;font-weight:bold;letter-spacing:.03em;text-transform:uppercase;color:${ORANGE};">${echapper(t)}</p></td></tr>
      <tr><td style="padding:0 0 6px;"><p style="margin:0;font-size:12px;color:${GRIS};">${echapper(st)}</p></td></tr>`;
  const article = (a: ArticleMail) => `
      <tr><td style="padding:6px 0 10px;border-bottom:1px solid #E6ECF1;">
        ${a.urgent ? `<p style="margin:0 0 4px;font-size:12px;font-weight:bold;color:#C2410C;">À NE PAS RATER${a.urgence ? ` · ${echapper(a.urgence)}` : ""}</p>` : ""}
        ${a.entreprise ? `<p style="margin:0 0 2px;font-size:12px;font-weight:bold;color:${BLEU};">${echapper(a.entreprise)}${a.ville ? ` · ${echapper(a.ville)}` : ""}</p>` : ""}
        <p style="margin:0;font-size:14px;font-weight:bold;"><a href="${echapper(a.url)}" style="color:${ENCRE};text-decoration:none;">${echapper(a.titre)}</a></p>
        <p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:${ENCRE};">${echapper(a.resume)}</p>
        ${a.pour_avisdoc ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:${GRIS};"><b>Pour AvisDoc :</b> ${echapper(a.pour_avisdoc)}</p>` : ""}
        <p style="margin:4px 0 0;font-size:12px;">${lienArticle(a)}</p>
        ${a.protege ? `<p style="margin:2px 0 0;font-size:11px;color:${GRIS};word-break:break-all;">Si la page ne s'ouvre pas, collez ce lien dans Google : ${echapper(a.url)}</p>` : ""}
      </td></tr>`;
  const blocAxe = (cle: string) => {
    const rubs = r.rubriques.filter((x) => x.axe === cle && x.articles.length);
    if (!rubs.length) return "";
    const plusieurs = rubs.length > 1;
    return rubs.map((x) => {
      // Tout ce qui compte (importance 2 et 3) est dans le mail ; le reste, pour mémoire, dans le Hub.
      // Un « À ne pas manquer » est toujours dans le mail, et en tête de sa case.
      const visibles = x.articles.filter((a) => a.importance >= 2 || a.urgent).sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
      const reste = x.articles.length - visibles.length;
      return `${plusieurs ? `<tr><td style="padding:10px 0 2px;"><p style="margin:0;font-size:12px;font-weight:bold;color:${ENCRE};">${echapper(x.nom)}</p></td></tr>` : ""}
      ${visibles.map(article).join("")}
      ${reste > 0 ? `<tr><td style="padding:6px 0 0;font-size:12px;color:${GRIS};">et ${reste} autre${reste > 1 ? "s" : ""} pour mémoire dans le Hub</td></tr>` : ""}`;
    }).join("");
  };
  const posts = r.posts.map((p) => `
      <tr><td style="padding:8px 0 12px;border-bottom:1px solid #E6ECF1;">
        <p style="margin:0 0 4px;font-size:14px;font-weight:bold;color:${ENCRE};">${echapper(p.titre)}</p>
        <p style="margin:0 0 6px;font-size:13px;line-height:1.55;color:${ENCRE};white-space:pre-wrap;background:#F4F7FA;border-radius:10px;padding:10px 12px;">${echapper(p.brouillon)}</p>
        <p style="margin:0;font-size:12px;color:${GRIS};">S'appuie sur : ${p.sources.map(lienArticle).join(" · ")}</p>
      </td></tr>`).join("");
  const corps = AXES.map((x) => {
    const contenu = x.cle === "publier" ? posts : blocAxe(x.cle);
    return contenu ? titreAxe(x.titre, x.sousTitre) + contenu : "";
  }).join("");
  const panne = r.enPanne.length
    ? `<tr><td style="padding:16px 0 0;font-size:12px;color:${ORANGE};">Sources qui n'ont pas répondu cette fois : ${echapper(r.enPanne.join(", "))}. Ce qu'elles auraient trouvé manque à ce rapport.</td></tr>`
    : "";
  const rangees = `
      <tr><td style="padding:0 0 4px;">${ancre ? `<a id="${ancre}" name="${ancre}"></a>` : ""}<p style="margin:0;font-size:20px;font-weight:bold;color:${ENCRE};">${echapper(nom)}${r.crm ? "" : " AvisDoc"}</p>${signature ? `<p style="margin:2px 0 0;font-size:12px;color:${GRIS};">par Scope, votre agent de veille</p>` : ""}</td></tr>
      <tr><td style="padding:0 0 18px;"><p style="margin:0;font-size:13px;color:${GRIS};">Du ${echapper(momentEnClair(r.debut))} au ${echapper(momentEnClair(r.fin))} · ${r.total} publication${r.total > 1 ? "s" : ""} retenue${r.total > 1 ? "s" : ""}</p></td></tr>
      ${r.points.length ? `<tr><td style="padding:0 0 8px;"><p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:${BLEU};">À retenir</p></td></tr>${points}` : `<tr><td style="font-size:14px;color:${ENCRE};">Rien de marquant sur la période.</td></tr>`}
      ${corps}
      <tr><td style="padding:22px 0 0;"><a href="${hub()}/veille/${r.veille}/${r.id}${r.crm ? `?crm=${r.crm.axe}` : ""}" style="color:${BLEU};font-size:14px;font-weight:bold;">Ouvrir ${r.crm ? "ce Weekly" : "le rapport"} dans le Hub (créer une fiche prospect, voir le reste)</a></td></tr>`;
  return { sujet, nom, urgents, rangees, panne };
}

const enveloppe = (rangees: string) => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#F4F7FA;padding:24px 12px;">
    <table role="presentation" width="100%" style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;" cellpadding="0" cellspacing="0">
      ${rangees}
    </table>
  </div>`;

export function composer(r: RapportMail) {
  const p = partie(r, true);
  return { sujet: p.sujet, html: enveloppe(`${p.rangees}${p.panne}`) };
}

/**
 * Le mail du vendredi d'une personne (Olivier, 09/11) : un seul mail, avec le Weekly de chaque CRM (et de la
 * Veille Marché) qu'elle a coché, l'un sous l'autre. Avec un seul Weekly, c'est le mail habituel.
 */
export function composerPlusieurs(rs: RapportMail[]) {
  if (rs.length === 1) return composer(rs[0]);
  const parts = rs.map((r, i) => partie(r, false, `weekly-${i + 1}`));
  const total = rs.reduce((n, r) => n + r.total, 0);
  const urgents = parts.reduce((n, p) => n + p.urgents, 0);
  const sujet = `Scope · Weekly AvisDoc du ${momentEnClair(rs[0].fin).replace(/, 9 h$/, "")} — ${parts.map((p) => p.nom.replace(/^Weekly · /, "")).join(", ")} — ${total} publication${total > 1 ? "s" : ""}${urgents ? ` dont ${urgents} à ne pas manquer` : ""}`;
  const separateur = `<tr><td style="padding:28px 0 20px;"><div style="border-top:3px solid ${BLEU};"></div></td></tr>`;
  // Le sommaire (Gemini, 09/11) : un clic mène au Weekly de ce CRM, plus bas dans le mail.
  const sommaire = parts.map((p, i) => `
      <tr><td style="padding:3px 0;"><a href="#weekly-${i + 1}" style="color:${BLEU};font-size:14px;font-weight:bold;text-decoration:none;">→ ${echapper(p.nom.replace(/^Weekly · /, ""))}</a> <span style="font-size:12px;color:${GRIS};">· ${rs[i].total} publication${rs[i].total > 1 ? "s" : ""}</span></td></tr>`).join("");
  const entete = `<tr><td style="padding:0 0 6px;"><p style="margin:0;font-size:20px;font-weight:bold;color:${ENCRE};">Vos Weekly AvisDoc</p><p style="margin:2px 0 0;font-size:12px;color:${GRIS};">par Scope, votre agent de veille · du ${echapper(momentEnClair(rs[0].debut))} au ${echapper(momentEnClair(rs[0].fin))}</p></td></tr>
      <tr><td style="padding:8px 0 4px;"><p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:${BLEU};">Sommaire</p></td></tr>${sommaire}
      <tr><td style="padding:20px 0 20px;"><div style="border-top:3px solid ${BLEU};"></div></td></tr>`;
  return { sujet, html: enveloppe(`${entete}${parts.map((p) => p.rangees).join(separateur)}${parts[0].panne}`) };
}

/** Où mène le mail, et pourquoi on le reçoit. */
export interface Suite { lien: string; libelle: string; pourquoi: string }
const SUITE_ABONNE: Suite = {
  lien: "/veille/direct", libelle: "Ouvrir « En direct » pour le confier à un commercial",
  pourquoi: "Vous recevez ce mail parce que vous avez activé les alertes dans « En direct ». Le même interrupteur les coupe.",
};

const lignesArticles = (articles: (ArticleMail & { urgence?: string | null })[]) => articles.map((a) => `
      <tr><td style="padding:10px 0 12px;border-bottom:1px solid #E6ECF1;">
        ${a.urgence ? `<p style="margin:0 0 4px;font-size:13px;font-weight:bold;color:#C2410C;">${echapper(a.urgence)}</p>` : ""}
        ${a.entreprise ? `<p style="margin:0 0 2px;font-size:12px;font-weight:bold;color:${BLEU};">${echapper(a.entreprise)}${a.ville ? ` · ${echapper(a.ville)}` : ""}</p>` : ""}
        <p style="margin:0;font-size:14px;font-weight:bold;"><a href="${echapper(a.url)}" style="color:${ENCRE};text-decoration:none;">${echapper(a.titre)}</a></p>
        <p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:${ENCRE};">${echapper(a.resume)}</p>
        ${a.pour_avisdoc ? `<p style="margin:4px 0 0;font-size:13px;line-height:1.5;color:${GRIS};"><b>Pour AvisDoc :</b> ${echapper(a.pour_avisdoc)}</p>` : ""}
        <p style="margin:4px 0 0;font-size:12px;"><a href="${echapper(a.url)}" style="color:${BLEU};text-decoration:none;">${echapper(a.source)}${a.publie_le ? `, ${date(a.publie_le)}` : ""}</a></p>
      </td></tr>`).join("");

const cadre = (titre: string, couleur: string, chapeau: string, lignes: string, suite: Suite) => `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#F4F7FA;padding:24px 12px;">
    <table role="presentation" width="100%" style="max-width:620px;margin:0 auto;background:#fff;border-radius:16px;padding:24px;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:0 0 4px;"><p style="margin:0;font-size:20px;font-weight:bold;color:${couleur};">${echapper(titre)}</p><p style="margin:2px 0 0;font-size:12px;color:${GRIS};">${echapper(chapeau)}</p></td></tr>
      ${lignes}
      <tr><td style="padding:20px 0 0;"><a href="${hub()}${suite.lien}" style="color:${BLEU};font-size:14px;font-weight:bold;">${echapper(suite.libelle)}</a></td></tr>
      <tr><td style="padding:10px 0 0;font-size:11px;color:${GRIS};">${echapper(suite.pourquoi)}</td></tr>
    </table>
  </div>`;

/** Le mail immédiat des « À ne pas manquer » : ce qui ne peut pas attendre le prochain rapport. */
export function composerUrgent(articles: (ArticleMail & { urgence: string | null })[], suite: Suite = SUITE_ABONNE) {
  const n = articles.length;
  const premier = articles[0];
  const sujet = `Scope · À ne pas manquer : ${n === 1 ? (premier.entreprise ?? premier.titre) : `${n} publications`}`;
  return { sujet, html: cadre("À ne pas manquer", "#C2410C", "Scope vient de le trouver : ça n'attend pas le prochain rapport.", lignesArticles(articles), suite) };
}

/** Le récapitulatif d'une tournée : les nouveautés d'une case, en un seul mail, pour celui qui les suit. */
export function composerRecap(quoi: string, articles: ArticleMail[], suite: Suite) {
  const n = articles.length;
  const sujet = `Scope · ${n} nouveauté${n > 1 ? "s" : ""} : ${quoi}`;
  return { sujet, html: cadre(`${n} nouveauté${n > 1 ? "s" : ""} : ${quoi}`, ENCRE, "Ce que Scope vient de trouver à sa dernière tournée.", lignesArticles(articles), suite) };
}

/** Le budget du mois de la veille est atteint à 80 % ou à 100 % : on prévient, rien n'est coupé. */
export function composerBudget(depense: number, budget: number, seuil: 80 | 100) {
  const d = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  const sujet = seuil === 100
    ? `Scope · Budget du mois atteint : ${d(depense)} sur ${d(budget)}`
    : `Scope · 80 % du budget du mois : ${d(depense)} sur ${d(budget)}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:${ENCRE};max-width:520px;">
    <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${echapper(sujet)}</p>
    <p style="font-size:14px;margin:0 0 8px;">Depuis le 1er du mois, la veille a coûté ${d(depense)} pour un budget de ${d(budget)}.</p>
    <p style="font-size:14px;margin:0 0 12px;color:${GRIS};">Scope continue normalement : rien n'est coupé. Le détail par jour, par IA et par tournée est dans CPR, où vous pouvez aussi déplacer le curseur du budget.</p>
    <p style="margin:0;"><a href="${hub()}/veille/commerciale/cpr" style="color:${BLEU};">Ouvrir CPR dans le Hub</a></p></div>`;
  return { sujet, html };
}

export interface Panne { nature: string; fin: Date; statut: string; bloquee: boolean; erreur: string | null; pannes: string[] }

/** Le mail technique d'une tournée en panne : ce qui s'est passé, ce que ça change, ce qu'il faut faire. */
export function composerPanne(liste: Panne[]) {
  const nom = (p: Panne) => `${p.nature === "quotidienne" ? "la tournée complète" : "la tournée légère"} de ${momentEnClair(p.fin)}`;
  const sujet = liste.length > 1 ? `Scope · ${liste.length} tournées ont eu un problème` : `Scope · Problème sur ${nom(liste[0])}`;
  const blocs = liste.map((p) => {
    const quoi = p.bloquee ? `Elle n'est pas terminée et n'avance plus (étape : ${p.statut}).` : p.statut === "echec" ? "Elle a échoué." : "Elle est terminée, mais il manque ce qui suit.";
    const lignes = [p.erreur, ...p.pannes.slice(0, 10), ...(p.pannes.length > 10 ? [`… et ${p.pannes.length - 10} autres`] : [])].filter(Boolean) as string[];
    return `<p style="font-size:14px;font-weight:bold;margin:0 0 4px;">${echapper(nom(p))}</p>
    <p style="font-size:14px;margin:0 0 4px;">${quoi}</p>
    ${lignes.length ? `<p style="font-size:13px;margin:0 0 12px;white-space:pre-wrap;color:${GRIS};">${echapper(lignes.join("\n"))}</p>` : ""}`;
  }).join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:${ENCRE};max-width:520px;">
    <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${echapper(sujet)}</p>
    ${blocs}
    <p style="font-size:14px;margin:0 0 8px;"><b>Ce que ça change :</b> les publications de ces recherches peuvent manquer. Le reste de la veille continue, et la tournée suivante repart normalement.</p>
    <p style="font-size:14px;margin:0 0 12px;"><b>Que faire :</b> si le message parle de clé, de quota, de 401, 402, 403 ou 429, vérifiez le compte du service concerné. Sinon, regardez si la tournée suivante passe avant d'intervenir. Vous ne recevrez pas d'autre mail avant 6 heures.</p>
    <p style="margin:0;"><a href="${hub()}/veille/commerciale/cpr" style="color:${BLEU};">Voir les tournées dans CPR</a></p></div>`;
  return { sujet, html };
}

export function composerAlerte(fin: Date, statut: string, detail: string) {
  const sujet = `Scope · Veille AvisDoc : le rapport de ${momentEnClair(fin)} n'est pas parti`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:${ENCRE};max-width:520px;">
    <p style="font-size:16px;font-weight:bold;margin:0 0 8px;">${echapper(sujet)}</p>
    <p style="font-size:14px;margin:0 0 8px;">Où il en est : ${echapper(statut)}.</p>
    <p style="font-size:14px;margin:0 0 12px;white-space:pre-wrap;color:${GRIS};">${echapper(detail)}</p>
    <p style="margin:0;"><a href="${hub()}/veille/commerciale" style="color:${BLEU};">Voir la veille dans le Hub</a></p></div>`;
  return { sujet, html };
}

/** Envoie aux destinataires du rapport ; rend l'identifiant du message. `cle` empêche un double envoi chez Resend. */
export async function envoyer(sujet: string, html: string, cle: string): Promise<string> {
  const a = destinataires();
  if (!a.length) throw new Error("VEILLE_DESTINATAIRES non configurée");
  return envoyerA(a, sujet, html, cle);
}

/** Envoie à ces adresses-là (déjà contrôlées par l'appelant). */
export async function envoyerA(a: string[], sujet: string, html: string, cle: string): Promise<string> {
  const from = Deno.env.get("VEILLE_FROM") ?? "Scope · Veille AvisDoc <noreply@avisdoc.fr>";
  const mailpit = Deno.env.get("VEILLE_MAILPIT_URL");
  if (mailpit) {
    const m = from.match(/^(.*)<(.+)>$/);
    const r = await fetch(`${mailpit.replace(/\/$/, "")}/api/v1/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ From: { Email: m ? m[2].trim() : from, Name: m ? m[1].trim() : "" }, To: a.map((Email) => ({ Email })), Subject: sujet, HTML: html }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Mailpit ${r.status}`);
    return `mailpit:${(await r.json()).ID ?? ""}`;
  }
  const k = Deno.env.get("RESEND_API_KEY");
  if (!k) throw new Error("RESEND_API_KEY non configurée");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json", "Idempotency-Key": cle },
    body: JSON.stringify({ from, to: a, subject: sujet, html }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status} : ${(await r.text()).slice(0, 200)}`);
  return `resend:${(await r.json()).id ?? ""}`;
}
