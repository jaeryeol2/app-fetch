/**
 * AGENTS.md 지침 기반 네이티브 Fetch 모킹 및 캡처 하네스 (Mock Fetch Harness)
 */

import { vi } from 'vitest';

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
  signal?: AbortSignal | null;
}

export interface MockFetchOptions {
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: BodyInit | Uint8Array | null | unknown;
  delayMs?: number;
  failCountBeforeSuccess?: number;
  failStatus?: number;
  onCall?: (captured: CapturedRequest, callIndex: number) => void;
}

export interface MockFetchController {
  spy: ReturnType<typeof vi.spyOn>;
  calls: CapturedRequest[];
  getCallCount: () => number;
  getLastCall: () => CapturedRequest | undefined;
  restore: () => void;
}

/**
 * 전역 또는 window scope의 fetch를 안전하게 스파이 및 모킹하는 하네스 컨트롤러 생성
 */
export function setupMockFetch(
  targetScope: typeof globalThis | (Window & typeof globalThis) = globalThis,
  options: MockFetchOptions = {},
): MockFetchController {
  const calls: CapturedRequest[] = [];
  let currentCallIndex = 0;

  const defaultStatus = options.status ?? 200;
  const failCount = options.failCountBeforeSuccess ?? 0;
  const failStatus = options.failStatus ?? 500;

  const spy = vi.spyOn(targetScope, 'fetch').mockImplementation(async (input, init) => {
    currentCallIndex++;
    const callIdx = currentCallIndex;

    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET');
    const headers = new Headers(init?.headers);
    const body = init?.body ?? (typeof input === 'object' && 'body' in input ? (input as Request).body : undefined);
    const signal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? (input as Request).signal : undefined);

    const captured: CapturedRequest = {
      url,
      method: method.toUpperCase(),
      headers,
      body,
      signal,
    };
    calls.push(captured);

    options.onCall?.(captured, callIdx);

    if (options.delayMs && options.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }

    if (signal?.aborted) {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const currentStatus = callIdx <= failCount ? failStatus : defaultStatus;
    const isError = currentStatus >= 400;

    let responseBody = options.responseBody;
    if (responseBody === undefined) {
      responseBody = JSON.stringify(
        isError ? { error: `HTTP ${currentStatus} Error`, call: callIdx } : { success: true, call: callIdx },
      );
    }

    const responseHeaders = new Headers(options.responseHeaders);
    if (!responseHeaders.has('Content-Type') && typeof responseBody === 'string') {
      responseHeaders.set('Content-Type', 'application/json');
    }

    return new Response(responseBody as BodyInit | null | undefined, {
      status: currentStatus,
      statusText: options.statusText ?? (isError ? 'Error' : 'OK'),
      headers: responseHeaders,
    });
  });

  return {
    spy,
    calls,
    getCallCount: () => calls.length,
    getLastCall: () => calls[calls.length - 1],
    restore: () => {
      spy.mockRestore();
    },
  };
}
