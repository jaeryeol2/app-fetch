/**
 * @file hardcore-stress-edge.test.ts
 * @description app-fetch 라이브러리의 무작위 동적 데이터, 병렬 동시성 스트레스, 멀티 인스턴스 격리,
 * 극단적 바이너리/유니코드 직렬화 및 에러 시나리오 하드 테스팅 스위트입니다.
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appFetch,
  HttpError,
  returnError,
  exponentialBackoffRetry,
} from '../src';

describe('Hardcore Edge-case & Stress Testing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('🔥 [Hardcore] 대규모 무작위 중첩 객체, 배열, 유니코드, Date, Map, Set 직렬화 하드 검증', async () => {
    let capturedUrl = '';
    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const randomTag1 = `태그_${Math.random().toString(36).substring(2, 8)}`;
    const randomTag2 = `🚀_Emoji_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date('2026-08-06T10:00:00.000Z');
    const mySet = new Set(['apple', 'banana']);
    const myMap = new Map([['key1', 'val1']]);

    await appFetch('https://api.example.com/search', {
      query: {
        keyword: 'jaeryeol2 검색어 테스트',
        filter: {
          category: 'electronics',
          tags: [randomTag1, randomTag2],
          createdAfter: now,
        },
        metadata: {
          mySet,
          myMap,
        },
        page: 1,
        isActive: true,
      },
    });

    expect(capturedUrl).toContain('keyword=jaeryeol2%20%EA%B2%80%EC%83%89%EC%96%B4%20%ED%85%8C%EC%8A%A4%ED%8A%B8');
    expect(capturedUrl).toContain('filter.category=electronics');
    expect(capturedUrl).toContain(`filter.tags%5B0%5D=${encodeURIComponent(randomTag1)}`);
    expect(capturedUrl).toContain(`filter.tags%5B1%5D=${encodeURIComponent(randomTag2)}`);
    expect(capturedUrl).toContain('filter.createdAfter=2026-08-06T10%3A00%3A00.000Z');
    expect(capturedUrl).toContain('metadata.mySet=%5B%22apple%22%2C%22banana%22%5D');
    expect(capturedUrl).toContain('metadata.myMap=%5B%5B%22key1%22%2C%22val1%22%5D%5D');
    expect(capturedUrl).toContain('page=1');
    expect(capturedUrl).toContain('isActive=true');
  });

  it('🔥 [Hardcore] 고빈도 병렬 동시 요청 (Concurrent 50+ Requests) 스트레스 테스트', async () => {
    let callCount = 0;
    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      callCount++;
      const urlStr = url.toString();
      const requestId = urlStr.split('reqId=')[1];
      return new Response(JSON.stringify({ reqId: Number(requestId), status: 'OK' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const totalRequests = 50;
    const promises = Array.from({ length: totalRequests }, (_, index) => {
      const reqId = index + 1;
      return appFetch(`https://api.example.com/concurrent?reqId=${reqId}`).getData();
    });

    const results = await Promise.all(promises);

    expect(callCount).toBe(totalRequests);
    expect(results).toHaveLength(totalRequests);
    for (const [idx, res] of results.entries()) {
      expect(res).toEqual({ reqId: idx + 1, status: 'OK' });
    }
  });

  it('🔥 [Hardcore] 멀티 테넌트 API 인스턴스 3개 간 완벽한 설정 및 인터셉터 독립 격리성 검증', async () => {
    const capturedHeaders: Record<string, string> = {};

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      const headers = new Headers(init?.headers);
      const urlStr = url.toString();
      if (urlStr.includes('tenant-a')) {
        capturedHeaders.tenantA = headers.get('X-Tenant-ID') || '';
      } else if (urlStr.includes('tenant-b')) {
        capturedHeaders.tenantB = headers.get('X-Tenant-ID') || '';
      } else if (urlStr.includes('tenant-c')) {
        capturedHeaders.tenantC = headers.get('X-Tenant-ID') || '';
      }
      return new Response(JSON.stringify({ tenantOk: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const tenantA = appFetch.create({
      baseURL: 'https://tenant-a.com',
      headers: { 'X-Tenant-ID': 'TENANT_A_KEY' },
    });

    const tenantB = appFetch.create({
      baseURL: 'https://tenant-b.com',
      headers: { 'X-Tenant-ID': 'TENANT_B_KEY' },
    });

    const tenantC = appFetch.create({
      baseURL: 'https://tenant-c.com',
      headers: { 'X-Tenant-ID': 'TENANT_C_KEY' },
    });

    await tenantA('/users');
    await tenantB('/users');
    await tenantC('/users');

    expect(capturedHeaders.tenantA).toBe('TENANT_A_KEY');
    expect(capturedHeaders.tenantB).toBe('TENANT_B_KEY');
    expect(capturedHeaders.tenantC).toBe('TENANT_C_KEY');
  });

  it('🔥 [Hardcore] 대용량 Uint8Array 바이너리 페이로드 및 커스텀 Content-Type 파이프라인 무결성 검증', async () => {
    let receivedBody: unknown;
    let receivedContentType: string | null = null;

    vi.spyOn(window, 'fetch').mockImplementation(async (_, init) => {
      receivedBody = init?.body;
      const headers = new Headers(init?.headers);
      receivedContentType = headers.get('Content-Type');
      return new Response(JSON.stringify({ processedBytes: 1024 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // 1024 바이트 무작위 바이너리 페이로드 생성
    const largeBinaryPayload = new Uint8Array(1024);
    for (let i = 0; i < 1024; i++) {
      largeBinaryPayload[i] = Math.floor(Math.random() * 256);
    }

    const response = await appFetch('https://api.example.com/binary-upload', {
      method: 'post',
      headers: {
        'Content-Type': 'application/x-custom-binary-format',
      },
      body: largeBinaryPayload as unknown as BodyInit,
    });

    const result = await response.getData();

    expect(receivedBody).toBe(largeBinaryPayload);
    expect(receivedContentType).toBe('application/x-custom-binary-format');
    expect(result).toEqual({ processedBytes: 1024 });
  });

  it('🔥 [Hardcore] Strategy Pattern 지수 백오프 극단적 재시도 수렴 및 대기 지연(Delay) 실패 수집 검증', async () => {
    let attemptCounter = 0;
    const startTime = Date.now();

    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      attemptCounter++;
      // 계속해서 HTTP 503 에러 리턴
      return new Response(JSON.stringify({ error: 'Service Unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // 10ms, 20ms, 40ms 총 3회 재시도 (총 4회 시도)
    const response = await appFetch('https://api.example.com/persistent-failure', {
      retryStrategy: exponentialBackoffRetry({
        maxRetries: 3,
        initialDelay: 10,
        factor: 2,
        statusCodes: [503],
      }),
    });

    const duration = Date.now() - startTime;

    expect(attemptCounter).toBe(4); // initial + 3 retries = 4
    expect(response.status).toBe(503);
    expect(duration).toBeGreaterThanOrEqual(60); // 최소 10+20+40 = 70ms 소모
  });

  it('🔥 [Hardcore] 204 No Content, 205 Reset Content, Content-Length: 0 빈 응답 처리 파싱 검증', async () => {
    // 1. HTTP 204 No Content
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response(null, { status: 204 });
    });
    const res204 = await appFetch('https://api.example.com/204').getData();
    expect(res204).toBeNull();

    // 2. HTTP 205 Reset Content
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response(null, { status: 205 });
    });
    const res205 = await appFetch('https://api.example.com/205').getData();
    expect(res205).toBeNull();

    // 3. Content-Length: 0 Header
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response('', {
        status: 200,
        headers: { 'Content-Length': '0' },
      });
    });
    const resZeroLen = await appFetch('https://api.example.com/empty-len').getData();
    expect(resZeroLen).toBeNull();
  });

  it('🔥 [Hardcore] 예외 래핑(returnError) 및 HttpError 커스텀 메세지 합성 하드 검증', async () => {
    // 1. HttpError 예외 래핑
    const httpErr = new HttpError('Custom Status Message', 403);
    const errObj1 = returnError(httpErr);
    expect(errObj1).toEqual({
      status: 403,
      message: 'Custom Status Message',
      data: null,
    });

    // 2. Standard Error 예외 래핑
    const stdErr = new Error('Network Connection Lost');
    const errObj2 = returnError(stdErr);
    expect(errObj2).toEqual({
      status: 500,
      message: 'Network Connection Lost',
      data: null,
    });

    // 3. Unknown Primitive Error 예외 래핑 (String, Object)
    const errObj3 = returnError('Fatal Primitive Exception');
    expect(errObj3).toEqual({
      status: 500,
      message: 'Internal Server Error',
      data: null,
    });
  });

  it('🔥 [Hardcore] afterResponse 인터셉터 및 retryStrategy에서 body stream 소비 시 response.clone() 안전성 검증', async () => {
    let interceptedData: unknown = null;
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ secret: 'cloned_data_ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await appFetch('https://api.example.com/clone-test', {
      afterResponse: async (res) => {
        // 인터셉터에서 response.json()으로 바디를 소비함
        interceptedData = await res.json();
      },
      retryStrategy: async (ctx) => {
        // retryStrategy에서 ctx.response.json()으로 바디를 소비함
        if (ctx.response) {
          await ctx.response.json();
        }
        return { shouldRetry: false };
      },
    });

    // 메인 로직에서 getData()를 호출할 때 locked/consumed 에러 없이 정상 작동해야 함
    const mainData = await response.getData();

    expect(interceptedData).toEqual({ secret: 'cloned_data_ok' });
    expect(mainData).toEqual({ secret: 'cloned_data_ok' });
  });

  it('🔥 [Hardcore] JSON 파싱 실패 시 response.clone() 기반 Fallback Text 파싱 안정성 검증', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      // Content-Type은 json이지만 실제 데이터는 HTML/Plain Text인 경우
      return new Response('<html>Error Page</html>', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const data = await appFetch('https://api.example.com/invalid-json-fallback').getData();

    // response.clone() 처리 덕분에 파싱 에러 후 Fallback text 파싱이 성공함
    expect(data).toBe('<html>Error Page</html>');
  });

  it('👿 [Evil Chaos] baseURL 미지정 + 상대 경로 호출 시 정상 200 OK 응답 처리 검증', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      expect(url.toString()).toBe('/api/success-endpoint');
      return new Response(JSON.stringify({ code: 'OK', items: [1, 2, 3] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await appFetch('/api/success-endpoint');
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);

    const data = await res.getData();
    expect(data).toEqual({ code: 'OK', items: [1, 2, 3] });
  });

  it('👿 [Evil Chaos] baseURL 미지정 + 상대 경로 호출 시 404 Not Found 응답 처리 검증', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      expect(url.toString()).toBe('/api/non-existent-endpoint');
      return new Response(JSON.stringify({ message: 'Not Found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await appFetch('/api/non-existent-endpoint');
    expect(res.status).toBe(404);
    expect(res.ok).toBe(false);

    const data = await res.getData();
    expect(data).toEqual({ message: 'Not Found' });
  });

  it('👿 [Evil Chaos] Node.js 환경에서 상대경로 해석 불가 시 네이티브 TypeError 발생 검증', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError('Failed to parse URL from /api/unresolvable');
    });

    await expect(appFetch('/api/unresolvable')).rejects.toThrow(
      'Failed to parse URL from /api/unresolvable',
    );
  });

  it('👿 [Evil Chaos] retryStrategy가 무한히 shouldRetry: true를 리턴할 때 시스템 안전 하드캡(Safety Cap 10회) 검증', async () => {
    let attempts = 0;
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      attempts++;
      return new Response(JSON.stringify({ error: 'Server Down' }), { status: 500 });
    });

    // retryStrategy가 무한 재시도(shouldRetry: true)를 반환하는 악의적/실수 코드
    const response = await appFetch('https://api.example.com/infinite-retry', {
      retryStrategy: () => ({ shouldRetry: true, delay: 0 }),
    });

    // 무한 폭주를 막고 Safety Cap (10회) 내에서 안전하게 재시도를 중단하고 최종 응답 리턴
    expect(attempts).toBe(10);
    expect(response.status).toBe(500);
  });

  it('👿 [Evil Chaos] beforeRequest 비동기 수행 중 timeout 시간 초과 시 타임아웃 타이머 정상 차단 검증', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }));
    });

    // beforeRequest가 200ms 대기하는데 timeout은 50ms인 시나리오
    const promise = appFetch('https://api.example.com/before-request-timeout', {
      timeout: 50,
      beforeRequest: async () => {
        await new Promise((resolve) => {
          const t = setTimeout(resolve, 200);
          if (typeof t === 'object' && t && 'unref' in t && typeof t.unref === 'function') {
            t.unref();
          }
        });
      },
    });

    await expect(promise).rejects.toThrow(/Request Timeout/i);
  });

  it('🎲 [Dynamic Varied Test] 매 실행마다 다르고 무작위 동적 파라미터 (GET query & POST body 엄격 분기) 무결성 검증', async () => {
    let capturedUrl = '';
    let capturedHeaderValue = '';
    let capturedBody = '';

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      capturedUrl = url.toString();
      const headers = new Headers(init?.headers);
      capturedHeaderValue = headers.get('X-Dynamic-Trace-ID') || '';
      capturedBody = String(init?.body || '');
      return new Response(JSON.stringify({ status: 'SUCCESS_DYNAMIC' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const dynamicSessionId = `SESS_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
    const dynamicToken = `Bearer_${Math.random().toString(36).substring(2, 15)}`;
    const randomAmount = Math.floor(Math.random() * 1000000) + 1;
    const dynamicPath = `/orders/${Math.floor(Math.random() * 90000) + 10000}`;

    const client = appFetch.create({
      baseURL: 'https://dynamic-api.com',
      headers: {
        'X-Dynamic-Trace-ID': dynamicToken,
      },
    });

    // 1. GET 메서드는 query 파라미터만 허용
    const getRes = await client(dynamicPath, {
      method: 'get',
      query: {
        sessionId: dynamicSessionId,
        v: Date.now(),
      },
    });
    await getRes.getData();
    expect(capturedUrl).toContain(`https://dynamic-api.com${dynamicPath}?sessionId=${dynamicSessionId}`);

    // 2. POST 메서드는 body만 허용
    const postRes = await client(dynamicPath, {
      method: 'post',
      body: {
        orderAmount: randomAmount,
        currency: 'KRW',
      },
    });
    const postData = await postRes.getData();

    expect(capturedHeaderValue).toBe(dynamicToken);
    expect(capturedBody).toContain(String(randomAmount));
    expect(postData).toEqual({ status: 'SUCCESS_DYNAMIC' });
  });

  it('🎲 [Dynamic Varied Test] 동적 무작위 HTTP 에러(400~599) 및 returnError 예외 합성 검증', async () => {
    const randomStatuses = [400, 401, 403, 404, 429, 500, 502, 503];
    const pickedStatus = randomStatuses[Math.floor(Math.random() * randomStatuses.length)];
    const randomErrorMsg = `Err_Msg_${Math.random().toString(36).substring(2, 8)}`;

    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ message: randomErrorMsg }), {
        status: pickedStatus,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await appFetch('https://api.example.com/dynamic-error');
    expect(res.status).toBe(pickedStatus);

    const httpErr = new HttpError(randomErrorMsg, pickedStatus);
    const wrappedErr = returnError(httpErr);

    expect(wrappedErr.status).toBe(pickedStatus);
    expect(wrappedErr.message).toBe(randomErrorMsg);
  });

  it('🎲 [Dynamic Varied Test] 동적 무작위 병렬 동시 요청 (Random 10~30 Requests) 및 동적 Auth Header 주입 검증', async () => {
    const requestCount = Math.floor(Math.random() * 20) + 10; // 10~30 무작위 갯수
    const randomAuthToken = `Bearer_${Math.random().toString(36).substring(2, 16)}`;
    let callCount = 0;
    const capturedTokens: string[] = [];

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      callCount++;
      const headers = new Headers(init?.headers);
      capturedTokens.push(headers.get('Authorization') || '');
      const urlStr = url.toString();
      const id = urlStr.split('itemId=')[1];
      return new Response(JSON.stringify({ itemId: Number(id), ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const client = appFetch.create({
      headers: {
        Authorization: randomAuthToken,
      },
    });

    const promises = Array.from({ length: requestCount }, (_, i) => {
      return client(`https://api.example.com/items?itemId=${i + 1}`).getData();
    });

    const results = await Promise.all(promises);

    expect(callCount).toBe(requestCount);
    expect(results).toHaveLength(requestCount);
    expect(capturedTokens.every((token) => token === randomAuthToken)).toBe(true);
    for (const [idx, item] of results.entries()) {
      expect(item).toEqual({ itemId: idx + 1, ok: true });
    }
  });
});
