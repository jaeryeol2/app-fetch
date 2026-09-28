/**
 * AGENTS.md 지침 기반 동적/랜덤 가변 데이터 생성기 (Dynamic Generators)
 * 고정된 정적 데이터(Static Fixture) 대신 매 실행마다 가변적인 테스트 데이터를 생성합니다.
 */

export type PayloadFormat = 'json' | 'formdata' | 'blob' | 'text' | 'binary' | 'urlsearchparams';

/**
 * 난수 기반 문자열 생성
 */
export function randomString(prefix = 'test', length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let str = '';
  for (let i = 0; i < length; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${str}`;
}

/**
 * 특정 범위 내의 정수 난수 생성
 */
export function randomInt(min = 1, max = 10000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * UUID v4 형식의 동적 랜덤 식별자 생성
 */
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * HTTP 4xx ~ 5xx 범위의 가변 에러 상태 코드 추출
 */
export function randomHttpStatus(category: 'all' | 'client' | 'server' = 'all'): number {
  const clientErrors = [400, 401, 403, 404, 408, 409, 422, 429];
  const serverErrors = [500, 502, 503, 504];

  let candidateList: readonly number[];
  switch (category) {
    case 'client':
      candidateList = clientErrors;
      break;
    case 'server':
      candidateList = serverErrors;
      break;
    case 'all':
    default:
      candidateList = [...clientErrors, ...serverErrors];
      break;
  }

  const index = Math.floor(Math.random() * candidateList.length);
  return candidateList[index];
}

/**
 * 무작위 딜레이 시간(ms) 생성
 */
export function randomDelayMs(min = 10, max = 100): number {
  return randomInt(min, max);
}

/**
 * 동적 임의 쿼리 객체 생성 (중첩 객체, 배열, 원시값 등 혼합)
 */
export function randomQueryParams(): Record<string, unknown> {
  const tagCount = randomInt(2, 5);
  const tags: string[] = [];
  for (let i = 0; i < tagCount; i++) {
    tags.push(randomString('tag', 4));
  }

  return {
    id: randomInt(100, 99999),
    keyword: randomString('query', 6),
    filter: {
      active: Math.random() > 0.5,
      tags,
      meta: {
        version: randomInt(1, 10),
        code: randomString('code', 3),
      },
    },
    page: randomInt(1, 20),
    timestamp: Date.now(),
  };
}

/**
 * 동적 임의 헤더 레코드 생성
 */
export function randomHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${randomString('token', 24)}`,
    'X-Request-Id': randomUuid(),
    'X-Client-Trace': randomString('trace', 12),
    'X-Tenant-Id': `tenant-${randomInt(1, 500)}`,
  };
}

/**
 * 지수 백오프 가변 설정 생성
 */
export function randomBackoffConfig(): {
  retries: number;
  initialDelay: number;
  factor: number;
} {
  return {
    retries: randomInt(2, 4),
    initialDelay: randomInt(10, 50),
    factor: Number((1.5 + Math.random() * 1.0).toFixed(2)),
  };
}

/**
 * 다양한 페이로드 데이터 생성기 (JSON, Blob, FormData, Plain Text, Uint8Array 바이너리)
 */
export function randomPayload(format: PayloadFormat = 'json'): {
  contentType: string;
  data: unknown;
  expectedParsed: unknown;
} {
  switch (format) {
    case 'formdata': {
      const form = new FormData();
      const title = randomString('form-title');
      const count = randomInt(1, 100);
      form.append('title', title);
      form.append('count', String(count));
      return {
        contentType: 'multipart/form-data',
        data: form,
        expectedParsed: { title, count: String(count) },
      };
    }

    case 'blob': {
      const content = randomString('blob-data', 32);
      const blob = new Blob([content], { type: 'application/octet-stream' });
      return {
        contentType: 'application/octet-stream',
        data: blob,
        expectedParsed: blob,
      };
    }

    case 'binary': {
      const bytes = new Uint8Array([randomInt(0, 255), randomInt(0, 255), randomInt(0, 255)]);
      return {
        contentType: 'application/octet-stream',
        data: bytes,
        expectedParsed: bytes,
      };
    }

    case 'text': {
      const text = `TEXT-DATA-${randomString('msg', 16)}`;
      return {
        contentType: 'text/plain; charset=utf-8',
        data: text,
        expectedParsed: text,
      };
    }

    case 'urlsearchparams': {
      const params = new URLSearchParams();
      const key = randomString('key', 4);
      const val = randomString('val', 6);
      params.append(key, val);
      return {
        contentType: 'application/x-www-form-urlencoded',
        data: params,
        expectedParsed: params.toString(),
      };
    }

    case 'json':
    default: {
      const jsonObj = {
        id: randomUuid(),
        title: randomString('title', 10),
        active: Math.random() > 0.5,
        items: [randomInt(1, 50), randomInt(51, 100)],
      };
      return {
        contentType: 'application/json',
        data: jsonObj,
        expectedParsed: jsonObj,
      };
    }
  }
}
