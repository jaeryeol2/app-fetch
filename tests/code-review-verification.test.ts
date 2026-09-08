/**
 * @file code-review-verification.test.ts
 * @description app-fetch-code-review.html에서 지적된 결함 및 개선사항 중 현재 재현 가능한 6건(#1, #2, #3, #5, #7, Method/Body Discriminated Union) 검증 테스트.
 *              원본 문서의 #4, #6 항목은 저장소에 근거 문서가 남아있지 않아 이 파일에서 다루지 않는다.
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appFetch } from '../src';

describe('Code Review Verification Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Finding #01: beforeRequest interceptor in retry', () => {
    it('재시도 시에도 beforeRequest 인터셉터가 매 시도마다 실행되어 헤더가 온전히 전달되어야 한다', async () => {
      let callCount = 0;
      const headersReceived: Array<string | null> = [];

      vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) => {
        callCount++;
        const headers = new Headers(init?.headers);
        headersReceived.push(headers.get('Authorization'));

        if (callCount < 3) {
          return new Response(JSON.stringify({ error: 'server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      let interceptorCount = 0;
      const response = await appFetch('/api/protected', {
        retry: 3,
        delay: 0,
        beforeRequest: (options) => {
          interceptorCount++;
          const headers = new Headers(options.headers);
          headers.set('Authorization', `Bearer Token-Attempt-${interceptorCount}`);
          options.headers = headers;
        },
      });

      expect(callCount).toBe(3);
      expect(interceptorCount).toBe(3);
      expect(headersReceived).toEqual([
        'Bearer Token-Attempt-1',
        'Bearer Token-Attempt-2',
        'Bearer Token-Attempt-3',
      ]);
      expect(response.status).toBe(200);
    });
  });

  describe('Finding #02: User abort signal stops retry immediately', () => {
    it('사용자가 AbortController.abort()로 취소한 경우 재시도 카운트가 있어도 즉시 중단되어야 한다', async () => {
      let callCount = 0;
      const controller = new AbortController();

      vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) => {
        callCount++;
        if (init?.signal?.aborted) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        controller.abort();
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      await expect(
        appFetch('/api/cancel-me', {
          retry: 3,
          delay: 0,
          signal: controller.signal,
        }),
      ).rejects.toThrow();

      // 사용자 취소이므로 재시도하지 않고 1회만 호출되어야 함
      expect(callCount).toBe(1);
    });
  });

  describe('Finding #03: Default retry status code filtering', () => {
    it('기본 retry 옵션은 404/401/400 등 일반 4xx 클라이언트 에러를 재시도하지 않아야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const response = await appFetch('/api/not-found', {
        retry: 3,
        delay: 0,
      });

      expect(response.status).toBe(404);
      expect(callCount).toBe(1);
    });

    it('기본 retry 옵션은 500, 503, 408, 429 에러 발생 시 정상 재시도해야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return new Response(null, { status: 429 });
        }
        if (callCount === 2) {
          return new Response(null, { status: 503 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const response = await appFetch('/api/server-error', {
        retry: 3,
        delay: 0,
      });

      expect(response.status).toBe(200);
      expect(callCount).toBe(3);
    });
  });

  describe('Finding #05: Retry limit hard cap warning', () => {
    it('재시도 시도 횟수가 10회에 도달하면 경고를 출력하고 재시도를 종료해야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: true }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const response = await appFetch('/api/infinite-retry', {
        retryStrategy: {
          shouldRetry: () => true,
        },
      });

      expect(callCount).toBe(10);
      expect(response.status).toBe(500);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Retry limit hard cap reached'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('Finding #07: context.maxRetries accuracy', () => {
    it('context.maxRetries에 options.retry 값이 정확하게 반영되어 전달되어야 한다', async () => {
      let receivedMaxRetries: number | undefined;

      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        return new Response(null, { status: 500 });
      });

      await appFetch('/api/context-check', {
        retry: 5,
        retryStrategy: (context) => {
          receivedMaxRetries = context.maxRetries;
          return { shouldRetry: false };
        },
      });

      expect(receivedMaxRetries).toBe(5);
    });
  });

  describe('Method & Body Discriminated Union', () => {
    it('method get 및 delete 요청 시 쿼리와 함께 정상 호출되어야 한다', async () => {
      let requestedMethod = '';
      vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) => {
        requestedMethod = init?.method ?? 'GET';
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const getRes = await appFetch('/api/items', {
        method: 'get',
        query: { active: true },
      });
      expect(getRes.status).toBe(200);

      const delRes = await appFetch('/api/items/10', {
        method: 'delete',
        query: { force: true },
      });
      expect(delRes.status).toBe(200);
      expect(requestedMethod).toBe('delete');
    });

    it('method post, put, patch 요청 시 body 데이터가 정상 전달되어야 한다', async () => {
      let capturedBody: unknown;
      vi.spyOn(window, 'fetch').mockImplementation(async (_input, init) => {
        capturedBody = init?.body;
        return new Response(JSON.stringify({ saved: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await appFetch('/api/items', {
        method: 'post',
        body: { name: 'app-fetch' },
      });
      expect(capturedBody).toBe(JSON.stringify({ name: 'app-fetch' }));

      await appFetch('/api/items/1', {
        method: 'put',
        body: { name: 'updated' },
      });
      expect(capturedBody).toBe(JSON.stringify({ name: 'updated' }));

      await appFetch('/api/items/1', {
        method: 'patch',
        body: { active: false },
      });
      expect(capturedBody).toBe(JSON.stringify({ active: false }));
    });
  });
});
