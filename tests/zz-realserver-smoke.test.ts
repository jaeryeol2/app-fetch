/**
 * @file zz-realserver-smoke.test.ts
 * @description 모킹 없이 실제 Node http 서버를 띄우고 네이티브 fetch 로 통신하여,
 * 결함 수정 이후에도 실사용 시나리오가 정상 동작하는지 확인하는 스모크 테스트.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { appFetch } from '../src/index';

let server: Server;
let origin = '';
let flakyHits = 0;

const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (url.pathname === '/echo') {
      readBody(req).then((body) => {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            method: req.method,
            query: url.search,
            contentType: req.headers['content-type'] ?? null,
            auth: req.headers.authorization ?? null,
            body: body.toString('utf8'),
          }),
        );
      });
      return;
    }

    if (url.pathname === '/flaky') {
      flakyHits += 1;
      if (flakyHits < 3) {
        res.statusCode = 503;
        res.end('unavailable');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ recoveredAfter: flakyHits }));
      return;
    }

    if (url.pathname === '/slow') {
      setTimeout(() => res.end('late'), 500);
      return;
    }

    if (url.pathname === '/binary') {
      res.setHeader('content-type', 'application/octet-stream');
      res.end(Buffer.from([1, 2, 3, 4]));
      return;
    }

    if (url.pathname === '/no-content') {
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 404;
    res.end('nope');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('실서버 스모크 - 기본 통신', () => {
  it('GET + 중첩 쿼리 직렬화', async () => {
    const res = await appFetch(`${origin}/echo`, {
      query: { page: 1, filter: { tags: ['a', 'b'] } },
    });
    const data = (await res.getData()) as { method: string; query: string };

    expect(res.ok).toBe(true);
    expect(data.method).toBe('GET');
    expect(decodeURIComponent(data.query)).toBe(
      '?page=1&filter.tags[0]=a&filter.tags[1]=b',
    );
  });

  it('POST JSON 바디 + 자동 Content-Type', async () => {
    const res = await appFetch(`${origin}/echo`, {
      method: 'post',
      body: { name: '재렬', n: 7 },
    });
    const data = (await res.getData()) as {
      contentType: string;
      body: string;
    };

    expect(data.contentType).toBe('application/json');
    expect(JSON.parse(data.body)).toEqual({ name: '재렬', n: 7 });
  });

  it('FormData 업로드 - boundary 가 살아있다', async () => {
    const form = new FormData();
    form.set('field', 'value');

    const res = await appFetch(`${origin}/echo`, {
      method: 'post',
      body: form,
    });
    const data = (await res.getData()) as { contentType: string; body: string };

    expect(data.contentType).toContain('multipart/form-data');
    expect(data.contentType).toContain('boundary=');
    expect(data.body).toContain('value');
  });

  it('204 No Content 는 null 로 파싱된다', async () => {
    const res = await appFetch(`${origin}/no-content`);
    expect(await res.getData()).toBeNull();
  });

  it('바이너리 응답은 Blob 으로 파싱된다', async () => {
    const res = await appFetch(`${origin}/binary`);
    const data = await res.getData();
    expect(data).toBeInstanceOf(Blob);
    expect((data as Blob).size).toBe(4);
  });
});

describe('실서버 스모크 - 수정된 결함이 실사용에서 재발하지 않는다', () => {
  it('GET 에 body 를 실어도 TypeError 없이 요청된다', async () => {
    const res = await appFetch(`${origin}/echo`, {
      method: 'get',
      body: { ignored: true },
    } as unknown as Parameters<typeof appFetch>[1]);

    const data = (await res.getData()) as { method: string; body: string };
    expect(data.method).toBe('GET');
    expect(data.body).toBe('');
  });

  it('FormData 인스턴스에 기본 Content-Type 이 걸려 있어도 업로드가 성공한다', async () => {
    const api = appFetch.create({
      baseURL: origin,
      headers: { 'Content-Type': 'application/json' },
    });

    const form = new FormData();
    form.set('k', 'v');
    const res = await api('/echo', { method: 'post', body: form });
    const data = (await res.getData()) as { contentType: string };

    expect(data.contentType).toContain('multipart/form-data');
  });

  it('create 인스턴스에 undefined 옵션을 넘겨도 기본값이 유지된다', async () => {
    const api = appFetch.create({
      baseURL: origin,
      headers: { Authorization: 'Bearer token' },
      timeout: 5000,
    });

    const maybeTimeout: number | undefined = undefined;
    const res = await api('/echo', { timeout: maybeTimeout });
    const data = (await res.getData()) as { auth: string | null };

    expect(res.ok).toBe(true);
    expect(data.auth).toBe('Bearer token');
  });

  it('// 로 시작하는 경로가 baseURL 을 벗어나지 않는다', async () => {
    const api = appFetch.create({ baseURL: origin });
    const res = await api('//echo');
    const data = (await res.getData()) as { method: string };

    expect(res.url).toBe(`${origin}/echo`);
    expect(data.method).toBe('GET');
  });
});

describe('실서버 스모크 - 재시도 / 타임아웃 / 인터셉터', () => {
  it('503 두 번 후 성공하는 엔드포인트를 재시도로 복구한다', async () => {
    flakyHits = 0;
    const res = await appFetch(`${origin}/flaky`, { retry: 3, delay: 10 });
    const data = (await res.getData()) as { recoveredAfter: number };

    expect(res.status).toBe(200);
    expect(data.recoveredAfter).toBe(3);
  });

  it('타임아웃은 지정 시간에 끊긴다', async () => {
    await expect(
      appFetch(`${origin}/slow`, { timeout: 100 }),
    ).rejects.toThrow(/Request Timeout/);
  });

  it('인터셉터 3종이 모두 실행된다', async () => {
    const order: string[] = [];
    const api = appFetch.create({
      baseURL: origin,
      beforeRequest: (init) => {
        order.push('before');
        (init.headers as Headers).set('Authorization', 'Bearer injected');
      },
      afterResponse: () => {
        order.push('after');
      },
      onError: () => {
        order.push('error');
      },
    });

    const res = await api('/echo');
    const data = (await res.getData()) as { auth: string | null };

    expect(order).toEqual(['before', 'after']);
    expect(data.auth).toBe('Bearer injected');
  });

  it('재시도해도 최종 응답 본문을 정상적으로 읽는다 (clone 최적화 회귀 확인)', async () => {
    flakyHits = 0;
    const res = await appFetch(`${origin}/flaky`, {
      retry: 5,
      delay: 5,
    });

    expect(await res.getData()).toEqual({ recoveredAfter: 3 });
  });
});

describe('실서버 스모크 - 보류 5건 수정 확인', () => {
  it('중첩 Map/Set 쿼리가 서버까지 값 유실 없이 전달된다', async () => {
    const res = await appFetch(`${origin}/echo`, {
      query: { filter: new Map([['tags', new Set(['a', 'b'])]]) },
    });
    const data = (await res.getData()) as { query: string };

    expect(decodeURIComponent(data.query)).toBe(
      '?filter=[["tags",["a","b"]]]',
    );
  });

  it('프래그먼트가 있어도 쿼리가 서버에 도달한다', async () => {
    const res = await appFetch(`${origin}/echo#frag`, { query: { id: 42 } });
    const data = (await res.getData()) as { query: string };

    expect(data.query).toBe('?id=42');
  });

  it('getData 는 원본을 소비하고 재호출해도 같은 값을 준다', async () => {
    const res = await appFetch(`${origin}/echo`, { method: 'post', body: { v: 1 } });

    const first = await res.getData();
    expect(res.bodyUsed).toBe(true);
    const second = await res.getData();

    expect(second).toEqual(first);
  });

  it('장수명 signal 을 20회 재사용해도 리스너가 누적되지 않는다', async () => {
    const controller = new AbortController();
    const shared = controller.signal;

    for (let i = 0; i < 20; i++) {
      const res = await appFetch(`${origin}/echo`, { signal: shared });
      await res.getData();
    }

    // Node EventTarget 기준 리스너 누수가 있으면 MaxListenersExceededWarning 이 뜬다
    expect(controller.signal.aborted).toBe(false);

    // 누적 없이도 abort 전파는 정상 동작해야 한다
    const inflight = appFetch(`${origin}/slow`, { signal: shared, timeout: 5000 });
    controller.abort();
    await expect(inflight).rejects.toThrow();
  });

  it('파생 인스턴스 체인이 실제 요청에서 동작한다', async () => {
    const root = appFetch.create({
      baseURL: origin,
      headers: { 'X-Tier': 'root', Authorization: 'Bearer root' },
    });
    const child = root.create?.({ headers: { Authorization: 'Bearer child' } });
    const grandChild = child?.create?.({ headers: { 'X-Deep': 'yes' } });

    const res = await grandChild?.('/echo');
    const data = (await res?.getData()) as { auth: string | null };

    expect(data.auth).toBe('Bearer child');
  });
});
