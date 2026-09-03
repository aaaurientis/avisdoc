// Cloisonnement (recette §8.8) : aucune requête du module ne touche le projet
// plateforme, aucun import croisé avec le domaine téléexpertise.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "../../../..");

function fichiers(dossier: string): string[] {
  let out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) out = out.concat(fichiers(p));
    else if (/\.(ts|tsx)$/.test(nom)) out.push(p);
  }
  return out;
}

const imports = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1] ?? "");

describe("cloisonnement", () => {
  const prospection = fichiers(resolve(RACINE, "src/prospection"));

  it("src/prospection n'importe rien du domaine téléexpertise", () => {
    const fautes = prospection.flatMap((f) =>
      imports(readFileSync(f, "utf8"))
        .filter((i) => /^(@\/|\.)/.test(i) && /(^|\/)(admin|client|pro|integrations)(\/|$)/.test(i))
        .map((i) => `${f} → ${i}`));
    expect(fautes).toEqual([]);
  });

  it("seul data/repo.ts importe supabase-js", () => {
    const fautes = prospection
      .filter((f) => !f.endsWith("data/repo.ts"))
      .filter((f) => imports(readFileSync(f, "utf8")).includes("@supabase/supabase-js"));
    expect(fautes).toEqual([]);
  });

  it("le repo vise le projet vitrine, jamais le projet plateforme", () => {
    const repo = readFileSync(resolve(RACINE, "src/prospection/data/repo.ts"), "utf8");
    expect(repo).toContain("VITE_SUPABASE_URL");
    expect(repo).toContain('schema: "prospection"');
    expect(repo).not.toMatch(/import\.meta\.env\.VITE_ADMIN/);
  });

  it("le domaine téléexpertise n'importe rien du module de prospection", () => {
    const autres = ["src/admin", "src/client", "src/pro", "src/pages", "src/components", "src/lib", "src/hooks", "src/integrations"]
      .flatMap((d) => fichiers(resolve(RACINE, d)));
    const fautes = autres.flatMap((f) =>
      imports(readFileSync(f, "utf8")).filter((i) => /^(@\/|\.)/.test(i) && /prospection/.test(i)).map((i) => `${f} → ${i}`));
    expect(fautes).toEqual([]);
  });

  it("les fonctions serveur du module vivent dans leur propre projet Supabase", () => {
    const config = readFileSync(resolve(RACINE, "supabase-prospection/supabase/config.toml"), "utf8");
    expect(config).toContain('project_id = "fmchuaxxchghfagfpvwn"');
    const admin = readFileSync(resolve(RACINE, "supabase/config.toml"), "utf8");
    expect(admin).not.toContain("prospection");
  });
});
