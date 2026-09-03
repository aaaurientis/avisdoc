import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ---------------------------------------------------------------------------
// Module de prospection : une chaîne visible en dur dans un écran est une
// erreur. Les libellés vivent dans src/prospection/i18n/libelles.ts.
// ---------------------------------------------------------------------------
const libellesEnDur = {
  meta: {
    type: "problem",
    docs: { description: "Interdit les libellés visibles en dur dans les écrans du module de prospection." },
    schema: [],
    messages: { texte: "Libellé en dur « {{texte}} » : le déclarer dans src/prospection/i18n/libelles.ts." },
  },
  create(context) {
    const aDuTexte = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);
    const signaler = (node, texte) =>
      context.report({ node, messageId: "texte", data: { texte: texte.trim().replace(/\s+/g, " ").slice(0, 40) } });
    return {
      JSXText(node) {
        if (aDuTexte(node.value)) signaler(node, node.value);
      },
      JSXAttribute(node) {
        const nom = node.name && node.name.name;
        if (!["title", "placeholder", "aria-label", "alt", "label"].includes(nom)) return;
        const v = node.value;
        if (v && v.type === "Literal" && typeof v.value === "string" && aDuTexte(v.value)) signaler(node, v.value);
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        if (!parent || (parent.type !== "JSXElement" && parent.type !== "JSXFragment")) return;
        const e = node.expression;
        if (e.type === "Literal" && typeof e.value === "string" && aDuTexte(e.value)) signaler(node, e.value);
        if (e.type === "TemplateLiteral") {
          const brut = e.quasis.map((q) => q.value.cooked ?? "").join(" ");
          if (aDuTexte(brut)) signaler(node, brut);
        }
      },
    };
  },
};

const prospection = { rules: { "libelles-en-dur": libellesEnDur } };

// Cloisonnement : le module de prospection (projet vitrine) et le domaine
// téléexpertise (admin, client, pro — projet plateforme) ne s'importent jamais.
const DOMAINES_TELEEXPERTISE = ["admin", "client", "pro", "integrations"];
const IMPORTS_TELEEXPERTISE = {
  group: DOMAINES_TELEEXPERTISE.flatMap((d) => [`@/${d}/*`, `../${d}/**`, `../../${d}/**`, `../../../${d}/**`, `../../../../${d}/**`]),
  message: "Cloisonnement : aucun import du domaine téléexpertise dans src/prospection.",
};
const IMPORT_SUPABASE_HORS_REPO = {
  group: ["@supabase/supabase-js"],
  message: "L'accès aux données passe par src/prospection/data/repo.ts.",
};
const IMPORTS_PROSPECTION = {
  group: ["@/prospection/*", "./prospection/**", "../prospection/**", "../../prospection/**", "../../../prospection/**"],
  message: "Cloisonnement : le domaine téléexpertise n'importe rien du module de prospection.",
};

export default tseslint.config(
  { ignores: ["dist", "dist-deploy"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // --- Module de prospection -------------------------------------------------
  {
    files: ["src/prospection/**/*.{ts,tsx}"],
    plugins: { prospection },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-imports": ["error", { patterns: [IMPORTS_TELEEXPERTISE, IMPORT_SUPABASE_HORS_REPO] }],
      "prospection/libelles-en-dur": "error",
    },
  },
  {
    files: ["src/prospection/data/repo.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [IMPORTS_TELEEXPERTISE] }] },
  },
  {
    files: ["src/prospection/i18n/**/*.ts", "src/prospection/**/*.test.{ts,tsx}", "src/prospection/data/types.gen.ts"],
    rules: { "prospection/libelles-en-dur": "off" },
  },
  // --- Domaine téléexpertise et site vitrine ----------------------------------
  {
    files: ["src/admin/**/*.{ts,tsx}", "src/client/**/*.{ts,tsx}", "src/pro/**/*.{ts,tsx}", "src/pages/**/*.{ts,tsx}",
            "src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/integrations/**/*.{ts,tsx}",
            "src/*.{ts,tsx}", "supabase/**/*.ts"],
    rules: { "no-restricted-imports": ["error", { patterns: [IMPORTS_PROSPECTION] }] },
  },
);
