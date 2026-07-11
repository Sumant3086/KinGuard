import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // Server uses console intentionally for logging
      'no-console': 'off',
      'no-unused-vars': ['warn', { vars: 'all', args: 'after-used', ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },
];
