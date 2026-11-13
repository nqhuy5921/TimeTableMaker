import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['out/', 'dist/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['src/main/**', 'src/preload/**', 'tests/**', '*.config.*'],
    languageOptions: { globals: globals.node },
  },
);
