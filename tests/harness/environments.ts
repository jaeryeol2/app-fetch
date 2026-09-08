/**
 * AGENTS.md 8대 타겟 환경 에뮬레이션 및 듀얼 모드(SSR/CSR) 하네스 유틸리티
 */

import fs from 'fs';
import path from 'path';
import type { appFetch, getData } from '../../src';

export interface IIFEBundleContext {
  appFetch: typeof appFetch;
  getData: typeof getData;
  raw: Record<string, unknown>;
}

/**
 * dist/app-fetch.min.js IIFE 번들을 읽어 window 객체에 주입하고 인스턴스를 반환
 */
export function loadIifeBundle(targetWindow: Window & typeof globalThis = window as unknown as Window & typeof globalThis): IIFEBundleContext {
  const scriptPath = path.resolve(__dirname, '../../dist/app-fetch.min.js');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`IIFE bundle not found at ${scriptPath}. Run 'npm run build' first.`);
  }

  const scriptCode = fs.readFileSync(scriptPath, 'utf-8');
  // window scope eval
  (targetWindow as unknown as { eval: (code: string) => void }).eval(scriptCode);

  const raw = (targetWindow as unknown as Record<string, unknown>).appFetch as Record<string, unknown>;
  if (!raw) {
    throw new Error('window.appFetch is not defined after evaluating IIFE script.');
  }

  return {
    appFetch: raw.appFetch as typeof appFetch,
    getData: raw.getData as typeof getData,
    raw,
  };
}

/**
 * SSR (Server Environment) 시뮬레이션 러너
 */
export async function runInSsrContext<T>(
  testFn: (ctx: { isSSR: true; isCSR: false }) => Promise<T>,
): Promise<T> {
  return await testFn({ isSSR: true, isCSR: false });
}

/**
 * CSR (Client/Browser Environment) 시뮬레이션 러너
 */
export async function runInCsrContext<T>(
  testFn: (ctx: { isSSR: false; isCSR: true; window: Window }) => Promise<T>,
): Promise<T> {
  if (typeof window === 'undefined') {
    throw new Error('CSR context requires DOM/window environment. Add @vitest-environment happy-dom to test file.');
  }
  return await testFn({ isSSR: false, isCSR: true, window });
}

/**
 * SSR & CSR 양방향(Dual-Mode) 통합 실행 헬퍼
 */
export async function runDualModeTest(options: {
  ssr: () => Promise<void>;
  csr: () => Promise<void>;
}): Promise<void> {
  // 1. SSR 실행
  await options.ssr();
  // 2. CSR 실행
  await options.csr();
}
