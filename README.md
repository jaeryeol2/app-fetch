# app-fetch 🚀

[![npm version](https://img.shields.io/npm/v/app-fetch.svg)](https://www.npmjs.com/package/app-fetch)
[![npm downloads](https://img.shields.io/npm/dm/app-fetch.svg)](https://www.npmjs.com/package/app-fetch)
[![GitHub](https://img.shields.io/badge/GitHub-jaeryeol2%2Fapp--fetch-181717?logo=github)](https://github.com/jaeryeol2/app-fetch)
[![License: MIT](https://img.shields.io/npm/l/app-fetch.svg)](https://github.com/jaeryeol2/app-fetch/blob/main/LICENSE)

> **Native Web Fetch API Wrapper Library**  
> `app-fetch`는 Web 표준 `fetch` API를 기반으로 제작된 경량(Zero-Dependency) 타입안전 HTTP 클라이언트 래퍼 라이브러리입니다.  

- **Author**: jaeryeol2
- **GitHub**: [github.com/jaeryeol2/app-fetch](https://github.com/jaeryeol2/app-fetch)
- **npm**: [npmjs.com/package/app-fetch](https://www.npmjs.com/package/app-fetch)

---

## 📌 주요 특징 (Key Features)

- ⚡ **Zero Dependencies & Native Fetch 기반**: 별도의 외부 종속성 없이 브라우저 및 Node.js 네이티브 `fetch` API를 활용합니다.
- 📦 **DUAL ESM & CommonJS 지원**: `tsdown`으로 빌드되어 `.mjs` 및 `.cjs` 번들을 모두 제공합니다.
- 🛠 **인스턴스 생성 (`appFetch.create`)**: `baseURL`, 기본 헤더, 인터셉터, 타임아웃 설정을 캡슐화한 커스텀 클라이언트를 생성할 수 있습니다.
- 🔍 **중첩 쿼리 파라미터 직렬화 (`query`)**: 배열(`tags[0]=ts`), 중첩 객체, Date, Map, Set 등의 파라미터를 자동으로 인코딩 및 URL 쿼리 스트링으로 변환합니다. (순환 참조 감지 포함)
- 📝 **스마트 요청 바디 처리 (`body`)**: Plain Object 입력 시 `Content-Type: application/json` 헤더 추가 및 자동 `JSON.stringify`를 수행하며, `FormData`, `Blob`, `URLSearchParams`는 유지합니다.
- 🪝 **강력한 인터셉터 (`beforeRequest`, `afterResponse`, `onError`)**: 단일 함수 또는 배열 형태의 인터셉터를 체이닝하여 공통 헤더 주입, 토큰 갱신, 에러 로깅 등을 처리합니다.
- ⏱ **타임아웃 & 자동 재시도 (`timeout`, `retry`, `delay`)**: `AbortController` 기반 타임아웃(기본 3,000ms) 및 일시적 오류(408, 429, 5xx 서버 오류 및 네트워크 단절) 발생 시 안전한 자동 재시도 기능을 제공합니다.
- 📄 **스마트 응답 파서 (`getData` & `.getData()`)**: `await appFetch(...).getData()` 직접 체이닝, `response.getData()`, `getData(response)` 헬퍼 함수 모두 지원하며, `Content-Type` 및 응답 상태에 따라 JSON, Blob(이미지, PDF, 바이너리), FormData, Plain Text 등을 자동 판별하여 파싱합니다.

---

## 📥 설치 및 빌드 (Installation & Build)

### 빌드 명령
```bash
npm run build
```
### 📦 빌드 산출물 구조 (`dist/`) 및 파일별 상세 설명

`npm run build` 실행 시 `tsdown` 및 후처리 스크립트에 의해 `dist/` 디렉토리에 런타임 환경별 번들 파일이 생성됩니다.

| 산출물 파일 | 빌드 포맷 | 주요 대상 환경 | 상세 설명 |
| :--- | :--- | :--- | :--- |
| **`dist/app-fetch.mjs`** | **ESM** (ES Module) | React, Vue, Svelte, Next.js App Router, Vite, Nuxt 3 | ESNext 모듈 표준으로 `import { appFetch } from 'app-fetch'` 구문을 사용하는 최신 모듈 번들러 및 SSR 환경 전용 번들입니다. 트리쉐이킹(Tree-shaking)을 지원합니다. |
| **`dist/app-fetch.cjs`** | **CommonJS** (CJS) | Node.js 백엔드 서버 (NestJS, Express, Fastify 등) | Node.js의 `const { appFetch } = require('app-fetch')` 구문 환경에서 동작하는 레거시 및 백엔드 CommonJS 모듈 번들입니다. |
| **`dist/app-fetch.min.js`** | **IIFE** (Minified Global) | JSP, 레거시 HTML, 스크립트 태그 (`<script>`) 로드 환경 | 모듈 번들러가 없는 단일 HTML/JSP 환경에서 `<script src="app-fetch.min.js"></script>`로 직접 로드할 수 있는 경량화 번들입니다. 브라우저 전역 객체 `window.appFetch`에 자동 노출됩니다. |
| **`dist/@types/app-fetch.d.mts`** | **DTS** (TypeScript Declaration) | TypeScript 개발 환경 | IDE(VS Code 등)에서 코드 자동 완성, 타입 검사 및 `AppFetchOptions`, `FetchInterceptors` 등의 타입 사양을 제공하는 선언 파일입니다. |

---

## 💡 사용법 (Usage Examples)

### 1. 기본 요청 (Basic Request)

```typescript
import { appFetch, getData } from 'app-fetch';

// 방법 1) Promise 메서드 직접 체이닝 (가장 추천하는 간결한 방법 🌟)
const users = await appFetch('https://api.example.com/users', {
  query: { page: 1, limit: 10 },
}).getData();

// 방법 2) Response 인스턴스를 받아 .getData() 메서드 직접 호출
const response = await appFetch('https://api.example.com/users');
const usersAlt1 = await response.getData();

// 방법 3) 기존 글로벌 getData(response) 헬퍼 함수 사용
const usersAlt2 = await getData(response);

// POST 요청 (객체 바디 전달 시 Content-Type 자동 설정 및 .getData() 체이닝)
const createdUser = await appFetch('https://api.example.com/users', {
  method: 'post',
  body: { name: 'Hong Gil-dong', email: 'hong@example.com' },
}).getData();
```

#### 🌐 JSP / HTML 환경 (Script Tag 사용)

```html
<!-- dist/app-fetch.min.js 파일을 script 태그로 로드 -->
<script src="/js/dist/app-fetch.min.js"></script>
<script>
  // window.appFetch 전역 객체 사용
  const { appFetch, getData } = window.appFetch;

  async function fetchUsers() {
    // appFetch 직접 체이닝 파싱 (.getData())
    const users = await appFetch('/api/users', { query: { page: 1 } }).getData();
    console.log(users);
  }
</script>
```

### 2. 커스텀 인스턴스 생성 (`appFetch.create`)

`appFetch.create(defaults)`를 사용하면 공통 `baseURL`, 기본 헤더, 타임아웃, 인터셉터 등이 미리 주입된 독립적인 API 클라이언트 인스턴스를 생성할 수 있습니다.

#### ⚙️ 인스턴스 기본 사용법

```typescript
import { appFetch, getData } from 'app-fetch';

// 1. 공통 옵션이 설정된 커스텀 인스턴스 생성
const apiClient = appFetch.create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  retry: 2,
  delay: 100,
  headers: {
    'X-Client-Version': '1.0.0',
  },
  beforeRequest: (options) => {
    const headers = options.headers as Headers;
    headers.set('Authorization', 'Bearer my-access-token');
  },
  onError: (error) => {
    console.error('[API Error Logged]:', error);
  },
});

// 2. 생성된 인스턴스로 API 호출 (기본 설정 자동 적용)
const response = await apiClient('/v1/products', {
  query: { category: 'electronics' },
});
const products = await getData(response);
```

#### 🔄 인스턴스 옵션 병합 및 인터셉터 체이닝 원리

- **Headers 병합 (`mergeHeaders`)**: `defaults.headers`와 호출 시 전달된 `options.headers`는 네이티브 `Headers` 객체 속성을 유지하며 안전하게 `set()` 처리됩니다.
- **Interceptors 체이닝 (`composeInterceptors`)**: `beforeRequest`, `afterResponse`, `onError` 인터셉터는 기본 설정에 정의된 인터셉터 뒤에 개별 호출 시 넘긴 인터셉터가 순차적으로 결합되어 순서대로 실행됩니다.
- **옵션 덮어쓰기**: `timeout`, `retry`, `delay` 등 일반 값은 호출 시 전달된 개별 옵션이 기본값을 덮어씁니다. 단, **값이 `undefined`인 키는 덮어쓰기 대상에서 제외**되어 기본 설정이 유지됩니다.
- **인스턴스 재파생**: 생성된 인스턴스도 `.create()`를 가지므로, 상위 설정을 누적 상속한 하위 인스턴스를 계속 파생시킬 수 있습니다.

#### 🏢 멀티 테넌트 / 마이크로서비스별 인스턴스 분리

```typescript
// 회원 서비스용 클라이언트
const userApi = appFetch.create({
  baseURL: 'https://user-service.internal',
  timeout: 3000,
});

// 결제 서비스용 클라이언트
const paymentApi = appFetch.create({
  baseURL: 'https://payment-service.internal',
  timeout: 10000,
  retry: 3,
});

const userInfo = await userApi('/profile');
const paymentResult = await paymentApi('/charge', { method: 'post', body: { amount: 50000 } });
```

### 3. 중첩 쿼리 파라미터 직렬화

```typescript
await appFetch('https://api.example.com/search', {
  query: {
    filter: {
      status: 'active',
      tags: ['typescript', 'javascript'],
    },
    page: 2,
  },
});

// 변환된 URL:
// https://api.example.com/search?filter.status=active&filter.tags%5B0%5D=typescript&filter.tags%5B1%5D=javascript&page=2
```

### 4. 타임아웃 및 재시도 전략 (Timeout & Strategy Pattern Retry)

`app-fetch`는 단순 카운터 방식 외에도 **Strategy Pattern(재시도 전략 패턴)**을 탑재하여 지수 백오프(Exponential Backoff), 커스텀 조건부 재시도 정책을 유연하게 주입할 수 있습니다.

```typescript
import { appFetch, exponentialBackoffRetry } from 'app-fetch';

// 1. 기본 재시도 옵션 사용 (하위 호환성 보장)
const response1 = await appFetch('https://api.example.com/flaky', {
  timeout: 2000, // 시도당(per-attempt) 2초 타임아웃
  retry: 3,      // 서버 오류(5xx, 408, 429) 또는 네트워크 에러 시 최대 3회 재시도
  delay: 500,    // 재시도 대기 간격 500ms
});

// 2. Strategy Pattern - 내장 지수 백오프(Exponential Backoff) 전략 사용 🌟
const response2 = await appFetch('https://api.example.com/unstable', {
  retryStrategy: exponentialBackoffRetry({
    maxRetries: 3,
    initialDelay: 100, // 100ms, 200ms, 400ms 지수 백오프
    factor: 2,
    statusCodes: [500, 502, 503, 504], // 해당 서버 오류 코드에서만 선택적 재시도
  }),
});

// 3. Strategy Pattern - 사용자 정의 커스텀 전략 객체 주입
const response3 = await appFetch('https://api.example.com/custom', {
  retryStrategy: {
    shouldRetry: (context) => {
      // 401 Unauthorized 에러 발생 시 재시도 안함
      if (context.response?.status === 401) return false;
      return context.attempt <= 3;
    },
    getDelay: (context) => context.attempt * 200,
  },
});
```

#### 💡 재시도 및 타임아웃 동작 방식 (Retry & Timeout Details)

- **`timeout`은 각 시도당(Per-Attempt) 적용됩니다.** 전체 요청 예산(Total Budget)이 아니므로, `timeout: 3000, retry: 3` 설정 시 각 시도마다 3초의 타임아웃이 개별 적용되어 최악의 경우 (4회 시도 * 3초) + 재시도 지연 시간만큼 소요될 수 있습니다.
- **`beforeRequest`는 매 재시도 시에도 실행됩니다.** 재시도 시에도 인터셉터가 다시 실행되므로, 토큰 갱신이나 헤더 주입이 재시도 요청에서도 온전히 유지됩니다.
- **기본 재시도 필터링:** 기본 `retry: N` 옵션은 `400`, `401`, `404` 등 일반 4xx 클라이언트 에러를 재시도하지 않으며, 일시적 복구 가능성이 있는 **`408`, `429`, `5xx` 서버 에러 및 네트워크 단절 에러**만 재시도합니다.
- **사용자 요청 취소(`signal.abort()`) 시 즉시 중단:** 사용자가 전달한 `AbortSignal`이 취소(`aborted: true`)되면 남아있는 재시도 카운트와 무관하게 모든 재시도가 즉시 중단되고 `AbortError`를 발생시켜 불필요한 중복 트래픽을 방지합니다.
- **요청 바디가 `ReadableStream`인 경우 재시도가 자동으로 차단됩니다.** 스트림은 한 번 소비되면 다시 읽을 수 없어(1회성 소비), 동일한 스트림으로 재시도를 시도하면 두 번째 요청이 반드시 실패합니다. `app-fetch`는 이런 상황에서 `retry`/`retryStrategy` 설정과 무관하게 재시도를 건너뛰고 최초 응답/에러를 그대로 반환하며, 콘솔에 `console.warn`으로 원인을 안내합니다. 스트리밍 업로드에서 재시도가 필요하다면 `Blob`, `ArrayBuffer`, `string`, `FormData`처럼 재사용 가능한 바디 타입을 사용해 주세요.
- **안전 하드캡(Hard Cap):** 무한 루프 방지를 위해 **한 요청의 총 시도 횟수는 10회를 넘지 않습니다**(= 최초 1회 + 재시도 최대 9회). 따라서 `retry: 10` 이상을 지정하더라도 10번째 시도에서 경고(`console.warn`)와 함께 재시도가 종료되며, 설정한 횟수가 그대로 반영되지 않습니다.

### 5. 응답 파싱 및 지원 포맷 (`getData`, `HttpError`, `returnError`)

`getData`는 `Content-Type` 헤더를 분석하여 적절한 데이터 타입으로 자동 파싱하며, 스트림 잠김(Locked Body Stream) 방지를 위해 `response.clone()` 기반으로 안전하게 처리됩니다.

```typescript
import { appFetch, getData, HttpError, returnError } from 'app-fetch';

try {
  const response = await appFetch('https://api.example.com/data');
  const data = await getData(response);

  if (!response.ok) {
    throw new HttpError('Request failed', response.status);
  }
  console.log('Parsed Data:', data);
} catch (error) {
  const errorResponse = returnError(error);
  // { status: 500 | status, message: '...', data: null }
}
```

#### 📦 `getData` 자동 지원 `Content-Type` 카테고리

| 카테고리 | 매칭 `Content-Type` 패턴 | 반환 타입 | 상세 내용 |
| :--- | :--- | :--- | :--- |
| **JSON** | `application/json`, `application/problem+json`, `application/ld+json`, `*.json` | `T` (JSON Object/Array) | `await response.json()` 자동 파싱 |
| **바이너리 (Blob)** | `image/*`, `audio/*`, `video/*`, `font/*`, `application/octet-stream`, `pdf`, `zip`, `tar`, `gzip`, `7z`, `rar`, `epub`, `excel`, `word`, `officedocument`, `vnd.ms-` | `Blob` | 파일 다운로드, 이미지/미디어 스트림 |
| **FormData** | `multipart/*`, `application/x-www-form-urlencoded` | `FormData` | `await response.formData()` 자동 파싱 |
| **텍스트 / 스크립트** | `text/*`, `application/xml`, `text/xml`, `application/javascript`, `text/javascript`, `application/typescript`, `application/yaml`, `application/graphql` | `string` | `await response.text()` 자동 파싱 |
| **Empty Body** | 상태코드 `204 No Content`, `205 Reset Content`, 헤더 `Content-Length: 0` | `null` | 바디가 없는 응답에 대해 `null` 반환 |
| **Fallback** | Content-Type 미지정 또는 알 수 없는 형식 | `string \| Blob \| null` | 텍스트 디코딩 시도 후 실패 시 `Blob` 순차적 Fallback |

#### ⚠️ `getData`의 본문 소비 방식 (Body Consumption)

- **`getData()`는 응답 본문 스트림을 정확히 한 번만 소비합니다.** 호출 이후 `response.bodyUsed`는 `true`가 되며, 이는 HTTP 연결이 커넥션 풀로 즉시 회수되도록 하기 위함입니다.
- **파싱 결과는 응답 인스턴스별로 캐시되므로 `getData()`를 여러 번 호출해도 동일한 값이 반환됩니다.** 파싱이 실패한 경우에는 캐시가 제거되어 재호출로 다시 시도할 수 있습니다.
- **단, `getData()` 호출 이후에는 `response.body`, `response.json()`, `response.clone()` 등 원본 스트림에 직접 접근하는 API를 사용할 수 없습니다.** 원본 스트림을 직접 다루어야 한다면(예: 대용량 다운로드 진행률 표시, SSE 수신) `getData()`를 호출하지 말고 `response.body`를 바로 사용하세요.

```ts
// ✅ 파싱 결과가 필요한 일반적인 경우
const res = await appFetch('/api/users');
const users = await res.getData<User[]>();
await res.getData<User[]>(); // 캐시된 동일 값 반환

// ✅ 스트리밍이 필요한 경우 — getData()를 호출하지 않는다
const stream = await appFetch('/api/large-file');
const reader = stream.body?.getReader();
```

---

### 6. 프로젝트 전역 커스텀 래퍼 구축 및 타입 커스텀 패턴 (`sampleFetch`)

실무 프로젝트마다 백엔드 API의 응답 구조(Response Envelope - 예: `{ status, message, data }` 또는 `{ code, result, isSuccess }`)가 다를 수 있습니다.  
`app-fetch`는 특정 프로젝트 스키마에 종속되지 않도록 설계되어 있으며, 프로젝트 환경에 맞춰 아래와 같이 전역 응답 타입(`ResponseApi<T>`) 및 커스텀 래퍼 클라이언트를 손쉽게 구성할 수 있습니다. (`examples/sample.ts` 참고)

```typescript
import { appFetch, getData, HttpError, returnError, mergeFetchOptions } from 'app-fetch';
import type { FetchInterceptors, AppFetchOptions } from 'app-fetch';

/**
 * 실무 프로젝트 전역에서 사용하는 백엔드 공통 API 응답 규격 타입 정의 샘플입니다.
 * 프로젝트 사양(예: { code: string, result: T, isSuccess: boolean })에 맞춰 자유롭게 커스텀할 수 있습니다.
 */
export interface ResponseApi<T> {
  status: number;
  message: string;
  data: T | null;
}

/**
 * 프로젝트 전역에서 공유되는 공통 인터셉터 레지스트리 객체입니다.
 */
const globalInterceptors: FetchInterceptors = {
  beforeRequest: [],
  afterResponse: [],
  onError: [],
};

/**
 * appFetch.create()를 이용하여 공통 baseURL, timeout, 헤더가 캡슐화된 싱글톤 API 인스턴스 생성
 */
const baseFetch = appFetch.create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
});

/**
 * Raw Web Native Response 객체를 그대로 반환하는 메서드
 */
const native = (path: string, options?: AppFetchOptions): Promise<Response> => {
  const mergedOptions = mergeFetchOptions(globalInterceptors, options);
  return baseFetch(path, mergedOptions);
};

/**
 * 백엔드 공통 응답 규격(ResponseApi<R>) 형태로 응답을 감싸서 반환하는 Wrap Fetch 메서드
 */
const wrap = async <R = unknown>(
  path: string,
  options?: AppFetchOptions,
): Promise<ResponseApi<R>> => {
  try {
    // 1. 전역 인터셉터와 요청별 개별 옵션 병합
    const mergedOptions = mergeFetchOptions(globalInterceptors, options);

    // 2. HTTP 통신 수행 및 헤더 기반 데이터 파싱 (JSON, Blob, FormData, Text 등)
    const response = await baseFetch(path, mergedOptions);
    const responseData = await getData(response);

    // 3. HTTP 응답 비정상(4xx, 5xx) 상태 감지 시 HttpError 예외 발생
    if (!response.ok) {
      let backendMessage = 'do not get response data.';
      if (responseData && typeof responseData === 'object' && 'message' in responseData) {
        backendMessage = String((responseData as Record<string, unknown>).message);
      } else if (typeof responseData === 'string' && responseData) {
        backendMessage = responseData;
      }
      throw new HttpError(backendMessage, response.status);
    }

    // 4-A. 파일 다운로드 / 바이너리 응답 (Blob) 인 경우
    if (responseData instanceof Blob) {
      return { status: response.status, message: 'success', data: responseData as unknown as R };
    }

    // 4-B. 백엔드에서 이미 { data: ... } 형태로 감싸서 응답한 경우
    if (responseData && typeof responseData === 'object' && 'data' in responseData) {
      return responseData as ResponseApi<R>;
    }

    // 4-C. 일반 JSON 객체 또는 단일 데이터인 경우 공통 규격으로 포맷팅
    return { status: response.status, message: 'success', data: (responseData ?? null) as R };
  } catch (error) {
    // 5. 예외 발생 시 표준 오류 구조체로 안전하게 변환하여 반환
    return returnError<R>(error);
  }
};

/**
 * 프로젝트 메인 Fetch 클라이언트 엔트리포인트 객체
 */
export const sampleFetch = Object.assign(wrap, { native });
```

---

### 7. 내부 안전 가드 및 SSR 안정성 (Safety & Chaos Guards) 🛡️

`app-fetch`는 예측 불가능한 네트워크 환경 및 복잡한 SSR/CSR 전환 환경에서도 시스템이 다운되거나 무한 루프에 빠지지 않도록 내장 안전 가드를 탑재하고 있습니다.

1. **무한 재시도 핑퐁 차단 (Safety Hard-Cap 10회)**:
   - 잘못 구성된 커스텀 재시도 전략이나 플래키 네트워크로 인한 무한 루프 폭주를 원천 차단하기 위해 **최대 10회 초과 시 재시도를 강제 종료**합니다.
2. **`beforeRequest` 비동기 타임아웃 즉시 차단**:
   - 비동기 인터셉터(토큰 갱신 등) 실행 도중 타임아웃(`options.timeout`)이 초과되면 `Promise.race`를 통해 `AbortSignal` 이벤트를 감지하여 즉시 요청을 중단하고 `AbortError`를 발생시킵니다.
3. **`response.clone()` 스트림 잠김 방지**:
   - `afterResponse` 인터셉터 로깅 및 `getData` 본문 파싱 시 원본 Response 스트림이 잠겨(Locked Body Stream) 재사용이 불가능해지는 문제를 방지하기 위해 내부적으로 `response.clone()`을 체계적으로 활용합니다.

---

## 📖 API Reference

### `appFetch(path, options)` & `appFetch.create(defaults)`

| 함수 / 메서드 | 파라미터 | 반환 타입 | 설명 |
| :--- | :--- | :--- | :--- |
| **`appFetch(path, options)`** | `path: string`, `options?: AppFetchOptions` | `AppFetchPromise` | HTTP 요청을 수행하며, `await appFetch(...).getData()` 체이닝 및 `res.getData()`를 지원하는 확장 Promise를 반환합니다. |
| **`appFetch.create(defaults)`** | `defaults: Omit<AppFetchOptions, 'method' \| 'query' \| 'body'>` | `AppFetchInstance` | 공통 `baseURL`, 기본 헤더, 타임아웃, 인터셉터가 캡슐화된 커스텀 클라이언트 인스턴스를 생성합니다. 생성된 인스턴스도 `.create()`를 가지므로, 상위 기본 설정을 누적 상속한 하위 인스턴스를 계속 파생시킬 수 있습니다. |

#### 🔗 인스턴스 파생 및 옵션 병합 규칙

- **`create()`로 만든 인스턴스는 다시 `.create()`로 파생할 수 있습니다.** 파생 시 상위 `baseURL`/헤더/인터셉터가 누적 상속되며, 같은 키는 하위 설정이 우선합니다.
- **호출 시 전달한 `undefined` 값은 기본 설정을 덮어쓰지 않습니다.** 예를 들어 `api('/x', { timeout: config.timeout })`에서 `config.timeout`이 비어 있어도 인스턴스의 `timeout` 기본값이 그대로 유지됩니다.

### `AppFetchOptions` (Discriminated Union)

`AppFetchOptions`는 TypeScript의 **Discriminated Union**으로 구성되어 있어, 모든 메서드에서 `query` 파라미터를 자유롭게 전달할 수 있으며, `body` 옵션은 `POST/PUT/PATCH/DELETE` 메서드에서 안전하게 허용됩니다.

- **본문이 허용되지 않는 메서드는 `GET`/`HEAD`뿐입니다.** RFC 9110에 따라 `DELETE`는 본문을 가질 수 있으므로(대량 삭제 API 등) `POST`와 동일하게 직렬화됩니다. `GET`/`HEAD`에 전달된 `body`는 네이티브 `fetch`의 `TypeError`를 막기 위해 조용히 제거됩니다.
- **`body`가 `FormData`이면 `Content-Type` 헤더가 자동으로 제거됩니다.** 멀티파트 `boundary`는 런타임이 직접 생성해야 하므로, 인스턴스 기본 헤더 등에 `application/json`이 설정되어 있어도 업로드가 깨지지 않습니다.
- **스킴이 명시된 절대 URL(`https:`, `blob:`, `data:` 등)은 `baseURL`과 결합하지 않고 그대로 사용됩니다.** 반대로 `//`로 시작하는 경로는 `baseURL`이 설정된 경우 그 하위 상대 경로로 정규화되어, 사용자 입력으로 조립된 경로가 인증 헤더를 실은 채 외부 호스트로 나가는 것을 방지합니다.

| 옵션명 | 타입 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- |
| `baseURL` | `string` | `undefined` | 모든 상대 경로에 결합될 기본 URL |
| `method` | `'get' | 'delete' | 'post' | 'put' | 'patch'` | `'get'` | HTTP 메서드 || 'delete' \| 'post' \| 'put' \| 'patch'` | `'get'` | HTTP 메서드 |
| `query` | `Record<string, unknown> \| object` | `undefined` | 모든 HTTP 요청 시 URL 쿼리 스트링으로 직렬화할 파라미터 객체 (중첩 객체/배열/Map/Set/Date 지원) |
| `body` | `Record<string, unknown> \| BodyInit` | `undefined` | POST / PUT / PATCH / DELETE 요청 시 전송할 바디 (Object는 자동 JSON 직렬화, GET / HEAD에서는 제거됨) |
| `headers` | `HeadersInit` | `undefined` | 요청 헤더 (`mergeHeaders`를 통해 네이티브 Headers 속성 유지) |
| `timeout` | `number` | `3000` | 각 시도당(per-attempt) 요청 타임아웃 (ms) |
| `retry` | `number` | `0` | 일시적 오류(408, 429, 5xx 및 네트워크 에러) 시 단순 재시도 횟수 |
| `delay` | `number` | `0` | 단순 재시도 대기 간격 (ms) |
| `retryStrategy` | `RetryStrategy` | `undefined` | Strategy Pattern 기반 커스텀 재시도 전략 함수/객체 |
| `signal` | `AbortSignal` | `undefined` | 외부 AbortSignal (내부 타임아웃 Signal과 `AbortSignal.any`로 자동 합성, 취소 시 재시도 즉시 중단) |
| `beforeRequest` | `BeforeRequestInterceptorType \| BeforeRequestInterceptorType[]` | `undefined` | 요청 전송 전 실행되는 인터셉터 (매 재시도 시에도 재실행) |
| `afterResponse` | `AfterResponseInterceptorType \| AfterResponseInterceptorType[]` | `undefined` | 응답 수신 직후 실행되는 인터셉터 (`response.clone()` 제공) |
| `onError` | `OnErrorType \| OnErrorType[]` | `undefined` | 통신 실패 및 타임아웃 발생 시 실행되는 에러 인터셉터 |

### 헬퍼 함수 (Helper Functions)

- **`exponentialBackoffRetry(config?): RetryStrategyFunction`**  
  지수 백오프(Exponential Backoff) 기반의 재시도 전략 함수를 생성하는 팩토리 헬퍼입니다.
  
  | 설정 속성 (`config`) | 타입 | 기본값 | 설명 |
  | :--- | :--- | :---: | :--- |
  | `maxRetries` | `number` | `3` | 최대 재시도 횟수 |
  | `initialDelay` | `number` | `100` | 초기 대기 시간 (ms, $100 \times \text{factor}^{\text{attempt}-1}$) |
  | `factor` | `number` | `2` | 지수 증가 배수 |
  | `statusCodes` | `number[]` | `[408, 429, 500, 502, 503, 504]` | 선택적 재시도 대상 HTTP 상태 코드 목록 |

- **`getData<T>(response: Response): Promise<T | Blob | FormData | string | null>`**  
  Response 헤더의 `Content-Type`을 기반으로 데이터를 적절한 타입(JSON, Blob, FormData, Text 등)으로 자동 파싱하는 헬퍼입니다.
- **`composeInterceptors<T>(base, custom): T[] | undefined`**  
  기본 인스턴스의 인터셉터와 개별 요청 시 전달된 인터셉터를 순서대로 안전하게 결합합니다.
- **`setInterceptors(mergeInterceptors, interceptors): void`**  
  대상 인터셉터 레지스트리 객체에 새로운 인터셉터 목록을 안전하게 일괄 등록합니다.
- **`mergeFetchOptions(mergeInterceptors, options): AppFetchOptions`**  
  글로벌 인터셉터와 요청별 개별 옵션을 결합합니다.
- **`HttpError`**  
  HTTP 상태 코드(`status`)와 메시지(`message`)를 보존하는 전용 Error 클래스입니다.
- **`returnError<T = null>(error: unknown): { status: number; message: string; data: T | null }`**  
  발생한 예외(Error 및 HttpError) 객체를 안전한 표준 에러 구조체(`{ status, message, data: null }`)로 일괄 변환합니다.


