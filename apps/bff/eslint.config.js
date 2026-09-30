// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Boundary: the BFF never reaches into the web app. Shared types come from @coursewright/contracts.
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/apps/web/**', '@coursewright/web', '@coursewright/web/*'], message: 'The BFF must not import web code. Share types through @coursewright/contracts.' }] },
      ],
    },
  },
);
