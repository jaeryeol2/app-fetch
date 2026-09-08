/**
 * @file fetch-helper.ts
 * @description HTTP 응답 데이터 파싱, HTTP 에러 클래스 및 예외 처리 래퍼 헬퍼 함수 모듈입니다.
 * 모든 가용 가능한 Content-Type(JSON 변종, 이미지/오디오/비디오/폰트/문서/압축 파일 등 바이너리, FormData, Plain/HTML/XML/YAML/JS 텍스트)을 지원합니다.
 * 소나큐브 인지 복잡도(Cognitive Complexity) 최소화를 위해 판별 및 파싱 로직이 독립적인 단일 책임 헬퍼 함수로 분리되어 있습니다.
 * @author jaeryeol2
 */

/**
 * HTTP 상태 코드를 포함하는 전용 Error 클래스입니다.
 *
 * @author jaeryeol2
 */
export class HttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

/**
 * 예외 발생 시 표준 HTTP 에러 데이터 구조체 객체({ status, message, data: null })를 반환하는 예외 처리 헬퍼 함수입니다.
 *
 * @template T 반환 데이터의 generic 타입 (기본값: null)
 * @param {unknown} error 발생한 예외 객체 (HttpError, Error 또는 기타 타입)
 * @returns {{ status: number; message: string; data: T | null }} 에러 응답 객체
 * @author jaeryeol2
 */
export const returnError = <T = null>(
  error: unknown,
): { status: number; message: string; data: T | null } => {
  const defaultError = {
    status: 500,
    message: 'Internal Server Error',
    data: null,
  };
  if (error instanceof HttpError) {
    return {
      status: error.status,
      message: error.message,
      data: null,
    };
  }
  if (error instanceof Error) {
    return { ...defaultError, message: error.message };
  }

  return defaultError;
};

/**
 * 바이너리 문서, 압축 파일 및 미디어 패턴 목록입니다.
 */
const BINARY_PATTERNS = [
  'application/octet-stream',
  'pdf',
  'zip',
  'tar',
  'gzip',
  '7z',
  'rar',
  'epub',
  'excel',
  'word',
  'officedocument',
  'vnd.ms-',
];

/**
 * 텍스트 기반 문서, 마크업, 스크립트 및 데이터 구조 패턴 목록입니다.
 */
const TEXT_PATTERNS = [
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
  'application/typescript',
  'application/yaml',
  'application/graphql',
];

/**
 * 응답 데이터가 0바이트이거나 204/205 상태인지 확인합니다.
 *
 * @param {Response} response Web Response 객체
 * @returns {boolean} 빈 응답 여부
 */
const isEmptyResponseBody = (response: Response): boolean => {
  return (
    response.status === 204 ||
    response.status === 205 ||
    response.headers.get('content-length') === '0'
  );
};

/**
 * Content-Type이 JSON 계열(application/json, application/ld+json, application/problem+json 등)인지 판별합니다.
 *
 * @param {string} contentType Content-Type 소문자 문자열
 * @returns {boolean} JSON 데이터 여부
 */
const isJsonContentType = (contentType: string): boolean => {
  return contentType.includes('json');
};

/**
 * Content-Type이 FormData 또는 Form-UrlEncoded 계열인지 판별합니다.
 *
 * @param {string} contentType Content-Type 소문자 문자열
 * @returns {boolean} FormData 데이터 여부
 */
const isFormDataContentType = (contentType: string): boolean => {
  return (
    contentType.includes('multipart/') ||
    contentType.includes('form-urlencoded')
  );
};

/**
 * Content-Type이 바이너리 파일(이미지, 오디오, 비디오, 폰트, PDF, ZIP, Office 문서 등)인지 판별합니다.
 *
 * @param {string} contentType Content-Type 소문자 문자열
 * @returns {boolean} 바이너리 파일 여부
 */
const isBinaryContentType = (contentType: string): boolean => {
  if (
    contentType.startsWith('image/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('font/')
  ) {
    return true;
  }
  return BINARY_PATTERNS.some((pattern) => contentType.includes(pattern));
};

/**
 * Content-Type이 텍스트, XML, HTML, JS, TS, YAML, GraphQL 등 텍스트 기반 데이터인지 판별합니다.
 *
 * @param {string} contentType Content-Type 소문자 문자열
 * @returns {boolean} 텍스트 데이터 여부
 */
const isTextContentType = (contentType: string): boolean => {
  if (contentType.startsWith('text/')) {
    return true;
  }
  return TEXT_PATTERNS.some((pattern) => contentType.includes(pattern));
};

/**
 * Content-Type이 알려진 어떤 파서 카테고리에도 매칭되지 않았음을 나타내는 내부 전용 sentinel 값입니다.
 * JSON 바디가 정상적으로 파싱된 `null`("실제 null 값")과, 매칭되는 파서가 없어 fallback이 필요한
 * "파싱 미수행" 상태를 구분하기 위해 사용됩니다.
 */
const NOT_MATCHED: unique symbol = Symbol('app-fetch:not-matched');

/**
 * Content-Type 카테고리에 맞춰 적절한 파서(json, blob, formData, text)를 분기 실행합니다.
 * 매칭되는 카테고리가 없으면 `NOT_MATCHED` sentinel을 반환하여, 파싱된 값이 `null`인 경우와
 * 명확히 구분합니다.
 *
 * @pattern Strategy Pattern - Content-Type 규격에 대응하는 적합한 바디 파싱 알고리즘을 런타임에 분기 실행
 * @template T JSON 파싱 타입
 * @param {Response} response 파싱할 Response 인스턴스
 * @param {string} contentType Content-Type 소문자 문자열
 * @returns {Promise<T | Blob | FormData | string | null | typeof NOT_MATCHED>} 파싱된 데이터 또는 NOT_MATCHED
 */
const parseBodyByContentType = async <T>(
  response: Response,
  contentType: string,
): Promise<T | Blob | FormData | string | null | typeof NOT_MATCHED> => {
  if (isJsonContentType(contentType)) {
    return (await response.json()) as T;
  }
  if (isBinaryContentType(contentType)) {
    return await response.blob();
  }
  if (isFormDataContentType(contentType)) {
    return await response.formData();
  }
  if (isTextContentType(contentType)) {
    return await response.text();
  }
  return NOT_MATCHED;
};

/**
 * Content-Type 미지정 또는 알 수 없는 형식에 대해 안전하게 Text/Blob 순으로 Fallback 파싱합니다.
 *
 * @param {Response} response 파싱할 Response 인스턴스
 * @returns {Promise<string | Blob | null>} 파싱된 Fallback 데이터
 */
const parseFallbackBody = async (
  response: Response,
): Promise<string | Blob | null> => {
  try {
    return await response.text();
  } catch {
    // 텍스트 읽기 실패 시 무시하고 바이너리로 진행
  }

  try {
    return await response.blob();
  } catch {
    return null;
  }
};

/**
 * Web Response 객체의 Content-Type 및 응답 상태 코드를 분석하여 적절한 타입으로 데이터를 자동 파싱합니다.
 * JSON 변종, 바이너리 미디어/문서, FormData, Text/XML/Script 등 모든 가용 가능한 Content-Type을 지원합니다.
 *
 * @template T JSON 파싱 시 기대되는 반환 타입
 * @param {Response} response 파싱할 Web Response 인스턴스
 * @returns {Promise<T | Blob | FormData | string | null>} 파싱된 응답 데이터 Promise
 * @author jaeryeol2
 */
export const getData = async <T = unknown>(
  response: Response,
): Promise<T | Blob | FormData | string | null> => {
  if (isEmptyResponseBody(response)) {
    return null;
  }

  const contentType = (
    response.headers.get('content-type') || ''
  ).toLowerCase();

  try {
    const parsedData = await parseBodyByContentType<T>(
      response.clone(),
      contentType,
    );
    if (parsedData !== NOT_MATCHED) {
      return parsedData;
    }
  } catch (error) {
    console.error('Content parsing failed, executing fallback.', error);
  }

  return parseFallbackBody(response.clone());
};
