import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/android/**',
      '**/ios/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/.expo/**',
      '**/.tools/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
    languageOptions: {
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
      },
    },
  },
);
