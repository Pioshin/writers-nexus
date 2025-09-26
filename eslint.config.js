import js from '@eslint/js';
import html from 'eslint-plugin-html';

export default [
  {
    ...js.configs.recommended,
    ignores: [
      'PROTOTIPI ED ESEMPI non fanno parte del progetto/',
      'node_modules/',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Puoi aggiungere regole personalizzate qui
    },
  },
  {
    files: ['**/*.html'],
    plugins: {
      html: html,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Regole specifiche per JavaScript in HTML
    },
  },
];
