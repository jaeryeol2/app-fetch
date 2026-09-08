/**
 * @file bugfix-regression.test.ts
 * @description 리뷰 과정에서 발견된 두 가지 버그에 대한 회귀 테스트입니다.
 * 1) JSON 응답 바디가 literal `null`일 때 텍스트로 잘못 파싱되던 문제
 * 2) `retry` 옵션(하위 호환 단순 카운트)이 네트워크/fetch 예외에는 적용되지 않던 문제
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appFetch, getData } from '../src';

describe('Bugfix Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('#1 JSON literal null body parsing', () => {
    it('Content-Type이 application/json이고 바디가 literal null이면 실제 null 값을 반환해야 한다', async () => {
      const response = new Response('null', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await getData(response);

      expect(data).toBeNull();
      expect(typeof data).not.toBe('string');
    });

    it('정상적인 JSON 객체는 여전히 올바르게 파싱되어야 한다 (회귀 방지)', async () => {
      const response = new Response(JSON.stringify({ foo: 'bar' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await getData(response);

      expect(data).toEqual({ foo: 'bar' });
    });

    it('매칭되는 Content-Type이 없는 경우 여전히 fallback(text/blob) 파싱이 동작해야 한다', async () => {
      const response = new Response('plain fallback body', {
        status: 200,
        headers: { 'Content-Type': 'application/x-custom-unknown' },
      });

      const data = await getData(response);

      expect(data).toBe('plain fallback body');
    });
  });

  describe('#2 retry option applies to network errors', () => {
    it('retryStrategy 없이 retry: N 만 설정해도 네트워크(fetch throw) 에러를 재시도해야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          throw new TypeError('Failed to fetch');
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const response = await appFetch('/api/flaky', { retry: 3, delay: 0 });
      const data = await response.getData<{ ok: boolean }>();

      expect(callCount).toBe(3);
      expect(data).toEqual({ ok: true });
    });

    it('retry 옵션이 없으면 네트워크 에러 발생 시 재시도 없이 즉시 던져야 한다 (기존 동작 회귀 방지)', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        throw new TypeError('Failed to fetch');
      });

      await expect(appFetch('/api/always-fails')).rejects.toThrow();
      expect(callCount).toBe(1);
    });

    it('retry 횟수를 다 소진하면 최종적으로 에러를 던져야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        throw new TypeError('Failed to fetch');
      });

      await expect(
        appFetch('/api/always-fails', { retry: 2, delay: 0 }),
      ).rejects.toThrow();
      // 최초 시도(1) + 재시도(2) = 총 3회 호출
      expect(callCount).toBe(3);
    });
  });

  describe('#3 ReadableStream body retry is safely blocked', () => {
    it('바디가 ReadableStream이면 상태 코드 기반 재시도가 안전하게 차단되고 경고가 출력되어야 한다', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: true }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const warnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('chunk'));
          controller.close();
        },
      });

      const response = await appFetch('/api/upload', {
        method: 'post',
        body: stream,
        retry: 3,
        delay: 0,
      });

      expect(response.status).toBe(503);
      // 재시도가 차단되어 최초 1회만 호출되어야 한다
      expect(callCount).toBe(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ReadableStream'),
      );

      warnSpy.mockRestore();
    });

    it('바디가 ReadableStream이 아닌 일반 요청은 재시도가 정상 동작해야 한다 (회귀 방지)', async () => {
      let callCount = 0;
      vi.spyOn(window, 'fetch').mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return new Response(JSON.stringify({ error: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const response = await appFetch('/api/upload', {
        method: 'post',
        body: { foo: 'bar' },
        retry: 3,
        delay: 0,
      });

      expect(response.status).toBe(200);
      expect(callCount).toBe(2);
    });
  });

  describe('#4 query parameters with POST/PUT/PATCH requests', () => {
    it('POST 요청에서도 query 옵션이 URL 쿼리 스트링으로 올바르게 결합되어야 한다', async () => {
      let requestedUrl = '';
      vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await appFetch('/api/orders', {
        method: 'post',
        query: { notify: true, channel: 'app' },
        body: { item: 'book', quantity: 2 },
      });

      expect(requestedUrl).toBe('/api/orders?notify=true&channel=app');
    });

    it('PUT/PATCH 요청에서도 query 옵션과 body가 모두 정상 처리되어야 한다', async () => {
      let requestedUrl = '';
      vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      await appFetch('/api/users/123', {
        method: 'patch',
        query: { validateOnly: false },
        body: { name: 'top' },
      });

      expect(requestedUrl).toBe('/api/users/123?validateOnly=false');
    });
  });
});
