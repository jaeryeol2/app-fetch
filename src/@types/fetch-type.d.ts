/**
 * beforeRequest 인터셉터에 전달되는 요청 옵션입니다. `headers`는 항상 `Headers` 인스턴스로 읽히며,
 * 일반 객체 등 `HeadersInit`을 대입해도 즉시 `Headers`로 정규화됩니다.
 */
export type BeforeRequestOptions = Omit<RequestInit, 'headers'> & {
  get headers(): Headers;
  set headers(value: HeadersInit);
};

/** beforeRequest 인터셉터에 전달되는 요청 맥락입니다. */
export interface BeforeRequestContext {
  /** 호출 시 전달한 경로 (baseURL 결합 전) */
  path: string;
  /** 현재 시도 횟수 (1부터 시작, 재시도마다 증가) */
  attempt: number;
}

export type BeforeRequestInterceptorType = (
  options: BeforeRequestOptions,
  context: BeforeRequestContext,
) => void | Promise<void>;

export type AfterResponseInterceptorType = (
  response: Response,
) => void | Promise<void>;

export type OnErrorType = (error: unknown) => void | Promise<void>;

export interface FetchInterceptors {
  beforeRequest?: BeforeRequestInterceptorType | BeforeRequestInterceptorType[];
  afterResponse?: AfterResponseInterceptorType | AfterResponseInterceptorType[];
  onError?: OnErrorType | OnErrorType[];
}

export interface RetryContext {
  response?: Response;
  error?: unknown;
  attempt: number;
  maxRetries: number;
  /** 대문자로 정규화된 요청 메서드 (지정하지 않으면 'GET') */
  method?: string;
  /**
   * 응답의 `Retry-After` 헤더를 밀리초로 해석한 값 (상한 미적용).
   * 헤더가 없거나 해석할 수 없으면 undefined, 이미 지난 날짜면 0입니다.
   */
  retryAfterMs?: number;
}

export type RetryStrategyFunction = (
  context: RetryContext,
) =>
  | { shouldRetry: boolean; delay?: number }
  | Promise<{ shouldRetry: boolean; delay?: number }>;

export interface RetryStrategyObject {
  shouldRetry: (context: RetryContext) => boolean | Promise<boolean>;
  getDelay?: (context: RetryContext) => number | Promise<number>;
}

export type RetryStrategy = RetryStrategyFunction | RetryStrategyObject;

/** 호출 시에는 소문자로 지정하며, 전송 직전 내부에서 대문자로 변환됩니다. */
export type HttpNoBodyMethod = 'get' | 'delete' | 'head' | 'options';
/**
 * 본문 전송이 허용되는 메서드입니다. RFC 9110 기준 본문이 금지되는 것은 GET/HEAD뿐이며
 * DELETE는 본문을 가질 수 있으므로(대량 삭제 API 등) 포함합니다.
 * `HttpNoBodyMethod`와 'delete'가 겹치는 것은 의도된 것으로, 본문 없는 DELETE 호출의
 * 기존 타입 호환성을 유지하기 위함입니다.
 */
export type HttpBodyMethod = 'post' | 'put' | 'patch' | 'delete';
export type HttpMethod = HttpNoBodyMethod | HttpBodyMethod;

export interface BaseFetchOptions
  extends FetchInterceptors, Omit<RequestInit, 'method' | 'body'> {
  /** base url */
  baseURL?: string;
  /**
   * baseURL이 설정된 경우 origin이 다른 http(s) 절대 URL 요청을 허용할지 여부 (기본값 false).
   * 인증 헤더가 외부 호스트로 전송되는 것을 막기 위해 기본적으로 차단합니다.
   */
  allowAbsoluteUrls?: boolean;
  /**
   * Node.js(undici) 전용 요청 디스패처. 사내 프록시 등에서 `ProxyAgent`를 전달할 때 사용하며,
   * 네이티브 fetch에 그대로 전달됩니다. 브라우저에서는 무시됩니다.
   */
  dispatcher?: unknown;
  /** request timeout */
  timeout?: number;
  /** if fail retry count */
  retry?: number;
  /** retry delay time */
  delay?: number;
  /** custom retry strategy */
  retryStrategy?: RetryStrategy;
  /** query parameters */
  query?: Record<string, unknown> | object;
}

export interface QueryFetchOptions extends BaseFetchOptions {
  method?: HttpNoBodyMethod;
}

export interface BodyFetchOptions extends BaseFetchOptions {
  method: HttpBodyMethod;
  body?: Record<string, unknown> | BodyInit;
}

export interface HttpErrorType<T = unknown> extends Error {
  status: number;
  /** 에러 응답 본문 등 호출부가 보존할 데이터 */
  data?: T;
}

export interface HttpErrorConstructorType {
  new <T = unknown>(message: string, status: number, data?: T): HttpErrorType<T>;
}

export type AppFetchOptions = QueryFetchOptions | BodyFetchOptions;

export type FlatQueryFunctionType = (
  query: object | Record<string, unknown>,
  parentKey?: string,
  seen?: WeakSet<object>,
) => string[];

/**
 * getData가 Content-Type에 따라 반환할 수 있는 파싱 결과 유니온입니다.
 * JSON은 제네릭 `T`, 바이너리는 `Blob`, 멀티파트는 `FormData`, 텍스트 계열은 `string`,
 * 빈 응답(204/205 등)은 `null`로 파싱됩니다.
 */
export type AppFetchData<T = unknown> = T | Blob | FormData | string | null;

export interface AppFetchResponse extends Response {
  getData: <T = unknown>() => Promise<AppFetchData<T>>;
}

export interface AppFetchPromise extends Promise<AppFetchResponse> {
  getData: <T = unknown>() => Promise<AppFetchData<T>>;
}

export type AppFetchInstance = ((
  path: string,
  options?: AppFetchOptions,
) => AppFetchPromise) & {
  create: (
    defaults: Omit<AppFetchOptions, 'method' | 'query' | 'body'>,
  ) => AppFetchInstance;
};
