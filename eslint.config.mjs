import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off' },
  },
];
