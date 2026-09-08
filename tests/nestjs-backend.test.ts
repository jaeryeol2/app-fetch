import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appFetch, getData } from '../src';

describe('NestJS & Node.js Backend Environment', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('NestJS Service: 싱글톤 외부 API 서비스 연동 및 동적 401 Unauthorized 처리', async () => {
    const randomErrMsg = `Unauthorized-${Math.random().toString(36).substring(2, 7)}`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ message: randomErrMsg }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const paymentServiceFetch = appFetch.create({
      baseURL: 'https://payment-gateway.internal',
    });

    const response = await paymentServiceFetch('/v1/charge', { method: 'post', body: { amount: Math.floor(Math.random() * 50000) } });
    expect(response.status).toBe(401);

    const body = await getData<{ message: string }>(response);
    expect(body).toEqual({ message: randomErrMsg });
  });

  it('NestJS / Backend: 백엔드 간 통신 재시도(Retry) 및 동적 딜레이(Delay) 검증', async () => {
    let callCount = 0;
    const randomRetryCount = Math.floor(Math.random() * 3) + 2; // 2 or 3 retries

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      if (callCount < randomRetryCount) {
        return new Response(JSON.stringify({ error: 'Temporary Server Error' }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify({ success: true, count: callCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const response = await appFetch('https://microservice.internal/health', {
      retry: randomRetryCount,
      delay: Math.floor(Math.random() * 20) + 10,
    });

    expect(callCount).toBe(randomRetryCount);
    expect(response.status).toBe(200);
    const data = await getData(response);
    expect(data).toEqual({ success: true, count: randomRetryCount });
  });

  it('NestJS / Backend: onError 인터셉터 로깅 수집', async () => {
    const errorLogs: unknown[] = [];
    const randomErrText = `Network Refused-${Math.random().toString(36).substring(2, 6)}`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new TypeError(randomErrText);
    });

    const loggingFetch = appFetch.create({
      onError: (err) => {
        errorLogs.push(err);
      },
    });

    await expect(loggingFetch('https://unreachable.internal/api')).rejects.toThrow(randomErrText);
    expect(errorLogs.length).toBe(1);
    expect(errorLogs[0]).toBeInstanceOf(Error);
  });
});
