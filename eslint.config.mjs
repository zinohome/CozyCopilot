import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "src-tauri/**",
      "ios/**",
      "android/**",
      "next-env.d.ts",
      // public/embed/loader.js is a third-party embed script that must
      // stay plain ES5 (no `let`/`const`/arrow functions) so legacy
      // CMSs can run it. Linting it would either flag the intended
      // style or — worse — auto-fix it into something the target hosts
      // can't parse. The integration test in tests/integration/m6-loader.test.ts
      // is linted normally.
      "public/embed/loader.js",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
];

export default eslintConfig;
