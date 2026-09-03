// Petites interactions navigateur : presse-papiers, téléchargement, mailto.

export async function copier(texte: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

export function telecharger(nom: string, contenu: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function lienMailto(destinataire: string, objet: string, corps: string): string {
  return `mailto:${encodeURIComponent(destinataire)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`;
}
