// Interface d'abstraction du prestataire de signature électronique + adaptateur
// Yousign (API v3). Le métier ne connaît que ServiceSignature : on peut changer
// de prestataire sans toucher aux fonctions d'inscription.
//
// Secrets attendus : YOUSIGN_API_KEY ; YOUSIGN_BASE_URL (optionnel, défaut sandbox).

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SignataireInfos {
  nom: string;
  prenom: string;
  email: string;
}

export interface ChampSignature {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DemandeSignature {
  titre: string;
  pdf: Uint8Array;
  nomFichier: string;
  signataire: SignataireInfos;
  champ: ChampSignature;
}

export interface DemandeTemplate {
  titre: string;
  templateId: string;
  /** Label du signataire « placeholder » défini dans le template Yousign (sensible à la casse). */
  signerLabel: string;
  signataire: SignataireInfos;
  /** Champs « texte en lecture seule » à préremplir (label sensible à la casse). */
  champs?: { label: string; text: string }[];
}

export interface ResultatSignature {
  requestId: string;
  signerId: string;
  /** Lien de signature à présenter au signataire (ou envoyé par e-mail). */
  signUrl: string | null;
}

export interface DocumentSigne {
  nomFichier: string;
  contenu: Uint8Array;
}

export interface ServiceSignature {
  /** Crée et active une demande de signature pour un unique signataire. */
  envoyer(d: DemandeSignature): Promise<ResultatSignature>;
  /** Idem, à partir d'un template (document standardisé) : seul le signataire varie. */
  envoyerTemplate(d: DemandeTemplate): Promise<ResultatSignature>;
  /** Télécharge le document signé (une fois la signature terminée). */
  telechargerSigne(requestId: string): Promise<DocumentSigne>;
  /** Télécharge le dossier de preuve (audit trail) d'un signataire, si disponible. */
  telechargerPreuve(requestId: string, signerId: string): Promise<DocumentSigne | null>;
}

// ---------------------------------------------------------------------------
// Adaptateur Yousign v3.
// ---------------------------------------------------------------------------
export function creerYousign(): ServiceSignature {
  const KEY = Deno.env.get("YOUSIGN_API_KEY");
  const BASE = (Deno.env.get("YOUSIGN_BASE_URL") ?? "https://api-sandbox.yousign.app/v3").replace(/\/$/, "");
  if (!KEY) throw new Error("YOUSIGN_API_KEY manquante.");

  const auth = { Authorization: `Bearer ${KEY}` };

  const callJson = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...auth, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`Yousign ${path} → ${res.status} ${await res.text().catch(() => "")}`);
    return res.json();
  };

  return {
    async envoyer(d) {
      // 1. Demande de signature (brouillon). delivery_mode "none" : on récupère
      //    nous-mêmes le lien (affiché au portail + e-mail Resend).
      const sr = await callJson("/signature_requests", {
        method: "POST",
        body: JSON.stringify({ name: d.titre, delivery_mode: "none", timezone: "Europe/Paris" }),
      });

      // 2. Document à signer (multipart).
      const form = new FormData();
      form.append("file", new Blob([d.pdf], { type: "application/pdf" }), d.nomFichier);
      form.append("nature", "signable_document");
      const docRes = await fetch(`${BASE}/signature_requests/${sr.id}/documents`, {
        method: "POST",
        headers: auth,
        body: form,
      });
      if (!docRes.ok) throw new Error(`Yousign documents → ${docRes.status} ${await docRes.text().catch(() => "")}`);
      const doc = await docRes.json();

      // 3. Signataire + champ de signature posé sur le document.
      const signer = await callJson(`/signature_requests/${sr.id}/signers`, {
        method: "POST",
        body: JSON.stringify({
          info: { first_name: d.signataire.prenom, last_name: d.signataire.nom, email: d.signataire.email, locale: "fr" },
          signature_level: "electronic_signature",
          signature_authentication_mode: "no_otp",
          fields: [{ type: "signature", document_id: doc.id, page: d.champ.page, x: d.champ.x, y: d.champ.y, width: d.champ.width, height: d.champ.height }],
        }),
      });

      // 4. Activation.
      await callJson(`/signature_requests/${sr.id}/activate`, { method: "POST" });

      // 5. Lien de signature (relecture du signataire après activation).
      let signUrl: string | null = signer.signature_link ?? null;
      if (!signUrl) {
        const s = await callJson(`/signature_requests/${sr.id}/signers/${signer.id}`).catch(() => null);
        signUrl = s?.signature_link ?? null;
      }
      return { requestId: sr.id, signerId: signer.id, signUrl };
    },

    async envoyerTemplate(d) {
      // Demande créée à partir du template ; le document et les champs sont figés
      // dans le template, seul le signataire (placeholder) est renseigné.
      const sr = await callJson("/signature_requests", {
        method: "POST",
        body: JSON.stringify({
          name: d.titre,
          delivery_mode: "none",
          template_id: d.templateId,
          template_placeholders: {
            signers: [{
              label: d.signerLabel,
              info: { first_name: d.signataire.prenom, last_name: d.signataire.nom, email: d.signataire.email, locale: "fr" },
            }],
            ...(d.champs?.length ? { read_only_text_fields: d.champs } : {}),
          },
        }),
      });
      await callJson(`/signature_requests/${sr.id}/activate`, { method: "POST" });

      const list = await callJson(`/signature_requests/${sr.id}/signers`);
      const signers: any[] = Array.isArray(list) ? list : (list?.data ?? list?.signers ?? []);
      const signer = signers[0] ?? {};
      let signUrl: string | null = signer.signature_link ?? null;
      if (!signUrl && signer.id) {
        const s = await callJson(`/signature_requests/${sr.id}/signers/${signer.id}`).catch(() => null);
        signUrl = s?.signature_link ?? null;
      }
      return { requestId: sr.id, signerId: signer.id ?? "", signUrl };
    },

    async telechargerSigne(requestId) {
      // Premier document signable de la demande, téléchargé en PDF.
      const list = await callJson(`/signature_requests/${requestId}/documents`);
      const docs: any[] = Array.isArray(list) ? list : (list?.data ?? list?.documents ?? []);
      const docId = docs[0]?.id;
      if (!docId) throw new Error("Aucun document signé à télécharger.");
      const res = await fetch(`${BASE}/signature_requests/${requestId}/documents/${docId}/download`, { headers: auth });
      if (!res.ok) throw new Error(`Yousign download → ${res.status} ${await res.text().catch(() => "")}`);
      return { nomFichier: "contrat-signe.pdf", contenu: new Uint8Array(await res.arrayBuffer()) };
    },

    async telechargerPreuve(requestId, signerId) {
      // Dossier de preuve (audit trail) du signataire.
      const res = await fetch(`${BASE}/signature_requests/${requestId}/signers/${signerId}/audit_trails/download`, { headers: auth });
      if (!res.ok) return null;
      return { nomFichier: "preuve.pdf", contenu: new Uint8Array(await res.arrayBuffer()) };
    },
  };
}
