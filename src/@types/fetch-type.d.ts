export type BeforeRequestInterceptorType = (
  options: RequestInit,
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

export type HttpNoBodyMethod = 'get' | 'delete';
export type HttpBodyMethod = 'post' | 'put' | 'patch';
export type HttpMethod = HttpNoBodyMethod | HttpBodyMethod;

export interface BaseFetchOptions
  extends FetchInterceptors, Omit<RequestInit, 'method' | 'body'> {
  /** base url */
  baseURL?: string;
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

export interface HttpErrorType extends Error {
  status: number;
}

export interface HttpErrorConstructorType {
  new (message: string, status: number): HttpErrorType;
}

export type AppFetchOptions = QueryFetchOptions | BodyFetchOptions;

export type FlatQueryFunctionType = (
  query: object | Record<string, unknown>,
  parentKey?: string,
  seen?: WeakSet<object>,
) => string[];

export interface AppFetchResponse extends Response {
  getData: <T = unknown>() => Promise<T | Blob | FormData | string | null>;
}

export interface AppFetchPromise extends Promise<AppFetchResponse> {
  getData: <T = unknown>() => Promise<T | Blob | FormData | string | null>;
}

export type AppFetchInstance = ((
  path: string,
  options?: AppFetchOptions,
) => AppFetchPromise) & {
  create?: (
    defaults: Omit<AppFetchOptions, 'method' | 'query' | 'body'>,
  ) => (path: string, options?: AppFetchOptions) => AppFetchPromise;
};
