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
    target: 'esnext',
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
