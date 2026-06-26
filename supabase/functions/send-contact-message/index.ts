import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactPayload {
  profile?: string;
  profileLabel?: string;
  name?: string;
  organization?: string;
  email?: string;
  phone?: string;
  message?: string;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: ContactPayload = await req.json();
    const { profile, profileLabel, name, organization, email, phone, message } =
      payload;

    if (!name?.trim() || !email?.includes("@") || !message?.trim() || message.length < 10) {
      return new Response(
        JSON.stringify({ error: "Champs requis manquants ou invalides" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const CONTACT_TO = Deno.env.get("CONTACT_TO") ?? "contact@avisdoc.fr";

    const subject = `Contact AvisDoc — ${profileLabel ?? "Autre"} : ${name}`;
    const date = new Date().toLocaleDateString("fr-FR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const html = `
      <h2 style="font-family: sans-serif; color: #16293D;">Nouveau message de contact</h2>
      <p><strong>Profil :</strong> ${escapeHtml(profileLabel ?? profile ?? "Non précisé")}</p>
      <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
      ${organization ? `<p><strong>Structure :</strong> ${escapeHtml(organization)}</p>` : ""}
      <p><strong>Email :</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
      ${phone ? `<p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>` : ""}
      <hr style="border:0;border-top:1px solid #eee;margin:16px 0;" />
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
      <hr style="border:0;border-top:1px solid #eee;margin:16px 0;" />
      <p style="font-size:12px;color:#888;">
        Reçu le ${date} via le formulaire de contact d'avisdoc.fr.
      </p>
    `;

    if (RESEND_API_KEY) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "AvisDoc <onboarding@resend.dev>",
          to: [CONTACT_TO],
          reply_to: email,
          subject,
          html,
        }),
      });

      if (!res.ok) {
        const errorData = await res.text();
        console.error("Resend error:", errorData);
        throw new Error(`Email send failed: ${res.status}`);
      }
    } else {
      console.log(`Contact message from: ${name} <${email}> (${profile})`);
      console.warn("RESEND_API_KEY not configured. Email not sent.");
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erreur lors de l'envoi du message" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
