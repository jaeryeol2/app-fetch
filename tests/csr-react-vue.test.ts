/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appFetch,
  getData,
  HttpError,
  returnError,
  exponentialBackoffRetry,
} from '../src';

describe('CSR Environment (React 18/19 & Vue 3 CSR)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('React/Vue CSR: window.fetch를 이용한 GET 요청 및 동적 랜덤 JSON 응답 처리 (res.getData 및 getData(res) 동시 검증)', async () => {
    const randomId = Math.floor(Math.random() * 10000) + 1;
    const randomName = `CSR-User-${Math.random().toString(36).substring(2, 9)}`;
    const mockData = { id: randomId, name: randomName };

    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      expect(url.toString()).toContain(`/api/user?page=${randomId}`);
      return new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    // 1. response.getData() 리팩토링 메서드 검증
    const response1 = await appFetch('/api/user', {
      baseURL: 'https://api.example.com',
      query: { page: randomId },
    });
    const data1 = await response1.getData();
    expect(response1.status).toBe(200);
    expect(data1).toEqual(mockData);

    // 2. await appFetch('...').getData() 직접 체이닝 검증
    const dataChained = await appFetch('/api/user', {
      baseURL: 'https://api.example.com',
      query: { page: randomId },
    }).getData();
    expect(dataChained).toEqual(mockData);

    // 3. customFetch.create().getData() 직접 체이닝 검증
    const customApi = appFetch.create({ baseURL: 'https://api.example.com' });
    const dataCustomChained = await customApi('/api/user', {
      query: { page: randomId },
    }).getData();
    expect(dataCustomChained).toEqual(mockData);

    // 4. getData(response) 기존 헬퍼 함수 호환성 검증
    const response2 = await appFetch('/api/user', {
      baseURL: 'https://api.example.com',
      query: { page: randomId },
    });
    const data2 = await getData(response2);
    expect(data2).toEqual(mockData);
  });

  it('React/Vue CSR: FormData 및 File 업로드 요청 처리', async () => {
    let capturedBody: unknown;
    const randomTitle = `Test-File-${Math.random().toString(36).substring(2, 8)}`;

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      capturedBody = init?.body;
      return new Response(JSON.stringify({ success: true, title: randomTitle }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const formData = new FormData();
    formData.append('title', randomTitle);
    formData.append('file', new Blob(['random-content'], { type: 'text/plain' }), `${randomTitle}.txt`);

    const response = await appFetch('https://api.example.com/upload', {
      method: 'post',
      body: formData,
    });

    const result = await response.getData();
    expect(result).toEqual({ success: true, title: randomTitle });
    expect(capturedBody).toBeInstanceOf(FormData);
  });

  it('React/Vue CSR: Blob/Binary 파일 및 Text 응답 파싱 (getData) 검증', async () => {
    const mockBlob = new Blob(['binary-file-content'], { type: 'application/octet-stream' });

    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      return new Response(mockBlob, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    });

    const response = await appFetch('https://api.example.com/download');
    const result = await response.getData();

    expect(result).toBeInstanceOf(Blob);
  });

  it('React/Vue CSR: 다종 Content-Type (Problem JSON, Text/HTML, WebP 이미지 등) 파싱 확장 검증', async () => {
    // 1. application/problem+json
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response(JSON.stringify({ type: 'about:blank', title: 'Bad Request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    });
    const jsonRes = await appFetch('https://api.example.com/problem');
    const jsonData = await jsonRes.getData();
    expect(jsonData).toEqual({ type: 'about:blank', title: 'Bad Request' });

    // 2. text/html
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response('<html><body>Hello</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    });
    const htmlRes = await appFetch('https://api.example.com/page');
    const htmlData = await htmlRes.getData();
    expect(htmlData).toBe('<html><body>Hello</body></html>');

    // 3. image/webp
    vi.spyOn(window, 'fetch').mockImplementationOnce(async () => {
      return new Response(new Blob(['fake-image'], { type: 'image/webp' }), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    });
    const imgRes = await appFetch('https://api.example.com/image.webp');
    const imgData = await imgRes.getData();
    expect(imgData).toBeInstanceOf(Blob);
  });

  it('React/Vue CSR: 브라우저 인터셉터 동작 (동적 인증 토큰 무작위 주입)', async () => {
    let sentHeaders: Headers | undefined;
    const randomToken = `mock-token-${Math.random().toString(36).substring(2, 12)}`;

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      sentHeaders = init?.headers as Headers;
      return new Response(JSON.stringify({ auth: true }), { status: 200 });
    });

    const customFetch = appFetch.create({
      baseURL: 'https://api.example.com',
      beforeRequest: (options) => {
        const headers = options.headers as Headers;
        headers.set('Authorization', `Bearer ${randomToken}`);
      },
    });

    await customFetch('/protected/data');

    expect(sentHeaders?.get('Authorization')).toBe(`Bearer ${randomToken}`);
  });

  it('React/Vue CSR 에러 시나리오: HTTP 500 서버 에러 수신 및 HttpError, returnError 헬퍼 포맷팅 검증', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ message: 'Internal Server Crash' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await appFetch('https://api.example.com/error');
    expect(response.status).toBe(500);

    const httpErr = new HttpError('Internal Server Crash', 500);
    const wrappedError = returnError(httpErr);

    expect(wrappedError).toEqual({
      status: 500,
      message: 'Internal Server Crash',
      data: null,
    });
  });

  it('React/Vue CSR 에러 시나리오: 쿼리 파라미터 순환 참조(Circular Reference) 발생 시 에러 감지 검증', async () => {
    const circularObj: Record<string, unknown> = { name: 'circular' };
    circularObj.self = circularObj; // 순환 참조 생성

    await expect(
      appFetch('https://api.example.com/search', {
        query: circularObj,
      }),
    ).rejects.toThrow('Circular reference detected in query parameters');
  });

  it('React/Vue CSR: 다차원 배열 쿼리 파라미터 직렬화 검증', async () => {
    let capturedUrl = '';
    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await appFetch('https://api.example.com/matrix', {
      query: {
        grid: [
          [10, 20],
          [30, 40],
        ],
      },
    });

    expect(capturedUrl).toContain('grid%5B0%5D%5B0%5D=10');
    expect(capturedUrl).toContain('grid%5B0%5D%5B1%5D=20');
    expect(capturedUrl).toContain('grid%5B1%5D%5B0%5D=30');
    expect(capturedUrl).toContain('grid%5B1%5D%5B1%5D=40');
  });

  it('React/Vue CSR: baseURL 끝에 슬래시가 포함되어 있어도 이중 슬래시(//) 방지 정규화 검증', async () => {
    let capturedUrl = '';
    vi.spyOn(window, 'fetch').mockImplementation(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const client = appFetch.create({ baseURL: 'https://api.example.com/v1/' });
    await client('/users');

    expect(capturedUrl).toBe('https://api.example.com/v1/users');
  });

  it('React/Vue CSR: 사용자 AbortController 취소 시 Request Timeout 대신 원본 AbortError 유지 검증', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      appFetch('https://api.example.com/cancel', {
        signal: controller.signal,
      }),
    ).rejects.toSatisfy((err: unknown) => {
      return (
        err instanceof Error &&
        err.name === 'AbortError' &&
        !err.message.includes('Request Timeout')
      );
    });
  });

  it('React/Vue CSR: Uint8Array/ArrayBuffer 등 Native BodyInit 바이너리 전송 및 커스텀 Content-Type 보존 검증', async () => {
    let capturedBody: unknown;
    let capturedContentType: string | null = null;

    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      capturedBody = init?.body;
      const headers = new Headers(init?.headers);
      capturedContentType = headers.get('Content-Type');
      return new Response(JSON.stringify({ bytesReceived: true }), { status: 200 });
    });

    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);

    await appFetch('https://api.example.com/binary', {
      method: 'post',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: binaryData as unknown as BodyInit,
    });

    expect(capturedBody).toBe(binaryData);
    expect(capturedContentType).toBe('application/octet-stream');
  });

  it('React/Vue CSR Strategy Pattern: exponentialBackoffRetry 내장 지수 백오프 전략 동작 검증', async () => {
    let callCount = 0;
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return new Response(JSON.stringify({ error: 'Temporary Server Error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, attempts: callCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await appFetch('https://api.example.com/flaky', {
      retryStrategy: exponentialBackoffRetry({ maxRetries: 3, initialDelay: 10, factor: 2 }),
    }).getData();

    expect(callCount).toBe(3);
    expect(result).toEqual({ success: true, attempts: 3 });
  });

  it('React/Vue CSR Strategy Pattern: 사용자 정의 객체 형태 RetryStrategyObject 및 조건부 재시도 동작 검증', async () => {
    let callCount = 0;
    vi.spyOn(window, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });

    const response = await appFetch('https://api.example.com/unauthorized', {
      retryStrategy: {
        shouldRetry: (context) => {
          // 401 에러는 재시도하지 않는 커스텀 전략
          if (context.response?.status === 401) {
            return false;
          }
          return context.attempt < 3;
        },
      },
    });

    expect(callCount).toBe(1);
    expect(response.status).toBe(401);
  });
});
