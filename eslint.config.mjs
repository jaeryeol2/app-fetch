import pluginJs from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['dist/**'],
  },
  // 1. 대상 파일 지정
  { files: ['**/*.{js,mjs,cjs,ts,mts}'] },

  // 2. 전역 변수 및 언어 옵션 (ESNext & TypeScript)
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  // 3. 권장 규칙들 적용
  pluginJs.configs.recommended, // JS 권장 규칙
  ...tseslint.configs.recommended, // TS 권장 규칙
  // prettierRecommended, // Prettier 연동 (맨 마지막에 위치)

  // 4. 세부 규칙 커스텀
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // 'prettier/prettier': 'error',
    },
  },
];
