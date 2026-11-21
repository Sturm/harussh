import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'scripts/**'] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...vue.configs['flat/recommended'],

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue']
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['error'] }],
      'vue/multi-word-component-names': 'off'
    }
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser }
    }
  },

  {
    files: ['src/main/**', 'src/preload/**', 'electron.vite.config.ts'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/renderer/**'],
    languageOptions: { globals: globals.browser }
  },

  {
    files: ['eslint.config.mjs', 'tools/**/*.mjs'],
    ...tseslint.configs.disableTypeChecked
  },
  {
    files: ['tools/**'],
    languageOptions: { globals: globals.node }
  },

  prettier
)
