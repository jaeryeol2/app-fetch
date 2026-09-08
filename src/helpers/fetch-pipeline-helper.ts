/**
 * @file fetch-pipeline-helper.ts
 * @description fetchData 실행 파이프라인 전처리/후처리, 시그널 처리, 바디 설정 및 재시도/에러 핸들링 헬퍼 모듈입니다.
 * 모듈 스코프 생성을 통한 메모리 최적화 및 캡슐화를 보장합니다.
 * @author jaeryeol2
 */

import type {
  AfterResponseInterceptorType,
  BeforeRequestInterceptorType,
  OnErrorType,
  RetryContext,
  RetryStrategy,
  RetryStrategyFunction,
  AppFetchOptions,
  AppFetchResponse,
} from '../@types/fetch-type';
import { getData } from './fetch-helper';

/**
 * 지수 백오프(Exponential Backoff) 기반의 재시도 전략 함수를 생성하는 팩토리 헬퍼입니다.
 *
 * @pattern Strategy Pattern - HTTP 상태 코드 및 재시도 시도 횟수에 따른 지수 백오프 지연 알고리즘 전략 캡슐화
 * @param {object} [config] 백오프 설정 (maxRetries, initialDelay, factor, statusCodes)
 * @returns {RetryStrategyFunction} 재시도 전략 함수
 * @author jaeryeol2
 */
export const exponentialBackoffRetry = (config?: {
  maxRetries?: number;
  initialDelay?: number;
  factor?: number;
  statusCodes?: number[];
}): RetryStrategyFunction => {
  const maxRetries = config?.maxRetries ?? 3;
  const initialDelay = config?.initialDelay ?? 100;
  const factor = config?.factor ?? 2;
  const statusCodes = config?.statusCodes ?? [408, 429, 500, 502, 503, 504];

  return (context: RetryContext) => {
    if (context.attempt > maxRetries) {
      return { shouldRetry: false };
    }

    if (context.response) {
      const isTargetStatus = statusCodes.includes(context.response.status);
      if (!isTargetStatus) {
        return { shouldRetry: false };
      }
    }

    const delay = initialDelay * Math.pow(factor, context.attempt - 1);
    return { shouldRetry: true, delay };
  };
};

/**
 * 요청 실행 전 호출되는 beforeRequest 인터셉터들을 순차적으로 실행합니다.
 *
 * @param {RequestInit} mergeOptions fetch 요청 옵션 객체
 * @param {BeforeRequestInterceptorType | BeforeRequestInterceptorType[]} [beforeRequest] 인터셉터 목록
 * @author jaeryeol2
 */
export const beforeRequestHandler = async (
  mergeOptions: RequestInit,
  beforeRequest?: BeforeRequestInterceptorType | BeforeRequestInterceptorType[],
  signal?: AbortSignal,
): Promise<void> => {
  if (!beforeRequest) {
    return;
  }

  const interceptors = Array.isArray(beforeRequest)
    ? beforeRequest
    : [beforeRequest];

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
        await Promise.race([interceptor(mergeOptions), abortPromise]);
      } finally {
        if (abortListener) {
          signal.removeEventListener('abort', abortListener);
        }
      }
    } else {
      await interceptor(mergeOptions);
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

    for (const interceptor of interceptors) {
      await interceptor(response.clone());
    }
  }
};

/**
 * 재시도 간격 대기를 위한 지연 함수입니다.
 *
 * @param {number} ms 대기 시간 (밀리초)
 * @returns {Promise<void>}
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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
    for (const interceptor of interceptors) {
      await interceptor(error);
    }
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
  const isBodyMethod =
    methodLower === 'post' || methodLower === 'put' || methodLower === 'patch';

  if (!hasBody || !isBodyMethod) {
    return;
  }

  const body = options.body;
  if (isNativeBody(body)) {
    mergeOptions.body = body as BodyInit;
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
): AbortSignal | undefined => {
  if (!customSignal) {
    return timeoutSignal;
  }
  if (!timeoutSignal) {
    return customSignal;
  }

  if ('any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([customSignal, timeoutSignal]);
  }

  const combinedController = new AbortController();
  const onAbort = () => combinedController.abort();

  if (customSignal.aborted || timeoutSignal.aborted) {
    combinedController.abort();
  } else {
    customSignal.addEventListener('abort', onAbort, { once: true });
    timeoutSignal.addEventListener('abort', onAbort, { once: true });
  }

  return combinedController.signal;
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

  // 기본 재시도 판별 (408, 429, 5xx 및 네트워크 에러 대상)
  const maxRetries = options?.retry ?? 0;
  const status = context.response?.status;
  const isRetryableStatus = status
    ? status === 408 || status === 429 || (status >= 500 && status <= 599)
    : Boolean(context.error);
  const shouldRetry = isRetryableStatus && context.attempt <= maxRetries;
  const delay = options?.delay ?? 0;

  return { shouldRetry, delay };
};

/**
 * fetch 요청에 필요한 RequestInit 옵션과 AbortController를 생성 및 준비합니다.
 *
 * @param {AppFetchOptions} [options] 사용자 요청 옵션
 * @param {number} attemptCount 현재 시도 횟수
 * @param {(base?: HeadersInit, custom?: HeadersInit) => Headers} mergeHeaders 헤더 병합 헬퍼
 * @returns {Promise<{ mergeOptions: RequestInit; abortController: AbortController }>}
 */
export const buildRequestInit = async (
  options: AppFetchOptions | undefined,
  attemptCount: number,
  mergeHeaders: (base?: HeadersInit, custom?: HeadersInit) => Headers,
  abortController: AbortController,
): Promise<RequestInit> => {
  const mergeOptions: RequestInit = {
    ...options,
    baseURL: undefined,
    query: undefined,
    beforeRequest: undefined,
    afterResponse: undefined,
    onError: undefined,
    timeout: undefined,
    retry: undefined,
    delay: undefined,
    retryStrategy: undefined,
  } as RequestInit & Record<string, unknown>;

  mergeOptions.headers = mergeHeaders(options?.headers);

  setupRequestBody(mergeOptions, options);
  mergeOptions.signal = resolveAbortSignal(
    options?.signal,
    abortController.signal,
  );

  await beforeRequestHandler(
    mergeOptions,
    options?.beforeRequest,
    mergeOptions.signal as AbortSignal,
  );

  return mergeOptions;
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
  const retryContext: RetryContext = {
    response: response.clone(),
    attempt: attemptCount,
    maxRetries: options?.retry ?? 0,
  };

  const retryDecision = await evaluateRetryStrategy(
    retryContext,
    options?.retryStrategy,
    options,
  );

  if (retryDecision.shouldRetry) {
    if (retryDecision.delay > 0) {
      await sleep(retryDecision.delay);
    }
    return await fetchExecutor(path, options, attemptCount + 1);
  }

  await afterResponseHandler(response, options?.afterResponse);

  return Object.assign(response, {
    getData: <T = unknown>() => getData<T>(response),
  }) as AppFetchResponse;
};

/**
 * 예외 발생 시 타임아웃 래핑, 에러 재시도 판단 및 에러 인터셉터를 실행합니다.
 *
 * @param {unknown} error 발생 예외
 * @param {boolean} isTimedOut 타임아웃 여부
 * @param {string} path 요청 경로
 * @param {AppFetchOptions} [options] 요청 옵션
 * @param {number} attemptCount 시도 횟수
 * @param {(path: string, options?: AppFetchOptions, attemptCount?: number) => Promise<AppFetchResponse>} fetchExecutor 실행기
 * @returns {Promise<AppFetchResponse>}
 */
export const handleFetchError = async (
  error: unknown,
  isTimedOut: boolean,
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
    formattedError = new Error(
      `Request Timeout. time : ${options?.timeout ?? 3000}ms`,
      { cause: error },
    );
  }

  // 사용자가 전달한 signal에 의해 abort된 경우 재시도 없이 즉시 중단
  if (options?.signal?.aborted) {
    await onErrorHandler(formattedError, options?.onError);
    throw formattedError;
  }

  const hasRetryStrategy = Boolean(options?.retryStrategy);
  const hasPlainRetryCount = (options?.retry ?? 0) > 0;

  if (hasRetryStrategy || hasPlainRetryCount) {
    const errorRetryContext: RetryContext = {
      error: formattedError,
      attempt: attemptCount,
      maxRetries: options?.retry ?? 0,
    };
    const errorDecision = await evaluateRetryStrategy(
      errorRetryContext,
      options?.retryStrategy,
      options,
    );
    if (errorDecision.shouldRetry) {
      if (errorDecision.delay > 0) {
        await sleep(errorDecision.delay);
      }
      return await fetchExecutor(path, options, attemptCount + 1);
    }
  }

  await onErrorHandler(formattedError, options?.onError);
  throw formattedError;
};
