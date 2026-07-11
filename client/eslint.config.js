import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      // ESLint recommended — included above
      // React recommended
      ...reactPlugin.configs.recommended.rules,
      // New JSX transform — no React import needed
      ...reactPlugin.configs['jsx-runtime'].rules,
      // React hooks
      ...reactHooks.configs.recommended.rules,

      // Project-level overrides
      'no-console': 'warn',
      'no-unused-vars': ['warn', { vars: 'all', args: 'after-used', ignoreRestSiblings: true, varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
      // Prop-types validation not used in this JS-only prototype
      'react/prop-types': 'off',
      // These v7 hooks rules flag standard data-fetch-on-mount patterns as errors.
      // The pattern `useEffect(() => { load(); }, [])` is intentional and correct.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
    },
  },
];
