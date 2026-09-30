/**
 * @file v2-1-features.test.ts
 * @description 2.1.0 기능 회귀 테스트입니다.
 * 1) beforeRequest 두 번째 인자 { path, attempt }
 * 2) beforeRequest options.headers accessor (읽기 Headers, 대입 HeadersInit 정규화, 스프레드 복사 유지)
 * 3) HttpError data 보존과 returnError 전달
 * 4) 기본 재시도 허용 목록 [408, 429, 500, 502, 503, 504]
 * 5) RetryContext.method / retryAfterMs
 * 6) 기본 retry 경로의 Retry-After 존중과 상한 초과 시 재시도 중단
 * 7) exponentialBackoffRetry의 methods / jitter / maxDelay / Retry-After
 * 8) (3.0.0) exponentialBackoffRetry 기본 methods는 멱등 메서드
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appFetch,
  exponentialBackoffRetry,
  HttpError,
  returnError,
} from '../src';
import type { BeforeRequestOptions, RetryContext } from '../src';

const randomInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min + 1));
const randomId = (): string => crypto.randomUUID().slice(0, 8);
const pick = <T>(items: readonly T[]): T => items[randomInt(0, items.length - 1)];

const jsonResponse = (
  status: number,
  data: unknown = { id: randomId() },
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('2.1.0 Features', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('beforeRequest는 두 번째 인자로 baseURL 결합 전 path와 시도 횟수를 받는다', async () => {
    const retry = randomInt(1, 3);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(503));
    const path = `/orders/${randomId()}`;
    const seen: Array<{ path: string; attempt: number }> = [];

    const client = appFetch.create({
      baseURL: `https://api-${randomId()}.example.com`,
      beforeRequest: (_options, context) => {
        seen.push({ ...context });
      },
    });
    await client(path, { retry, delay: 0 });

    const expected = Array.from({ length: retry + 1 }, (_, i) => ({ path, attempt: i + 1 }));
    expect(seen).toEqual(expected);
  });

  it('beforeRequest에서 headers에 일반 객체를 대입해도 즉시 Headers로 읽히고 전송된다', async () => {
    const inits: RequestInit[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      inits.push(init ?? {});
      return jsonResponse(200);
    });
    const token = randomId();
    let readBack: unknown;
    let copied: Partial<BeforeRequestOptions> = {};

    await appFetch(`/h-${randomId()}`, {
      headers: { 'X-Base': 'base' },
      beforeRequest: (options) => {
        options.headers = { 'X-Token': token };
        readBack = options.headers;
        options.headers.set('X-Extra', token);
        copied = { ...options };
      },
    });

    expect(readBack).toBeInstanceOf(Headers);
    expect(copied.headers).toBeInstanceOf(Headers);
    expect(copied.headers?.get('X-Token')).toBe(token);
    const sent = new Headers(inits[0].headers);
    expect(sent.get('X-Token')).toBe(token);
    expect(sent.get('X-Extra')).toBe(token);
    expect(sent.get('X-Base')).toBeNull();
  });

  it('HttpError는 data를 보존하고 returnError가 그대로 전달한다 (없으면 null)', () => {
    const status = randomInt(400, 599);
    const body = { code: randomId(), detail: randomId() };

    const withData = returnError<typeof body>(new HttpError('fail', status, body));
    const withoutData = returnError(new HttpError('fail', status));

    expect(withData).toEqual({ status, message: 'fail', data: body });
    expect(withoutData).toEqual({ status, message: 'fail', data: null });
  });

  it.each([
    ['retryable', [408, 429, 500, 502, 503, 504], 2],
    ['excluded', [501, 505, 506, 507, 508, 510, 511], 1],
  ] as const)('기본 retry는 허용 목록만 재시도한다 (%s)', async (_label, codes, expectedCalls) => {
    const status = pick(codes);
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return jsonResponse(calls === 1 ? status : 200);
    });

    await appFetch(`/r-${randomId()}`, { retry: 1, delay: 0 });

    expect(calls).toBe(expectedCalls);
  });

  it('RetryContext에 대문자 method와 Retry-After(ms)가 채워지고, 네트워크 에러에도 method가 있다', async () => {
    const seconds = randomInt(1, 9);
    const contexts: RetryContext[] = [];
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls === 1) {
        return jsonResponse(503, {}, { 'Retry-After': String(seconds) });
      }
      throw new TypeError('fetch failed');
    });

    await expect(
      appFetch(`/c-${randomId()}`, {
        method: 'put',
        body: { id: randomId() },
        retryStrategy: (context) => {
          contexts.push(context);
          return { shouldRetry: context.attempt === 1 };
        },
      }),
    ).rejects.toThrow('fetch failed');

    expect(contexts[0]).toMatchObject({ method: 'PUT', retryAfterMs: seconds * 1000 });
    expect(contexts[1]).toMatchObject({ method: 'PUT', attempt: 2 });
    expect(contexts[1].retryAfterMs).toBeUndefined();
  });

  it.each([
    ['과거 HTTP-date', () => new Date(Date.now() - randomInt(10, 99) * 1000).toUTCString(), 0],
    ['소수 초', () => `${randomInt(1, 9)}.5`, undefined],
    ['해석 불가', () => `soon-${randomId()}`, undefined],
  ] as const)('Retry-After 해석: %s', async (_label, makeValue, expected) => {
    let captured: RetryContext | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(429, {}, { 'Retry-After': makeValue() }),
    );

    await appFetch(`/p-${randomId()}`, {
      retryStrategy: (context) => {
        captured = context;
        return { shouldRetry: false };
      },
    });

    expect(captured?.retryAfterMs).toBe(expected);
  });

  it('Retry-After의 미래 HTTP-date는 남은 시간(ms)으로 해석된다', async () => {
    const aheadSeconds = randomInt(20, 90);
    let captured: RetryContext | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      jsonResponse(503, {}, {
        'Retry-After': new Date(Date.now() + aheadSeconds * 1000).toUTCString(),
      }),
    );

    await appFetch(`/d-${randomId()}`, {
      retryStrategy: (context) => {
        captured = context;
        return { shouldRetry: false };
      },
    });

    // HTTP-date는 초 단위라 최대 1초 오차가 있습니다.
    expect(captured?.retryAfterMs).toBeGreaterThan((aheadSeconds - 2) * 1000);
    expect(captured?.retryAfterMs).toBeLessThanOrEqual(aheadSeconds * 1000);
  });

  it('기본 retry는 Retry-After를 delay 대신 쓰고, 상한(30초)을 넘으면 재시도하지 않는다', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return jsonResponse(429, {}, { 'Retry-After': '0' });
    });
    await appFetch(`/ra-${randomId()}`, { retry: 1, delay: 60_000 });
    expect(calls).toBe(2);

    calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return jsonResponse(503, {}, { 'Retry-After': String(randomInt(31, 3600)) });
    });
    const response = await appFetch(`/rb-${randomId()}`, { retry: 3, delay: 0 });
    expect(calls).toBe(1);
    expect(response.status).toBe(503);
  });

  it('exponentialBackoffRetry: methods, jitter, maxDelay, Retry-After 규칙', () => {
    const initialDelay = randomInt(50, 200);
    const factor = randomInt(2, 4);
    const maxDelay = initialDelay * factor;
    const response = jsonResponse(503);
    const base: RetryContext = { response, attempt: 1, maxRetries: 0, method: 'GET' };

    const getOnly = exponentialBackoffRetry({ methods: ['get'], jitter: false });
    expect(getOnly({ ...base, method: 'POST' })).toEqual({ shouldRetry: false });

    const fixed = exponentialBackoffRetry({ initialDelay, factor, maxDelay, jitter: false, methods: ['GET'] });
    expect(fixed({ ...base, attempt: 2 })).toEqual({ shouldRetry: true, delay: initialDelay * factor });
    expect(fixed({ ...base, attempt: 3 })).toEqual({ shouldRetry: true, delay: maxDelay });

    const jittered = exponentialBackoffRetry({ initialDelay, factor, methods: ['GET'] });
    const decision = jittered({ ...base, attempt: 2 }) as { shouldRetry: boolean; delay: number };
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delay).toBeGreaterThanOrEqual(0);
    expect(decision.delay).toBeLessThanOrEqual(initialDelay * factor);

    const retryAfterMs = randomInt(1, maxDelay);
    expect(fixed({ ...base, retryAfterMs })).toEqual({ shouldRetry: true, delay: retryAfterMs });
    expect(fixed({ ...base, retryAfterMs: maxDelay + 1 })).toEqual({ shouldRetry: false });
  });

  it('exponentialBackoffRetry는 기본적으로 POST/PATCH를 재시도하지 않고, methods로 명시하면 재시도한다 (3.0.0)', async () => {
    const method = pick(['post', 'patch'] as const);
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      return jsonResponse(calls === 1 ? pick([502, 503, 504]) : 200);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const safeDefault = appFetch.create({
      retryStrategy: exponentialBackoffRetry({ initialDelay: 0 }),
    });
    await safeDefault(`/m1-${randomId()}`, { method, body: { id: randomId() } });
    expect(calls).toBe(1);

    calls = 0;
    await safeDefault(`/m2-${randomId()}`, { method: pick(['get', 'put', 'delete'] as const) });
    expect(calls).toBe(2);

    calls = 0;
    const explicit = appFetch.create({
      retryStrategy: exponentialBackoffRetry({ initialDelay: 0, methods: [method] }),
    });
    await explicit(`/m3-${randomId()}`, { method, body: { id: randomId() } });
    expect(calls).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });
});
