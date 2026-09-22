// Coordonnées publiées sur le site officiel d'une entreprise, lues directement : deux secondes, gratuit, et
// sans erreur possible là où le modèle cherchait longtemps. On ne lit que les liens `mailto:` et `tel:` ;
// le reste de la page n'est pas utilisé.

const PAGES = ["", "contact", "nous-contacter", "contactez-nous", "mentions-legales"];
const PAGE_TIMEOUT_MS = 5_000; // pages lues en parallèle : l'ensemble reste sous 5 s
const MAX_HTML = 2_000_000; // pas de troncature courte : des liens de contact se trouvent très bas dans la page
// Un e-mail de brique logicielle ou d'image n'est pas un contact.
const JUNK = /(sentry|wixpress|squarespace|example\.(com|org)|@2x|\.(png|jpe?g|gif|svg|webp)$)/i;

export interface SiteContacts {
  emails: string[];
  phones: string[];
  readOn: string;
}

export async function readSiteContacts(site: string | null): Promise<SiteContacts | null> {
  if (!site) return null;
  let base: URL;
  try {
    base = new URL(/^https?:\/\//.test(site) ? site : `https://${site}`);
  } catch {
    return null;
  }
  const emails = new Set<string>();
  const phones = new Set<string>();
  await Promise.all(
    PAGES.map(async (page) => {
      try {
        const res = await fetch(new URL(page, base), {
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
          headers: { "user-agent": "Mozilla/5.0 (compatible; AvisDocHub/1.0)" },
        });
        if (!res.ok) return;
        const html = (await res.text()).slice(0, MAX_HTML);
        for (const m of html.matchAll(/mailto:([^"'?\s>&]+@[^"'?\s>&]+)/gi)) {
          const email = decodeURIComponent(m[1]).toLowerCase().replace(/[.,;]$/, "");
          if (!JUNK.test(email) && email.length < 90) emails.add(email);
        }
        for (const m of html.matchAll(/tel:(\+?[\d\s().-]{8,20})/gi)) phones.add(m[1].replace(/\s+/g, " ").trim());
      } catch {
        // page absente, site injoignable ou trop lent : on passe
      }
    }),
  );
  if (!emails.size && !phones.size) return null;
  return { emails: [...emails].slice(0, 5), phones: [...phones].slice(0, 3), readOn: base.origin };
}
