const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'android/**',
      'dist-*/**',
      'coverage/**',
      'node_modules/**',
    ],
    rules: {
      // Încărcarea datelor și abonamentele externe actualizează intenționat
      // starea din effects. Regula React Compiler este prea strictă aici.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      // vi.mock() este hoisted; importurile de după mock păstrează factory-ul
      // de stocare determinist și izolat în test.
      'import/first': 'off',
    },
  },
]);
