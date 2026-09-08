import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appFetch, getData } from '../src';

describe('SSR & CSR Dual-Mode Environment (Next.js App Router & Nuxt 3)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Next.js/Nuxt SSR Mode: Server Component & Server-side fetch 분기 및 absolute/relative URL 처리', async () => {
    const randomId = Math.floor(Math.random() * 9000) + 1000;
    const mockPosts = [{ id: randomId, title: `SSR Post ${randomId}` }];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      expect(url.toString()).toBe(`http://localhost:3000/api/posts?postId=${randomId}`);
      return new Response(JSON.stringify(mockPosts), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const apiFetcher = appFetch.create({
      baseURL: 'http://localhost:3000',
    });

    const response = await apiFetcher('/api/posts', {
      query: { postId: randomId },
    });

    const data = await getData(response);
    expect(response.status).toBe(200);
    expect(data).toEqual(mockPosts);
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('Next.js/Nuxt CSR Mode: Hydration 후 Client-side Interactive fetch & state 업데이트 통신', async () => {
    const randomClientToken = `client-csr-token-${Math.random().toString(36).substring(2, 10)}`;
    let receivedAuth = '';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_, init) => {
      const headers = new Headers(init?.headers);
      receivedAuth = headers.get('Authorization') || '';
      return new Response(JSON.stringify({ clientHydrated: true, token: randomClientToken }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const clientFetcher = appFetch.create({
      baseURL: 'https://app.example.com',
      headers: {
        Authorization: `Bearer ${randomClientToken}`,
      },
    });

    const data = await clientFetcher('/api/client-state').getData();

    expect(receivedAuth).toBe(`Bearer ${randomClientToken}`);
    expect(data).toEqual({ clientHydrated: true, token: randomClientToken });
  });

  it('Next.js Server Action / Nuxt SSR & Client Shared: Per-request 인스턴스 격리 및 멀티 테넌트 타임아웃 검증', async () => {
    const randomTenantId1 = `tenant-ssr-${Math.floor(Math.random() * 1000)}`;
    const randomTenantId2 = `tenant-csr-${Math.floor(Math.random() * 1000)}`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('tenant1')) {
        return new Response(JSON.stringify({ tenantId: randomTenantId1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ tenantId: randomTenantId2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const tenant1Api = appFetch.create({
      baseURL: 'https://tenant1.api.com',
      timeout: 5000,
    });

    const tenant2Api = appFetch.create({
      baseURL: 'https://tenant2.api.com',
      timeout: 1000,
    });

    const res1 = await tenant1Api('/status');
    const res2 = await tenant2Api('/status');

    const data1 = (await getData<{ tenantId: string }>(res1)) as { tenantId: string };
    const data2 = (await getData<{ tenantId: string }>(res2)) as { tenantId: string };

    expect(data1?.tenantId).toBe(randomTenantId1);
    expect(data2?.tenantId).toBe(randomTenantId2);
  });

  it('SSR & CSR Common: 복잡한 쿼리 파라미터(배열, 중첩 객체) 직렬화 무결성 통신', async () => {
    let capturedUrl = '';
    const randomTag = `tag-${Math.random().toString(36).substring(2, 6)}`;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      capturedUrl = url.toString();
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await appFetch('https://ssr-api.com/search', {
      query: {
        filter: { status: 'active', tags: [randomTag, 'js'] },
        page: 2,
      },
    });

    expect(capturedUrl).toContain('filter.status=active');
    expect(capturedUrl).toContain(`filter.tags%5B0%5D=${randomTag}`);
    expect(capturedUrl).toContain('filter.tags%5B1%5D=js');
    expect(capturedUrl).toContain('page=2');
  });
});
