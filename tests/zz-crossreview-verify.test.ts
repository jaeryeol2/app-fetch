/**
 * @file zz-crossreview-verify.test.ts
 * @description Claude <-> Gemini 교차 코드리뷰에서 제기된 주장들을 실증 판정하기 위한 검증 스위트.
 * 각 테스트는 "주장"을 그대로 assert 하여 CONFIRMED / REJECTED 를 코드로 증명한다.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { appFetch } from '../src/index';
import { exponentialBackoffRetry } from '../src/helpers/fetch-pipeline-helper';
import { getData } from '../src/helpers/fetch-helper';

type FetchArgs = { url: string; init?: RequestInit };

const installFetchSpy = (
  responder: (call: number) => Response,
): { calls: FetchArgs[] } => {
  const calls: FetchArgs[] = [];
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(responder(calls.length));
  });
  globalThis.fetch = spy as unknown as typeof fetch;
  return { calls };
};

const jsonResponse = (status = 200): Response =>
  new Response(JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('주장 1 (Gemini, CRITICAL): 중첩된 Map/Set 은 JSON.stringify 로 데이터 유실', () => {
  it('Map 안의 Map 은 빈 객체로 직렬화되어 값이 사라진다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const inner = new Map<string, number>([['a', 1]]);
    const outer = new Map<string, unknown>([['inner', inner]]);

    await appFetch('/probe', { query: { m: outer } });

    // 수정됨: toSerializable 이 중첩 Map/Set 을 미리 배열로 펼쳐 데이터가 보존된다
    expect(decodeURIComponent(calls[0].url)).toBe(
      '/probe?m=[["inner",[["a",1]]]]',
    );
  });

  it('수정됨: Set 안의 Set 도 보존된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const s = new Set<unknown>([new Set([1, 2])]);

    await appFetch('/probe', { query: { s } });

    expect(decodeURIComponent(calls[0].url)).toBe('/probe?s=[[1,2]]');
  });

  it('회귀 가드: 평면 Map/Set/Date 직렬화 포맷은 기존과 동일하다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const date = new Date('2026-01-02T03:04:05.000Z');

    await appFetch('/probe', {
      query: {
        m: new Map([['k', 'v']]),
        s: new Set(['a', 'b']),
        d: date,
        r: /ab+c/i,
      },
    });

    expect(decodeURIComponent(calls[0].url)).toBe(
      '/probe?m=[["k","v"]]&s=["a","b"]&d=2026-01-02T03:04:05.000Z&r=/ab+c/i',
    );
  });
});

describe('주장 2 (양측 합치, HIGH): 중첩객체 dot / 배열 bracket 혼용', () => {
  it('실제 생성되는 쿼리 스트링 포맷을 고정한다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());

    await appFetch('/probe', {
      query: { user: { name: 'kim', tags: ['a', 'b'] } },
    });

    const url = decodeURIComponent(calls[0].url);
    // 관찰된 실제 포맷을 그대로 기록 (백엔드 상호운용성 판단 근거)
    expect(url).toBe('/probe?user.name=kim&user.tags[0]=a&user.tags[1]=b');
  });
});

describe('주장 3 (양측 합치, HIGH): create() 얕은 병합이 명시적 undefined 로 default 를 날린다', () => {
  it('options 에 timeout: undefined 를 넘기면 defaults.timeout 이 소실된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const api = appFetch.create({ baseURL: 'https://base.test', timeout: 9000 });

    await api('/probe', { baseURL: undefined });

    // 기대: defaults.baseURL 이 살아남아야 한다
    expect(calls[0].url).toBe('https://base.test/probe');
  });
});

describe('주장 4 (양측 합치, HIGH): 재시도가 없어도 매 요청마다 소비되지 않는 clone 이 생긴다', () => {
  it('수정됨: 재시도 설정이 없으면 재시도 판정용 clone 을 아예 만들지 않는다', async () => {
    const cloneSpy = vi.spyOn(Response.prototype, 'clone');
    installFetchSpy(() => jsonResponse());

    const res = await appFetch('/probe');

    expect(cloneSpy).toHaveBeenCalledTimes(0);
    expect(await res.getData()).toEqual({ ok: true });
  });

  it('수정됨: 재시도 설정이 있어도 성공 응답에는 판정용 clone 이 생기지 않는다', async () => {
    const cloneSpy = vi.spyOn(Response.prototype, 'clone');
    installFetchSpy(() => jsonResponse());

    await appFetch('/probe', { retry: 2, delay: 0 });

    // 2xx는 재시도 판정 대상이 아니므로 clone 자체를 만들지 않는다
    expect(cloneSpy).toHaveBeenCalledTimes(0);
  });

  it('수정됨: getData 는 원본 스트림을 정확히 한 번 소비하고 결과를 메모이즈한다', async () => {
    installFetchSpy(() => jsonResponse());

    const res = await appFetch('/probe');
    expect(res.bodyUsed).toBe(false);

    const first = await res.getData();
    expect(res.bodyUsed).toBe(true);

    // 원본을 소비했어도 캐시 덕분에 재호출이 여전히 동작한다
    const second = await res.getData();
    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
  });
});

describe('주장 5 (Gemini, MEDIUM): 기본 retry 경로와 exponentialBackoffRetry 사이 off-by-one', () => {
  it('retry:3 (기본 경로) 총 요청 횟수', async () => {
    const { calls } = installFetchSpy(() => jsonResponse(500));
    await appFetch('/probe', { retry: 3, delay: 0 });
    expect(calls.length).toBe(4);
  });

  it('exponentialBackoffRetry({maxRetries:3}) 총 요청 횟수', async () => {
    const { calls } = installFetchSpy(() => jsonResponse(500));
    await appFetch('/probe', {
      retryStrategy: exponentialBackoffRetry({
        maxRetries: 3,
        initialDelay: 0,
      }),
    });
    expect(calls.length).toBe(4);
  });
});

describe('주장 6 (Gemini, HIGH): parseFallbackBody 의 blob() 재시도 분기', () => {
  it('text() 로 바디를 소비한 뒤 blob() 은 사용 불가 - fallback 2단계는 실질 무효', async () => {
    const res = new Response('hello', {
      headers: { 'content-type': 'application/json' },
    });
    await res.text();
    await expect(res.blob()).rejects.toThrow();
  });

  it('Content-Type 이 json 인데 바디가 깨져도 getData 는 예외 없이 fallback 문자열을 준다', async () => {
    const res = new Response('not-json-at-all', {
      headers: { 'content-type': 'application/json' },
    });
    const data = await getData(res);
    expect(data).toBe('not-json-at-all');
  });
});

describe('주장 7 (양측 합치, CRITICAL/HIGH): 사용자 signal 에 abort 리스너가 누적된다', () => {
  it('AbortSignal.any 없는 fallback 경로에서 요청 N회 후 리스너가 N개 남는다', async () => {
    const anyRef = AbortSignal.any;
    // 구형 런타임 fallback 경로 강제
    Reflect.deleteProperty(AbortSignal, 'any');

    try {
      installFetchSpy(() => jsonResponse());

      const controller = new AbortController();
      const shared = controller.signal;
      let added = 0;
      let removed = 0;
      const origAdd = shared.addEventListener.bind(shared);
      const origRemove = shared.removeEventListener.bind(shared);
      shared.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'abort') added += 1;
        return origAdd(type, listener, opts);
      }) as typeof shared.addEventListener;
      shared.removeEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: boolean | EventListenerOptions,
      ) => {
        if (type === 'abort') removed += 1;
        return origRemove(type, listener, opts);
      }) as typeof shared.removeEventListener;

      const total = 5;
      for (let i = 0; i < total; i++) {
        await appFetch('/probe', { signal: shared }).getData();
      }

      // 수정됨: 본문 소비(getData)가 끝날 때마다 리스너를 해제한다.
      // 본문 수신 중에도 abort가 전달되어야 하므로 헤더 수신 시점에는 해제하지 않는다.
      expect(added).toBe(total);
      expect(added - removed).toBe(0);
    } finally {
      Object.defineProperty(AbortSignal, 'any', {
        value: anyRef,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe('주장 8 (Gemini, MEDIUM): GET 에 body 를 넣으면 조용히 버려진다', () => {
  it('수정됨: 비-body 메서드의 raw body 는 RequestInit 에서 제거된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());

    await appFetch('/probe', {
      method: 'get',
      body: { a: 1 },
    } as unknown as Parameters<typeof appFetch>[1]);

    expect(calls[0].init?.body).toBeUndefined();
  });

  it('수정됨: 실제 네이티브 fetch 로도 body 관련 TypeError 가 나지 않는다', async () => {
    globalThis.fetch = originalFetch;

    await expect(
      appFetch('http://127.0.0.1:1/probe', {
        method: 'get',
        body: { a: 1 },
        timeout: 2000,
      } as unknown as Parameters<typeof appFetch>[1]),
    ).rejects.not.toThrow(/cannot have body/i);
  });
});

describe('주장 9 (Claude): create() 로 만든 인스턴스에도 .create 가 있어야 한다', () => {
  it('수정됨: 파생 인스턴스에서 재파생이 가능하다', () => {
    const api = appFetch.create({ baseURL: 'https://base.test' });
    expect(typeof api.create).toBe('function');
  });

  it('수정됨: 재파생 시 상위 기본 설정이 누적 상속되고 하위가 우선한다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const order: string[] = [];

    const root = appFetch.create({
      baseURL: 'https://base.test',
      headers: { Authorization: 'Bearer root', 'X-Root': 'yes' },
      timeout: 9000,
      beforeRequest: () => {
        order.push('root');
      },
    });
    const child = root.create?.({
      headers: { Authorization: 'Bearer child' },
      beforeRequest: () => {
        order.push('child');
      },
    });

    await child?.('/probe');

    const headers = calls[0].init?.headers as Headers;
    expect(calls[0].url).toBe('https://base.test/probe');
    expect(headers.get('x-root')).toBe('yes');
    expect(headers.get('authorization')).toBe('Bearer child');
    expect(order).toEqual(['root', 'child']);
  });
});

describe('주장 10 (Claude): beforeRequest 인터셉터는 URL/query 를 바꿀 수 없다', () => {
  it('인터셉터가 받은 객체에는 query 정보가 없고 URL 에도 반영되지 않는다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const seen: string[] = [];

    await appFetch('/probe', {
      query: { a: 1 },
      beforeRequest: (init: RequestInit) => {
        seen.push(...Object.keys(init).filter((k) => k === 'query'));
        (init as RequestInit & { query?: unknown }).query = { a: 999 };
      },
    });

    // query 키는 존재하지만 항상 undefined 로 비워진 채 전달된다
    expect(seen).toEqual(['query']);
    // 인터셉터가 query 를 바꿔도 URL 은 원본 options 기준으로 계산되어 무시된다
    expect(decodeURIComponent(calls[0].url)).toBe('/probe?a=1');
  });
});

describe('주장 11 (Claude): 재시도마다 beforeRequest 가 재실행된다', () => {
  it('retry:2 이면 beforeRequest 가 3회 호출된다', async () => {
    installFetchSpy(() => jsonResponse(503));
    let count = 0;

    await appFetch('/probe', {
      retry: 2,
      delay: 0,
      beforeRequest: () => {
        count += 1;
      },
    });

    expect(count).toBe(3);
  });
});

describe('Round3 (Gemini 신규 제시): 검증', () => {
  it('신규1 REJECT: Headers 는 대소문자를 정규화하므로 Authorization/authorization 중복 전송 없음', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const api = appFetch.create({ headers: { Authorization: 'Bearer base' } });

    await api('/probe', { headers: { authorization: 'Bearer override' } });

    const headers = calls[0].init?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer override');
    expect([...headers.keys()].filter((k) => k === 'authorization').length).toBe(
      1,
    );
  });

  it('신규2 REJECT: baseURL 끝 슬래시 / path 앞 슬래시 조합은 정상 병합된다', async () => {
    const combos: Array<[string, string, string]> = [
      ['https://a.test', '/v1', 'https://a.test/v1'],
      ['https://a.test/', 'v1', 'https://a.test/v1'],
      ['https://a.test///', '/v1', 'https://a.test/v1'],
      ['https://a.test/api', 'v1', 'https://a.test/api/v1'],
    ];

    for (const [baseURL, path, expected] of combos) {
      const { calls } = installFetchSpy(() => jsonResponse());
      await appFetch(path, { baseURL });
      expect(calls[0].url).toBe(expected);
    }
  });

  it('신규3 부분 CONFIRM: FormData 에는 라이브러리가 Content-Type 을 넣지 않지만, 사용자 기본 헤더는 그대로 남아 boundary 를 깬다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const form = new FormData();
    form.set('f', 'v');

    await appFetch('/probe', { method: 'post', body: form });
    const clean = calls[0].init?.headers as Headers;
    expect(clean.get('content-type')).toBeNull();

    const api = appFetch.create({
      headers: { 'Content-Type': 'application/json' },
    });
    await api('/probe', { method: 'post', body: form });
    const dirty = calls[1].init?.headers as Headers;
    // 기대(안전): FormData 바디면 잘못된 Content-Type 은 제거되어야 한다
    expect(dirty.get('content-type')).toBeNull();
  });
});

describe('Round3 (교차검증 중 우발 발견): // 로 시작하는 path 가 baseURL 을 통째로 우회한다', () => {
  it('buildBasePath 의 protocol-relative 판정이 path 를 절대 URL 로 삼킨다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const api = appFetch.create({
      baseURL: 'https://api.internal.test',
      headers: { Authorization: 'Bearer secret' },
    });

    // path 가 사용자 입력으로 조립되어 앞에 // 가 붙은 경우
    await api('//evil.test/steal');

    // 수정됨: baseURL 이 있으면 // 시작 경로도 baseURL 하위로 정규화된다
    expect(calls[0].url).toBe('https://api.internal.test/evil.test/steal');
    const headers = calls[0].init?.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer secret');
  });
});

describe('Round4 (Gemini 3.8 Flash 신규 제시): 검증', () => {
  it('신규A REJECT: Map 의 "키" 쪽 순환참조도 정상 감지되어 규정대로 throw 된다', async () => {
    installFetchSpy(() => jsonResponse());
    const selfRef: Record<string, unknown> = {};
    selfRef.self = selfRef;
    const m = new Map<unknown, string>([[selfRef, 'val']]);

    // Map 은 entries() 로 변환되어 키까지 순회 대상에 포함된다
    await expect(appFetch('/probe', { query: { m } })).rejects.toThrow(
      'Circular reference detected in query parameters',
    );
  });

  it('신규F REJECT: 3.8 이 불필요하다고 한 캐스팅 2건은 타입상 필수다', () => {
    // options.body: QueryFetchOptions 에는 body 가 없는 유니온이라 직접 접근 불가
    const probe = (o: { a: 1 } | { a: 1; body: string }): unknown =>
      (o as { body?: unknown }).body;
    expect(probe({ a: 1 })).toBeUndefined();

    // RequestInit['signal'] 은 null 을 포함하므로 signal?: AbortSignal 에 그대로 못 넘긴다
    const init: RequestInit = { signal: null };
    expect(init.signal).toBeNull();
  });

  it('수정됨: 쿼리는 프래그먼트(#) 앞에 삽입된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/page#section', { query: { id: 10 } });
    expect(calls[0].url).toBe('/page?id=10#section');
  });

  it('회귀 가드: 이미 ? 가 있는 경로 + 프래그먼트 조합도 올바르게 결합된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/page?a=1#section', { query: { b: 2 } });
    expect(calls[0].url).toBe('/page?a=1&b=2#section');
  });

  it('신규C CONFIRM?: Node 에서 baseURL 없는 상대경로는 네이티브 fetch 가 거부한다', async () => {
    globalThis.fetch = originalFetch;
    await expect(appFetch('/users', { timeout: 2000 })).rejects.toThrow(
      TypeError,
    );
  });

  it('신규D CONFIRM?: 빈 배열/빈 객체 쿼리 키는 통째로 사라진다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/probe', { query: { filterIds: [], meta: {}, ok: 1 } });
    expect(decodeURIComponent(calls[0].url)).toBe('/probe?ok=1');
  });

  it('보류(문서화 대상): retry:10 은 안전 하드캡에 걸려 총 10회 요청에서 멈춘다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse(503));
    await appFetch('/probe', { retry: 10, delay: 0 });
    expect(calls.length).toBe(10);
  });
});

describe('Round5 (Gemini 토론 반영): 수정본에 대한 재수정 검증', () => {
  it('DELETE 는 본문을 유지하고 JSON 직렬화된다 (GET/HEAD 만 제거)', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());

    await appFetch('/probe', {
      method: 'delete',
      body: { ids: [1, 2, 3] },
    } as unknown as Parameters<typeof appFetch>[1]);

    expect(calls[0].init?.body).toBe('{"ids":[1,2,3]}');
    expect((calls[0].init?.headers as Headers).get('content-type')).toBe(
      'application/json',
    );
  });

  it('본문 없는 DELETE 에는 Content-Type 을 붙이지 않는다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/probe', { method: 'delete' });

    expect(calls[0].init?.body).toBeUndefined();
    expect((calls[0].init?.headers as Headers).get('content-type')).toBeNull();
  });

  it('toJSON 을 구현한 값은 그 결과가 쓰인다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());

    class Tagged {
      readonly [Symbol.toStringTag] = 'Tagged';
      constructor(readonly amount: number) {}
      toJSON(): string {
        return 'TAGGED';
      }
    }

    await appFetch('/probe', { query: { t: new Tagged(10) } });
    expect(decodeURIComponent(calls[0].url)).toBe('/probe?t="TAGGED"');
  });

  it('toJSON 결과가 Map 을 품고 있어도 재귀 정규화된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());

    class Wrapper {
      readonly [Symbol.toStringTag] = 'Wrapper';
      toJSON(): unknown {
        return { inner: new Map([['k', 'v']]) };
      }
    }

    await appFetch('/probe', { query: { w: new Wrapper() } });
    expect(decodeURIComponent(calls[0].url)).toBe(
      '/probe?w={"inner":[["k","v"]]}',
    );
  });

  it('회귀 가드: Date 는 여전히 ISO 문자열로 직렬화된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/probe', {
      query: { d: new Date('2026-01-02T03:04:05.000Z') },
    });
    expect(decodeURIComponent(calls[0].url)).toBe(
      '/probe?d=2026-01-02T03:04:05.000Z',
    );
  });

  it('TypedArray 는 분해되지 않고 JSON 기본 동작을 따른다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    await appFetch('/probe', { query: { u: new Uint8Array([1, 2, 3]) } });
    expect(decodeURIComponent(calls[0].url)).toBe(
      '/probe?u={"0":1,"1":2,"2":3}',
    );
  });

  it('getData 파싱이 실패하면 캐시에서 제거되어 재시도가 가능하다', async () => {
    const res = new Response('x', {
      headers: { 'content-type': 'application/json' },
    });
    let shouldFail = true;
    Object.defineProperty(res, 'arrayBuffer', {
      value: () =>
        shouldFail
          ? Promise.reject(new Error('network broke'))
          : Promise.resolve(new TextEncoder().encode('{"ok":1}').buffer),
      configurable: true,
    });

    await expect(getData(res)).rejects.toThrow('network broke');

    shouldFail = false;
    await expect(getData(res)).resolves.toEqual({ ok: 1 });
  });

  it('blob:/data: 등 스킴이 명시된 절대 URL 은 baseURL 에 오염되지 않는다', async () => {
    const api = appFetch.create({ baseURL: 'https://api.test' });

    for (const absolute of [
      'blob:http://localhost:3000/uuid',
      'data:text/plain,hi',
    ]) {
      const { calls } = installFetchSpy(() => jsonResponse());
      await api(absolute);
      expect(calls[0].url).toBe(absolute);
    }

    // baseURL과 origin이 다른 http(s) 절대 URL은 allowAbsoluteUrls로 명시해야 허용된다
    const { calls } = installFetchSpy(() => jsonResponse());
    await expect(api('https://other.test/x')).rejects.toThrow(
      'does not match baseURL',
    );
    await api('https://other.test/x', { allowAbsoluteUrls: true });
    expect(calls[0].url).toBe('https://other.test/x');
  });

  it('회귀 가드: 스킴 없는 상대 경로는 여전히 baseURL 과 결합된다', async () => {
    const { calls } = installFetchSpy(() => jsonResponse());
    const api = appFetch.create({ baseURL: 'https://api.test' });
    await api('/v1/users');
    expect(calls[0].url).toBe('https://api.test/v1/users');
  });

  it('omitUndefined 가 Symbol 키를 보존한다', async () => {
    const marker = Symbol.for('app-fetch.test.marker');
    const { calls } = installFetchSpy(() => jsonResponse());
    const api = appFetch.create({ baseURL: 'https://api.test' });

    await api('/probe', {
      [marker]: 'kept',
    } as unknown as Parameters<typeof appFetch>[1]);

    expect(
      (calls[0].init as unknown as Record<symbol, unknown>)[marker],
    ).toBe('kept');
  });

  it('재시도 중에도 리스너가 시도 수만큼 동시 잔존하지 않는다', async () => {
    const anyRef = AbortSignal.any;
    Reflect.deleteProperty(AbortSignal, 'any');

    try {
      installFetchSpy(() => jsonResponse(503));
      const controller = new AbortController();
      const shared = controller.signal;

      let live = 0;
      let peak = 0;
      const origAdd = shared.addEventListener.bind(shared);
      const origRemove = shared.removeEventListener.bind(shared);
      shared.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'abort') {
          live += 1;
          peak = Math.max(peak, live);
        }
        return origAdd(type, listener, opts);
      }) as typeof shared.addEventListener;
      shared.removeEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: boolean | EventListenerOptions,
      ) => {
        if (type === 'abort') live -= 1;
        return origRemove(type, listener, opts);
      }) as typeof shared.removeEventListener;

      await appFetch('/probe', { signal: shared, retry: 4, delay: 0 }).getData();

      // 재귀 재시도 중에도 동시에 살아있는 리스너는 1개를 넘지 않아야 한다
      expect(peak).toBe(1);
      expect(live).toBe(0);
    } finally {
      Object.defineProperty(AbortSignal, 'any', {
        value: anyRef,
        configurable: true,
        writable: true,
      });
    }
  });
});
