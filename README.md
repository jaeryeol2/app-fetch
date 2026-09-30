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

> ⚠️ **2.0.0 변경 사항 (Breaking)**: `baseURL`이 설정된 요청에서 **origin이 다른 `http(s)` 절대 URL은 기본적으로 차단**됩니다. 인스턴스로 외부 API를 직접 호출하던 코드는 해당 호출에 `allowAbsoluteUrls: true`를 지정하세요. (아래 `7. 내부 안전 가드` 4번 참고)

---

## 📌 주요 특징 (Key Features)

- ⚡ **Zero Dependencies & Native Fetch 기반**: 별도의 외부 종속성 없이 브라우저 및 Node.js 네이티브 `fetch` API를 활용합니다.
- 📦 **DUAL ESM & CommonJS 지원**: `tsdown`으로 빌드되어 `.mjs` 및 `.cjs` 번들과 각각의 타입 선언(`.d.mts`/`.d.cts`)을 모두 제공합니다.
- 🛠 **인스턴스 생성 (`appFetch.create`)**: `baseURL`, 기본 헤더, 인터셉터, 타임아웃 설정을 캡슐화한 커스텀 클라이언트를 생성할 수 있습니다.
- 🔍 **중첩 쿼리 파라미터 직렬화 (`query`)**: 배열(`tags[0]=ts`), 중첩 객체, Date, Map, Set 등의 파라미터를 자동으로 인코딩 및 URL 쿼리 스트링으로 변환합니다. (순환 참조 감지 포함)
- 📝 **스마트 요청 바디 처리 (`body`)**: Plain Object 입력 시 `Content-Type: application/json` 헤더 추가 및 자동 `JSON.stringify`를 수행하며, `FormData`, `Blob`, `URLSearchParams`는 유지합니다.
- 🪝 **강력한 인터셉터 (`beforeRequest`, `afterResponse`, `onError`)**: 단일 함수 또는 배열 형태의 인터셉터를 체이닝하여 공통 헤더 주입, 토큰 갱신, 에러 로깅 등을 처리합니다.
- ⏱ **타임아웃 & 자동 재시도 (`timeout`, `retry`, `delay`)**: `AbortController` 기반 타임아웃(기본 3,000ms) 및 일시적 오류(408, 429, 5xx 서버 오류 및 네트워크 단절) 발생 시 안전한 자동 재시도 기능을 제공합니다. (멱등하지 않은 `post`/`patch`는 기본 재시도에서 제외)
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
| **`dist/@types/app-fetch.d.mts`**<br>**`dist/@types/app-fetch.d.cts`** | **DTS** (TypeScript Declaration) | TypeScript 개발 환경 | `import`용(`.d.mts`)과 `require`용(`.d.cts`) 선언 파일입니다. IDE(VS Code 등)에서 코드 자동 완성, 타입 검사 및 `AppFetchOptions`, `FetchInterceptors` 등의 타입 사양을 제공하는 선언 파일입니다. |

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

스크립트 태그 번들(`app-fetch.min.js`)은 ES2019 문법으로 빌드되어 Chrome 73+, Safari 12.1+ 등 `fetch`/`AbortController`를 지원하는 구형 브라우저에서도 동작합니다. (npm 패키지는 Node.js 18 이상 필요)

```html
<!-- dist/app-fetch.min.js 파일을 script 태그로 로드 -->
<script src="/js/dist/app-fetch.min.js"></script>
<!-- 또는 CDN: <script src="https://unpkg.com/app-fetch"></script> (jsDelivr: https://cdn.jsdelivr.net/npm/app-fetch) -->
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
  beforeRequest: (options, { path, attempt }) => {
    // options.headers는 항상 Headers 인스턴스입니다. 대입(options.headers = {...})은 인스턴스 기본 헤더와
    // JSON Content-Type까지 모두 교체하므로, 헤더는 .set()/.append()/.delete()로 수정하세요.
    options.headers.set('Authorization', 'Bearer my-access-token');
    if (attempt > 1) console.info(`[retry #${attempt - 1}] ${path}`);
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
// GET 조회는 인스턴스의 retry: 3이 적용됩니다.
const paymentStatus = await paymentApi('/charge/123');
// POST는 중복 결제 방지를 위해 기본 retry 대상에서 제외됩니다(1회만 전송).
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
  retry: 3,      // 408, 429, 500, 502, 503, 504 또는 네트워크 에러 시 최대 3회 재시도
  delay: 500,    // 재시도 대기 간격 500ms
});

// 2. Strategy Pattern - 내장 지수 백오프(Exponential Backoff) 전략 사용 🌟
const response2 = await appFetch('https://api.example.com/unstable', {
  retryStrategy: exponentialBackoffRetry({
    maxRetries: 3,
    initialDelay: 100, // 최대 100ms, 200ms, 400ms (기본 full jitter로 0~계산값 사이 무작위)
    factor: 2,
    statusCodes: [500, 502, 503, 504], // 해당 서버 오류 코드에서만 선택적 재시도
    methods: ['GET', 'PUT', 'DELETE'], // 재시도할 메서드 (지정 권장, 아래 참고)
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

- **`timeout`은 각 시도당(Per-Attempt) 적용됩니다.** 전체 요청 예산(Total Budget)이 아니므로, `timeout: 3000, retry: 3` 설정 시 각 시도마다 3초의 타임아웃이 개별 적용되어 최악의 경우 (4회 시도 * 3초) + 재시도 지연 시간만큼 소요될 수 있습니다. 재시도를 포함한 전체 시간을 제한하려면 `signal: AbortSignal.timeout(totalMs)`를 함께 전달하세요. 재시도 대기(`delay`) 중에도 즉시 중단됩니다.
- **`timeout`은 응답 헤더 수신까지만 적용됩니다.** 헤더를 받은 뒤 `getData()`로 본문을 읽는 구간은 타임아웃 대상이 아니므로, 본문 수신까지 제한이 필요하면 `signal` 옵션(예: `AbortSignal.timeout(ms)`)을 함께 전달하세요. `AbortSignal.any`가 없는 구형 런타임(Node 18.0~20.2, Chrome 115 이하, Safari 17.3 이하)에서도 동작하며, 이 경우 `signal` 연결은 `getData()`로 본문 소비가 끝날 때 해제됩니다. `beforeRequest` 인터셉터 실행 시간은 타임아웃에 포함됩니다.
- **`beforeRequest`는 매 재시도 시에도 실행됩니다.** 재시도 시에도 인터셉터가 다시 실행되므로, 토큰 갱신이나 헤더 주입이 재시도 요청에서도 온전히 유지됩니다. 두 번째 인자 `{ path, attempt }`로 호출 경로(baseURL 결합 전)와 시도 횟수를 알 수 있습니다. `options.headers`는 `.set()`/`.append()`/`.delete()`로 수정하세요. `options.headers = { ... }` 대입은 헤더 전체를 교체하므로 인스턴스 기본 헤더와 객체 body에 자동으로 붙은 `Content-Type: application/json`이 사라지고, 서버가 `415 Unsupported Media Type`을 돌려줄 수 있습니다.
- **`afterResponse`는 최종 응답에 대해서만 1회 실행되고, 요청이 reject되면 실행되지 않습니다.** 네트워크 에러·타임아웃·abort로 끝난 요청은 `afterResponse` 없이 `onError`만 거칩니다. 로딩 표시처럼 `beforeRequest`에서 켠 상태는 `afterResponse`와 `onError` 양쪽에서 해제하세요. 시도 횟수를 세는 용도라면 `beforeRequest`와 `afterResponse`의 호출 횟수가 일치하지 않는다는 점에 유의하세요. 카운터·타이머처럼 짝이 맞아야 하는 처리는 인터셉터가 아니라 호출 전후(`try/finally`)에서 하거나, `beforeRequest`에서 `attempt === 1`일 때만 세세요.
- **기본 재시도 필터링:** 기본 `retry: N` 옵션은 `400`, `401`, `404` 등 일반 4xx 클라이언트 에러를 재시도하지 않으며, 일시적 복구 가능성이 있는 **`408`, `429`, `500`, `502`, `503`, `504` 및 네트워크 단절 에러**만 재시도합니다(`501`, `505`~`511`처럼 다시 보내도 결과가 같은 코드는 제외). 또한 멱등하지 않은 **`post`/`patch` 요청은 중복 처리 위험 때문에 기본 `retry` 대상에서 제외**됩니다. 이 요청들을 재시도하려면 `retryStrategy`(예: `exponentialBackoffRetry()`)를 명시하세요. `put`/`delete`는 RFC 9110상 멱등이라 기본 재시도 대상이지만, 알림 발송·파일 정리 등 부수 효과가 있는 API라면 `retry: 0`으로 두거나 서버에 멱등성 키를 도입하세요. 특히 클라이언트 `timeout`이 서버 처리 시간보다 짧으면 서버가 이전 요청을 처리하는 동안 같은 요청이 재전송됩니다.
- **`Retry-After` 헤더를 존중합니다.** 기본 `retry`와 `exponentialBackoffRetry()`는 `Retry-After`(정수 초 또는 HTTP-date)가 있으면 `delay`/백오프 대신 그 값만큼 기다립니다. 값이 상한(기본 `retry`는 30초, 백오프는 `maxDelay`)을 넘으면 재시도하지 않고 그 응답을 그대로 반환합니다. 소수 초 등 해석할 수 없는 값은 무시합니다. 커스텀 전략에는 적용되지 않으며, 대신 `context.retryAfterMs`로 해석된 값을 받을 수 있습니다(`getDelay: (c) => c.retryAfterMs ?? 1000`). 브라우저의 cross-origin 요청에서는 서버가 `Access-Control-Expose-Headers: Retry-After`를 보내야 읽힙니다.
- **⚠️ 커스텀 `retryStrategy`는 `post`/`patch` 제외 안전장치를 우회합니다.** 전략을 지정하면 메서드와 관계없이 전략의 판단을 따르므로, 인스턴스 기본값에 전략을 걸면 그 인스턴스의 모든 POST가 재시도되어 중복 생성될 수 있습니다. 전략 안에서 `context.method`로 직접 거르세요. `context.method`는 요청 옵션이 소문자(`'post'`)여도 항상 대문자(`'POST'`)로 정규화됩니다. `exponentialBackoffRetry()`는 `methods` 옵션으로 제한할 수 있으며, `methods` 없이 POST/PATCH를 요청하면 1회 경고합니다. **3.0.0부터 `methods` 기본값이 멱등 메서드(GET, HEAD, OPTIONS, PUT, DELETE)로 바뀝니다.**
- **`afterResponse` 인터셉터나 `retryStrategy`에서 발생한 예외는 재시도하지 않습니다.** `onError`를 1회 실행한 뒤 호출부로 그대로 전달됩니다.
- **2xx 성공 응답에는 `retryStrategy`가 호출되지 않습니다.** 전략은 실패 응답(`response.ok === false`)과 네트워크 에러에 대해서만 평가되므로, `attempt`만 검사하는 전략도 성공 응답을 재요청하지 않습니다.
- **fetch 이전 단계의 에러는 재시도하지 않습니다.** 쿼리 순환 참조, 바디 직렬화 실패, `beforeRequest` 예외는 다시 시도해도 같은 결과이므로 대기 없이 즉시 `onError` 후 전달됩니다. 단, 타임아웃은 `beforeRequest` 실행 중 발생했더라도 재시도 대상입니다.
- **타임아웃 에러는 `error.name === 'TimeoutError'`로 판별할 수 있습니다.** 메시지는 `Request Timeout. time : {timeout}ms` 형식이며, 원본 `AbortError`는 `error.cause`에 담깁니다.
- **사용자 요청 취소(`signal.abort()`) 시 즉시 중단:** 사용자가 전달한 `AbortSignal`이 취소(`aborted: true`)되면 남아있는 재시도 카운트와 무관하게 모든 재시도가 즉시 중단되고(재시도 대기(`delay`) 중이어도 대기를 끝까지 기다리지 않음) `AbortError`를 발생시켜 불필요한 중복 트래픽을 방지합니다.
- **요청 바디가 `ReadableStream`인 경우 재시도가 자동으로 차단됩니다.** 스트림은 한 번 소비되면 다시 읽을 수 없어(1회성 소비), 동일한 스트림으로 재시도를 시도하면 두 번째 요청이 반드시 실패합니다. `app-fetch`는 이런 상황에서 `retry`/`retryStrategy` 설정과 무관하게 재시도를 건너뛰고 최초 응답/에러를 그대로 반환하며, 콘솔에 `console.warn`으로 원인을 안내합니다. 스트리밍 업로드에서 재시도가 필요하다면 `Blob`, `ArrayBuffer`, `string`, `FormData`처럼 재사용 가능한 바디 타입을 사용해 주세요.
- **안전 하드캡(Hard Cap):** 무한 루프 방지를 위해 **한 요청의 총 시도 횟수는 10회를 넘지 않습니다**(= 최초 1회 + 재시도 최대 9회). 따라서 `retry: 10` 이상을 지정하더라도 10번째 시도에서 경고(`console.warn`)와 함께 재시도가 종료되며, 설정한 횟수가 그대로 반영되지 않습니다.

### 5. 응답 파싱 및 지원 포맷 (`getData`, `HttpError`, `returnError`)

`getData`는 `Content-Type` 헤더를 분석하여 적절한 데이터 타입으로 자동 파싱합니다. 텍스트/JSON은 `charset` 파라미터(예: `EUC-KR`)를 반영해 디코딩하며, 지원하지 않는 charset은 UTF-8로 처리합니다.

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

#### 🧭 에러 판별 (Error Classification)

| 상황 | 판별 방법 | 비고 |
| :--- | :--- | :--- |
| `timeout` 초과 | `error.name === 'TimeoutError'` | 메시지 `Request Timeout. time : {ms}ms`, 원본은 `error.cause` |
| `signal: AbortSignal.timeout(ms)` 초과 | `error.name === 'TimeoutError'` | 런타임의 `DOMException`이 그대로 전달됨 |
| 사용자 취소 (`controller.abort()`) | `error.name === 'AbortError'` | |
| 네트워크 계열 실패 | `error.name === 'TypeError'` | 단절·DNS 실패·브라우저 CORS 차단을 구분할 수 없음. 메시지는 런타임마다 다르므로(Node `fetch failed`, Chrome `Failed to fetch`, Safari `Load failed`) name으로만 판별 |
| HTTP 4xx/5xx | `response.ok === false`, `response.status` | 예외가 아니라 정상 resolve되는 응답입니다 |

HTTP 에러를 예외로 다루고 싶다면 헬퍼 하나로 변환하세요. `HttpError`의 세 번째 인자 `data`에 에러 본문을 담으면 `returnError()`가 그대로 전달합니다.

```typescript
const ensureOk = async (response: Response): Promise<Response> => {
  if (!response.ok) {
    throw new HttpError(`HTTP ${response.status}`, response.status, await getData(response));
  }
  return response;
};

try {
  const data = await getData(await ensureOk(await api('/orders')));
} catch (error) {
  const { status, message, data } = returnError(error); // data = 백엔드 에러 본문
}
```

> 💡 **성공은 `response.ok`(2xx 범위)로 판정하세요.** `status === 200`, `status === 201`처럼 특정 코드를 고정하면 서버가 생성 응답을 `200`↔`201`로 바꾸거나 `202`/`204`를 돌려줄 때 에러 없이 조용히 실패 처리됩니다. 특정 코드 비교는 실패 분기 분류(재시도 `429`/`503`, 인증 `401`/`403` 등)나 API 계약에 명시된 의미 차이(`202` 접수 vs `201` 생성)에만 쓰고, 비즈니스 결과는 HTTP 숫자가 아닌 본문의 비즈니스 코드로 구분하세요.

#### 📦 `getData` 자동 지원 `Content-Type` 카테고리

| 카테고리 | 매칭 `Content-Type` 패턴 | 반환 타입 | 상세 내용 |
| :--- | :--- | :--- | :--- |
| **JSON** | `application/json`, `application/problem+json`, `application/ld+json`, `*.json` | `T` (JSON Object/Array) | `await response.json()` 자동 파싱 |
| **바이너리 (Blob)** | `image/*`, `audio/*`, `video/*`, `font/*`, `application/octet-stream`, `pdf`, `zip`, `tar`, `gzip`, `7z`, `rar`, `epub`, `excel`, `word`, `officedocument`, `vnd.ms-` | `Blob` | 파일 다운로드, 이미지/미디어 스트림 |
| **FormData** | `multipart/*`, `application/x-www-form-urlencoded` | `FormData` | `await response.formData()` 자동 파싱 |
| **텍스트 / 스크립트** | `text/*`, `application/xml`, `text/xml`, `application/javascript`, `text/javascript`, `application/typescript`, `application/yaml`, `application/graphql` | `string` | `await response.text()` 자동 파싱 |
| **Empty Body** | 상태코드 `204 No Content`, `205 Reset Content`, 헤더 `Content-Length: 0`, 길이 0인 본문(`Content-Length` 없는 chunked 포함) | `null` | 바디가 없는 응답에 대해 상태 코드와 무관하게 `null` 반환 |
| **Fallback** | Content-Type 미지정 또는 알 수 없는 형식 | `string \| Blob \| null` | 텍스트 디코딩 시도 후 실패 시 `Blob` 순차적 Fallback |

#### ⏱️ 스트리밍 응답의 idle 타임아웃 (레시피)

`timeout`은 헤더 수신까지, `AbortSignal.timeout()`은 전체 시간을 제한합니다. SSE처럼 본문이 길게 이어지는 스트리밍 응답에서 "N ms 동안 데이터가 한 번도 오지 않으면 중단"이 필요하면, 청크를 받을 때마다 타이머를 다시 거세요.

```typescript
const controller = new AbortController();
const response = await api('/stream', { signal: controller.signal });
const reader = response.body!.getReader();
let idle = setTimeout(() => controller.abort(new DOMException('Body idle', 'TimeoutError')), 10_000);
try {
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    clearTimeout(idle);
    idle = setTimeout(() => controller.abort(new DOMException('Body idle', 'TimeoutError')), 10_000);
    handle(chunk.value);
  }
} finally {
  clearTimeout(idle);
}
```

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

> ⚠️ **SSR/서버 환경 주의 — 전역 인터셉터에 사용자별 값을 넣지 마세요.** 아래 `globalInterceptors`는 모듈 전역에서 공유되는 객체입니다. Next.js/Nuxt SSR이나 NestJS처럼 한 프로세스가 여러 사용자의 요청을 동시에 처리하는 환경에서 요청마다 `setInterceptors`로 사용자 토큰을 주입하면, **동시에 처리 중인 다른 사용자의 요청에 그 토큰이 섞여 전송**될 수 있습니다. 전역 인터셉터에는 로깅처럼 사용자와 무관한 로직만 두고, 사용자별 토큰은 호출할 때 `headers` 또는 요청별 `beforeRequest`로 전달하세요.
>
> ```typescript
> // ❌ SSR에서 위험: 요청마다 전역 레지스트리를 덮어씀
> setInterceptors(globalInterceptors, { beforeRequest: (o) => o.headers.set('Authorization', `Bearer ${userToken}`) });
>
> // ✅ 요청 단위로 전달
> await sampleFetch('/me', { headers: { Authorization: `Bearer ${userToken}` } });
> ```

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
   - `afterResponse` 인터셉터에는 `response.clone()`이 전달되므로, 인터셉터에서 본문을 읽어도 이후 `getData()` 파싱에 영향을 주지 않습니다. 인터셉터가 반환될 때까지 읽기를 시작하지 않은 clone은 메모리 버퍼를 해제하기 위해 즉시 취소되므로, clone을 저장해 두었다가 나중에 읽지 말고 인터셉터 안에서 읽기를 시작하세요(`await` 없이 `res.text().then(...)`처럼 시작만 해도 됩니다). `getData()` 자체는 원본 스트림을 한 번만 소비하고 결과를 캐시합니다.
4. **절대 URL의 `baseURL` 우회 차단 (자격증명 유출/SSRF 방지)**:
   - `baseURL`이 설정된 경우, **origin이 다른 `http(s)` 절대 URL은 요청 전에 에러로 차단**됩니다. 사용자 입력으로 조립된 경로(`client(req.query.path)` 등)가 인스턴스의 인증 헤더를 실은 채 외부 호스트로 나가는 것을 막습니다. 에러 메시지에는 전체 URL 대신 origin만 포함되어 쿼리의 토큰이 로그에 남지 않습니다.
   - `baseURL`과 **같은 origin**의 절대 URL(예: 페이지네이션 `next` 링크), 네트워크로 나가지 않는 `blob:`/`data:` URL, `baseURL`이 없는 호출은 그대로 허용됩니다.
   - 외부 API를 의도적으로 호출해야 한다면 호출 또는 인스턴스에 `allowAbsoluteUrls: true`를 지정하세요. 이때 인스턴스 기본 헤더(토큰 포함)도 함께 전송되므로, 외부 호출용 인스턴스는 인증 헤더 없이 따로 만드는 것을 권장합니다.

   ```typescript
   const api = appFetch.create({ baseURL: 'https://api.example.com', headers: { Authorization: 'Bearer ...' } });
   await api('https://evil.test/steal');                                  // ❌ Error: Absolute URL origin "https://evil.test" does not match baseURL
   await api('https://api.example.com/v1/items?page=2');                   // ✅ 같은 origin
   await api('https://partner.test/data', { allowAbsoluteUrls: true });    // ✅ 명시적 허용
   ```

### 8. 기업 환경 설정 (사내 프록시 · SSR baseURL)

#### 🏢 사내 프록시 (Node.js 서버)

Node.js 네이티브 `fetch`는 `HTTP_PROXY`/`HTTPS_PROXY` 환경변수를 **기본적으로 무시**합니다. 프록시를 거쳐야 하는 서버에서는 아래 중 하나를 적용하세요.

```bash
# 방법 1) Node.js 24+ : 환경변수 프록시 활성화 (코드 변경 없음)
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://proxy.corp.local:8080 node server.js
```

```typescript
// 방법 2) undici ProxyAgent를 dispatcher로 전달 (npm i undici@^<Node 내장 메이저>, 아래 주의 참고)
import { ProxyAgent } from 'undici';

const api = appFetch.create({
  baseURL: 'https://api.example.com',
  dispatcher: new ProxyAgent('http://proxy.corp.local:8080'),
});
```

`dispatcher`는 네이티브 `fetch`에 그대로 전달되며 브라우저에서는 무시됩니다. `app-fetch` 자체는 의존성이 없으므로 `ProxyAgent`/`Agent`를 쓰려면 소비자 프로젝트에 `undici`를 설치해야 합니다.

> ⚠️ **설치하는 `undici`의 메이저 버전을 Node에 내장된 버전과 맞추세요.** `node -p process.versions.undici`로 내장 버전을 확인한 뒤 `npm i undici@^<그 메이저>`로 설치합니다(예: Node 24 → 내장 7.x → `undici@^7`). 버전을 지정하지 않고 설치하면 최신 메이저(8.x)가 설치되어, Node 24에서는 첫 요청부터 모든 요청이 `TypeError: fetch failed`(cause: `InvalidArgumentError: invalid onRequestStart method`, `UND_ERR_INVALID_ARG`)로 실패합니다. 에러 메시지에 버전 불일치가 드러나지 않으니 이 문자열로 검색하세요.
 Next.js처럼 서버 `fetch`를 패치하는 프레임워크에서는 `dispatcher`가 그대로 전달되는지도 확인하세요. 사내 CA 인증서는 `NODE_EXTRA_CA_CERTS=/path/to/ca.pem` 환경변수로 추가합니다.

#### 🌐 SSR에서는 서버용 `baseURL`을 절대 URL로

서버(Node.js)에는 브라우저의 현재 위치(`location`)가 없으므로 `baseURL: '/api'` 같은 상대 경로는 해석되지 않습니다. 이 상태로는 상대 경로 요청이 네이티브 `fetch`에서 실패하고, 절대 URL 요청은 origin을 비교할 수 없어 절대 URL 차단 가드(`7. 내부 안전 가드` 4번)에 의해 모두 차단됩니다. Nuxt/Next.js 공용 코드에서는 실행 환경에 따라 `baseURL`을 분기하세요.

```typescript
const api = appFetch.create({
  baseURL: typeof window === 'undefined' ? process.env.INTERNAL_API_URL : '/api',
});
```

#### 🔐 세션 만료 리다이렉트 (모놀리식 · JSP)

세션 기반 서버는 세션이 만료되면 `302`로 로그인 페이지를 돌려주는데, 네이티브 `fetch`는 리다이렉트를 자동으로 따라가므로 호출부에는 `200` + `text/html` 응답이 도착합니다. `getData()`는 이를 문자열로 반환하므로 성공으로 오인하기 쉽습니다. `response.redirected`와 `response.url`로 판별하세요.

```typescript
const res = await api('/orders');
if (res.redirected && new URL(res.url).pathname.startsWith('/login')) {
  location.href = res.url; // 세션 만료 처리
}
```

브라우저에서 `redirect: 'manual'`을 쓰면 `status`가 `0`인 opaque 응답이 되어 이동 위치(`Location`)를 읽을 수 없으므로, 위 방식을 권장합니다.

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
- **`body`가 `FormData`이면 `Content-Type` 헤더가 자동으로 제거됩니다.** 멀티파트 `boundary`는 런타임이 직접 생성해야 하므로, 인스턴스 기본 헤더 등에 `application/json`이 설정되어 있어도 업로드가 깨지지 않습니다. `URLSearchParams`/`Blob` 본문도 JSON 계열 `Content-Type`이 남아 있으면 제거되어, 런타임이 `application/x-www-form-urlencoded` 또는 `Blob.type`으로 채웁니다.
- **스킴이 명시된 절대 URL(`https:`, `blob:`, `data:` 등)은 `baseURL`과 결합하지 않고 그대로 사용됩니다.** 단, `baseURL`과 origin이 다른 `http(s)` URL은 `allowAbsoluteUrls: true` 없이는 차단됩니다. 반대로 `//`로 시작하는 경로는 `baseURL`이 설정된 경우 그 하위 상대 경로로 정규화되어, 사용자 입력으로 조립된 경로가 인증 헤더를 실은 채 외부 호스트로 나가는 것을 방지합니다.

| 옵션명 | 타입 | 기본값 | 설명 |
| :--- | :--- | :---: | :--- |
| `baseURL` | `string` | `undefined` | 모든 상대 경로에 결합될 기본 URL |
| `allowAbsoluteUrls` | `boolean` | `false` | `baseURL`이 있을 때 origin이 다른 `http(s)` 절대 URL 요청을 허용 (기본은 차단) |
| `method` | `'get' \| 'delete' \| 'head' \| 'options' \| 'post' \| 'put' \| 'patch'` | `'get'` | HTTP 메서드. 소문자로 지정하며 전송 시 내부에서 대문자로 변환됩니다 |
| `query` | `Record<string, unknown> \| object` | `undefined` | 모든 HTTP 요청 시 URL 쿼리 스트링으로 직렬화할 파라미터 객체 (중첩 객체/배열/Map/Set/Date 지원) |
| `body` | `Record<string, unknown> \| BodyInit` | `undefined` | POST / PUT / PATCH / DELETE 요청 시 전송할 바디 (Object는 자동 JSON 직렬화, GET / HEAD에서는 제거됨) |
| `headers` | `HeadersInit` | `undefined` | 요청 헤더 (`mergeHeaders`를 통해 네이티브 Headers 속성 유지) |
| `timeout` | `number` | `3000` | 각 시도당(per-attempt) 요청 타임아웃 (ms) |
| `retry` | `number` | `0` | 일시적 오류(408, 429, 500, 502, 503, 504 및 네트워크 에러) 시 단순 재시도 횟수 (`post`/`patch`는 제외, `Retry-After` 존중) |
| `delay` | `number` | `0` | 단순 재시도 대기 간격 (ms) |
| `retryStrategy` | `RetryStrategy` | `undefined` | Strategy Pattern 기반 커스텀 재시도 전략 함수/객체 (실패 응답과 네트워크 에러에만 호출, 2xx에는 호출되지 않음). `context`로 `{ response, error, attempt, maxRetries, method, retryAfterMs }`를 받으며, 메서드 안전장치를 우회하므로 `method`로 직접 거를 것. **`method`는 요청 옵션과 무관하게 항상 대문자**(`'POST'`)이므로 `c.method === 'post'`는 항상 false |
| `dispatcher` | `unknown` | `undefined` | Node.js(undici) 전용 디스패처. 사내 프록시용 `ProxyAgent` 등을 네이티브 `fetch`에 전달 (브라우저에서는 무시) |
| `signal` | `AbortSignal` | `undefined` | 외부 AbortSignal (내부 타임아웃 Signal과 `AbortSignal.any`로 자동 합성, 취소 시 재시도 즉시 중단) |
| `beforeRequest` | `BeforeRequestInterceptorType \| BeforeRequestInterceptorType[]` | `undefined` | 요청 전송 전 실행되는 인터셉터 (매 재시도 시에도 재실행). `(options, { path, attempt })`를 받으며 `options.headers`는 항상 `Headers` |
| `afterResponse` | `AfterResponseInterceptorType \| AfterResponseInterceptorType[]` | `undefined` | 응답 수신 직후 실행되는 인터셉터 (`response.clone()` 제공) |
| `onError` | `OnErrorType \| OnErrorType[]` | `undefined` | 통신 실패, 타임아웃, `beforeRequest`/`afterResponse`/`retryStrategy` 예외, 쿼리·바디 직렬화 실패 시 요청당 1회 실행되는 에러 인터셉터 (HTTP 4xx/5xx 응답은 예외가 아니므로 호출되지 않음) |

### 헬퍼 함수 (Helper Functions)

- **`exponentialBackoffRetry(config?): RetryStrategyFunction`**  
  지수 백오프(Exponential Backoff) 기반의 재시도 전략 함수를 생성하는 팩토리 헬퍼입니다.
  
  | 설정 속성 (`config`) | 타입 | 기본값 | 설명 |
  | :--- | :--- | :---: | :--- |
  | `maxRetries` | `number` | `3` | 최대 재시도 횟수 |
  | `initialDelay` | `number` | `100` | 초기 대기 시간 (ms, $100 \times \text{factor}^{\text{attempt}-1}$) |
  | `factor` | `number` | `2` | 지수 증가 배수 |
  | `statusCodes` | `number[]` | `[408, 429, 500, 502, 503, 504]` | 선택적 재시도 대상 HTTP 상태 코드 목록 |
  | `methods` | `string[]` | `undefined` (모든 메서드) | 재시도할 메서드(대소문자 무관). 지정하지 않고 POST/PATCH를 요청하면 1회 경고. **3.0.0부터 기본값 GET/HEAD/OPTIONS/PUT/DELETE** |
  | `jitter` | `boolean` | `true` | full jitter: 대기 시간을 0~계산값 사이에서 무작위로 골라 동시 재시도 쏠림을 방지 |
  | `maxDelay` | `number` | `30000` | 대기 시간 상한(ms). `Retry-After`가 이 값을 넘으면 재시도하지 않고 응답을 반환 |

- **`getData<T>(response: Response): Promise<T | Blob | FormData | string | null>`**  
  Response 헤더의 `Content-Type`을 기반으로 데이터를 적절한 타입(JSON, Blob, FormData, Text 등)으로 자동 파싱하는 헬퍼입니다.
- **`composeInterceptors<T>(base, custom): T[] | undefined`**  
  기본 인스턴스의 인터셉터와 개별 요청 시 전달된 인터셉터를 순서대로 안전하게 결합합니다.
- **`setInterceptors(mergeInterceptors, interceptors): void`**  
  대상 인터셉터 레지스트리 객체에 새로운 인터셉터 목록을 안전하게 일괄 등록합니다.
- **`mergeFetchOptions(mergeInterceptors, options): AppFetchOptions`**  
  글로벌 인터셉터와 요청별 개별 옵션을 결합합니다.
- **`HttpError<T>(message, status, data?)`**  
  HTTP 상태 코드(`status`), 메시지(`message`), 선택적 데이터(`data`, 에러 응답 본문 등)를 보존하는 전용 Error 클래스입니다. `returnError()`는 `data`를 그대로 전달합니다(없으면 `null`).
- **`returnError<T = null>(error: unknown): { status: number; message: string; data: T | null }`**  
  발생한 예외(Error 및 HttpError) 객체를 안전한 표준 에러 구조체(`{ status, message, data: null }`)로 일괄 변환합니다.


