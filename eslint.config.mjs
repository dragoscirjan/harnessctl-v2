import templEslintConfig from '@templ-project/eslint';
import typescriptEslintPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '.venv/**',
      '**/dist/**',
      '**/coverage/**',
      'site/**',
      '**/*.d.ts',
      'extensions/**/out/**',
      '.external-docs/**',
      '.harnessctl/**',
      '.specs-v1/**',
      'req.md',
    ],
  },
  ...templEslintConfig,
  {
    plugins: {
      '@typescript-eslint': typescriptEslintPlugin,
    },
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-useless-escape': 'off',
    },
  },
  {
    files: ['.github/workflows/*.{yml,yaml}'],
    rules: {
      // GitHub's `on:` key is valid but appears empty under the parser's YAML 1.1 semantics.
      'yml/no-empty-mapping-value': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
