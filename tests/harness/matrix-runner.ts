/**
 * AGENTS.md 8대 타겟 환경 매트릭스 실행 엔진 (Matrix Runner Engine)
 */

export const TargetEnvironment = {
  VUE_3_CSR: 'Vue 3 (CSR)',
  NUXT_3_DUAL: 'Nuxt 3 (SSR & CSR)',
  REACT_18_19_CSR: 'React 18/19 (CSR)',
  NEXTJS_APP_ROUTER_DUAL: 'Next.js App Router (SSR & CSR)',
  NESTJS_NODEJS_BACKEND: 'NestJS / Node.js Backend',
  JSP_LEGACY_HTML_IIFE: 'JSP / Legacy HTML (IIFE Script Tag)',
  SERVER_TEMPLATE_ENGINES: 'Server Template Engines (EJS/Handlebars/Thymeleaf)',
  BUNDLE_DIST_INTEGRITY: 'Bundle Integrity (ESM/CJS/IIFE)',
} as const;

export type TargetEnvironmentType = (typeof TargetEnvironment)[keyof typeof TargetEnvironment];

export interface MatrixTestContext {
  environment: TargetEnvironmentType;
  isNode: boolean;
  isBrowser: boolean;
  isDualMode: boolean;
  timestamp: number;
}

export interface MatrixTestSuite {
  environment: TargetEnvironmentType;
  execute: (context: MatrixTestContext) => Promise<void>;
}

/**
 * 환경별 컨텍스트 생성기
 */
export function createMatrixContext(env: TargetEnvironmentType): MatrixTestContext {
  const isBrowser = env === TargetEnvironment.VUE_3_CSR || env === TargetEnvironment.REACT_18_19_CSR || env === TargetEnvironment.JSP_LEGACY_HTML_IIFE;
  const isDual = env === TargetEnvironment.NUXT_3_DUAL || env === TargetEnvironment.NEXTJS_APP_ROUTER_DUAL || env === TargetEnvironment.SERVER_TEMPLATE_ENGINES;
  const isNode = !isBrowser || isDual;

  return {
    environment: env,
    isNode,
    isBrowser,
    isDualMode: isDual,
    timestamp: Date.now(),
  };
}

/**
 * 8대 타겟 환경 매트릭스 일괄 실행 엔진
 */
export async function runMatrixSuites(suites: MatrixTestSuite[]): Promise<{
  passedCount: number;
  results: Array<{ env: TargetEnvironmentType; success: boolean; error?: unknown }>;
}> {
  const results: Array<{ env: TargetEnvironmentType; success: boolean; error?: unknown }> = [];
  let passedCount = 0;

  for (const suite of suites) {
    const ctx = createMatrixContext(suite.environment);
    try {
      await suite.execute(ctx);
      results.push({ env: suite.environment, success: true });
      passedCount++;
    } catch (err: unknown) {
      results.push({ env: suite.environment, success: false, error: err });
    }
  }

  return { passedCount, results };
}
