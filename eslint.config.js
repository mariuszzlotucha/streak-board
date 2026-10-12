import { fixupPluginRules } from "@eslint/compat";
import eslint from "@eslint/js";
import { defineConfig, includeIgnoreFile } from "eslint/config";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

// eslint-plugin-react still uses context APIs removed in ESLint 10; wrap it until it ships native support.
const reactPlugin = fixupPluginRules(pluginReact);

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = defineConfig({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

const reactConfig = defineConfig({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [eslintPluginReactHooks.configs.flat["recommended-latest"]],
  plugins: { react: reactPlugin },
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...pluginReact.configs.flat.recommended.rules,
    "react/react-in-jsx-scope": "off",
  },
});

const astroConfig = defineConfig({
  files: ["**/*.astro"],
  languageOptions: {
    // astro-eslint-parser does not support projectService yet and warns on every file; hand it a project path instead.
    parserOptions: { projectService: false, project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
  },
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
    // Frontmatter has no enclosing function, so the `returns` check throws on `return Astro.redirect(...)`. The options
    // replace the base ones, so `attributes: false` from the base rule is repeated here.
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false, returns: false } }],
  },
});

// Views read colours and sizes from the design tokens (src/styles/global.css) and the components in src/components/ui/;
// a hex colour, colour function, palette class or arbitrary px/rem value in a view file is an error. Wording that looks
// like a class name in prose is reworded, not allowed through.
const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|mauve|olive|mist|taupe|white|black";
// esquery regex: no "/" inside; the lookahead keeps `href="#add-task"` out.
const UI_LITERAL = `/#[0-9a-fA-F]{3,8}(?![\\w-])|\\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\\(|-\\[[0-9.]+(?:px|rem)\\]|\\b(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|from|via|to|fill|stroke|shadow|divide|decoration|accent|caret|placeholder)-(?:${PALETTE})\\b/`;
const UI_LITERAL_MESSAGE =
  "No literal colours, colour functions, arbitrary px/rem values or palette classes in view files: use a design token (src/styles/global.css) or a component from src/components/ui/.";

const viewLiteralsConfig = defineConfig({
  files: [
    "src/pages/dashboard.astro",
    "src/pages/settings.astro",
    "src/pages/dev/**",
    "src/layouts/**",
    "src/components/{dashboard,tasks,groups,forms,site,dev}/**",
  ],
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=${UI_LITERAL}]`, message: UI_LITERAL_MESSAGE },
      { selector: `TemplateElement[value.raw=${UI_LITERAL}]`, message: UI_LITERAL_MESSAGE },
    ],
  },
});

// shadcn registry items import `cn` from the npm package `cn`; the repo's helper is `cn` in @/lib/utils.
const registryCnConfig = defineConfig({
  files: ["src/**/*.{ts,tsx,astro}"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "cn",
            message:
              'Import `cn` from "@/lib/utils" (a `shadcn add` keeps the registry\'s `cn` package import; point it at the repo helper).',
          },
        ],
      },
    ],
  },
});

const scriptsConfig = defineConfig({
  files: ["scripts/**/*.mjs"],
  extends: [tseslint.configs.disableTypeChecked],
  languageOptions: { globals: { console: true, process: true, fetch: true, URLSearchParams: true } },
  rules: { "no-console": "off" },
});

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  // Generated by `supabase gen types`; overwritten on every migration, so style rules don't apply. Audit probe harnesses are throwaway scripts.
  { ignores: ["src/types.ts", "context/audits/**", ".dependency-cruiser.cjs"] },
  baseConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  viewLiteralsConfig,
  registryCnConfig,
  scriptsConfig,
  eslintPluginPrettier,
);
