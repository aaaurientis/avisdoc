import { useEffect } from "react";

const SITE_URL = "https://www.avisdoc.fr";
const DEFAULT_OG = `${SITE_URL}/og-image.svg`;

type JsonLd = Record<string, unknown> | Record<string, unknown>[];

interface SEOOptions {
  title: string;
  description: string;
  canonical?: string;
  ogImage?: string;
  jsonLd?: JsonLd;
  robots?: string;
}

const upsertMeta = (attr: "name" | "property", key: string, content: string) => {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
};

const upsertLink = (rel: string, href: string) => {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
};

export const useSEO = ({
  title,
  description,
  canonical,
  ogImage = DEFAULT_OG,
  jsonLd,
  robots = "index,follow,max-image-preview:large",
}: SEOOptions) => {
  useEffect(() => {
    document.title = title;

    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", robots);

    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", "AvisDoc");
    upsertMeta("property", "og:image", ogImage);
    upsertMeta("property", "og:locale", "fr_FR");

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", ogImage);

    if (canonical) {
      const href = canonical.startsWith("http") ? canonical : `${SITE_URL}${canonical}`;
      upsertLink("canonical", href);
      upsertMeta("property", "og:url", href);
    }

    const existing = document.getElementById("seo-jsonld");
    if (existing) existing.remove();
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "seo-jsonld";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }

    return () => {
      const s = document.getElementById("seo-jsonld");
      if (s) s.remove();
    };
  }, [title, description, canonical, ogImage, jsonLd, robots]);
};
