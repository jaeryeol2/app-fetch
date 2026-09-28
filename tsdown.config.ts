import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    target: 'esnext',
    entry: {
      'app-fetch': 'src/index.ts',
    },
    sourcemap: false,
    minify: true,
    clean: true,
    dts: false,
    format: ['esm', 'cjs'],
  },
  {
    // 스크립트 태그(JSP/레거시) 번들은 구형 브라우저에서도 파싱되도록 문법을 낮춥니다.
    // 런타임 하한은 Object.fromEntries/AbortController 기준 Chrome 73+, Safari 12.1+입니다.
    target: 'es2019',
    entry: {
      'app-fetch.min': 'src/index.ts',
    },
    sourcemap: false,
    minify: true,
    clean: false,
    dts: false,
    format: ['iife'],
    globalName: 'appFetch',
    outExtensions() {
      return { js: '.js' };
    },
  },
  {
    entry: {
      'app-fetch': 'src/index.ts',
    },
    outDir: 'dist/@types',
    dts: {
      emitDtsOnly: true,
    },
  },
]);
