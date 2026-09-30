// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// Architectural boundaries, enforced by lint rather than by convention:
//   design-system  -> depends on nothing in the app
//   core           -> may use design-system; never features or shell
//   features/<x>   -> may use core and design-system; never another feature
//   shell          -> may use core and design-system
function featureNames() {
  try {
    return fs
      .readdirSync(path.join(__dirname, 'src/app/features'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

const features = featureNames();
const restrict = (regex, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ regex, message }] }],
});

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'cw', style: 'camelCase' },
      ],
      // Elements (cw-card), plus attribute components on native elements (button[cwButton]).
      '@angular-eslint/component-selector': [
        'error',
        [
          { type: 'element', prefix: 'cw', style: 'kebab-case' },
          { type: 'attribute', prefix: 'cw', style: 'camelCase' },
        ],
      ],
    },
  },
  {
    files: ['src/app/design-system/**/*.ts'],
    // Relative paths only, so that a package path such as '@angular/core/testing' doesn't match.
    rules: restrict(
      '(^@cw/core)|(^\\.{1,2}/(.*/)?(core|features|shell)/)',
      'The design system depends on nothing in the app: no core, features or shell imports.',
    ),
  },
  {
    files: ['src/app/core/**/*.ts'],
    rules: restrict(
      '^\\.{1,2}/(.*/)?(features|shell)/',
      'Core must not depend on features or the shell.',
    ),
  },
  ...features.map((feature) => ({
    files: [`src/app/features/${feature}/**/*.ts`],
    rules: restrict(
      `(^|/)(${[...features.filter((f) => f !== feature), 'shell'].join('|')})/`,
      'A feature must not import another feature or the shell. Move shared code to core or the design system.',
    ),
  })),
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
