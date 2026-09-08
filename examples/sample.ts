/**
 * @file sample.ts
 * @description 실제 프로젝트에서 `app-fetch` 라이브러리를 활용하여 전역 API 통신 클라이언트를 구축할 때 참고하는 샘플 래퍼 구현체입니다.
 * @author jaeryeol2
 *
 * 실무 프로젝트마다 백엔드 공통 응답 구조(Response Envelope)가 다를 수 있으므로,
 * `ResponseApi<T>` 타입과 커스텀 래퍼 함수를 각 프로젝트 환경에 맞게 자유롭게 정의하여 사용합니다.
 *
 * 주요 기능:
 * 1. `appFetch.create()`를 이용한 커스텀 API 인스턴스 캡슐화 (`baseFetch`)
 * 2. 전역 인터셉터 레지스트리 동적 설정 및 병합 (`globalInterceptors`)
 * 3. Raw Web Native `Response` 객체를 반환하는 `sampleFetch.native(path, options)` 메서드
 * 4. 프로젝트 공통 API 응답 규격(`ResponseApi<T>`)으로 감싸서 반환하는 `sampleFetch(path, options)` 메서드
 */

import { appFetch, getData, HttpError, returnError, mergeFetchOptions } from '../src';
import type { FetchInterceptors, AppFetchOptions } from '../src/@types/fetch-type';


/**
 * 실무 프로젝트 전역에서 사용하는 백엔드 공통 API 응답 규격 타입 정의 샘플입니다.
 * 프로젝트 사양에 따라 예: `{ code: string, result: T, isSuccess: boolean }` 등으로 변경하여 사용할 수 있습니다.
 */
interface ResponseApi<T> {
  status: number;
  message: string;
  data: T | null;
}

/**
 * 프로젝트 전역에서 공유되는 공통 인터셉터 레지스트리 객체입니다.
 * 필요에 따라 인증 토큰 갱신, 글로벌 로깅, 에러 모니터링 인터셉터를 동적으로 등록하여 관리할 수 있습니다.
 */
const globalInterceptors: FetchInterceptors = {
  beforeRequest: [],
  afterResponse: [],
  onError: [],
};

/**
 * `appFetch.create()`를 이용하여 공통 baseURL, 기본 타임아웃, 기본 헤더 및 전역 인터셉터가 적용된
 * 싱글톤 형태의 커스텀 API 인스턴스를 생성합니다.
 */
const baseFetch = appFetch.create({
  // baseURL: 'https://api.example.com',
  // timeout: 5000,
  // ...globalInterceptors,
});

/**
 * 네이티브 Web `Response` 객체를 그대로 반환하는 Native Fetch 래퍼 함수입니다.
 *
 * @template Path 요청할 상대 경로 또는 절대 URL
 * @template Options 요청 옵션 (`baseURL`, `query`, `body`, `headers`, `timeout`, `retry` 등)
 * @returns {Promise<Response>} 네이티브 `Response` Promise 객체
 *
 * @example
 * ```typescript
 * const response = await sampleFetch.native('/api/raw-stream');
 * console.log('HTTP Status:', response.status);
 * ```
 */
const native = (path: string, options?: AppFetchOptions): Promise<Response> => {
  // 글로벌 인터셉터와 개별 요청 옵션을 안전하게 병합
  const mergedOptions = mergeFetchOptions(globalInterceptors, options);

  return baseFetch(path, mergedOptions);
};

/**
 * 프로젝트의 공통 응답 규격(`ResponseApi<R>`) 형태로 응답을 감싸서 반환하는 Wrap Fetch 함수입니다.
 *
 * 동작 과정:
 * 1. 글로벌 인터셉터와 요청별 개별 옵션 병합 (`mergeFetchOptions`)
 * 2. HTTP 통신 수행 (`baseFetch`) 및 응답 Body 자동 파싱 (`getData`)
 * 3. HTTP 응답 에러(!response.ok) 상태 감지 시 백엔드 메시지를 포함한 `HttpError` 예외 발생
 * 4. Blob(파일/바이너리), 커스텀 데이터, 일반 JSON 객체를 `ResponseApi<R>` 규격으로 변환하여 반환
 * 5. 예외 발생 시 `returnError` 헬퍼를 통해 500/에러 상태 객체로 일괄 래핑
 *
 * @template R 응답 데이터 generic 타입
 * @param {string} path 요청할 상대 경로 또는 절대 URL
 * @param {AppFetchOptions} [options] 요청 옵션
 * @returns {Promise<ResponseApi<R>>} `{ status: number, message: string, data: R | null }` 형태의 객체
 *
 * @example
 * ```typescript
 * const result = await sampleFetch<UserDto>('/api/users/1');
 * if (result.status === 200) {
 *   console.log('User Name:', result.data?.name);
 * }
 * ```
 */
const wrap = async <R = unknown>(
  path: string,
  options?: AppFetchOptions,
): Promise<ResponseApi<R>> => {
  try {
    // 1. 전역 인터셉터와 요청별 개별 옵션 병합
    const mergedOptions = mergeFetchOptions(globalInterceptors, options);

    // 2. HTTP 요청 수행 및 헤더 기반 응답 데이터 파싱
    const response = await baseFetch(path, mergedOptions);
    const responseData = await getData(response);

    // 3. HTTP 상태 코드가 정상(2xx)이 아닐 경우 예외 처리
    if (!response.ok) {
      let backendMessage = 'do not get response data.';
      if (
        responseData &&
        typeof responseData === 'object' &&
        'message' in responseData
      ) {
        backendMessage = String(
          (responseData as Record<string, unknown>).message,
        );
      } else if (typeof responseData === 'string' && responseData) {
        backendMessage = responseData;
      }

      throw new HttpError(backendMessage, response.status);
    }

    // 4-A. 파일 다운로드 / 바이너리 응답 (Blob) 인 경우
    if (responseData instanceof Blob) {
      return {
        status: response.status,
        message: 'success',
        data: responseData as unknown as R,
      };
    }

    // 4-B. 백엔드에서 이미 ResponseApi 형태({ data: ... })로 감싸서 응답한 경우
    if (
      responseData &&
      typeof responseData === 'object' &&
      'data' in responseData
    ) {
      return responseData as ResponseApi<R>;
    }

    // 4-C. 일반 JSON 객체 또는 단일 데이터인 경우 공통 규격으로 포맷팅
    return {
      status: response.status,
      message: 'success',
      data: (responseData ?? null) as R,
    };
  } catch (error) {
    // 예외 발생 시 표준 ResponseApi 오류 구조체로 변환하여 안전하게 반환
    return returnError<R>(error);
  }
};

/**
 * 프로젝트 전역에서 활용되는 메인 Fetch 클라이언트 객체입니다.
 *
 * - `sampleFetch(path, options)`: 백엔드 공통 규격(`ResponseApi<T>`)으로 감싼 데이터 반환
 * - `sampleFetch.native(path, options)`: 네이티브 Web `Response` 객체 반환
 *
 * @example
 * ```typescript
 * import { sampleFetch } from './sample';
 *
 * // 1. 공통 규격 Wrap Fetch 사용
 * const { data, status } = await sampleFetch<Product>('/products/10');
 *
 * // 2. Raw Native Fetch 사용
 * const rawResponse = await sampleFetch.native('/health');
 * ```
 */
export const sampleFetch = Object.assign(wrap, { native });
