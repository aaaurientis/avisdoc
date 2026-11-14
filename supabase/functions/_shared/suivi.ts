// Suivi de l'avancement d'un travail en tâche de fond (recherche IA, recherche des
// fiches Google) : étape, pourcentage et journal, écrits dans
// admin_reseau_recherches_ia et relus par l'écran toutes les 3 secondes.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Niveau = "info" | "ok" | "ecarte";

export class Suivi {
  private journal: { le: string; texte: string; niveau: Niveau }[] = [];
  private etape = "";
  private progression = 0;
  private file: Promise<unknown> = Promise.resolve();
  constructor(private db: any, private id: string, reprise?: { etape?: string | null; progression?: number; journal?: any[] }) {
    // Reprise d'un travail enchaîné sur plusieurs appels : on repart de l'état écrit.
    if (reprise) {
      this.etape = reprise.etape ?? "";
      this.progression = reprise.progression ?? 0;
      this.journal = Array.isArray(reprise.journal) ? reprise.journal : [];
    }
  }

  /** Écrit l'étape, le pourcentage et une ligne de journal. Les écritures restent dans l'ordre. */
  maj(o: { etape?: string; progression?: number; ligne?: string; niveau?: Niveau }): Promise<unknown> {
    if (o.etape) this.etape = o.etape;
    if (o.progression !== undefined) this.progression = Math.max(this.progression, Math.min(99, Math.round(o.progression)));
    if (o.ligne) this.journal = [...this.journal, { le: new Date().toISOString(), texte: o.ligne.slice(0, 300), niveau: o.niveau ?? "info" }].slice(-40);
    const ligne = { etape: this.etape, progression: this.progression, journal: this.journal };
    this.file = this.file.then(() => this.db.from("admin_reseau_recherches_ia").update(ligne).eq("id", this.id)).catch(() => {});
    return this.file;
  }

  /** La dernière écriture avant de clore la recherche. */
  attendre(): Promise<unknown> {
    return this.file;
  }

  get lignes() {
    return this.journal;
  }
}



/** Poursuivre un travail après avoir répondu au navigateur (EdgeRuntime.waitUntil). */
export function enTacheDeFond(travail: Promise<unknown>): void {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(travail.catch(() => {}));
  else void travail.catch(() => {});
}
