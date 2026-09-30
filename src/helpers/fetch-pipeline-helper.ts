/**
 * @file fetch-pipeline-helper.ts
 * @description fetchData 실행 파이프라인 전처리/후처리, 시그널 처리, 바디 설정 및 재시도/에러 핸들링 헬퍼 모듈입니다.
 * 모듈 스코프 생성을 통한 메모리 최적화 및 캡슐화를 보장합니다.
 * @author jaeryeol2
 */

import type {
  AfterResponseInterceptorType,
  BeforeRequestContext,
  BeforeRequestInterceptorType,
  BeforeRequestOptions,
  OnErrorType,
  RetryContext,
  RetryStrategy,
  RetryStrategyFunction,
  AppFetchOptions,
  AppFetchResponse,
} from '../@types/fetch-type';
import { getData, releaseBodySignal } from './fetch-helper';

/** 기본 재시도 대상 상태 코드. 일시적 장애로 볼 수 있는 코드만 허용 목록으로 둡니다. */
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/** 재전송 시 중복 처리 위험이 있는 메서드 */
const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PATCH']);

/** 재시도 대기 시간의 기본 상한(ms). Retry-After가 이 값을 넘으면 재시도하지 않습니다. */
const DEFAULT_MAX_DELAY = 30_000;

/** exponentialBackoffRetry가 기본으로 재시도하는 멱등 메서드 */
const DEFAULT_BACKOFF_METHODS = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'];

/**
 * 요청 메서드를 대문자로 정규화합니다. 지정하지 않으면 fetch 기본값인 GET입니다.
 *
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @returns {string} 대문자 메서드
 */
const normalizeMethod = (options?: AppFetchOptions): string =>
  (options?.method ?? 'get').toUpperCase();

/**
 * `Retry-After` 헤더 값을 밀리초로 해석합니다.
 * 정수 초(delay-seconds) 또는 HTTP-date만 허용하며, 소수 초 등 그 밖의 값은 무시합니다.
 *
 * @param {string | null} value Retry-After 헤더 값
 * @returns {number | undefined} 대기 시간(ms). 해석할 수 없으면 undefined, 지난 날짜면 0
 */
const parseRetryAfter = (value: string | null): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  // HTTP-date는 항상 요일·월 이름을 포함합니다. 문자가 없는 값('1.5' 등)은
  // Date.parse가 임의의 날짜로 해석하므로 거부합니다.
  if (!/[a-z]/i.test(trimmed)) {
    return undefined;
  }
  const time = Date.parse(trimmed);
  return Number.isNaN(time) ? undefined : Math.max(0, time - Date.now());
};

/**
 * 지수 백오프(Exponential Backoff) 기반의 재시도 전략 함수를 생성하는 팩토리 헬퍼입니다.
 * `Retry-After`가 있으면 그 값을 우선 사용하고, `maxDelay`를 넘으면 재시도하지 않습니다.
 *
 * @pattern Strategy Pattern - HTTP 상태 코드 및 재시도 시도 횟수에 따른 지수 백오프 지연 알고리즘 전략 캡슐화
 * @param {object} [config] 백오프 설정 (maxRetries, initialDelay, factor, statusCodes, methods, jitter, maxDelay)
 * @returns {RetryStrategyFunction} 재시도 전략 함수
 * @author jaeryeol2
 */
export const exponentialBackoffRetry = (config?: {
  maxRetries?: number;
  initialDelay?: number;
  factor?: number;
  statusCodes?: number[];
  /**
   * 재시도할 메서드(대소문자 무관). 기본값은 멱등 메서드(GET, HEAD, OPTIONS, PUT, DELETE)이며,
   * POST/PATCH를 재시도하려면 명시해야 합니다.
   */
  methods?: string[];
  /** 지연에 full jitter(0~계산값 사이 무작위)를 적용할지 여부 (기본값 true) */
  jitter?: boolean;
  /** 지연 상한(ms). Retry-After가 이 값을 넘으면 재시도하지 않습니다. (기본값 30000) */
  maxDelay?: number;
}): RetryStrategyFunction => {
  const maxRetries = config?.maxRetries ?? 3;
  const initialDelay = config?.initialDelay ?? 100;
  const factor = config?.factor ?? 2;
  const statusCodes = config?.statusCodes ?? RETRYABLE_STATUS_CODES;
  const methods = (config?.methods ?? DEFAULT_BACKOFF_METHODS).map((method) =>
    method.toUpperCase(),
  );
  const jitter = config?.jitter ?? true;
  const maxDelay = config?.maxDelay ?? DEFAULT_MAX_DELAY;

  return (context: RetryContext) => {
    if (context.attempt > maxRetries) {
      return { shouldRetry: false };
    }
    if (!methods.includes(context.method ?? 'GET')) {
      return { shouldRetry: false };
    }
    if (context.response && !statusCodes.includes(context.response.status)) {
      return { shouldRetry: false };
    }
    if (context.retryAfterMs !== undefined) {
      return context.retryAfterMs > maxDelay
        ? { shouldRetry: false }
        : { shouldRetry: true, delay: context.retryAfterMs };
    }

    const backoff = Math.min(
      initialDelay * Math.pow(factor, context.attempt - 1),
      maxDelay,
    );
    return {
      shouldRetry: true,
      // 재시도 시점 분산용 난수이며 보안 용도가 아니므로 Math.random으로 충분합니다.
      delay: jitter ? Math.round(Math.random() * backoff) : backoff, // NOSONAR
    };
  };
};

/**
 * 요청 실행 전 호출되는 beforeRequest 인터셉터들을 순차적으로 실행합니다.
 *
 * @param {RequestInit} mergeOptions fetch 요청 옵션 객체
 * @param {BeforeRequestInterceptorType | BeforeRequestInterceptorType[]} [beforeRequest] 인터셉터 목록
 * @param {AbortSignal} [signal] 인터셉터 대기를 중단할 signal
 * @param {BeforeRequestContext} context 요청 경로와 시도 횟수
 * @author jaeryeol2
 */
export const beforeRequestHandler = async (
  mergeOptions: RequestInit,
  beforeRequest: BeforeRequestInterceptorType | BeforeRequestInterceptorType[] | undefined,
  signal: AbortSignal | undefined,
  context: BeforeRequestContext,
): Promise<void> => {
  if (!beforeRequest) {
    return;
  }

  const interceptors = Array.isArray(beforeRequest)
    ? beforeRequest
    : [beforeRequest];
  // buildRequestInit이 headers를 Headers로 정규화하는 accessor로 정의해 두었습니다.
  const interceptorOptions = mergeOptions as BeforeRequestOptions;
  // 인터셉터는 등록 순서대로 직렬 실행되어야 합니다(앞 인터셉터의 헤더 변경을 다음 인터셉터가 봄).
  // 병렬화하면 순서 계약이 깨지므로 루프 안 await은 의도된 것입니다(NOSONAR).

  for (const interceptor of interceptors) {
    if (signal?.aborted) {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    }

    if (signal) {
      let abortListener: (() => void) | undefined;
      const abortPromise = new Promise<never>((_, reject) => {
        abortListener = () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        };
        signal.addEventListener('abort', abortListener, { once: true });
      });

      try {
        await Promise.race([interceptor(interceptorOptions, context), abortPromise]); // NOSONAR
      } finally {
        if (abortListener) {
          signal.removeEventListener('abort', abortListener);
        }
      }
    } else {
      await interceptor(interceptorOptions, context); // NOSONAR
    }
  }
};

/**
 * 응답 수신 후 호출되는 afterResponse 인터셉터들을 순차적으로 실행합니다.
 *
 * @param {Response} response 수신된 Web Response 객체
 * @param {AfterResponseInterceptorType | AfterResponseInterceptorType[]} [afterResponse] 인터셉터 목록
 * @author jaeryeol2
 */
export const afterResponseHandler = async (
  response: Response,
  afterResponse?: AfterResponseInterceptorType | AfterResponseInterceptorType[],
): Promise<void> => {
  if (afterResponse) {
    const interceptors = Array.isArray(afterResponse)
      ? afterResponse
      : [afterResponse];

    // 등록 순서대로 직렬 실행합니다(루프 안 await 의도됨, NOSONAR).
    for (const interceptor of interceptors) {
      const clone = response.clone();
      try {
        await interceptor(clone); // NOSONAR
      } finally {
        // 읽지 않은 clone은 원본을 읽는 동안 tee 버퍼에 본문 전체를 쌓아 두므로 즉시 해제합니다.
        // 인터셉터 안에서 읽기를 시작했다면(bodyUsed) 그 읽기를 방해하지 않습니다.
        if (!clone.bodyUsed) {
          void clone.body?.cancel().catch(() => undefined);
        }
      }
    }
  }
};

/**
 * 재시도 간격 대기를 위한 지연 함수입니다.
 * signal이 abort되면 즉시 resolve합니다. 이어지는 fetch가 abort된 signal로
 * AbortError를 내고 기존 사용자 abort 처리 경로(onError 1회 후 throw)를 그대로 탑니다.
 *
 * @param {number} ms 대기 시간 (밀리초)
 * @param {AbortSignal | null} [signal] 대기를 조기 종료할 사용자 signal
 * @returns {Promise<void>}
 */
export const sleep = (ms: number, signal?: AbortSignal | null): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

/**
 * 에러 발생 시 호출되는 onError 인터셉터들을 순차적으로 실행합니다.
 *
 * @param {unknown} error 발생한 에러 객체
 * @param {OnErrorType | OnErrorType[]} [onError] 에러 인터셉터 목록
 * @author jaeryeol2
 */
export const onErrorHandler = async (
  error: unknown,
  onError?: OnErrorType | OnErrorType[],
): Promise<void> => {
  if (onError) {
    const interceptors = Array.isArray(onError) ? onError : [onError];
    // 등록 순서대로 직렬 실행합니다(루프 안 await 의도됨, NOSONAR).
    for (const interceptor of interceptors) {
      await interceptor(error); // NOSONAR
    }
  }
};

/**
 * 작업이 실패하면 onError 인터셉터를 실행한 뒤 예외를 그대로 다시 던집니다.
 * 응답 수신 이후 단계(재시도 판정, afterResponse)의 예외가 재시도 경로를 타지 않으면서도
 * onError로는 전달되도록 합니다.
 *
 * @template T 작업 결과 타입
 * @param {() => Promise<T>} task 실행할 작업
 * @param {OnErrorType | OnErrorType[]} [onError] 에러 인터셉터 목록
 * @returns {Promise<T>} 작업 결과
 */
const withOnError = async <T>(
  task: () => Promise<T>,
  onError?: OnErrorType | OnErrorType[],
): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    await onErrorHandler(error, onError);
    throw error;
  }
};

/**
 * 전달된 데이터가 Web Native BodyInit 타입(FormData, Blob, URLSearchParams, ArrayBuffer, TypedArray, ReadableStream, string)인지 판별합니다.
 *
 * @param {unknown} body 바디 객체
 * @returns {boolean} Native BodyInit 데이터 여부
 */
const isNativeBody = (body: unknown): boolean => {
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) ||
    typeof body === 'string'
  );
};

/**
 * 요청 바디(body) 데이터 형태를 확인하여 JSON 변환 및 Content-Type 헤더를 설정합니다.
 * 사용자가 사전에 명시한 Content-Type이 존재하면 이를 우선시합니다.
 *
 * @param {RequestInit} mergeOptions 적용할 RequestInit 객체
 * @param {AppFetchOptions} [options] 사용자 전달 옵션
 * @author jaeryeol2
 */
export const setupRequestBody = (
  mergeOptions: RequestInit,
  options?: AppFetchOptions,
): void => {
  const methodLower = options?.method?.toLowerCase();
  const hasBody =
    options &&
    'body' in options &&
    options.body !== undefined &&
    options.body !== null;
  // 본문이 금지되는 것은 GET/HEAD뿐입니다. DELETE는 본문을 가질 수 있으므로 제외하지 않습니다.
  const isNoBodyMethod = methodLower === 'get' || methodLower === 'head';

  if (!hasBody || isNoBodyMethod) {
    // 스프레드로 이미 복사된 raw body를 제거합니다. 남겨두면 GET/HEAD 요청에서
    // 네이티브 fetch가 'Request with GET/HEAD method cannot have body' TypeError를 던집니다.
    delete mergeOptions.body;
    return;
  }

  const body = options.body;
  if (isNativeBody(body)) {
    mergeOptions.body = body as BodyInit;

    // FormData는 네이티브 fetch가 boundary를 포함한 Content-Type을 직접 생성해야 하므로,
    // 기본 헤더 등으로 미리 설정된 Content-Type이 남아 있으면 제거합니다.
    if (body instanceof FormData) {
      (mergeOptions.headers as Headers).delete('Content-Type');
    } else if (body instanceof URLSearchParams || body instanceof Blob) {
      // 인스턴스 기본 헤더의 JSON Content-Type이 남아 있으면 본문과 어긋납니다.
      // 제거하면 fetch가 urlencoded 또는 Blob.type으로 알맞게 채웁니다.
      const headers = mergeOptions.headers as Headers;
      if (headers.get('Content-Type')?.toLowerCase().includes('json')) {
        headers.delete('Content-Type');
      }
    }
  } else {
    const headers = mergeOptions.headers as Headers;
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    mergeOptions.body = JSON.stringify(body);
  }
};

/**
 * 사용자의 signal과 내부 timeout signal을 안전하게 합성(AbortSignal.any 또는 Fallback)합니다.
 *
 * @param {AbortSignal | null} [customSignal] 사용자 정의 AbortSignal
 * @param {AbortSignal} [timeoutSignal] 타임아웃용 AbortSignal
 * @returns {AbortSignal | undefined} 합성된 AbortSignal
 * @author jaeryeol2
 */
export const resolveAbortSignal = (
  customSignal?: AbortSignal | null,
  timeoutSignal?: AbortSignal,
): { signal: AbortSignal | undefined; dispose: () => void } => {
  const noop = () => {};

  if (!customSignal) {
    return { signal: timeoutSignal, dispose: noop };
  }
  if (!timeoutSignal) {
    return { signal: customSignal, dispose: noop };
  }

  if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any([customSignal, timeoutSignal]), dispose: noop };
  }

  const combinedController = new AbortController();
  // AbortSignal.any처럼 원인 signal의 reason을 전달해야 AbortSignal.timeout()의 TimeoutError가 유지됩니다.
  const onAbort = () =>
    combinedController.abort(
      customSignal.aborted ? customSignal.reason : timeoutSignal.reason,
    );

  if (customSignal.aborted || timeoutSignal.aborted) {
    onAbort();
    return { signal: combinedController.signal, dispose: noop };
  }

  customSignal.addEventListener('abort', onAbort, { once: true });
  timeoutSignal.addEventListener('abort', onAbort, { once: true });

  // 요청이 끝나면 반드시 호출되어야 합니다. 호출하지 않으면 수명주기가 긴 사용자 signal에
  // 리스너가 요청 횟수만큼 누적됩니다. 해제 이후에는 타임아웃 타이머와 동일하게
  // 이 요청에 대한 abort 전파가 종료됩니다.
  const dispose = () => {
    customSignal.removeEventListener('abort', onAbort);
    timeoutSignal.removeEventListener('abort', onAbort);
  };

  return { signal: combinedController.signal, dispose };
};

/**
 * 요청 바디가 1회성으로만 소비 가능한 ReadableStream인지 확인합니다.
 * ReadableStream 바디는 최초 fetch 시도에서 이미 소비되므로, 재시도 시 동일한 스트림을
 * 재사용할 수 없어 두 번째 시도부터 실패합니다.
 *
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @returns {boolean} ReadableStream 바디 여부
 */
const hasStreamBody = (options?: AppFetchOptions): boolean => {
  const body = (options as { body?: unknown } | undefined)?.body;
  return typeof ReadableStream !== 'undefined' && body instanceof ReadableStream;
};

/**
 * 사용자 정의 재시도 전략(RetryStrategy) 또는 기본 옵션(retry/delay)에 따라 재시도 여부 및 대기 시간을 계산합니다.
 * 요청 바디가 ReadableStream인 경우, 스트림이 이미 소비되어 재시도가 안전하지 않으므로
 * 재시도 조건과 무관하게 재시도를 차단하고 콘솔에 경고를 남깁니다.
 *
 * @param {RetryContext} context 재시도 맥락 객체 (응답, 에러, 현재 시도 횟수 등)
 * @param {RetryStrategy} [strategy] 전달된 재시도 전략
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @returns {Promise<{ shouldRetry: boolean; delay: number }>} 재시도 판단 결과
 */
export const evaluateRetryStrategy = async (
  context: RetryContext,
  strategy?: RetryStrategy,
  options?: AppFetchOptions,
): Promise<{ shouldRetry: boolean; delay: number }> => {
  // 안전 하드캡: 최대 10회 시도 초과 시 무한 재시도 차단
  if (context.attempt >= 10) {
    console.warn(
      `app-fetch: Retry limit hard cap reached (${context.attempt} attempts). Halting retries to prevent infinite loop.`,
    );
    return { shouldRetry: false, delay: 0 };
  }

  const decision = await computeRetryDecision(context, strategy, options);

  if (decision.shouldRetry && hasStreamBody(options)) {
    console.warn(
      'app-fetch: Retry skipped because the request body is a ReadableStream, ' +
        'which can only be consumed once and cannot be safely re-sent. ' +
        'To enable retries for this request, provide a re-creatable body instead ' +
        '(e.g. a Blob, ArrayBuffer, string, or FormData).',
    );
    return { shouldRetry: false, delay: 0 };
  }

  return decision;
};

/**
 * 전달된 전략(함수/객체) 또는 기본 옵션(retry/delay)에 따라 순수하게 재시도 여부와 지연 시간을 계산합니다.
 * ReadableStream 가드가 적용되기 전 단계의 1차 판단 로직입니다.
 *
 * @param {RetryContext} context 재시도 맥락 객체
 * @param {RetryStrategy} [strategy] 전달된 재시도 전략
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @returns {Promise<{ shouldRetry: boolean; delay: number }>} 재시도 판단 결과
 */
const computeRetryDecision = async (
  context: RetryContext,
  strategy?: RetryStrategy,
  options?: AppFetchOptions,
): Promise<{ shouldRetry: boolean; delay: number }> => {
  if (strategy) {
    if (typeof strategy === 'function') {
      const decision = await strategy(context);
      return {
        shouldRetry: decision.shouldRetry,
        delay: decision.delay ?? 0,
      };
    }

    if (typeof strategy === 'object' && strategy !== null) {
      const shouldRetry = await strategy.shouldRetry(context);
      const delay = strategy.getDelay
        ? await strategy.getDelay(context)
        : (options?.delay ?? 0);
      return { shouldRetry, delay };
    }
  }

  // 기본 재시도 판별 (408, 429, 500, 502, 503, 504 및 네트워크 에러 대상)
  // POST/PATCH는 멱등하지 않아 재전송 시 중복 처리 위험이 있으므로 기본 재시도에서 제외합니다.
  // 필요하면 retryStrategy를 명시해 재시도할 수 있습니다.
  const isIdempotent = !NON_IDEMPOTENT_METHODS.has(normalizeMethod(options));
  const maxRetries = options?.retry ?? 0;
  const status = context.response?.status;
  const isRetryableStatus = status
    ? RETRYABLE_STATUS_CODES.includes(status)
    : Boolean(context.error);
  // 서버가 상한보다 오래 기다리라고 하면 재시도하지 않고 그 응답을 그대로 반환합니다.
  const retryAfterMs = context.retryAfterMs;
  const exceedsRetryAfter =
    retryAfterMs !== undefined && retryAfterMs > DEFAULT_MAX_DELAY;
  const shouldRetry =
    isIdempotent &&
    isRetryableStatus &&
    context.attempt <= maxRetries &&
    !exceedsRetryAfter;
  const delay = retryAfterMs ?? options?.delay ?? 0;

  return { shouldRetry, delay };
};

/**
 * fetch 요청에 필요한 RequestInit 옵션과 AbortController를 생성 및 준비합니다.
 *
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @param {(base?: HeadersInit, custom?: HeadersInit) => Headers} mergeHeaders 헤더 병합 헬퍼
 * @param {AbortController} abortController 타임아웃용 AbortController
 * @param {BeforeRequestContext} context beforeRequest에 전달할 요청 경로와 시도 횟수
 * @returns {Promise<{ mergeOptions: RequestInit; disposeSignal: () => void }>} 요청 옵션과 시그널 해제 함수
 */
export const buildRequestInit = async (
  options: AppFetchOptions | undefined,
  mergeHeaders: (base?: HeadersInit, custom?: HeadersInit) => Headers,
  abortController: AbortController,
  context: BeforeRequestContext,
): Promise<{ mergeOptions: RequestInit; disposeSignal: () => void }> => {
  const mergeOptions: RequestInit = {
    ...options,
    baseURL: undefined,
    allowAbsoluteUrls: undefined,
    query: undefined,
    beforeRequest: undefined,
    afterResponse: undefined,
    onError: undefined,
    timeout: undefined,
    retry: undefined,
    delay: undefined,
    retryStrategy: undefined,
  } as RequestInit & Record<string, unknown>;

  // 호출 시에는 소문자를 쓰고, 전송은 대문자로 합니다. fetch 스펙은 PATCH를
  // 대문자로 정규화하지 않아 소문자 'patch'가 그대로 나가 405/400을 유발합니다.
  if (options?.method) {
    mergeOptions.method = options.method.toUpperCase();
  }
  // 인터셉터가 일반 객체를 대입해도 읽을 때는 항상 Headers가 되도록 accessor로 정의합니다.
  // enumerable이어야 `{ ...options }` 복사에서 headers가 빠지지 않습니다.
  let headers = mergeHeaders(options?.headers);
  Object.defineProperty(mergeOptions, 'headers', {
    get: () => headers,
    set: (value: HeadersInit) => {
      headers = value instanceof Headers ? value : new Headers(value);
    },
    enumerable: true,
    configurable: true,
  });

  setupRequestBody(mergeOptions, options);

  const { signal, dispose } = resolveAbortSignal(
    options?.signal,
    abortController.signal,
  );
  mergeOptions.signal = signal;

  try {
    await beforeRequestHandler(mergeOptions, options?.beforeRequest, signal, context);
  } catch (error) {
    dispose();
    throw error;
  }

  return { mergeOptions, disposeSignal: dispose };
};

/**
 * HTTP 응답 수신 후 재시도 필요 여부를 확인하여 재귀 호출하거나 최종 AppFetchResponse를 형성합니다.
 *
 * @param {Response} response 수신된 Web Response
 * @param {string} path 요청 경로
 * @param {AppFetchOptions} [options] 요청 옵션
 * @param {number} attemptCount 시도 횟수
 * @param {(path: string, options?: AppFetchOptions, attemptCount?: number) => Promise<AppFetchResponse>} fetchExecutor 실행기
 * @returns {Promise<AppFetchResponse>} AppFetchResponse
 */
export const handleRetryOrReturnResponse = async (
  response: Response,
  path: string,
  options: AppFetchOptions | undefined,
  attemptCount: number,
  fetchExecutor: (
    path: string,
    options?: AppFetchOptions,
    attemptCount?: number,
  ) => Promise<AppFetchResponse>,
): Promise<AppFetchResponse> => {
  // 재시도 설정이 전혀 없으면 재시도 판정 자체가 불필요합니다. 이 경우 clone을 만들지 않아
  // 아무도 소비하지 않는 복제 스트림이 매 요청마다 버퍼를 점유하는 것을 방지합니다.
  // 2xx 성공 응답은 재시도 대상이 아니므로 전략을 호출하지 않습니다. 전략이 attempt만
  // 검사하면(예: `attempt <= 3`) 성공 응답까지 재요청되는 함정을 막습니다.
  const canRetry =
    !response.ok &&
    (Boolean(options?.retryStrategy) || (options?.retry ?? 0) > 0);

  if (canRetry) {
    const retryClone = response.clone();
    const retryContext: RetryContext = {
      response: retryClone,
      attempt: attemptCount,
      maxRetries: options?.retry ?? 0,
      method: normalizeMethod(options),
      retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    };

    const retryDecision = await withOnError(
      () => evaluateRetryStrategy(retryContext, options?.retryStrategy, options),
      options?.onError,
    );

    if (retryDecision.shouldRetry) {
      // 버려지는 응답의 두 분기를 모두 취소해야 연결과 버퍼가 즉시 회수됩니다.
      void response.body?.cancel().catch(() => undefined);
      releaseBodySignal(response);
      if (!retryClone.bodyUsed) {
        void retryClone.body?.cancel().catch(() => undefined);
      }
      if (retryDecision.delay > 0) {
        await sleep(retryDecision.delay, options?.signal);
      }
      return await fetchExecutor(path, options, attemptCount + 1);
    }

    // 재시도하지 않기로 했으면 판정용 clone은 더 이상 쓰이지 않습니다.
    // 읽지 않은 채 두면 tee된 버퍼가 GC 시점까지 남으므로 즉시 해제합니다.
    //
    // await하면 안 됩니다. tee된 스트림의 cancel()은 양쪽 분기가 모두 취소되어야
    // resolve되는데, 원본 분기는 사용자가 getData()로 읽을 대상이라 취소되지 않습니다.
    if (!retryClone.bodyUsed) {
      void retryClone.body?.cancel().catch(() => undefined);
    }
  }

  await withOnError(
    () => afterResponseHandler(response, options?.afterResponse),
    options?.onError,
  );

  return Object.assign(response, {
    getData: <T = unknown>() => getData<T>(response),
  }) as AppFetchResponse;
};

/**
 * 예외 발생 시 타임아웃 래핑, 에러 재시도 판단 및 에러 인터셉터를 실행합니다.
 *
 * @param {unknown} error 발생 예외
 * @param {boolean} isTimedOut 타임아웃 여부
 * @param {boolean} isRetryable 재시도 가능 여부. fetch 이전 단계(쿼리 직렬화, 바디 직렬화,
 *   beforeRequest)의 에러는 다시 시도해도 같은 결과이므로 false로 전달됩니다.
 * @param {string} path 요청 경로
 * @param {AppFetchOptions} [options] 요청 옵션
 * @param {number} attemptCount 시도 횟수
 * @param {(path: string, options?: AppFetchOptions, attemptCount?: number) => Promise<AppFetchResponse>} fetchExecutor 실행기
 * @returns {Promise<AppFetchResponse>}
 */
export const handleFetchError = async (
  error: unknown,
  isTimedOut: boolean,
  isRetryable: boolean,
  path: string,
  options: AppFetchOptions | undefined,
  attemptCount: number,
  fetchExecutor: (
    path: string,
    options?: AppFetchOptions,
    attemptCount?: number,
  ) => Promise<AppFetchResponse>,
): Promise<AppFetchResponse> => {
  let formattedError = error;

  if (isTimedOut && error instanceof Error && error.name === 'AbortError') {
    const timeoutError = new Error(
      `Request Timeout. time : ${options?.timeout ?? 3000}ms`,
      { cause: error },
    );
    // 메시지 문자열 대신 `error.name === 'TimeoutError'`로 판별할 수 있게 합니다.
    timeoutError.name = 'TimeoutError';
    formattedError = timeoutError;
  }

  // 사용자가 전달한 signal에 의해 abort된 경우 재시도 없이 즉시 중단
  if (options?.signal?.aborted) {
    await onErrorHandler(formattedError, options?.onError);
    throw formattedError;
  }

  const hasRetryStrategy = Boolean(options?.retryStrategy);
  const hasPlainRetryCount = (options?.retry ?? 0) > 0;

  if (isRetryable && (hasRetryStrategy || hasPlainRetryCount)) {
    const errorRetryContext: RetryContext = {
      error: formattedError,
      attempt: attemptCount,
      maxRetries: options?.retry ?? 0,
      method: normalizeMethod(options),
    };
    const errorDecision = await evaluateRetryStrategy(
      errorRetryContext,
      options?.retryStrategy,
      options,
    );
    if (errorDecision.shouldRetry) {
      if (errorDecision.delay > 0) {
        await sleep(errorDecision.delay, options?.signal);
      }
      return await fetchExecutor(path, options, attemptCount + 1);
    }
  }

  await onErrorHandler(formattedError, options?.onError);
  throw formattedError;
};
