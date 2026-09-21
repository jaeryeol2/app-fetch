/**
 * @file index.ts
 * @description Native Fetch API 기반 래퍼 라이브러리 메인 엔트리포인트 모듈입니다.
 * URL 분기 처리, 중첩 쿼리 파라미터 직렬화, 인터셉터 체이닝, 타임아웃/재시도 전략,
 * 바디 포맷팅 및 커스텀 인스턴스 생성(appFetch.create) 기능을 제공합니다.
 * @author jaeryeol2
 */

import type {
  FlatQueryFunctionType,
  AppFetchInstance,
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
 * 쿼리 파라미터 직렬화 중 순환 참조가 감지되었을 때 던지는 예외 메시지입니다.
 * 순환 참조 감지 지점 전체(flatQuery, serializeArray, serializeTopLevelArray,
 * stringifyOrThrowCircular)가 이 상수 하나를 공유합니다.
 */
const CIRCULAR_REFERENCE_MESSAGE =
  'Circular reference detected in query parameters';

/**
 * Map/Set 인스턴스의 순회 가능한 값 목록을 배열로 반환합니다. 그 외 일반 객체는
 * 자체 열거 가능한 속성 값을 배열로 반환합니다.
 *
 * @param {object} value 값을 추출할 객체
 * @returns {unknown[]} 순회 대상 값 배열
 */
const getIterableEntries = (value: object): unknown[] => {
  // Map은 키 쪽에도 순환 참조가 존재할 수 있으므로 키와 값을 모두 순회 대상에 포함합니다.
  if (value instanceof Map) {
    return [...value.keys(), ...value.values()];
  }
  if (value instanceof Set) {
    return Array.from(value.values());
  }
  return Object.values(value);
};

/**
 * WeakSet 기반으로 객체 그래프를 재귀 순회하여 순환 참조 여부를 감지합니다.
 * JS 엔진마다 문구가 다른 JSON.stringify 예외 메시지에 의존하지 않는,
 * 엔진 독립적인 순환 참조 탐지 방식입니다.
 *
 * `flatQuery`/`serializeArray`/`serializeTopLevelArray`가 재귀 경로 전체에서
 * 공유하는 동일한 `seen` WeakSet을 그대로 전달받아, 특수 객체(Map/Set 등) 내부에서
 * 상위 경로의 객체를 다시 참조하는 교차 순환 참조까지 하나의 상태로 탐지합니다.
 *
 * @param {unknown} value 검사할 값
 * @param {WeakSet<object>} seen 순환 참조 감지용 WeakSet (호출 경로 전체에서 공유)
 * @returns {boolean} 순환 참조 여부
 */
const hasCircularReference = (
  value: unknown,
  seen: WeakSet<object>,
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
 * @param {unknown} value 직렬화할 특수 객체
 * @param {WeakSet<object>} seen 순환 참조 감지용 WeakSet (호출 경로 전체에서 공유)
 * @returns {string | null} 직렬화된 문자열 또는 실패 시 null
 * @throws {Error} 순환 참조 감지 시 예외 발생
 */
/**
 * Map/Set/Date/RegExp를 JSON 직렬화 가능한 형태로 재귀 변환합니다.
 * `JSON.stringify`는 Map/Set을 빈 객체(`{}`)로 치환하므로, 최상위뿐 아니라
 * 중첩된 위치의 Map/Set까지 미리 배열로 펼쳐야 데이터가 유실되지 않습니다.
 *
 * 순환 참조는 이 함수 호출 전에 `hasCircularReference`로 차단되므로 무한 재귀는 발생하지 않습니다.
 *
 * @param {unknown} value 변환할 값
 * @returns {unknown} JSON 직렬화 가능한 값
 */
const toSerializable = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // TypedArray/ArrayBuffer는 JSON.stringify 기본 동작에 맡깁니다.
  // 여기서 분해하면 원소 수만큼 중간 배열이 생겨 비용만 커집니다.
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return value;
  }

  // toJSON을 구현한 값(Date, Dayjs, Decimal 등)은 그 의도를 최우선으로 존중합니다.
  // 반환값이 다시 Map/Date 등을 품을 수 있으므로 재귀로 한 번 더 정규화합니다.
  const serializable = value as { toJSON?: () => unknown };
  if (typeof serializable.toJSON === 'function') {
    const converted = serializable.toJSON();
    if (converted !== value) {
      return toSerializable(converted);
    }
  }

  if (value instanceof RegExp) {
    return value.toString();
  }
  if (value instanceof Map) {
    return Array.from(value.entries(), ([key, item]) => [
      toSerializable(key),
      toSerializable(item),
    ]);
  }
  if (value instanceof Set) {
    return Array.from(value, (item) => toSerializable(item));
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, toSerializable(item)]),
  );
};

const stringifyOrThrowCircular = (
  value: unknown,
  seen: WeakSet<object>,
): string | null => {
  if (hasCircularReference(value, seen)) {
    throw new Error(CIRCULAR_REFERENCE_MESSAGE);
  }

  try {
    return JSON.stringify(toSerializable(value));
  } catch {
    return null;
  }
};

const stringifySpecialObject = (
  value: object,
  seen: WeakSet<object>,
): string | null => {
  if (value instanceof RegExp) {
    return value.toString();
  }

  return stringifyOrThrowCircular(value, seen);
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
      throw new Error(CIRCULAR_REFERENCE_MESSAGE);
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

    const objectValue = stringifySpecialObject(item, seen);
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

  const objectValue = stringifySpecialObject(value, seen);
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
    throw new Error(CIRCULAR_REFERENCE_MESSAGE);
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
    throw new Error(CIRCULAR_REFERENCE_MESSAGE);
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
  // 스킴이 명시된 절대 URL은 그대로 사용합니다. http/https뿐 아니라 blob:, data:,
  // file: 등도 포함해야 브라우저에서 Blob/DataURL 페치가 baseURL에 오염되지 않습니다.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    return path;
  }

  const cleanBase = resolveBaseURL(options?.baseURL);

  // '//host/path' 형태는 baseURL이 지정되지 않은 경우에만 프로토콜 상대 URL로 인정합니다.
  // baseURL이 있는데도 이를 절대 URL로 취급하면, 사용자 입력으로 조립된 경로가
  // baseURL을 우회하여 외부 호스트로 인증 헤더와 함께 전송될 수 있습니다.
  if (path.startsWith('//') && !cleanBase) {
    return path;
  }

  const normalizedPath = path.startsWith('/')
    ? path.replace(/^\/+/, '/')
    : `/${path}`;
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

  // 프래그먼트(#) 이후는 서버로 전송되지 않으므로, 쿼리는 반드시 # 앞에 붙여야 합니다.
  const hashIndex = baseUrl.indexOf('#');
  if (hashIndex === -1) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${qString}`;
  }

  const head = baseUrl.slice(0, hashIndex);
  const fragment = baseUrl.slice(hashIndex);
  const separator = head.includes('?') ? '&' : '?';
  return `${head}${separator}${qString}${fragment}`;
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
    let disposeSignal: (() => void) | null = null;
    const abortController = new AbortController();

    // 재시도는 재귀 호출이므로, finally만 믿으면 전체 체인이 끝날 때까지 이전 시도들의
    // 리스너가 함께 살아남습니다. 재귀 직전에 먼저 해제하고 finally는 안전망으로 둡니다.
    const releaseSignal = () => {
      disposeSignal?.();
      disposeSignal = null;
    };

    try {
      const timeoutMs = options?.timeout ?? 3000;
      requestTimer =
        timeoutMs > 0
          ? setTimeout(() => {
              isTimedOut = true;
              abortController.abort();
            }, timeoutMs)
          : null;

      const built = await buildRequestInit(
        options,
        mergeHeaders,
        abortController,
      );
      const mergeOptions = built.mergeOptions;
      disposeSignal = built.disposeSignal;
      const url = getURL(path, options);

      const response = await fetch(url, mergeOptions);

      if (requestTimer) {
        clearTimeout(requestTimer);
      }
      releaseSignal();

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
      releaseSignal();

      return await handleFetchError(
        error,
        isTimedOut,
        path,
        options,
        attemptCount,
        fetchData,
      );
    } finally {
      // 안전망: 위 경로에서 해제되지 않은 경우에만 동작합니다(해제는 멱등).
      releaseSignal();
    }
  })();

  return Object.assign(promise, {
    getData: <T = unknown>() => promise.then((res) => res.getData<T>()),
  }) as AppFetchPromise;
};

/**
 * 값이 `undefined`인 키를 제거한 얕은 복사본을 반환합니다.
 * 스프레드 병합에서 호출측이 전달한 `undefined`(예: `{ timeout: config.timeout }`의
 * config.timeout이 비어 있는 경우)가 기본 설정값을 덮어써 지우는 것을 방지합니다.
 *
 * @template T 원본 객체 타입
 * @param {T} [source] 정리할 객체
 * @returns {Partial<T>} undefined 키가 제거된 얕은 복사본
 */
const omitUndefined = <T extends object>(source?: T): Partial<T> => {
  if (!source) {
    return {};
  }

  // Reflect.ownKeys를 쓰면 Symbol 키(런타임별 확장 옵션)까지 보존됩니다.
  const copy: Record<string | symbol, unknown> = {};
  const record = source as Record<string | symbol, unknown>;
  for (const key of Reflect.ownKeys(source)) {
    if (record[key] !== undefined) {
      copy[key] = record[key];
    }
  }

  return copy as Partial<T>;
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
): AppFetchInstance => {
  const instance = (
    path: string,
    options?: AppFetchOptions,
  ): AppFetchPromise => {
    const mergeOptions = {
      ...defaults,
      ...omitUndefined(options),
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

  // 파생 인스턴스도 다시 파생할 수 있도록 create를 부여하고, 상위 기본 설정을 누적 상속합니다.
  return Object.assign(instance, {
    create: (
      nextDefaults: Omit<AppFetchOptions, 'method' | 'query' | 'body'>,
    ): AppFetchInstance =>
      create({
        ...defaults,
        ...omitUndefined(nextDefaults),
        headers: mergeHeaders(defaults.headers, nextDefaults.headers),
        beforeRequest: composeInterceptors(
          defaults.beforeRequest,
          nextDefaults.beforeRequest,
        ),
        afterResponse: composeInterceptors(
          defaults.afterResponse,
          nextDefaults.afterResponse,
        ),
        onError: composeInterceptors(defaults.onError, nextDefaults.onError),
      }),
  });
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
  AppFetchData,
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
