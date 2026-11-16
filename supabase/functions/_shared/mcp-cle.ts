// Clés du connecteur MCP : génération et empreinte (SHA-256). La clé elle-même n'est jamais stockée.

/** « avd_ » + 40 caractères aléatoires (base64url, 240 bits). */
export function nouvelleCle(): string {
  const octets = crypto.getRandomValues(new Uint8Array(30));
  const b64 = btoa(String.fromCharCode(...octets)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `avd_${b64}`;
}

export async function empreinteCle(cle: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(cle));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
