import js from '@eslint/js';

export default [
  {
    ...js.configs.recommended,
    ignores: ['PROTOTIPI ED ESEMPI non fanno parte del progetto/'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Puoi aggiungere regole personalizzate qui
    },
  },
];
