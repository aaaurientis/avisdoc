import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Adresse email invalide' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'AvisDoc <onboarding@resend.dev>',
          to: ['arthur@avisdoc.fr'],
          subject: `Demande de suppression de données personnelles - ${email}`,
          html: `
            <h2>Demande de suppression de données personnelles</h2>
            <p>Un utilisateur a demandé la suppression de ses données personnelles via le formulaire du site.</p>
            <p><strong>Email de l'utilisateur :</strong> ${email}</p>
            <p><strong>Date de la demande :</strong> ${new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            <hr />
            <p><em>Conformément au RGPD, cette demande doit être traitée dans un délai de 30 jours.</em></p>
          `,
        }),
      });

      if (!res.ok) {
        const errorData = await res.text();
        console.error('Resend error:', errorData);
        throw new Error(`Email send failed: ${res.status}`);
      }
    } else {
      // Fallback: log the request (in production, configure RESEND_API_KEY)
      console.log(`Data deletion request from: ${email}`);
      console.warn('RESEND_API_KEY not configured. Email not sent.');
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erreur lors de l\'envoi de la demande' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
