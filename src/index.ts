/**
 * @file index.ts
 * @description Native Fetch API 기반 래퍼 라이브러리 메인 엔트리포인트 모듈입니다.
 * URL 분기 처리, 중첩 쿼리 파라미터 직렬화, 인터셉터 체이닝, 타임아웃/재시도 전략,
 * 바디 포맷팅 및 커스텀 인스턴스 생성(appFetch.create) 기능을 제공합니다.
 * @author jaeryeol2
 */

import type {
  FlatQueryFunctionType,
  AppFetchOptions,
  AppFetchPromise,
  AppFetchResponse,
} from './@types/fetch-type';
import {
  buildRequestInit,
  handleFetchError,
  handleRetryOrReturnResponse,
} from './helpers/fetch-pipeline-helper';
import { composeInterceptors } from './helpers/interceptor-helper';

/**
 * Map/Set 인스턴스의 순회 가능한 값 목록을 배열로 반환합니다. 그 외 일반 객체는
 * 자체 열거 가능한 속성 값을 배열로 반환합니다.
 *
 * @param {object} value 값을 추출할 객체
 * @returns {unknown[]} 순회 대상 값 배열
 */
const getIterableEntries = (value: object): unknown[] => {
  if (value instanceof Map || value instanceof Set) {
    return Array.from(value.values());
  }
  return Object.values(value);
};

/**
 * WeakSet 기반으로 객체 그래프를 재귀 순회하여 순환 참조 여부를 감지합니다.
 * JS 엔진마다 문구가 다른 JSON.stringify 예외 메시지에 의존하지 않는,
 * 엔진 독립적인 순환 참조 탐지 방식입니다.
 *
 * @param {unknown} value 검사할 값
 * @param {WeakSet<object>} [seen] 순환 참조 감지용 WeakSet
 * @returns {boolean} 순환 참조 여부
 */
const hasCircularReference = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): boolean => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return true;
  }

  seen.add(value);
  const found = getIterableEntries(value).some((entry) =>
    hasCircularReference(entry, seen),
  );
  seen.delete(value);

  return found;
};

/**
 * Map, Set, RegExp 등 특수 객체 타입을 쿼리 스트링 표현을 위한 직렬화 문자열로 변환합니다.
 *
 * @param {object} value 직렬화할 특수 객체
 * @returns {string | null} 직렬화된 문자열 또는 실패 시 null
 * @throws {Error} 순환 참조 감지 시 예외 발생
 */
const stringifyOrThrowCircular = (value: unknown): string | null => {
  if (hasCircularReference(value)) {
    throw new Error('Circular reference detected in query parameters');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

const stringifySpecialObject = (value: object): string | null => {
  if (value instanceof Map) {
    return stringifyOrThrowCircular(Array.from(value.entries()));
  }
  if (value instanceof Set) {
    return stringifyOrThrowCircular(Array.from(value));
  }
  if (value instanceof RegExp) {
    return value.toString();
  }

  return stringifyOrThrowCircular(value);
};

/**
 * 키와 값을 URL 인코딩(encodeURIComponent)하여 'key=value' 형식으로 결합합니다.
 *
 * @param {string} key 쿼리 키
 * @param {string} value 쿼리 값
 * @returns {string} 인코딩된 쿼리 스트링 조각
 */
const encodeKeyValue = (key: string, value: string): string =>
  `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;

/**
 * 배열 원소를 쿼리 파라미터 키 규칙(arrayKey[index])에 맞게 직렬화합니다.
 *
 * @param {string} arrayKey 배열 인덱스가 포함된 키
 * @param {unknown} item 배열 항목
 * @param {WeakSet<object>} seen 순환 참조 감지용 WeakSet
 * @param {FlatQueryFunctionType} flatQuery 재귀 직렬화 헬퍼 함수
 * @returns {string[]} 직렬화된 쿼리 스트링 배열
 */
const serializeArray = (
  arrayKey: string,
  item: unknown,
  seen: WeakSet<object>,
  flatQuery: FlatQueryFunctionType,
): string[] => {
  if (item === undefined || item === null) {
    return [];
  }

  if (Array.isArray(item)) {
    if (seen.has(item)) {
      throw new Error('Circular reference detected in query parameters');
    }
    seen.add(item);
    const arrayResult: string[] = [];
    for (const [index, subItem] of item.entries()) {
      const subArrayKey = `${arrayKey}[${index}]`;
      arrayResult.push(
        ...serializeArray(subArrayKey, subItem, seen, flatQuery),
      );
    }
    seen.delete(item);
    return arrayResult;
  }

  if (typeof item === 'object' && !(item instanceof Date)) {
    if (Object.prototype.toString.call(item) === '[object Object]') {
      return flatQuery(item, arrayKey, seen);
    }

    const objectValue = stringifySpecialObject(item);
    return objectValue ? [encodeKeyValue(arrayKey, objectValue)] : [];
  }

  if (item instanceof Date) {
    return [encodeKeyValue(arrayKey, item.toISOString())];
  } else if (
    typeof item === 'string' ||
    typeof item === 'number' ||
    typeof item === 'boolean' ||
    typeof item === 'bigint'
  ) {
    return [encodeKeyValue(arrayKey, String(item))];
  }

  return [];
};

/**
 * 중첩 객체 필드를 쿼리 키 규칙에 맞게 재귀적으로 직렬화합니다.
 *
 * @param {object} value 직렬화할 객체
 * @param {string} combineKey 부모 키와 결합된 현재 키
 * @param {WeakSet<object>} seen 순환 참조 감지용 WeakSet
 * @param {FlatQueryFunctionType} flatQuery 재귀 직렬화 헬퍼 함수
 * @returns {string[]} 직렬화된 쿼리 스트링 배열
 */
const serializeObject = (
  value: object,
  combineKey: string,
  seen: WeakSet<object>,
  flatQuery: FlatQueryFunctionType,
): string[] => {
  if (value instanceof Date) {
    return [encodeKeyValue(combineKey, value.toISOString())];
  }

  if (Object.prototype.toString.call(value) === '[object Object]') {
    return flatQuery(value, combineKey, seen);
  }

  const objectValue = stringifySpecialObject(value);
  return objectValue ? [encodeKeyValue(combineKey, objectValue)] : [];
};

/**
 * 최상위 배열 값을 배열 인덱스 키 규칙(key[index])에 맞게 직렬화하며 순환 참조를 감지합니다.
 *
 * @param {unknown[]} value 직렬화할 배열
 * @param {string} combineKey 부모 키와 결합된 현재 키
 * @param {WeakSet<object>} seen 순환 참조 감지용 WeakSet
 * @param {FlatQueryFunctionType} flatQuery 재귀 직렬화 헬퍼 함수
 * @returns {string[]} 직렬화된 쿼리 스트링 배열
 * @throws {Error} 순환 참조 감지 시 예외 발생
 * @author jaeryeol2
 */
const serializeTopLevelArray = (
  value: unknown[],
  combineKey: string,
  seen: WeakSet<object>,
  flatQuery: FlatQueryFunctionType,
): string[] => {
  if (seen.has(value)) {
    throw new Error('Circular reference detected in query parameters');
  }

  seen.add(value);
  const array: string[] = [];
  for (const [index, item] of value.entries()) {
    const arrayKey = `${combineKey}[${index}]`;
    array.push(...serializeArray(arrayKey, item, seen, flatQuery));
  }
  seen.delete(value);

  return array;
};

/**
 * 중첩 쿼리 객체를 평탄화하여 쿼리 스트링 배열로 직렬화합니다.
 * WeakSet을 사용하여 객체의 순환 참조(Circular Reference)를 안전하게 감지하고 차단합니다.
 *
 * @param {object | Record<string, unknown>} query 직렬화할 쿼리 객체
 * @param {string} [parentKey] 부모 키
 * @param {WeakSet<object>} [seen] 순환 참조 감지용 WeakSet
 * @returns {string[]} 평탄화된 쿼리 스트링 배열
 * @throws {Error} 순환 참조 감지 시 예외 발생
 * @author jaeryeol2
 */
const flatQuery = (
  query: object | Record<string, unknown>,
  parentKey?: string,
  seen: WeakSet<object> = new WeakSet(),
): string[] => {
  const array: string[] = [];

  if (seen.has(query)) {
    throw new Error('Circular reference detected in query parameters');
  }

  seen.add(query);

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) {
      continue;
    }

    const combineKey = parentKey ? `${parentKey}.${key}` : key;

    if (Array.isArray(value)) {
      array.push(...serializeTopLevelArray(value, combineKey, seen, flatQuery));
    } else if (typeof value === 'object') {
      array.push(...serializeObject(value, combineKey, seen, flatQuery));
    } else if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      array.push(encodeKeyValue(combineKey, String(value)));
    }
  }

  seen.delete(query);

  return array;
};

/**
 * 쿼리 객체를 '&' 구분자로 연결된 쿼리 스트링으로 변환합니다.
 *
 * @param {Record<string, unknown>} query 쿼리 객체
 * @param {WeakSet<object>} [seen] 순환 참조 감지용 WeakSet
 * @returns {string} 쿼리 스트링 문자열
 * @author jaeryeol2
 */
const queryString = (
  query: object | Record<string, unknown>,
  seen: WeakSet<object> = new WeakSet(),
): string => flatQuery(query, undefined, seen).join('&');

/**
 * baseURL을 정규화하고 끝자리의 중복 슬래시(/)를 제거합니다.
 *
 * @param {string} [baseURL] 기본 URL
 * @returns {string} 정규화된 baseURL
 */
const resolveBaseURL = (baseURL?: string): string => {
  if (!baseURL) {
    return '';
  }
  let end = baseURL.length;
  while (end > 0 && baseURL[end - 1] === '/') {
    end--;
  }
  return baseURL.slice(0, end);
};

/**
 * 상대 및 절대 경로를 판단하여 기본 요청 경로를 조합합니다.
 *
 * @param {string} path 요청 경로
 * @param {AppFetchOptions} [options] 요청 옵션
 * @returns {string} 조합된 기본 경로
 */
const buildBasePath = (path: string, options?: AppFetchOptions): string => {
  if (/^(?:https?:)?\/\//i.test(path)) {
    return path;
  }

  const cleanBase = resolveBaseURL(options?.baseURL);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return cleanBase ? `${cleanBase}${normalizedPath}` : normalizedPath;
};

/**
 * 절대 경로 및 상대 경로(baseURL 결합)와 쿼리 파라미터를 조합하여 최종 요청 URL을 생성합니다.
 * 소나큐브 인지 복잡도(Cognitive Complexity) 최소화를 위해 단일 책임 헬퍼 함수로 분리되어 있습니다.
 *
 * @param {string} path 요청 경로 또는 URL
 * @param {AppFetchOptions} [options] 요청 옵션
 * @returns {string} 완성된 최종 요청 URL
 * @author jaeryeol2
 */
const getURL = (path: string, options?: AppFetchOptions): string => {
  const baseUrl = buildBasePath(path, options);
  if (!options?.query) {
    return baseUrl;
  }

  const qString = queryString(options.query);
  if (!qString) {
    return baseUrl;
  }

  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}${qString}`;
};

/**
 * 기존 Headers 객체와 커스텀 HeadersInit 객체를 속성 유실 없이 안전하게 병합합니다.
 *
 * @param {HeadersInit} [base] 기본 헤더
 * @param {HeadersInit} [custom] 추가/덮어쓸 커스텀 헤더
 * @returns {Headers} 병합된 네이티브 Headers 객체
 * @author jaeryeol2
 */
const mergeHeaders = (base?: HeadersInit, custom?: HeadersInit): Headers => {
  const headers = new Headers(base);

  if (custom) {
    for (const [key, value] of new Headers(custom).entries()) {
      headers.set(key, value);
    }
  }

  return headers;
};

/**
 * HTTP 통신을 수행하는 메인 비동기 fetchData 함수입니다.
 * 독립 헬퍼 모듈(fetch-pipeline-helper)을 통해 모듈 스코프 1회 생성 메모리 최적화 및 캡슐화가 적용되어 있습니다.
 *
 * @param {string} path 요청 경로 또는 URL
 * @param {AppFetchOptions} [options] 요청 옵션
 * @param {number} [attemptCount] 현재 시도 횟수 (1-indexed)
 * @returns {AppFetchPromise} getData() 메서드가 포함된 AppFetchPromise
 * @author jaeryeol2
 */
const fetchData = (
  path: string,
  options?: AppFetchOptions,
  attemptCount = 1,
): AppFetchPromise => {
  const promise = (async (): Promise<AppFetchResponse> => {
    let requestTimer: ReturnType<typeof setTimeout> | null = null;
    let isTimedOut = false;
    const abortController = new AbortController();

    try {
      const timeoutMs = options?.timeout ?? 3000;
      requestTimer =
        timeoutMs > 0
          ? setTimeout(() => {
              isTimedOut = true;
              abortController.abort();
            }, timeoutMs)
          : null;

      const mergeOptions = await buildRequestInit(
        options,
        attemptCount,
        mergeHeaders,
        abortController,
      );
      const url = getURL(path, options);

      const response = await fetch(url, mergeOptions);

      if (requestTimer) {
        clearTimeout(requestTimer);
      }

      return await handleRetryOrReturnResponse(
        response,
        path,
        options,
        attemptCount,
        fetchData,
      );
    } catch (error) {
      if (requestTimer) {
        clearTimeout(requestTimer);
      }

      return await handleFetchError(
        error,
        isTimedOut,
        path,
        options,
        attemptCount,
        fetchData,
      );
    }
  })();

  return Object.assign(promise, {
    getData: <T = unknown>() => promise.then((res) => res.getData<T>()),
  }) as AppFetchPromise;
};

/**
 * 기본 설정(baseURL, headers, timeout, 인터셉터 등)이 캡슐화된 커스텀 appFetch 클라이언트 인스턴스를 생성합니다.
 *
 * @pattern Factory Pattern - 기본 설정 및 인터셉터를 캡슐화한 독립 인스턴스를 생성
 * @param {Omit<AppFetchOptions, 'method' | 'query' | 'body'>} defaults 커스텀 기본 옵션
 * @returns {(path: string, options?: AppFetchOptions) => AppFetchPromise} 커스텀 appFetch 클라이언트 함수
 * @author jaeryeol2
 */
const create = (
  defaults: Omit<AppFetchOptions, 'method' | 'query' | 'body'>,
) => {
  return (path: string, options?: AppFetchOptions): AppFetchPromise => {
    const mergeOptions = {
      ...defaults,
      ...options,
      headers: mergeHeaders(defaults.headers, options?.headers),
      beforeRequest: composeInterceptors(
        defaults.beforeRequest,
        options?.beforeRequest,
      ),
      afterResponse: composeInterceptors(
        defaults.afterResponse,
        options?.afterResponse,
      ),
      onError: composeInterceptors(defaults.onError, options?.onError),
    };

    return fetchData(path, mergeOptions);
  };
};

/**
 * 메인 appFetch HTTP 클라이언트 객체입니다.
 * 직접 함수로 호출하거나, appFetch.create()로 커스텀 인스턴스를 생성할 수 있습니다.
 *
 * @author jaeryeol2
 */
export const appFetch = Object.assign(fetchData, { create });

export type {
  BodyFetchOptions,
  HttpBodyMethod,
  HttpMethod,
  HttpNoBodyMethod,
  QueryFetchOptions,
  RetryContext,
  RetryStrategy,
  RetryStrategyFunction,
  RetryStrategyObject,
  AppFetchInstance,
  AppFetchOptions,
  AppFetchPromise,
  AppFetchResponse,
} from './@types/fetch-type';
export { getData, HttpError, returnError } from './helpers/fetch-helper';
export { exponentialBackoffRetry } from './helpers/fetch-pipeline-helper';
export {
  composeInterceptors,
  mergeFetchOptions,
  setInterceptors,
} from './helpers/interceptor-helper';
